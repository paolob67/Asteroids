# Decision Models for the Asteroids Autopilot

This document analyzes the landscape of decision models (System One models), compares their architectural trade-offs, evaluates hardware feasibility on the development machine (Apple M1), and selects the primary candidates to test for the Asteroids autopilot.

For specific implementation details on CLM, see [CLM.md](CLM.md).

---

## 1. What Are Decision Models (System One Models)?

Decision models represent a paradigm shift from generative LLMs for control and automated decision tasks:

- **Generative LLMs (System Two)**: Predict sequential tokens autoregressively. Flexible for text generation, but slow (hundreds of milliseconds to seconds), prone to formatting/type errors, and prone to hallucinations.
- **Decision Models (System One)**: Take an input state (text string or structured data) and evaluate candidate actions or typed questions in a single, non-autoregressive forward pass.

### Key Characteristics
1. **Typed, Schema-Guaranteed Outputs**: The output is strictly a discrete choice, boolean judgment (noul), or ordinal score. No JSON parsing or regex extraction is needed.
2. **Calibrated Probabilities**: Every candidate receives an explicit probability and confidence score.
3. **Fixed Low Latency**: Because the entire candidate set is scored in parallel, latency is predictable and orders of magnitude lower than autoregressive decoding.

---

## 2. The Standard Protocol: `/v1/systemone`

The open source and hosted decision ecosystem has standardized on the TypeSafe `/v1/systemone` wire protocol.

### Request Schema
```json
{
  "model": "model-identifier",
  "state": "Ship at (512, 384), heading 90 deg, speed 0.1 px/frame. Large rock closing from 85 deg at 1.8 px/frame, TTC 16 frames.",
  "questions": {
    "action": {
      "type": "choice",
      "instructions": "Select the best immediate maneuver to avoid incoming hazards and maintain tactical position.",
      "options": [
        "stay_and_fire",
        "turn_left_and_thrust",
        "turn_right_and_thrust",
        "turn_left_only",
        "turn_right_only",
        "thrust_only",
        "hyperspace"
      ]
    }
  }
}
```

### Response Schema
```json
{
  "answers": {
    "action": {
      "value": "turn_left_and_thrust",
      "confidence": 0.842,
      "probabilities": {
        "stay_and_fire": 0.041,
        "turn_left_and_thrust": 0.842,
        "turn_right_and_thrust": 0.083,
        "turn_left_only": 0.018,
        "turn_right_only": 0.012,
        "thrust_only": 0.003,
        "hyperspace": 0.001
      }
    }
  }
}
```

Because every candidate model in this survey supports or can be adapted to this schema, the Asteroids autopilot client code remains completely decoupled from the underlying model backend.

---

## 3. Comparison of Candidate Decision Models

| Model | Architecture & Backbone | Serving Runtime | Serving Location | Typical Latency | Key Pros | Key Cons |
|---|---|---|---|---|---|---|
| **Laya** (`laya-mlx` / ONNX) | ModernBERT encoder + non-autoregressive head (~1.7 GB) | Native MLX or ONNX Runtime | **Local M1** | **7 to 14 ms** | Sub-frame latency; runs natively on Apple Silicon Metal; minimal memory footprint (< 2 GB). | Compact encoder may struggle with very verbose or multi-entity state text. |
| **Kev** (Kev-0.8B / Kev-4B) | Qwen3.5/3.8 + lightweight pointer readout head | MLX, GGUF (`llama.cpp`), or Ollama | **Local M1** | **25 to 60 ms** | Rich linguistic representation from Qwen base; robust calibration; native `/v1/systemone` compatibility. | Latency spans 2 to 4 game frames on M1. |
| **d1 / d1-3B** (Liquid AI) | Single forward pass LFM backbone (~2.2 GB) | GGUF / Ollama | **Local M1** | **20 to 50 ms** | Fast single forward pass; good benchmark scores under 10B. | Less tested on complex spatial relation tasks. |
| **Jev 1.14 / 1.13** (TypeSafe) | Flagship RLCD decision model | Hosted Cloud API | **Cloud Endpoint** | **70 to 150 ms** | Frontier decision intelligence; zero local hardware consumption; 64k context window. | Network round-trip introduces ~4 to 9 frames of latency; requires API key. |
| **CLM-8B** (Contrastive LM) | Qwen3-8B + dual 20M state/action heads | `clm-serve` + `vllm --runner pooling` | **Remote Linux GPU** | **28 to 50 ms** | Action vector caching; bidirectional InfoNCE loss; trainable heads on custom logs. | Incompatible with local macOS M1; requires dedicated Linux CUDA server. |
| **Clef / Clef-Flash** (Cloudflare) | Qwen backbone + routing head | Workers AI / Open weights | Cloud / Local | ~130 ms (cloud) | Multi-modal support (text, image, audio); cheap cloud hosting. | Slower local inference compared with specialized lightweight heads. |

---

## 4. Hardware Feasibility on the Development Machine

### 4.1 Machine Profile
* **Hardware**: Apple MacBook Air M1 (ARM64, 8 cores, 16 GB Unified RAM)
* **Storage Available**: ~16 GB free space
* **OS & Environment**: macOS Darwin 27.2.0, Python 3.14, Ollama 0.40.15

### 4.2 Local vs Remote Feasibility Analysis

1. **Why Full CLM-8B Cannot Run Locally**:
   * CLM relies on `vllm serve Qwen/Qwen3-8B --runner pooling` to extract last-token-pooled embeddings. vLLM has no official or stable Apple Silicon / Metal support.
   * Full 16-bit Qwen3-8B weights require ~16 GB RAM just for model weights, which would immediately starve macOS and browser memory on a 16 GB unified system.
   * 16 GB free disk space is insufficient for unquantized weights plus torch/cuda dependency caches.
   * *Conclusion*: CLM is viable only via remote Linux GPU server with SSH port forwarding (`ssh -L 8700:localhost:8700`).

2. **Why Laya and Kev Are Ideal for Local M1 Testing**:
   * **`laya-mlx`**: Weights are ~1.7 GB (fitting comfortably within available disk). It runs directly on Apple Silicon Metal via Apple's MLX framework, yielding inference times of 7 to 14 ms. At 60 Hz (16.6 ms per frame), Laya decisions can be returned in under one game frame.
   * **`Kev-0.8B` / `Kev-4B`**: Runs locally via `llama.cpp` GGUF, Ollama, or MLX. The 0.8B variant uses ~1.2 GB RAM with ~25 to 35 ms latency (1 to 2 frames of lag), while the 4B variant uses ~3.5 GB RAM with ~50 to 60 ms latency.
   * Both run completely offline without token costs or network jitter.

---

## 5. Candidate Selection: Laya vs Kev

For local experimentation on the M1, we select **`laya-mlx`** and **`Kev`** as the two primary models to benchmark.

### Detailed Head-to-Head Comparison

| Criteria | Laya (`laya-mlx`) | Kev (`Kev-0.8B` / `Kev-4B`) |
|---|---|---|
| **Primary Strength** | **Ultra-low latency** (7 to 14 ms). Faster than a single 60 Hz tick. | **Higher semantic capacity** and spatial inference quality from Qwen base. |
| **Memory Footprint** | Extremely light (~1.7 GB total). | Light to moderate (1.5 GB for 0.8B, 4.0 GB for 4B). |
| **Inference Lag ($L$)** | 0 to 1 frame lag at 60 Hz. | 2 to 4 frames lag at 60 Hz. |
| **State Text Format** | Best suited for concise, structured key-value summaries. | Handles longer descriptions and raw snapshot summaries well. |
| **Implementation Route** | Python `mlx` service exposing `/v1/systemone` on localhost:8700, or Node.js ONNX runtime (`receptron/laya`). | GGUF served via Ollama/`llama.cpp`, or Python MLX runner on localhost:8700. |

### Evaluation Plan
1. **Baseline Protocol Validation**: Implement a unified JavaScript `/v1/systemone` HTTP client in the test suite and game engine.
2. **Local Candidate 1 (`laya-mlx`)**: Test speed, action stability, and survival rate with minimal simulated lag ($L = 1$).
3. **Local Candidate 2 (`Kev-0.8B / Kev-4B`)**: Test decision quality with moderate lag ($L = 3$).
4. **Hosted Reference (Jev 1.14 / OpenRouter)**: Run identical test traces against cloud Jev to measure the quality gap between local compact models and the frontier reference.
5. **Remote Reference (CLM-8B)**: If remote GPU infrastructure is configured, run contrastive scoring on the same JSONL benchmarks.

---

## 6. Autopilot Integration Design

### 6.1 Asynchronous Game Loop
The game never blocks for model inference:
1. Capture state snapshot at tick $t$.
2. Post request asynchronously to `/v1/systemone`.
3. Game continues rendering and simulating at 60 Hz; previous virtual keys remain active or release on timeout.
4. When response arrives at tick $t + L$, apply the action and immediately trigger the next request.

### 6.2 Action Primitives
The closed set of candidate choices provided to the models:
* `stay_and_fire`: Maintain current trajectory; fire at locked target.
* `turn_left_and_thrust`: Turn counter-clockwise and apply short thrust burst.
* `turn_right_and_thrust`: Turn clockwise and apply short thrust burst.
* `turn_left_only`: Adjust heading left without accelerating.
* `turn_right_only`: Adjust heading right without accelerating.
* `thrust_only`: Accelerate forward along current nose heading.
* `hyperspace`: Emergency teleportation when collision is imminent.

### 6.3 State Representation Arms
To determine what input format decision models interpret best, we test three state formulations:
1. **Raw Snapshot JSON**: Direct stringification of game entity coordinates and velocities.
2. **Structured Key-Value Summary**: Clean text listing ship status, nearest asteroid distance/bearing, and saucer status.
3. **Egocentric Derived Geometry**: Pre-computed bearings relative to ship nose, closing velocities, and time to collision (TTC).

### 6.4 Offline Validation
Before running live browser sessions, candidate models will be evaluated offline using datasets generated by [`scripts/dev/export_pilot_log.js`](../scripts/dev/export_pilot_log.js). This ensures model accuracy and calibration are validated on ground truth situations (`dodge`, `brake`, `stay`, `hyper`) before live gameplay.
