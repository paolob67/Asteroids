# CLM: the decision model for the planned autopilot

This page keeps the reference facts about the model and the design decisions taken so far for the CLM autopilot. Nothing here is implemented yet.

## 1. Where everything is

| What | Link |
|------|------|
| Model card (primary reference) | <https://huggingface.co/Contrastive-LM/CLM-v0.1-8B> |
| Code, server and examples | <https://github.com/Contrastive-LM/CLM> |
| Fine-tuning guide | <https://github.com/Contrastive-LM/CLM/blob/main/docs/FINETUNING.md> |
| Real-time game example (Chrome dinosaur) | <https://github.com/Contrastive-LM/CLM/tree/main/examples/t_rex> |

Facts below were read from those pages on 2026-11-09. Re-check them before relying on a number.

## 2. What CLM is (and what it is not)

The Contrastive Language Model is a "System One" model: two small projection heads (a state head and an action head, about 20M parameters each) on top of a frozen Qwen3-8B encoder, trained with a bidirectional InfoNCE loss so that a state is pulled towards the action taken in it. License: Apache 2.0 for the weights, the code and the Qwen3-8B encoder.

Consequences for this project:

| Property | What it means for the Asteroids pilot |
|----------|---------------------------------------|
| **It does not generate.** It scores candidates you give it, and the probabilities are relative to that set. | The pilot cannot "emit the five booleans". We must define a closed list of candidate actions and ask the model to pick one (`Choice` question, or `/v1/rank`). |
| **The heads were trained on prose.** The API reference says `state` can be a string, an object or an array. Objects are rendered as `key: value` text and arrays as `- item` lines, "never JSON". That describes the server's rendering; it does not say a JSON string is rejected. | A JSON string can be sent as the state (not yet tried). Expect it to be out of distribution, so quality is unknown. Test it as one arm against a prose description and against the server's `key: value` rendering of an object. |
| **Each candidate is embedded from its description.** | The wording of each action description is part of the model input, so it needs to be tested like any prompt. |
| **Context limit.** States longer than 2048 tokens are truncated (configurable together on `vllm serve` and `clm-serve`). | Cap the number of objects per state. |
| **Encoder-locked.** The heads need Qwen3-8B last-token-pooled embeddings. | A GPU server for the vLLM pooling encoder is required (see section 3). |
| **Fine-tuning trains only the heads.** | Cheap compared with fine-tuning an 8B generative model. Needs state/action pairs in the format the training script expects (to be checked in `train/adapters.py`). |
| **Zero-shot results are for general tasks.** The model card says it is on par with a larger reference model on computer-use, gaming and tool-calling tasks. | Not a promise for Asteroids. The model card also says its best published results come from fine-tuned heads. |

## 3. How it is served

```text
browser or script  ──►  clm-serve (:8700, POST /v1/systemone, POST /v1/rank)
                              │  state head + action head, embedding cache
                              ▼
                        vLLM Qwen3-8B pooling server (GPU, :8090, /v1/embeddings)
```

```bash
pip install contrastive-lm
vllm serve Qwen/Qwen3-8B --served-model-name qwen3-8b --runner pooling --max-model-len 2048 --port 8090 &
clm-serve        # API and playground at http://localhost:8700/ ; downloads the 75 MB head on first run
```

Published latency (one RTX 4090, server side, median): about 28 ms for a state the server has not seen, about 0.6 ms for a repeated state, with the action set held fixed. Action embeddings are cached, so a small fixed list of candidate actions is cheap. Browser calls need `clm-serve --cors`, which is off by default.

Open question: which machine will run the encoder. The development machine is a Mac, and the card asks for a GPU with vLLM. Latency on our hardware must be measured before design numbers are fixed.

## 4. Design decisions so far

### 4.1 The game and the model run asynchronously (decided)

The game never waits for the model. The model is treated like any other player:

1. Take the latest `snapshot()` that exists now.
2. Send it to the model.
3. While waiting, the game keeps running and the keys from the previous decision stay held (or are released after a timeout).
4. When the answer arrives, set the keys, then take whatever the newest snapshot is and send that.

The answer therefore always describes a moment that is already in the past by the time it is applied. The ship has moved, rocks have moved, and the action may be stale. This is part of the experiment, not a defect to hide. The T-Rex example in the CLM repository does the same thing: it keeps several requests in flight, asked a few frames apart, so a decision arrives every few frames and not once per round trip. It also offers a `--lockstep` option (game freezes while the model answers) as a separate experiment, which we do not use for the main result.

### 4.2 What can and cannot be measured (consequence of 4.1)

- Real-time runs depend on the machine and on network and server load, so they are not repeatable. They are right for the browser demo.
- The existing headless harness ([`measure_pilots.js`](../scripts/dev/measure_pilots.js)) is repeatable because it is tick-driven. To keep that, the harness can simulate the asynchrony: a decision requested at tick `t` is applied at tick `t + L`, where `L` is a latency measured on the real server (and swept to see its effect). The game still never waits.
- Real-model runs are far too slow for the 1,200,000-tick runs used for the table in [Version 3](VERSION_3.md#3-how-well-it-plays). Plan for shorter runs and report confidence intervals.

### 4.3 Open design questions

| Question | Options | Note |
|----------|---------|------|
| Candidate action set | Per-tick key combinations; short key sequences ("turn right and fire for 6 ticks"); intents ("dodge towards heading X", "shoot the saucer") | Intents need an executor below the model, which moves the work back into rule code. Start with the plain one, since it is the fairest test. |
| State text | Raw `snapshot()` as a JSON string; the same data as an object (the server renders `key: value`); a prose description; derived, egocentric facts (relative position, bearing from the nose, closing speed, time to hit) | Test all of them. Derived facts do part of the work, and this must be reported. In the T-Rex example a physics planner labels each action safe or unsafe inside the candidate text, so the survival number there measures the combined system. |
| Safety shield | None; veto of actions that `smartPilot` predicts will be hit | Report results with and without. The T-Rex example counts every shield intervention. |
| Zero-shot or fine-tuned heads | Zero-shot first as the baseline; then train the heads on `(state text, action)` pairs produced by `smartPilot` | `smartPilot` is a free expert, and `logState()` already prints state/decision pairs. Oversample the rare dangerous states. A later round can relabel the states the model itself reaches. |

## 5. Corrections to earlier notes

An earlier brainstorm in this project assumed CLM is a generative model that returns a JSON object of five booleans, and compared "zero-shot prompting" with "LoRA fine-tuning of an 8B model". Both assumptions were wrong. CLM chooses among candidates you supply, was trained on prose (a JSON string is allowed as the state but untested), and fine-tunes by training two small heads on a frozen encoder.

## 6. Offline tests from pilot logs

Before building a live pilot, the model can be tested offline on states the existing pilots met. [`scripts/dev/export_pilot_log.js`](../scripts/dev/export_pilot_log.js) runs a pilot headless and writes one JSON line per sampled tick: the `snapshot()` the pilot saw, the keys it chose, its `why` text and a `situation` label.

```bash
node scripts/dev/export_pilot_log.js asteroids.html 600000 smartPilot 0 /tmp/smart_0.jsonl
```

Calm ticks are far more common than dangerous ones, so records are sampled by situation (every tick for hyperspace, every 5th for dodge, every 15th for brake, every 30th for "safe, stay and shoot"). The `situation` is read from the `why` text of `smartPilot`. For `simplePilot` every record is labelled `simple`.

Result for `smartPilot`, seed 0, 600,000 ticks (10,000 s of play):

| Situation | Ticks | Records written | Most common keys |
|-----------|-------|-----------------|------------------|
| stay (nothing predicted to hit) | 517,333 | 17,244 | none 30%, fire 26%, right 22%, left 22% |
| dodge | 21,994 | 4,398 | left 32%, right 31%, right+thrust 11%, thrust 11%, left+thrust 10% |
| brake | 15,607 | 1,040 | left 40%, right 40% |
| hyperspace | 117 | 117 | hyper key down on 68% (it is pressed on even frames only), 32% are the odd frames of the same decision |

Notes for using these logs:

- The hyperspace records include the odd frames of a decision, where the pilot's keys are all up. A test should compare the decision (from `why`), not only the key state on that tick.
- "Fire" is also pulsed on even frames only, so a single tick of "no fire" can be part of a firing decision.
- Records are not independent: neighbouring ticks of the same dodge look alike. Split train and test by seed or by game time, not at random.

### Where the model can run

The check on the development machine (2026-11-09): Apple M1, 16 GB RAM, 8.6 GB free disk, no GPU server, no `clm-serve`, no vLLM, no `torch`. Qwen3-8B in 16-bit is about 16 GB of weights, so it will not fit in this machine's memory or disk. The offline tests need the encoder served somewhere else (a GPU machine reached over `ssh -L 8700:localhost:8700`, or a hosted endpoint), or a smaller local copy of it.

Local option to test (read from `src/clm/embedder.py` in the CLM repo): `clm-serve` does not need vLLM itself. It posts `{"model", "input": [texts], "encoding_format": "base64", "truncate_prompt_tokens": 2048}` to any OpenAI-compatible `/v1/embeddings` URL (`--emb-url`, `--emb-model`) and L2-normalises the returned vectors. Ollama is installed here (0.40.15) and offers such an endpoint. Open risks, none tested yet:

| Risk | Why it matters |
|------|----------------|
| The heads need Qwen3-8B **last-token-pooled** embeddings. Ollama's `qwen3-embedding` is a different, fine-tuned model and must not be used. | The correct model is the plain generative Qwen3-8B, and whether Ollama returns its last-token vector for it is unknown. |
| A 4-bit copy (about 5 GB, estimate) gives vectors that differ from the 16-bit ones the heads were trained on. | Quality may drop by an unknown amount. |
| Ollama may ignore or reject `encoding_format: base64` and `truncate_prompt_tokens`. | Might need a small shim in front of it. |
| `pip install contrastive-lm` pulls in torch; the machine runs Python 3.14 and has 8.6 GB free disk. | Possible install failure or disk pressure. |

A fidelity check is available without a GPU: the CLM README gives expected outputs for its invoice example (`department` = billing with probabilities 0.93878 / 0.06122, `urgency` 0.41022, `frustration` 1.98386). If a local setup reproduces these numbers closely, the encoder is behaving like the reference one.
