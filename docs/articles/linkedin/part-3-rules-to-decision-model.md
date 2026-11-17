# From Rules to a Decision Model: Who Actually Decides?

*Part 3 of the series "A journey in code modernization with Bob: from 6502 assembly to an AI autopilot"*

A 421M parameter decision model, running locally on a laptop and answering a typed question about the ship's situation, can sit in the loop of an arcade game. In about 25 minutes of measured play per pilot it scored close to the tuned rule-based pilot from [Part 2](https://github.com/paolob67/Asteroids/blob/main/docs/articles/linkedin/part-2-building-on-a-modern-base.md). It also reacted about 100 ms late, drifted around the field, and lost ships to rocks.

That is not the same as the model flying the ship, and a reviewer of this work pointed out why. In my first version the code decided which manoeuvre was needed and wrote it into the sentence the model read, so the model only had to match phrases. I then removed the verdict from the text and measured again. Sections 5, 6 and 9 show the result: without the verdict this model did not dodge.

This article is not a verdict on rules against models. The model pilot is a first version: one model, three prompt wordings, one question, no tuning. What follows is how the pilot is wired, what it looks like on screen, the numbers with their limits, and what I have not tried.

---

## 1. Two Kinds of Model

A generative language model (the "System Two" kind) writes its answer token by token. It is flexible, and it is slow, free-form and sometimes wrong in format. For a control loop that runs 60 times a second, that is a poor fit.

A decision model (the "System One" kind) takes a text description and a typed question, and scores the candidate answers in a single forward pass. There is no generation step. The output is a discrete choice with a probability for each option, so there is nothing to parse and nothing to hallucinate in the format. Latency is fixed by the size of the model and the length of the text.

![Generative model writing free text token by token, against a decision model scoring a closed set of options in one pass](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/g12-system-one-two.png)

Editable source: [`docs/diagrams/g12-system-one-two.drawio`](https://github.com/paolob67/Asteroids/blob/main/docs/diagrams/g12-system-one-two.drawio).

For the game, that is the right shape: a small closed set of tactics in, one tactic out.

---

## 2. Choosing a Model for a Laptop

The development machine is an Apple MacBook Air M1 with 16 GB of memory and about 16 GB of free disk. That rules some candidates out before any test.

![Candidate decision models: where they run, claimed latency, and why or why not](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/p3-model-candidates.png)

Editable source: [`docs/diagrams/p3-model-candidates.drawio`](https://github.com/paolob67/Asteroids/blob/main/docs/diagrams/p3-model-candidates.drawio).

The only latency I measured is Laya's, and it did not match its documentation. I come back to that in section 8.

The choice of Laya was practical, not a ranking of the models. It was the one I could run locally, today, with the least friction.

---

## 3. The `/v1/systemone` Contract

The model sits behind a small local HTTP server (`scripts/dev/laya_server.py`, about 100 lines of Python) on `127.0.0.1:8700`. The wire format is a typed request and a typed response. Abridged from what the page actually sends:

![A typed request with a state sentence and four action criteria, and the response with the chosen action and its confidence](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/snippet-systemone-request.png)

Code source: [`snippets.json`](https://github.com/paolob67/Asteroids/blob/main/docs/articles/linkedin/snippets.json) (`systemone-request`).

(The sentence above is an example of the format, including the verdict the code wrote into it. In a recorded test of the 421M model on a state like this, the probability of the chosen option was 0.97. With a sentence that spells out the manoeuvre, a high probability is not evidence of judgement: see section 9.)

The client does not know which model is behind the endpoint, so another decision model with the same protocol could be swapped in without touching the pilot.

---

## 4. Architecture: The Game Never Waits

The game runs at a fixed 60 Hz. A model call takes several frames, so the pilot cannot wait for it.

![The selector routes the snapshot to one of three pilots; layaPilot sends a situation sentence to the local Laya server and falls back to smartPilot when it is offline; every decision ends in the same keys table](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/v3-pilots.png)

Editable source: [`docs/diagrams/v3-pilots.drawio`](https://github.com/paolob67/Asteroids/blob/main/docs/diagrams/v3-pilots.drawio).

The same flow as a sequence between the four parts involved:

![Sequence between the game loop, the pilot in the page, the local server and the model; the game keeps running while a request is pending](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/g13-browser-mlx-sequence.png)

Editable source: [`docs/diagrams/g13-browser-mlx-sequence.drawio`](https://github.com/paolob67/Asteroids/blob/main/docs/diagrams/g13-browser-mlx-sequence.drawio).

The loop is:

1. If no request is pending, build the state sentence from the current snapshot and send it with a non-blocking `fetch`.
2. Meanwhile, every tick, turn the most recent answer into keys.
3. When the answer arrives, store it and send the next request.

So the ship always follows the latest answer, which is 5 to 8 ticks old. In a real Chrome page I measured the answer reaching the game 6 to 7 ticks after the request (median 94.5 ms headless, 103.8 ms with a window), with the game holding 60.0 ticks per second. Drawing the page does not slow the game down, so the model gets no extra game time.

---

## 5. Turning Geometry into a Sentence

The model never sees coordinates. A few lines of JavaScript compute the geometry and write one sentence in the ship's own frame. The shortest offset to each rock across the wrapping edges, its bearing relative to the nose, and its closing speed give a time to collision:

![Shortest offset across the wrapping edges, closing speed and time to collision for one threat](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/snippet-time-to-collision.png)

Code source: [`snippets.json`](https://github.com/paolob67/Asteroids/blob/main/docs/articles/linkedin/snippets.json) (`time-to-collision`).

In the version I first built, there are three sentences the model can receive:

- **Safe** (nothing closing within 60 ticks): the ship's speed and the nearest target.
- **Danger** (collision in 60 ticks or less): which rock or saucer, from which side, in how many ticks, and which way to turn.
- **Fatal collision emergency** (8 ticks or less): ask for hyperspace.

Read that list again. The code tests whether a threat is closing, grades its urgency from the time to collision, picks the side to dodge and writes "turn left and thrust". The four options the model chooses from repeat those same phrases. That is the verdict prompt, and the decision was in the code before the model saw anything. The sentence is also built from the single threat with the lowest time to collision and says nothing about any other rock. That limit comes back in section 8.

To see what the model does without that help, the page now has two more prompt levels. **Facts** lists the same objects and numbers (distance, bearing, closing speed, time to collision) with no verdict and with neutral option wording. **Raw** gives bare numbers and nothing else.

![The same request at the facts level: objects with distance, bearing and time to impact, and options that describe only the action](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/snippet-facts-request.png)

Code source: [`snippets.json`](https://github.com/paolob67/Asteroids/blob/main/docs/articles/linkedin/snippets.json) (`facts-request`).

---

## 6. Who Does What

The split of responsibility depends on the prompt level. With the verdict prompt it looks like this, and the model's part is small:

![What the model decides and what the code decides](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/p3-responsibility-split.png)

Editable source: [`docs/diagrams/p3-responsibility-split.drawio`](https://github.com/paolob67/Asteroids/blob/main/docs/diagrams/p3-responsibility-split.drawio).

![Mapping from the model's chosen action to the left, right, thrust, fire and hyper keys](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/snippet-choice-to-keys.png)

Code source: [`snippets.json`](https://github.com/paolob67/Asteroids/blob/main/docs/articles/linkedin/snippets.json) (`choice-to-keys`).

One fact matters for reading the results. In `stay_and_fire`, the Laya pilot aims with the same target picker as `smartPilot` (`spPickTarget`). So when its score comes out close to `smartPilot`'s, part of the reason is shared code, not model quality. `simplePilot` has its own, similar interception calculation.

There is also no safety check between the model and the keys. Whatever the model picks is executed. With the verdict prompt the numbers below are therefore the behaviour of the code's rule, the prompt and the model together, and the dodge direction in particular comes from the code. They are not a measure of the model's own judgement.

---

## 7. When the Server Is Down

If the server is not running, the pilot falls back to `smartPilot`, says so in the Decision panel, and retries every 3 seconds. When the server returns, control goes back to the model without a reload. It is a small piece of code, and it means the game is never left without a pilot because a local process is not running.

![State machine: model in control, fallback to smartPilot when a request fails, return to the model when a retry succeeds](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/g15-fallback-state-machine.png)

Editable source: [`docs/diagrams/g15-fallback-state-machine.drawio`](https://github.com/paolob67/Asteroids/blob/main/docs/diagrams/g15-fallback-state-machine.drawio).


---

## 8. What I Observed

### How it was measured

Everything in this section was measured with the verdict prompt, the first version. Section 9 repeats the run with the verdict removed. The measurement script is the one from Part 2, with the same definitions. For Laya there is one difference that must be stated. A headless run cannot let the game wait, so the script sends the real HTTP request, waits for the real answer, and applies it 6 ticks after the request (`--lag=6`). That matches what the browser does: I measured 6 to 7 ticks there.

The Laya run is short because it is slow. At about 90 ms per answer, the long run used for the rule-based pilots would take days. So all three pilots were run together on the same short budget: **12 starting points of 8,000 ticks, about 0.41 flying hours (25 minutes) each**, the same games for every pilot. Do not compare these rows with the long-run rows in Part 2.

### (a) It plays

Across the 12 starting points `layaPilot` ran with no fallback to `smartPilot` and no server error. Two further checks agree: a single seed (seed 0) at 3,000, 6,000 and 9,000 ticks, and the browser timing runs.

![Short run results for simplePilot, smartPilot and layaPilot](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/p3-short-run-results.png)

Editable source: [`docs/diagrams/p3-short-run-results.drawio`](https://github.com/paolob67/Asteroids/blob/main/docs/diagrams/p3-short-run-results.drawio).

On points, in the same 12 games: `layaPilot` is ahead of `simplePilot` in 11 of 12, by 4,192 points on average in 8,000 ticks (95% interval 2,710 to 5,673). It is behind `smartPilot` by 710 points on average, but the interval (-577 to +1,997) includes zero: on points I cannot tell the two apart. Why it beats `simplePilot` I did not test. It moves, `simplePilot` never does; it shares a target picker with `smartPilot`; and it may simply stay alive longer.

### (b) It dies more than the tuned pilot

On survival the picture is less flattering. `layaPilot` lost 22 ships against 2 for `smartPilot`; an exact test on the counts gives p < 0.0001. Against `simplePilot` (14 losses) the difference is not distinguishable (p = 0.18), because the counts are small and the intervals overlap.

I will not turn that into "models lose to rules". It is two specific pilots as built: an untuned model pilot and a tuned rule set.

Two more points about the losses:

- **All 22 were rocks.** None were saucer torpedoes, none were hyperspace deaths. That is different from `smartPilot`, whose largest long-run cause was its own hyperspace.
- **They are spread out.** 10 of 12 starting points had at least one Laya loss, so the result is not one bad game.

A caution on the word "loss": no pilot ran out of ships in the short run. The game gives a free ship every 10,000 points, and at about 1.0 earned and 0.9 lost per minute, `layaPilot` sits close to break-even. By that arithmetic it could go either way over a longer run. That is a hypothesis, not a result.

### (c) What it looks like

This part is from watching it play, and then checking the numbers.

**Clip 3 (about 42 s):** the game is played by `smartPilot` first, then after a while switched to `layaPilot`.

*Video file: `docs/articles/linkedin/clip-part3-gameplay.mp4`. Upload it in the LinkedIn editor here.*

`smartPilot` moves in short taps and stays put. `layaPilot` is capable of moving out of the way of a rock it cannot destroy. Its movements look less controlled, and the ship drifts around the field for longer. Sometimes it flies into approaching rocks and has no time to react.

The behaviour counters (same 12 games) put numbers on that impression:

![Behaviour counters for smartPilot and layaPilot over the same 12 games](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/p3-behaviour.png)

Editable source: [`docs/diagrams/p3-behaviour.drawio`](https://github.com/paolob67/Asteroids/blob/main/docs/diagrams/p3-behaviour.drawio).

The code explains why it drifts. `turn_left_and_thrust` holds turn and thrust for as long as the choice stays the same. There is no brake and no rule that stops thrust when the heading is right, so a dodge keeps pushing the ship after the danger has passed. It also explains why the dodge can point into a second rock: the state sentence describes only the nearest threat, and 8 of its 22 losses (36%) happened with two or more rocks closing.

Latency is not in that explanation, on purpose. I suspect the late decisions play a part, but the one experiment that would isolate it, a run with an answer within one tick (`--lag=1`), took 669 seconds for one starting point and was abandoned. One thing speaks against latency as the main cause: even an instant answer would not give the pilot an action that brakes. Latency is still not isolated. The prompt ablation in section 9 adds that the dodge direction and urgency came from the code's rule, so the drift reflects that rule and the missing brake as much as the model.


### (d) The decision arrives late, and not as fast as documented

The model's own documentation states 7.4 to 13.9 ms. Measured here, one answer takes about 90 ms: 88 ms for the model call in-process, with HTTP adding a few ms. During the runs the median was 137 ms (95th percentile 156 ms), while the machine was busy with other software; idle it was 91 to 104 ms. At 60 Hz that is 5 to 8 ticks.

Where the time goes is partly known:

- It is the model's forward pass, not the network.
- The GPU is 3 to 4 times faster than the CPU, and fp16 is the fastest precision. Compiling and prompt caching did not help.
- Time grows with text length: a shorter question text brought the call from about 88 to about 66 ms.
- The smaller 322M checkpoint of the same model family answers in 27 to 35 ms, about 3 times faster.

The 7.4 ms figure was not reached (best case 26 ms). Of the gap of about 12 times between 88 ms and 7.4 ms, the smaller checkpoint explains about 3 times and about 3.5 times remains unexplained. I do not know why the documentation is faster. Different checkpoint, batch setting or machine state are guesses.

---

## 9. Who Decides? A Prompt Ablation

The critique was simple: if the sentence says "turn left and thrust", the model has nothing to decide. I checked it two ways.

**Offline, on a recorded `smartPilot` game.** I rebuilt the sentence from each recorded state, using only the snapshot (the earlier offline check had read the situation label, which leaks the answer). Of 150 records where `smartPilot` dodged or used hyperspace, the verdict prompt returned the action the sentence spells out in 150 of 150, with the original option texts and with neutral ones. Always answering "stay and fire" would score 78.0% on those records. The verdict prompt scored 61.3%, because the sentence's advice is not always what `smartPilot` did. The model followed the sentence, not the situation. With facts only and neutral options it scored 77.3% and answered "stay" for 31 of the 32 records where `smartPilot` turned and thrust. With the verdict removed from the text but the verdict wording kept in the options, it scored 11.3%: it answered "turn right" every time.

**In play.** Same 12 starting points of 8,000 ticks, same server, answer applied 6 ticks late, three prompt levels:

![Prompt ablation: verdict, facts and raw prompt levels compared on losses, points, thrust and hyperspace](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/p3-ablation.png)

Editable source: [`docs/diagrams/p3-ablation.drawio`](https://github.com/paolob67/Asteroids/blob/main/docs/diagrams/p3-ablation.drawio).

What the table says:

- **The verdict run reproduced the first run exactly** (22 losses, 10,096 points per minute, same losses per seed), so the comparison is fair.
- **Facts only: the model stopped dodging.** It chose `stay_and_fire` 97.5% of the time, turned right and thrust 1.1%, never turned left, and pressed hyperspace 1.3%. Thrust fell from 3.8% to 0.8% of ticks. Points fell by about 5,000 per game (95% interval 3,509 to 6,644 lower, lower in 12 of 12). Losses were 17 against 22; the difference is not distinguishable (p = 0.73), but in 11 of the 17 losses no closing threat had been flagged. Hyperspace use rose to 1,303 per hour, and 2 games ended.
- **Raw numbers: the model cannot fly.** 122 losses (284.9 per hour), 520 points per minute, 35 games ended, and 35.3% of flying time on hyperspace.
- **The score advantage of the first version came from shared code.** Aiming uses `spPickTarget`, and the dodge rule was in the sentence.

What this does not show. It is one model of 421M parameters, one wording of the facts, three objects in the sentence, one run per level and no tuning. It does not show that a decision model cannot choose a tactic. It shows that this checkpoint, prompted this way, did not, and that my first result was measuring the code. Whether fine-tuning would change that I have not tested. The upstream README of the `laya-mlx` port says training stays upstream, and I did not check whether the upstream project can fine-tune this checkpoint for this task. A realistic ceiling for training on logged `smartPilot` decisions is `smartPilot` itself delayed by the model's latency.

---

## 10. What I Have Not Tried Yet

Each of these is a hypothesis. None has a result.

![Open questions and what would answer each](https://raw.githubusercontent.com/paolob67/Asteroids/main/docs/diagrams/p3-not-tried.png)

Editable source: [`docs/diagrams/p3-not-tried.drawio`](https://github.com/paolob67/Asteroids/blob/main/docs/diagrams/p3-not-tried.drawio).

Two improvement ideas also came from watching: a rule to brake or stop thrusting after a dodge for `layaPilot`, and a return to the centre after moving for `smartPilot`. The ablation adds three more: a different wording or more objects in the facts prompt, a model trained on logged (facts, `smartPilot` action) pairs, and a hybrid where the simulation scores each candidate manoeuvre and the model chooses among neutral outcomes such as "A: hit in 40 ticks, B: clear".

---

## 11. Rules, Models, or Both

I started this series to see what happens when old code becomes modern code. By Part 3 the question has moved to the boundary between rules and models, and the first answer I wrote down was wrong.

What I can say from this comparison:

- **Geometry, threat judgement and aiming looked like a job for code, and the data agrees.** With the verdict in the sentence the model returned the code's advice. With only facts it stopped dodging.
- **A model in the loop is not a model deciding.** If the prompt contains the decision, the pilot measures the code that wrote it. The check is cheap: remove the verdict and run again.
- **Whether a model can choose the tactic from facts is still open.** Not this checkpoint, with this wording and no training. A larger model, a trained one or a hybrid that gives the model neutral outcomes to choose from are the next experiments.

For now the result is the one in the title: the model did not decide, until I made it, and then it did not do well.

---

## What This Series Showed

1. **Porting** (Part 1): an LLM translates structure well and fails on conventions the source never states. Running the code against the source found what reading did not.
2. **Building on a modern base** (Part 2): explicit state, a narrow action interface and determinism made autoplay cost lines instead of rewrites.
3. **Rules and models** (Part 3): the same interface took a decision model as easily as a rule set, and a review plus an ablation showed that the first result measured the code that wrote the prompt, not the model.

---

### Commands to Reproduce

```bash
# Start the local decision model server (see docs/LAYA.md for setup)
.venv/bin/python scripts/dev/laya_server.py --port 8700
curl -s http://127.0.0.1:8700/health

# All three pilots, 12 starting points of 8,000 ticks, answer applied 6 ticks late (about 25 minutes)
node scripts/dev/measure_pilots.js asteroids.html 8000 simplePilot,smartPilot,layaPilot 12 --lag=6 --json=out.json

# Prompt ablation (verdict, facts, raw), about 25 minutes per level
node scripts/dev/measure_pilots.js asteroids.html 8000 layaPilot 12 --lag=6 --level=facts --json=out.json
python3 scripts/dev/analyze_ablation.py docs/articles/data

# Offline check on a recorded smartPilot game
node scripts/dev/export_pilot_log.js asteroids.html 100000 smartPilot 0 /tmp/smart_0.jsonl
node scripts/dev/eval_laya_offline.js /tmp/smart_0.jsonl 150 facts

# Latency anatomy of the model call
.venv/bin/python scripts/dev/bench_laya_latency.py --calls 30 --json=out.json

# Real Chrome timing (60 s per pilot)
node scripts/dev/browser_check.js 60 simple,smart,laya --json=out.json
```

Raw output and definitions: [`docs/articles/data/`](https://github.com/paolob67/Asteroids/blob/main/docs/articles/data/README.md). Run: 2026-11-10 and 2026-11-11, Apple MacBook Air M1 (16 GB), Node v26.3.1, `laya-mlx` 0.6.0 with `aac6fef/laya-mlx`. The Laya run is short (22 losses) and the rates are imprecise.

The game, the frozen versions 1 to 3, the measurement scripts and the raw data are all in the repository: [github.com/paolob67/Asteroids](https://github.com/paolob67/Asteroids).

*Previous: [Part 2: Once the code is modern, a game becomes something a program can play](https://github.com/paolob67/Asteroids/blob/main/docs/articles/linkedin/part-2-building-on-a-modern-base.md)*
