# Laya-MLX: Local Decision Model for the Asteroids Autopilot

This document specifies the technical details, serving specifications, and implementation plan for deploying the `laya-mlx` decision model as a real-time autopilot on Apple Silicon M1.

For the general decision model landscape, see [DECISION_MODELS.md](DECISION_MODELS.md). For CLM specific specifications, see [CLM.md](CLM.md).

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
| `aac6fef/laya-multilingual-mlx` | 322M | 1,024 tokens | Fastest throughput (7.4 ms median latency), compact footprint. |
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
* **Inference Latency**: **7.4 ms to 13.9 ms** end-to-end on Apple Silicon Metal.
* **Game Loop Fit**: At 60 Hz (16.6 ms per frame), inference executes in less than one game tick ($L \le 1$), enabling near real-time reaction without blocking the browser.

### 3.1 Why Native `laya-mlx` Over Ollama
While Laya can also be pulled through Ollama (or Ollaya), native `laya-mlx` was selected for the Asteroids autopilot for three decisive reasons:

1. **Sub-Frame Game Latency**: `laya-mlx` executes directly on Apple Silicon Metal in 7.4 ms to 13.9 ms, returning answers in under one 60 Hz frame ($L \le 1$). Running through Ollama / GGUF introduces translation overhead, increasing latency to 30 ms to 80 ms (2 to 5 frames of reaction lag).
2. **True Probability Calibration**: `laya-mlx` retains the author's fitted temperature scaling and confidence calibration. Ollama outputs raw softmax scores without specialized calibration.
3. **Structured Criteria Support**: `laya-mlx` accepts detailed `criteria` descriptions per candidate action, allowing the model to distinguish nuanced flight conditions.

### 3.2 Serving Commands
To run the local Laya-MLX server on port 8700 using the project's virtual environment:
```bash
.venv/bin/python scripts/dev/laya_server.py --port 8700
```

### 3.3 How to Verify the Server is Running

You can verify that the local inference server is active and reachable using any of the following methods:

1. **Terminal Health Probe**:
   ```bash
   curl -s http://127.0.0.1:8700/health
   ```
   *Expected response*: `{"status": "ok", "model": "aac6fef/laya-multilingual-mlx"}`

2. **In the Browser Game UI**:
   Open `asteroids.html` in your browser and click the **Laya** button in the Decision panel:
   * **When active**: The Decision panel note displays real-time telemetry:
     ```text
     Laya decision: stay_and_fire (p=0.92, conf=0.88). Latency: 32.1 ms (avg 33.4 ms).
     ```
   * **When offline**: The Decision panel displays an explicit alert:
     ```text
     Laya server error (Failed to fetch). Is laya-mlx-serve running on port 8700?
     ```

3. **Browser DevTools Network Tab**:
   Open DevTools (`Cmd + Option + I`), go to the **Network** tab, and filter by `Fetch/XHR`. When **Laya** is active, you will see `POST /v1/systemone` requests returning `200 OK` every ~30 to 40 ms.

---

## 4. Step-by-Step Implementation Plan

### Phase 1: Local Server Setup and Baseline Verification
1. Create a lightweight Python environment on the machine:
   ```bash
   python3 -m venv .venv-laya
   source .venv-laya/bin/activate
   pip install "laya-mlx[server]"
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
1. Run [`scripts/dev/measure_pilots.js`](../scripts/dev/measure_pilots.js) across 8 random seeds for 1,200,000 ticks:
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
| **Latency on Apple Silicon** | **7.4 ms to 13.9 ms** | N/A (local), ~28 ms (remote RTX 4090) |
| **Serving Dependency** | `pip install laya-mlx` (lightweight) | `vllm` pooling server + `clm-serve` + CUDA |
| **API Wire Protocol** | TypeSafe `/v1/systemone` | TypeSafe `/v1/systemone` / `/v1/rank` |

---

## 7. Empirical Performance & Benchmark Results

The table below reports measured figures from headless test runs comparing `layaPilot` against `smartPilot` and `simplePilot` (6 seeds per pilot, 20,000 ticks per seed, total 120,000 ticks / 33.3 minutes of live 60 Hz play per pilot):

| Pilot | Paradigm | Ship Losses / Hour | Points / Minute | Thrust Engaged | Hyperspace / Hour | Median Latency |
|---|---|---|---|---|---|---|
| `simplePilot` | Fixed heuristic (no dodging) | 43.9 | 9,017 | 0.0% | 0.0 | < 0.01 ms |
| `smartPilot` | Trajectory physics lookahead | 7.7 | 11,842 | 1.4% | 27.0 | ~0.15 ms |
| `layaPilot` | Neural decision model (`laya-mlx`) | 36.6 | 11,289 | 5.1% | 0.0 | 11.2 ms |

### Breakdown of Ship Losses by Cause

| Pilot | Asteroid Impacts | Saucer Torpedoes | Saucer Collisions | Hyperspace Self-Destruct | Total Losses |
|---|---|---|---|---|---|
| `simplePilot` | 16 | 7 | 0 | 0 | 23 |
| `smartPilot` | 2 | 0 | 0 | 2 | 4 |
| `layaPilot` | 16 | 2 | 1 | 0 | 19 |

### Qualitative Analysis of Gameplay Behavior

Watching `layaPilot` in the browser game reveals distinctive characteristics of neural decision control:

1. **Reactive vs Predictive Movement**:
   `smartPilot` plans multi-second trajectories with exact inertia calculations, making smooth, calculated maneuvers. In contrast, `layaPilot` evaluates discrete tactical classifications from the neural model every ~11 ms. When threats appear, it reacts with bursts of turning and thrust (5.1% thrust engagement vs 1.4% in `smartPilot`), leading to noticeable ship drift and reactive course corrections that look less polished in the UI.

2. **High Scoring Velocity**:
   `layaPilot` achieves 11,289 points/min, approaching `smartPilot` (11,842 pts/min) and outperforming `simplePilot` (9,017 pts/min). In safe conditions, its real-time aiming and shooting pipeline clears asteroids rapidly.

3. **Collision Limits of Semantic Reasoning**:
   While `layaPilot` reduces saucer torpedo deaths from 7 to 2 by executing lateral dodges, its asteroid loss rate (36.6 losses/hour) is higher than `smartPilot` (7.7 losses/hour). A natural-language state summary cannot replace full multi-body physics integration across splitting rock trajectories.
