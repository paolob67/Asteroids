# CLM: The Contrastive Language Model

This document contains reference facts, architecture details, and serving specifications for the Contrastive Language Model (CLM).

For the broader landscape of decision models, local Apple Silicon alternatives (such as Laya and Kev), and the autopilot integration design, see [DECISION_MODELS.md](DECISION_MODELS.md).

---

## 1. Primary References

| Resource | Link |
|---|---|
| **Model Card (Hugging Face)** | <https://huggingface.co/Contrastive-LM/CLM-v0.1-8B> |
| **Code & Server Repository** | <https://github.com/Contrastive-LM/CLM> |
| **Fine-Tuning Guide** | <https://github.com/Contrastive-LM/CLM/blob/main/docs/FINETUNING.md> |
| **Real-Time Game Example (T-Rex)** | <https://github.com/Contrastive-LM/CLM/tree/main/examples/t_rex> |

---

## 2. Model Architecture and Mechanism

CLM is a "System One" decision model that pairs a frozen text encoder with small, specialized projection heads:

- **Base Encoder**: Frozen `Qwen/Qwen3-8B` encoder extracting last-token-pooled embeddings.
- **Projection Heads**: Two lightweight projection heads (a state head and an action head, ~20M parameters each).
- **Training Loss**: Bidirectional InfoNCE contrastive loss that pulls state representations toward the action representation taken in that state.
- **License**: Apache 2.0 for the model weights, code, and base encoder.

### Key Behavioral Properties
1. **Contrastive Scoring**: The model does not generate tokens. It embeds a state text and evaluates it against pre-embedded candidate action descriptions. Output probabilities are relative to the supplied candidate set.
2. **Action Vector Caching**: Because candidate action descriptions are known in advance, their embeddings can be computed once and cached in memory. Subsequent decisions only require embedding the incoming state text.
3. **Context Length**: The default context limit is 2,048 tokens (configurable in `vllm serve` and `clm-serve`).
4. **Adapter Training**: Fine-tuning trains only the two 20M parameter projection heads while keeping the 8B encoder frozen, making training significantly faster and cheaper than full LLM fine-tuning.

---

## 3. Serving Architecture

```text
browser / script  ──►  clm-serve (:8700, POST /v1/systemone, POST /v1/rank)
                             │  (state head + action head, action vector cache)
                             ▼
                       vLLM Qwen3-8B pooling server (GPU, :8090, /v1/embeddings)
```

### Reference Serving Commands (Linux with NVIDIA CUDA GPU)
```bash
pip install contrastive-lm

# Start the vLLM pooling embedding runner on GPU
vllm serve Qwen/Qwen3-8B --served-model-name qwen3-8b --runner pooling --max-model-len 2048 --port 8090 &

# Start clm-serve with CORS enabled for browser access
clm-serve --port 8700 --cors
```

### Published Latency
On an NVIDIA RTX 4090:
- **New State**: ~28 ms median latency.
- **Repeated State**: ~0.6 ms (cached).

---

## 4. Hardware Constraints and Development Setup

### Why CLM Cannot Run Locally on Apple Silicon M1
1. **vLLM Compatibility**: `clm-serve` depends on `vllm --runner pooling`, which requires Linux with CUDA and lacks stable macOS Metal support.
2. **Memory Requirements**: Unquantized 16-bit Qwen3-8B weights require ~16 GB VRAM/RAM. On a 16 GB unified memory Mac, loading the model leaves no RAM for macOS or browser execution.
3. **Storage Limits**: Full model weights and Python dependencies exceed the available disk space on the development machine (~16 GB available).

### Remote GPU Deployment Workflow
To evaluate CLM with the Asteroids autopilot:
1. Deploy `vllm` and `clm-serve` on an external Linux GPU machine (e.g., cloud instance or dedicated workstation).
2. Forward the serving port to the development machine via SSH tunnel:
   ```bash
   ssh -L 8700:localhost:8700 user@gpu-server
   ```
3. Direct the game's decision client to `http://localhost:8700/v1/systemone`.

---

## 5. Model Fidelity Verification

The CLM repository provides an invoice classification check to verify encoder fidelity without running the full game:

- **Expected Output for Reference Invoice**:
  - `department` = `billing` (probabilities: `0.93878` / `0.06122`)
  - `urgency` = `0.41022`
  - `frustration` = `1.98386`

If a deployed server or quantized test setup reproduces these values closely, the underlying embedding pipeline is functioning consistently with the reference model.
