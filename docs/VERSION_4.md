# Version 4: a fine-tuned decision model chooses a strategy, the code flies it

Version 4 is frozen in [`versions/v4/`](../versions/v4/) (SHA-256 `11d74e2bed030fed947a9fc4c51f499c49f1d696a5edae534a6d6e48dfa04e1e`, frozen on 2026-11-18; see [`versions/v4/README.md`](../versions/v4/README.md)). The root [`asteroids.html`](../asteroids.html) is an identical copy and the working copy for later work.

Version 4 is version 3 with the generic Laya model replaced by a **student**: a Laya (ModernBERT-large, 421M parameters) fine-tuned to imitate `smartPilot`. The Laya server and the Laya button are gone. A `student_server.py` serves the fine-tuned checkpoint instead, and the **Student** button uses it. The selector is **Manual | Simple | Smart | Student**.

The student does not press keys. It reads a geometry-only description of the frame (objects, bearings, closing speeds, ship motion; no verdict and no look-ahead sentence) and chooses one of four strategies: `aim`, `escape`, `brake`, `hyperspace`. The code (`spExecute`) flies the chosen strategy on the current frame every tick, so turning, aiming and pulsing fire never wait for the model. The teacher is `smartPilot`, which was split into a strategy part and an executor without changing its behaviour.

Measurements, controls and the reasoning are in [`articles/TEST_LOG_PART4.md`](articles/TEST_LOG_PART4.md) (T12 to T19). The data files are in [`articles/data/part4/`](articles/data/README.md).

## 1. What changed from version 3

| Area | Version 3 | Version 4 |
|------|-----------|-----------|
| Decision model | `layaPilot`, generic `laya-mlx` model, one of four actions per request | `strategyPilot`, fine-tuned `student3`, one of four strategies per request |
| Server | `scripts/dev/laya_server.py`, port 8700, downloads the model from Hugging Face | `scripts/dev/student_server.py`, port 8701, loads a local checkpoint, falls back to the checkpoint's own `questions.json` when a request sends none |
| Selector | Manual, Simple, Smart, Laya | Manual, Simple, Smart, Student |
| Fallback | `layaPilot` flies `smartPilot` while the server is offline | Same behaviour for the student (see section 3) |
| State text | `layaFormatState` (verdict, facts or raw) | `layaFrameState(..., lookahead = false)` (geometry only) |
| Removed | | `layaPilot`, `layaFormatState`, `layaPromptLevel`, `LAYA_QUESTIONS`, `LAYA_QUESTIONS_NEUTRAL`, `checkLayaServer`, the Laya button and banner |

The Part 3 scripts (`measure_pilots.js`, `eval_laya_offline.js`, `measure_laya.js`, `browser_check.js`) need `layaPilot`, so they now default to the frozen [`versions/v3/asteroids.html`](../versions/v3/asteroids.html). `laya_server.py` is kept for them. Version 4 does not use it.

## 2. Run the student

You need a checkpoint in `.work/ckpt/student3`. The checkpoint is 804 MB and is not in the repository, because GitHub rejects files above 100 MB. It is a [GitHub release asset](https://github.com/paolob67/Asteroids/releases/tag/v4-student3) (`student3.tar.gz`, 778 MB, SHA-256 `7dcee73e18295bd839020d55d3d6be643f60cc3cc90fe2a6b10eff1fa7756c2e`) and `scripts/dev/fetch_student3.sh` downloads it, checks the checksum and unpacks it. The archive holds only what serving needs (it loads with `laya_mlx` with the Hugging Face hub set offline); the training state is left out. To rebuild the checkpoint instead, everything is in [`training/student3/`](../training/student3/) (see section 4). Serving needs only `laya-mlx`, not PyTorch. Apple Silicon is required.

```bash
python3 -m venv .venv                                        # once
.venv/bin/pip install -r scripts/dev/requirements-laya.txt   # once, laya-mlx 0.6.0
scripts/dev/fetch_student3.sh                                # once, about 780 MB
.venv/bin/python scripts/dev/student_server.py               # keep running, port 8701
curl -s http://127.0.0.1:8701/health                         # from another terminal
```

Then open [`asteroids.html`](../asteroids.html) and press **Student**. Use `--ckpt DIR` for another checkpoint and `--port N` for another port.

Measured on this machine with `laya_mlx` (200 held-out frames): load time 1.0 s, median latency 184 ms, p95 214 ms. The same checkpoint served with PyTorch on MPS took 0.23 to 0.4 s. The MLX server chose the same option as the PyTorch one on 200 of 200 frames (mean absolute probability difference on the chosen option 0.0003), so no conversion step is needed.

## 3. Behaviour when the server is offline

The student pilot follows the version 3 Laya pilot:

- It retries at most once every 3 s after a failed request.
- On the first failure it logs one console warning with the start command, disables the **Student** button and flies `smartPilot` (the Decision panel shows `Student server offline. Running Smart fallback. [Smart: ...]`).
- When the server answers again it logs one "reconnected" message, enables the button and returns to the model by itself.
- It keeps the last 30 latencies and shows the average in the Decision panel.
- `checkStudentServer()` probes `/health` on page load, on window focus and every 5 s, enables or disables the button, and updates the green or red banner.

`scripts/dev/test_controller_selector.js` flies the student for 5,000 ticks with no server running and passes, which exercises the fallback.

## 4. Retrain student3

The training set and the recipe are in [`training/student3/`](../training/student3/):

| File | What it is |
|------|-----------|
| `train5_strategy.jsonl` | 3,141 training rows (cap of 1,000 per strategy), 5.0 MB |
| `val5_strategy.jsonl` | 1,500 held-out rows (seeds 200 to 204, natural class mix), 2.4 MB |
| `questions.json` | The question and four options the model was trained on, copied into the checkpoint |
| `requirements-train.txt` | Exact package versions of the training venv, with the upstream `laya` commit |
| `SHA256SUMS` | Checksums of the four files above |

```bash
(cd training/student3 && shasum -a 256 -c SHA256SUMS)       # verify the files

python3.12 -m venv .work/venv
.work/venv/bin/pip install -r training/student3/requirements-train.txt
git clone https://github.com/NandhaKishorM/laya.git .work/laya
git -C .work/laya checkout b1d656952f0f9581ea691a70cb6f38abf3eb13a9
.work/venv/bin/pip install --no-deps -e .work/laya

scripts/dev/reproduce_student3.sh train                      # about 3 hours on an M1 Air with 16 GB
```

The train step runs `train_student.py` with 2 epochs, micro-batch 2, gradient accumulation 4, soft cross-entropy and seed 0, writes `.work/ckpt/student3`, and scores the checkpoint on the held-out file. The original run took 10,955 s and reached 0.843 accuracy against the teacher on 1,500 held-out frames (0.147 before tuning). Training on MPS is not bit-exact, so a retrain gives a close accuracy, not identical weights. The original run's reports are in [`articles/data/part4/`](articles/data/README.md) (`student3-run_report.json`, `student3-train_report.json`). The SHA-256 of the original `model.safetensors` is `3efe5583fccfd6a04f088ef977e8beeaa43f26bd6a653b18d7f50982e8a39143`, for reference only.

To rebuild the training set from the game instead of using the committed files:

```bash
scripts/dev/reproduce_student3.sh data                       # about 1 minute, no model
```

This runs `smartPilot` on seeds 100 to 119 (training) and 200 to 204 (held out), converts the exports with `make_strategy_set.py`, and compares the result with `training/student3/`. The step is deterministic: both strategy files come out byte for byte identical. Seeds 0 to 11 are the in-play evaluation games and the exporter refuses them.

## 5. Verify

```bash
scripts/run_all.sh                                           # includes the controller selector and the geometry tests
node scripts/dev/measure_student.js 8000 0 11 --lag=22       # needs the student server; seeds 0 to 11, against Simple and Smart
```

`measure_student.js` takes `--port=N` if the server is not on 8701.
