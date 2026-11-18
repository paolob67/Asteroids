# Version 4 (frozen)

This directory holds the frozen fourth version of the JavaScript port of Atari Asteroids: the version 3 game with the generic Laya pilot replaced by the **student**, a Laya fine-tuned to imitate `smartPilot`. The model chooses a strategy (`aim`, `escape`, `brake`, `hyperspace`) and the code (`spExecute`) flies it. The selector is Manual / Simple / Smart / Student. The Laya button, `layaPilot` and `layaFormatState` are removed; `scripts/dev/student_server.py` serves the checkpoint instead of `laya_server.py`.

| Item | Value |
|------|-------|
| File | [`asteroids.html`](asteroids.html) |
| SHA-256 | `11d74e2bed030fed947a9fc4c51f499c49f1d696a5edae534a6d6e48dfa04e1e` |
| Size | 115,882 bytes, 2,794 lines |
| Files are read-only | yes (`chmod a-w`) |
| Model | `student3`, ModernBERT-large encoder, 421M parameters. Not in the repository (804 MB); [release asset `v4-student3`](https://github.com/paolob67/Asteroids/releases/tag/v4-student3), SHA-256 of the archive `7dcee73e18295bd839020d55d3d6be643f60cc3cc90fe2a6b10eff1fa7756c2e` |
| Training set | [`training/student3/`](../../training/student3/) |

## Revision history

- 2026-11-18: first freeze.

## Rules

- Do not edit `asteroids.html` or `SHA256SUMS` in this directory. All new work happens on the root [`asteroids.html`](../../asteroids.html), which starts as an identical copy of this file.
- To change what "version 4" means, create `versions/v5/` instead of altering this one.

## Verify integrity

```bash
cd versions/v4 && shasum -a 256 -c SHA256SUMS
```

## Verify behaviour

```bash
scripts/run_all.sh versions/v4/asteroids.html
```

Expected result at the time of freezing: `ALL CHECKS PASSED`. The play measurements (seeds 0 to 11, 8,000 ticks, 22 tick answer delay) need the student server and are in [`docs/articles/TEST_LOG_PART4.md`](../../docs/articles/TEST_LOG_PART4.md), T19.

## Run the student server

Needs a checkpoint in `.work/ckpt/student3` and Apple Silicon. From the repository root:

```bash
python3 -m venv .venv                                        # once
.venv/bin/pip install -r scripts/dev/requirements-laya.txt   # once
scripts/dev/fetch_student3.sh                                # once, downloads and checks the checkpoint (about 780 MB)
.venv/bin/python scripts/dev/student_server.py               # keep running, port 8701
curl -s http://127.0.0.1:8701/health                         # from another terminal
```

Getting or rebuilding the checkpoint: [Version 4](../../docs/VERSION_4.md#2-run-the-student) and [retrain](../../docs/VERSION_4.md#4-retrain-student3).

## Compare against other versions

```bash
diff -u versions/v3/asteroids.html versions/v4/asteroids.html | less
diff -u versions/v4/asteroids.html asteroids.html | less
```
