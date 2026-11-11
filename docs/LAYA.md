# Laya-MLX: Local Decision Model for the Asteroids Autopilot

This document specifies the technical details, serving specifications, and implementation plan for deploying the `laya-mlx` decision model as a real-time autopilot on Apple Silicon M1.

For detailed runtime implementation and data flow, see [LAYA_IMPLEMENTATION.md](LAYA_IMPLEMENTATION.md). For the general decision model landscape, see [DECISION_MODELS.md](DECISION_MODELS.md). For CLM specific specifications, see [CLM.md](CLM.md).

---

## 1. Primary References

| Resource | Link / Identifier |
|---|---|
| **Laya-MLX GitHub Repository** | <https://github.com/mizorewww/laya-mlx> |
| **PyPI Package** | <https://pypi.org/project/laya-mlx/> (`pip install laya-mlx`) |
| **Hugging Face Weights (English 421M)** | <https://huggingface.co/aac6fef/laya-mlx> (`aac6fef/laya-mlx`) |
| **Hugging Face Weights (Multilingual 322M)** | <https://huggingface.co/aac6fef/laya-multilingual-mlx> (`aac6fef/laya-multilingual-mlx`) |
| **Hugging Face Weights (Typed-Decisions 421M)** | <https://huggingface.co/aac6fef/laya-typed-decisions-mlx> (`aac6fef/laya-typed-decisions-mlx`) |
| **Upstream Laya Project** | Convai Innovations (<https://laya-ai.com/>) / `NandhaKishorM/laya` |

---

## 2. What Laya-MLX Is (and What It Is Not)

`laya-mlx` is a native Apple Silicon port of the Laya open-weight typed decision model:

- **Neural Architecture**: Bidirectional ModernBERT encoder with dedicated non-autoregressive decision readout heads.
- **Single Forward Pass**: Evaluates candidate actions and questions in parallel within a single forward pass without autoregressive token generation.
- **Native MLX Runtime**: Built directly on Apple's MLX machine learning framework. It requires no PyTorch, CUDA, Transformers library, or cloud API.
- **Output Guarantee**: Emits typed options, boolean flags (noul), or ordinal scores accompanied by calibrated probabilities and confidence estimates. No JSON parsing or regular expressions are needed.

### Available Checkpoints

| Checkpoint | Parameters | Context Window | Best Use |
|---|---|---|---|
| `aac6fef/laya-mlx` | 421M | 512 tokens | High-precision English structured decisions. |
| `aac6fef/laya-multilingual-mlx` | 322M | 1,024 tokens | Compact footprint. Quoted upstream as the fastest (7.4 ms median latency); not reproduced here (see section 7). |
| `aac6fef/laya-typed-decisions-mlx` | 421M | 1,024 tokens | Upstream typed-decisions and complex rule sets. |

---

## 3. Local Serving Architecture on Apple Silicon M1

```text
asteroids.html (Browser)  ──►  POST http://localhost:8700/v1/systemone
                                     │
                                     ▼
                            laya-mlx-serve (Python / MLX)
                            [ModernBERT + MLX Decision Heads on Metal GPU]
```

### Resource Footprint on Development Machine (Apple M1, 16 GB RAM)
* **Model Size**: ~680 MB (322M) to ~940 MB (421M) in FP16 precision.
* **RAM Allocation**: Under 1.0 GB peak memory usage.
* **Inference Latency**: measured with `aac6fef/laya-mlx` on this machine: median 91 to 104 ms per HTTP request when idle, 137 ms (95th percentile 156 ms) during the pilot runs. An earlier version of this document quoted 7.4 ms to 13.9 ms; that was not reproduced (see section 7).
* **Game Loop Fit**: At 60 Hz (16.7 ms per frame), 90 to 140 ms is 5 to 8 ticks. The request is asynchronous, so rendering is never blocked, but the ship acts on an answer that is several ticks old.

### 3.1 Why Native `laya-mlx` Over Ollama
While Laya can also be pulled through Ollama (or Ollaya), native `laya-mlx` was selected for the Asteroids autopilot for three decisive reasons:

1. **Latency**: `laya-mlx` executes directly on Apple Silicon Metal. The earlier claim of sub-frame latency (7.4 ms to 13.9 ms) was not reproduced; the measured figure is 90 to 140 ms (section 7). The 30 ms to 80 ms quoted for Ollama / GGUF was never measured in this project and is unverified.
2. **True Probability Calibration**: `laya-mlx` retains the author's fitted temperature scaling and confidence calibration. Ollama outputs raw softmax scores without specialized calibration.
3. **Structured Criteria Support**: `laya-mlx` accepts detailed `criteria` descriptions per candidate action, allowing the model to distinguish nuanced flight conditions.

### 3.2 Setup and Serving Commands
Requirements: a Mac with Apple Silicon. Python 3.12 was used for the measurements; a fresh install of `requirements-laya.txt` also imports cleanly on 3.14. The server uses only the Python standard library plus `laya-mlx`, so no web framework is needed.

One-time setup, from the repository root:
```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/dev/requirements-laya.txt
```

Start the server (keep the terminal open; stop it with `Ctrl+C`):
```bash
.venv/bin/python scripts/dev/laya_server.py --port 8700
```

The first start downloads the `aac6fef/laya-mlx` weights from Hugging Face into `~/.cache/huggingface/` and needs network access. Later starts load from the cache. The server listens on `127.0.0.1` only. To use another model, pass `--model` with a Hugging Face ID from the table in section 2. If the port is taken ("Address already in use"), a server is probably already running: check with the health probe below.

`.venv` is listed in `.gitignore` and is not committed.

### 3.3 How to Verify the Server is Running

You can verify that the local inference server is active and reachable using any of the following methods:

1. **Terminal Health Probe**:
   ```bash
   curl -s http://127.0.0.1:8700/health
   ```
   *Expected response*: `{"status": "ok", "model": "aac6fef/laya-mlx"}` (the model ID is the value of `--model`, so another model shows its own ID)

2. **In the Browser Game UI**:
   Open `asteroids.html` in your browser and click the **Laya** button in the Decision panel:
   * **When active**: The Decision panel note displays real-time telemetry:
     ```text
     Laya decision: stay_and_fire (p=0.92, conf=0.88). Latency: 104 ms (avg 98 ms).
     ```
     (The numbers shown are an example. The latency depends on the machine and the model.)
   * **When offline**: The Laya button is disabled, the game runs `smartPilot` as a fallback, and the Decision panel shows:
     ```text
     Laya server offline. Running Smart fallback. (To enable Laya: .venv/bin/python scripts/dev/laya_server.py --port 8700)
     ```
     The game reconnects by itself once the server is up.

3. **Browser DevTools Network Tab**:
   Open DevTools (`Cmd + Option + I`), go to the **Network** tab, and filter by `Fetch/XHR`. When **Laya** is active, you will see `POST /v1/systemone` requests returning `200 OK`, one after another as each decision completes.

---

## 4. Step-by-Step Implementation Plan

### Phase 1: Local Server Setup and Baseline Verification
1. Create a lightweight Python environment on the machine (same as section 3.2; the `[server]` extra of `laya-mlx` is not needed because `scripts/dev/laya_server.py` uses the standard library HTTP server):
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r scripts/dev/requirements-laya.txt
   ```
2. Run the reference verification probe to ensure the MLX engine matches published reference values:
   ```python
   import laya_mlx as laya
   agent = laya.load("aac6fef/laya-mlx")
   result = agent.predict(
       "I was billed twice. Please refund the duplicate.",
       {
           "department": {
               "type": "choice",
               "instructions": "Which department should handle this request?",
               "criteria": {
                   "billing": "Payments, invoices, refunds, and duplicate charges.",
                   "technical": "Broken features, errors, and product troubleshooting.",
                   "sales": "Pricing, upgrades, and new purchases."
               }
           }
       }
   )
   assert result["answers"]["department"]["choice"] == "billing"
   ```
3. Start the local HTTP daemon on `http://localhost:8700`.

### Phase 2: Offline Accuracy Benchmark on Pilot Logs
1. Export 600,000 ticks of expert game data with [`scripts/dev/export_pilot_log.js`](../scripts/dev/export_pilot_log.js).
2. Create an evaluation script (`scripts/dev/eval_laya_offline.js`) to score Laya against logged expert actions across situations (`dodge`, `brake`, `stay`, `hyper`).
3. Evaluate prompt formulations:
   * **Format A (Raw snapshot)**: Direct JSON summary of coordinates.
   * **Format B (Key-value prose)**: Structured text listing ship state, nearest asteroid, and saucer.
   * **Format C (Egocentric geometry)**: Bearings relative to nose, closing speeds, and predicted time to collision.
   * **Option Criteria Descriptions**: Compare bare action labels versus detailed criteria definitions for each candidate choice.

### Phase 3: Real-Time Game Integration in `asteroids.html`
1. **Decision Client**: Implement an asynchronous `layaPilot(snapshot)` in JavaScript that dispatches a fetch request to `http://localhost:8700/v1/systemone`.
2. **Asynchronous Non-Blocking Loop**:
   * Request is dispatched; current keys remain held or release on a small tick timeout.
   * When the HTTP response resolves, unpack the probability distribution and apply virtual keys (`left`, `right`, `thrust`, `fire`, `hyper`).
   * Queue the next snapshot immediately.
3. **Controller Selector UI**: Add a fourth button to the Decision panel: **Manual | Simple | Smart | Laya**.
4. **Decision Panel Telemetry**: Display Laya's top choice, probability score, confidence level, and round-trip inference latency (in ms).

### Phase 4: Performance Measurement and Shielding
1. Run [`scripts/dev/measure_pilots.js`](../scripts/dev/measure_pilots.js). The plan was 8 random seeds of 1,200,000 ticks; at the measured latency that would take days for Laya, so the Laya run is 12 seeds of 8,000 ticks (section 7):
   * Record ship losses per hour, points per minute, thrust percentage, and hyperspace frequency.
2. Compare two operating modes:
   * **Unshielded**: Direct execution of Laya's top probability action.
   * **Shielded**: A lightweight safety lookahead vetoes actions leading to collision within 8 ticks, logging every intervention.

---

## 5. Candidate Action Schema for Laya

To maximize classification accuracy, candidate options should include explicit descriptions in their criteria:

```json
{
  "action": {
    "type": "choice",
    "instructions": "Select the optimal flight maneuver for the ship based on current position and incoming hazards.",
    "criteria": {
      "stay_and_fire": "No immediate collision hazard. Keep current heading and shoot at locked target.",
      "turn_left_and_thrust": "Danger approaching from right or front. Turn counter-clockwise and accelerate away.",
      "turn_right_and_thrust": "Danger approaching from left or front. Turn clockwise and accelerate away.",
      "turn_left_only": "Align heading towards target without accelerating.",
      "turn_right_only": "Align heading towards target without accelerating.",
      "thrust_only": "Accelerate forward along current heading to evade lateral hazard.",
      "hyperspace": "Unavoidable collision within 8 frames. Emergency jump as last resort."
    }
  }
}
```

---

## 6. Comparison: Laya-MLX vs CLM-8B

| Dimension | Laya-MLX | CLM-8B |
|---|---|---|
| **Local M1 Execution** | **Yes** (Native MLX on Metal) | **No** (Requires Linux with NVIDIA CUDA) |
| **Model Size** | ~680 MB to 940 MB | ~16 GB (16-bit) |
| **RAM Footprint** | < 1 GB | ~16 GB VRAM |
| **Latency on Apple Silicon** | Measured 90 to 140 ms (earlier 7.4 ms to 13.9 ms claim not reproduced) | N/A (local), ~28 ms (remote RTX 4090, not measured here) |
| **Serving Dependency** | `pip install laya-mlx` (lightweight) | `vllm` pooling server + `clm-serve` + CUDA |
| **API Wire Protocol** | TypeSafe `/v1/systemone` | TypeSafe `/v1/systemone` / `/v1/rank` |

---

## 7. Empirical Performance & Benchmark Results

**Correction (2026-11-10).** The first version of this section reported 6 seeds of 20,000 ticks measured with two different scripts that counted losses and flying time differently. The figures are replaced by a re-run of all three pilots with one script ([`measure_pilots.js`](../scripts/dev/measure_pilots.js)), 12 seeds of 8,000 ticks each (about 0.41 flying hours per pilot), with Laya answers delayed by 6 ticks to match the measured latency. Raw files and definitions: [`docs/articles/data/`](articles/data/README.md). The old figures (`simplePilot` 43.9, `smartPilot` 7.7, `layaPilot` 36.6 losses per hour) should not be quoted.

| Pilot | Paradigm | Ship Losses / Hour | Losses | Points / Minute | Thrust Engaged | Hyperspace / Hour |
|---|---|---|---|---|---|---|
| `simplePilot` | Fixed heuristic (no dodging) | 33.6 | 14 | 7,991 | 0.0% | 0.0 |
| `smartPilot` | Trajectory physics lookahead | 4.9 | 2 | 10,493 | 1.4% | 14.6 |
| `layaPilot` | Neural decision model (`laya-mlx`) | 53.3 | 22 | 10,096 | 3.8% | 19.4 |

Laya latency during this run: median 137.1 ms, 95th percentile 155.8 ms (11,495 requests to the server, 3,735 answers served from a cache of identical requests).

### Breakdown of Ship Losses by Cause

| Pilot | Asteroid Impacts | Saucer Torpedoes | Saucer Collisions | Hyperspace Self-Destruct | Total Losses |
|---|---|---|---|---|---|
| `simplePilot` | 12 | 2 | 0 | 0 | 14 |
| `smartPilot` | 0 | 0 | 0 | 2 | 2 |
| `layaPilot` | 22 | 0 | 0 | 0 | 22 |

With 14, 2 and 22 losses the rates are imprecise. An exact test on the counts separates `smartPilot` from both others (p = 0.004 against `simplePilot`, p < 0.0001 against `layaPilot`); `layaPilot` and `simplePilot` cannot be told apart (p = 0.18).

### Qualitative Analysis of Gameplay Behavior

Watching `layaPilot` in the browser game reveals distinctive characteristics of neural decision control:

1. **Reactive vs Predictive Movement**:
   `smartPilot` plans multi-second trajectories with exact inertia calculations, making smooth, calculated maneuvers. In contrast, `layaPilot` evaluates discrete tactical classifications from the neural model, each answer arriving about 90 to 140 ms after the request. When threats appear, it reacts with bursts of turning and thrust (3.8% thrust engagement vs 1.4% in `smartPilot`), leading to noticeable ship drift and reactive course corrections that look less polished in the UI.

2. **High Scoring Velocity**:
   `layaPilot` achieves 10,096 points/min, approaching `smartPilot` (10,493 pts/min) and above `simplePilot` (7,991 pts/min), probably because it shares the target picker (`spPickTarget`) with `smartPilot`; `simplePilot` has its own intercept code.

3. **Collision Limits of Semantic Reasoning**:
   All 22 `layaPilot` losses in this run were asteroid impacts. Its loss rate (53.3 per hour) is not distinguishable from `simplePilot` (33.6) and far above `smartPilot` (4.9). The earlier claim that `layaPilot` dodges saucer torpedoes better than `simplePilot` is not supported: it had no torpedo losses here, but this run is too short to show a saucer effect (`simplePilot` had 2). A natural-language summary of the nearest threat is a plausible reason for the rock losses, but this has not been tested.
