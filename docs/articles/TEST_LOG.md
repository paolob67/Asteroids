# Test log: autopilot measurements, 2026-11-10

A record of every test run while preparing the articles, in the order it was done, with what each one showed and what it did not. Raw files and definitions are in [data/README.md](data/README.md). Nothing here is a final verdict: the Laya pilot has not been optimized, and the next step is to watch it play.

## Setup common to all tests

| Item | Value |
|------|-------|
| Machine | Apple MacBook Air M1, 16 GB, macOS (Darwin 27.2.0) |
| Game file | `asteroids.html`, identical to `versions/v3/` |
| Measurement script | [`scripts/dev/measure_pilots.js`](../../scripts/dev/measure_pilots.js) (one script for all pilots) |
| Flying time | Ticks in the `playing` state, 60 ticks per second |
| Ship loss | A call that removes a life, counted in the game code |
| Laya model | `aac6fef/laya-mlx` (421M), fp16, GPU, served by [`laya_server.py`](../../scripts/dev/laya_server.py) |
| Laya in a headless run | The game waits for the real HTTP answer and applies it `--lag` ticks after the request |

## Summary

| # | Test | Question | Result in one line |
|---|------|----------|--------------------|
| T1 | Rule pilots, long run | How good are `simplePilot` and `smartPilot` over many hours? | `smartPilot` loses a ship 12 times less often (5.7 against 69.1 per hour) |
| T2 | Rule pilots, 100,000 tick check | Are T1 numbers stable? | Yes: 67.6 and 5.8 |
| T3 | Three pilots, 12 starting points | How does `layaPilot` compare at a short budget? | Laya plays; 22 losses against 14 and 2; Laya and `simplePilot` not distinguishable |
| T4 | Laya latency in play and idle | How long does one decision take? | 91 to 104 ms idle, 137 ms median during runs |
| T5 | Single seed, 3 budgets | Do the points agree? | Laya scores in the same range as the others; one game only |
| T6 | Abandoned `--lag=1` run | Does a fast answer help? | Too slow to finish; nothing shown |
| T7 | Latency anatomy (O1, O2) | Where does the time go, and can it be cut? | Model compute, grows with text length; the 322M model is 3 times faster |
| T8 | Browser check | Does drawing slow the game and give the model more time? | No: 60 ticks/s in Chrome, answers arrive 6 to 7 ticks after the request, as in the headless runs |
| T9 | Behaviour counters | How do the pilots move? | Laya drifts 41% of the time against 7% for `smartPilot`, with thrust bursts 6 times longer |
| T10 | Prompt ablation (3 levels, 12 x 8,000 ticks) | Does the model decide anything, or does the sentence decide for it? | With facts only, survival is the same (17 losses against 22) but the score falls by 5,077 points per game and the model almost never dodges; with raw numbers it fails (122 losses). Original prompt reproduced exactly |
| T11 | Offline evaluation, state text and option wording crossed | Where does the answer come from? | With the original prompt the model repeats the code's advice in 150 of 150 records. With facts it matches `smartPilot` no better than answering "stay" always |

## T1. Rule pilots, long run

`node scripts/dev/measure_pilots.js asteroids.html 1200000 simplePilot,smartPilot 8 --json=...`
8 starting points of 1,200,000 ticks, about 42 flying hours per pilot. File: `pilots-2026-11-10-rules-8x1200000.json`.

| Pilot | Losses/h (range over starting points) | Points/min | Thrust | Hyperspace/h | Games ended |
|-------|---------------------------------------|------------|--------|--------------|-------------|
| `simplePilot` | 69.1 (66.9 to 70.7) | 9,527 | 0.0% | 0.0 | 217 (median score 69,610) |
| `smartPilot` | 5.7 (3.5 to 7.1) | 13,992 | 1.7% | 29.1 | 0 |

Causes of loss: `simplePilot` rock 1,763, saucer torpedo 1,092, saucer body 45. `smartPilot` hyperspace 123, rock 109, saucer body 7.

Why it was run: the older docs showed 43.9 and 7.7 losses per hour and described them as coming from this run. They were in fact the 6 x 20,000 tick figures. The older docs were corrected.

## T2. Rule pilots, 100,000 tick check

8 starting points of 100,000 ticks. File: `pilots-2026-11-10-rules-8x100000.json` (and `.txt`). `simplePilot` 67.6 and `smartPilot` 5.8 losses per hour, so the long run is stable.

## T3. Three pilots, 12 starting points of 8,000 ticks

`node scripts/dev/measure_pilots.js asteroids.html 8000 simplePilot,smartPilot,layaPilot 12 --lag=6 --json=...`
About 0.41 flying hours per pilot. File: `pilots-2026-11-10-all3-12x8000-lag6.json`. Laya took 1,558 s of wall time (11,495 requests, 3,735 answered from a cache of identical requests, 1 connection retry).

| Pilot | Losses | Losses/h | Points/min | Thrust | Hyperspace/h | Causes |
|-------|--------|----------|------------|--------|--------------|--------|
| `simplePilot` | 14 | 33.6 | 7,991 | 0.0% | 0.0 | rock 12, saucer torpedo 2 |
| `smartPilot` | 2 | 4.9 | 10,493 | 1.4% | 14.6 | hyperspace 2 |
| `layaPilot` | 22 | 53.3 | 10,096 | 3.8% | 19.4 | rock 22 |

Exact two-sided tests on the loss counts: `simplePilot` against `smartPilot` p = 0.004; `smartPilot` against `layaPilot` p < 0.0001; `simplePilot` against `layaPilot` p = 0.18 (not distinguishable).

What it shows: Laya plays the game for 12 starting points with no fallback to `smartPilot` and no server error, and its points per minute are close to `smartPilot`, with which it shares the target picker (`spPickTarget`). `simplePilot` has its own intercept code.

What it does not show: a ranking. The counts (14, 2, 22) are small, the rates are imprecise, and Laya was not tuned while the rule pilots were. The author judged this insufficient for a verdict.

Older claims this test did not support, now withdrawn in the repo docs: "Laya dodges saucer torpedoes (2 losses against 7)" (it had none, but all 22 losses were rocks and the run is too short to show a saucer effect) and "Laya never presses hyperspace" (it used it 19.4 times per hour).

## T4. Laya latency

| Measurement | Result |
|-------------|--------|
| HTTP round trip, 30 requests, server idle | median 90.9 to 104.4 ms, min 87.3 ms |
| `agent.predict` in-process, 40 calls | median 88.2 ms, min 85.3 ms |
| During the T3 run (requests that reached the server) | median 137.1 ms, 95th percentile 155.8 ms |
| During the T5 runs | median 86 to 105 ms |

At 60 Hz one tick is 16.7 ms, so 90 to 140 ms is 5 to 8 ticks. The older docs claimed 7.4 to 13.9 ms ("sub-frame"); that was not reproduced and was withdrawn. The comparison in T3 uses `--lag=6`. During the T3 run the machine was busy with other software, which is a likely reason for the higher median there.

## T5. Single seed, three budgets (points)

Seed 0, the same game for every pilot, Laya with `--lag=6`. Files: `pilots-2026-11-10-all3-1x3000-lag6.json`, `1x6000`, `1x9000`.

| Budget | `simplePilot` | `smartPilot` | `layaPilot` |
|--------|---------------|--------------|-------------|
| 3,000 ticks (50 s) | 6,560 | 7,270 | 6,970 |
| 6,000 ticks (100 s) | 12,190 | 17,900 | 12,910 |
| 9,000 ticks (150 s) | 16,810 | 25,780 | 23,260 |

| Budget | Ships lost: `simplePilot` | `smartPilot` | `layaPilot` |
|--------|---------------------------|--------------|-------------|
| 3,000 ticks | 0 | 0 | 0 |
| 6,000 ticks | 1 (saucer torpedo) | 0 | 3 (rocks) |
| 9,000 ticks | 2 (torpedo 1, rock 1) | 0 | 3 (rocks) |

What it shows: Laya flies and scores in the same range as the other pilots in this game. Its three losses all happened between ticks 3,000 and 6,000.

What it does not show: anything about ranking. It is one game, and the order changes between budgets (Laya is 5,000 points behind `smartPilot` at 6,000 ticks and 2,500 behind at 9,000).

## T6. Abandoned `--lag=1` run

`layaPilot` only, 6 x 8,000 ticks, an answer taking effect one tick after the request. This was meant to show how much of Laya's result depends on latency. With lag 1 every tick waits for a model answer, so one starting point took 669 s (3 losses, the same count as with lag 6 on that starting point). It was stopped after the first starting point and no file was kept. Nothing is claimed about the effect of latency.

## T7. Latency anatomy (O1 and O2)

`.venv/bin/python scripts/dev/bench_laya_latency.py --calls 30 --json ...`
`agent.predict()` called in-process with the real question set, 30 timed calls after 5 warm-up calls. File: `laya-latency-2026-11-10.json`. Median in ms.

| Configuration | Safe | Danger | Fatal | Very short state | State x4 | Safe, shortened question |
|---------------|------|--------|-------|------------------|----------|--------------------------|
| `laya-mlx` (421M) fp16 GPU (the server's setup) | 87.7 | 88.5 | 88.1 | 66.5 | 125.0 | 65.8 |
| `laya-mlx` fp16 CPU | 280.1 | 278.7 | 279.0 | 236.0 | 423.8 | 227.4 |
| `laya-mlx` fp32 GPU | 113.4 | 113.2 | 113.2 | 87.3 | 164.7 | 86.6 |
| `laya-mlx` fp32 CPU | 300.8 | 290.7 | 289.8 | 240.9 | 448.8 | 236.4 |
| `laya-mlx` bf16 GPU | 106.8 | 106.9 | 105.5 | 78.4 | 149.8 | 77.7 |
| `laya-mlx` fp16 GPU, `compile=True` | 85.5 | 85.6 | 86.9 | 65.9 | 131.8 | 68.9 |
| `laya-mlx` fp16 GPU, `cache_prompts=True` | 91.8 | 94.4 | 98.7 | 75.8 | 140.6 | 73.2 |
| `laya-multilingual-mlx` (322M) fp16 GPU | 34.6 | 27.0 | 27.0 | 26.1 | 50.2 | 26.6 |
| `laya-multilingual-mlx` (322M) fp16 CPU | 126.7 | 113.1 | 109.3 | 96.4 | 174.0 | 91.5 |

What it shows:
- The time is the model's forward pass; HTTP adds a few ms.
- The GPU is 3 to 4 times faster than the CPU; fp16 is the fastest precision; `compile` and `cache_prompts` do not help. The server already uses the best of these.
- Time grows with text length: a shorter question text cuts the call from about 88 to about 66 ms.
- The 322M checkpoint is about 3 times faster (27 to 35 ms). The 7.4 ms in the model's documentation is for that checkpoint, which likely explains part of the earlier discrepancy; 7.4 ms itself was not reached (best case 26 ms).
- The two checkpoints choose the same action on the three real states with different probabilities (Danger: 0.97 for the 421M model, 0.58 for the 322M model). With the shortened question the 322M model chose `hyperspace` for the Danger state.

What it does not show: whether a faster configuration plays better. Not tested.

## Not done

| Item | Why |
|------|-----|
| Pilot runs with the 322M checkpoint or a shortened question (O2b, O3 in play) | Stopped by the author; to be preceded by watching the model play |
| `--lag=1` comparison | Too slow at 88 ms per answer (T6) |
| A longer Laya run (more than 12 x 8,000 ticks) | Hours of wall time at this latency |
| A shielded Laya pilot, other models (Kev, Jev, CLM, d1) | Out of scope for Part 3 |
| Clips (V1 to V9) | Planned, not taken: see [WRITEUP_PLAN.md](WRITEUP_PLAN.md) section 5.4 |

## T8. Browser check: does drawing slow the game and give the model more time?

Concern raised by the author: in a browser the game might run slower because of redrawing, which would give the model more game time per decision than the headless runs assume.

What the code does: [`loop()`](../../asteroids.html) uses a fixed 60 Hz accumulator. It runs as many logic steps as the elapsed real time requires (clamped to 100 ms), then draws once. So slow drawing cannot stretch game time; it can only drop frames. A Laya request is sent from `applyAutopilot()` inside a logic step, only when no request is pending, and the answer is used by the next steps after it arrives.

Measured: [`scripts/dev/browser_check.js`](../../scripts/dev/browser_check.js) drives a real Chrome page over the DevTools protocol, plays 60 s per pilot, and records game ticks per real second, animation frames, and for Laya the number of game ticks between sending a request and receiving its answer.

| Run | Pilot | Ticks per second | Frames per second | Longest gap between frames | Laya request to answer |
|-----|-------|------------------|-------------------|----------------------------|------------------------|
| Headless Chrome | `simplePilot` | 59.9 | 59.8 | 233 ms (once) | n/a |
| | `smartPilot` | 60.0 | 60.0 | 17 ms | n/a |
| | `layaPilot` | 60.0 | 60.0 | 17 ms | median 94.5 ms = 6 ticks (95th percentile 6, max 8; 542 requests) |
| Chrome with a window | `simplePilot` | 59.9 | 59.8 | 267 ms (once) | n/a |
| | `smartPilot` | 60.0 | 60.0 | 18 ms | n/a |
| | `layaPilot` | 60.0 | 60.0 | 18 ms | median 103.8 ms = 7 ticks (95th percentile 7, max 22; 468 requests) |

Files: `browser-2026-11-11-headless-60s.json`, `browser-2026-11-11-headed-60s.json`.

What it shows:
- The browser keeps the game at 60 ticks per second while drawing the full page with its panels. Drawing does not slow the game down, so the model gets no extra game time.
- Laya's answer reaches the game 6 to 7 ticks after the request in the browser. The headless runs use 6 (`--lag=6`). The two agree. At 7 ticks the browser is one tick slower than the headless assumption, not faster.
- Each run shows one long gap between frames (233 and 267 ms for `simplePilot`, which ran first in the session; 783 ms for `smartPilot` when it ran first in a 15 s trial). It happens once, at the start of the first pilot's run, and is not repeated. The cause was not investigated (page warm-up is a guess).
- Request rate: 6.6 to 7.7 game ticks per request in the browser (468 to 542 requests in about 3,600 ticks). In the 12 x 8,000 tick headless run it was 6.3 ticks per request (15,230 requests including answers from the cache, over 96,000 ticks). The headless Laya therefore asked about as often as, or slightly more often than, the browser one.

What it does not show:
- The 60 s browser runs are single games and are not comparable in points to the headless runs (they do not use the headless starting points). They are a timing check, not a scoring test.
- It was run on this machine only, at one window size. On a slower machine the browser could fall below 60 ticks per second. That was not tested.
- Points in the browser runs (6,780 to 9,560 in 60 s) are not a result either: `smartPilot` 8,910 and 9,560, `layaPilot` 8,560 and 8,140, `simplePilot` 6,780 and 8,260, one game each.

## T9. Behaviour counters (after watching the pilots)

Prompted by the author's observations ([OBSERVATIONS.md](OBSERVATIONS.md)): `measure_pilots.js` now also records, from game state only, mean speed, ticks at speed 1.5 or more, mean distance from the field centre, thrust bursts, the number of closing threats at the tick before each loss, and for Laya the decisions per second, the choice changes and the time per choice. Files: `pilots-2026-11-11-all3-12x8000-lag6-behaviour.json` (12 x 8,000 ticks, all three pilots) and `pilots-2026-11-11-rules-8x100000-behaviour.json`.

Result: see the table in [OBSERVATIONS.md](OBSERVATIONS.md) section 4. In short, Laya drifts at 1.5 units per tick or more for 41.4% of flying ticks (`smartPilot` 6.6%), its mean speed is 3.05 (0.50), it is 1,959 units from the centre on average (936), and its thrust bursts last 18.5 ticks on average (3.0). It decides 10.05 times per second.

Reproducibility: this re-run reproduced T3 exactly (22, 14 and 2 losses, identical points and thrust shares). Its Laya median latency was 134.7 ms (T3: 137.1 ms). Before this run the Laya HTTP client in the script was changed from `fetch` to the `http` module with a new connection per request, because one earlier attempt crashed with `setTypeOfService EINVAL` inside Node's `fetch` (seen once, after three finished starting points; the attempt was discarded and no results from it are used). Connection retries in the re-run: 2.

## T10. Prompt ablation: what the state text tells the model (2026-11-17)

Prompted by a review of the code: `layaFormatState` did not describe the situation, it decided it. The code tested for a threat, graded the urgency, picked the side and wrote "Pilot needs to turn left and thrust to dodge", and the option texts repeated the same trigger ("Asteroid on right side. Turn left and thrust away"). The model matched two phrases. This test removes the code's decision in two steps and measures what the model does alone.

`measure_pilots.js --level=verdict|facts|raw` and `layaPromptLevel` in the game file (definitions in [`data/README.md`](data/README.md#prompt-levels---level)). Same 12 starting points, 8,000 ticks, `--lag=6`, same server, the 3-object cap in `facts` and `raw`. Files: `ablation-2026-11-17-*-12x8000-lag6.json`, analysis in `analysis-ablation-2026-11-17.txt`.

| Level | Losses | Losses per hour (95% interval) | Points per minute | Thrust | Hyperspace per hour | Drift | Games ended |
|-------|--------|-------------------------------|-------------------|--------|---------------------|-------|-------------|
| `verdict` (original) | 22 | 53.3 (33.4 to 80.6) | 10,096 | 3.8% | 19.4 | 41.4% | 0 |
| `facts` | 17 | 40.6 (23.6 to 65.0) | 7,529 | 0.8% | 1,303 | 21.3% | 2 |
| `raw` | 122 | 284.9 (236.6 to 340.2) | 520 | 0.0% | 2,996 | 0.0% | 35 |

Reproducibility: `verdict` reproduced T3 and T9 exactly (22 losses, 10,096 points per minute, same losses per starting point, median latency 139.3 ms against 134.7 ms).

Paired over the same 12 starting points (`facts` against `verdict`): points -5,077 per game (95% interval -6,644 to -3,509, lower in 12 of 12), losses -0.4 per game (-1.2 to +0.3, p = 0.73). `raw` against `verdict`: points -19,735 (-20,714 to -18,756), losses +8.3 (+6.3 to +10.3, higher in 12 of 12). `facts` against `smartPilot`: points -5,787, losses +1.2 (+0.4 to +2.1, p = 0.008). `facts` against `simplePilot`: points -885 (-2,625 to +855), losses +0.2 (-0.8 to +1.3): not distinguishable.

What the numbers say:
- **The loss count did not change; the behaviour did.** With facts the pilot has 17 losses against 22 (the difference is within the noise), but it spends 97.5% of its time on `stay_and_fire`, thrusts 0.8% of the time (3.8% before) and drifts 21% (41% before). Its turns are rare and one-sided: `turn_right_and_thrust` 1.1% of flying time and `turn_left_and_thrust` never, against 2.4% and 1.7% with `verdict`. In 11 of its 17 losses no object was closing within 60 ticks on the tick before (`threatsAtLoss`), so the model was not reacting to a threat it could see. In short, the model with facts only behaves close to a pilot that never dodges, as `simplePilot` does (14 losses). Facts did not make it a better dodger, and the loss figure hides that.
- **The model reaches for hyperspace.** With facts it presses hyperspace 1,303 times per hour of flying (546 presses in 12 games, against 8 with `verdict`), with raw numbers 2,996 per hour. Why was not tested; a possible reason is that its option text is the only one that mentions a risk to the ship. Two of the 17 losses were hyperspace self-destructs. The score falls because each jump interrupts aiming and the ship re-enters at a random place: 7,529 points per minute against 10,096.
- **Raw numbers fail.** With offsets and velocities in world axes the pilot spends 35.3% of its flying time on hyperspace and 63.7% on `stay_and_fire`, changes its choice 340 times per minute (19 with `verdict`), and loses a ship about every 13 seconds of flying (284.9 per hour). Whether a larger model could do this was not tested.
- **The point score of the original prompt was most likely not model skill.** Under `verdict` the model returned the code's advice every time (T11), so the score came from the shared target picker plus the code's dodge rule. This was not separated by an experiment with the model removed.

Limits: one model, one wording of the facts and of the neutral options, one cap of 3 objects, one run per level (12 starting points, 0.41 to 0.43 flying hours, 17 to 122 losses). The facts level is not an optimised prompt; a different wording may do better, and this test does not say how much. Latency during the `facts` run was 177 ms median (the machine was also running the offline evaluation, T11), which does not change the result because the lag is simulated at 6 ticks.

## T11. Offline evaluation of the model on recorded states (2026-11-17)

`eval_laya_offline.js` was rewritten. The old version built its sentence from the situation label of the recorded game (`hyper`, `dodge`, `brake`), which is the answer. No figure from it appears in the repository docs, and none should be quoted from it. The new version builds the text from the recorded snapshot only, with the game's own `layaFormatState`, and uses the recorded keys only to score the answer. The 100,000-tick `smartPilot` game of seed 0 was exported (3,862 records: 2,876 stay, 796 dodge, 177 brake, 13 hyper). The labels are `smartPilot`'s keys mapped to the four actions (a brake or an aim is `stay_and_fire`), so a mismatch is not always an error.

Evenly spaced sample of 300 records (234 stay, 58 dodge, 8 brake): 284 of 300 labels are `stay_and_fire`, so always answering "stay" scores 94.7%.

| Level | Accuracy | Dodge records matched |
|-------|----------|-----------------------|
| `verdict` | 86.0% | 28 of 58 |
| `facts` | 89.3% | 42 of 58 |
| `raw` | 41.7% | 19 of 58 |

No level beats the 94.7% baseline. 150 dodge and hyper records only (117 stay, 17 right, 15 left, 1 hyperspace; always "stay" scores 78.0%):

| State text | Option wording | Accuracy | Agreement with what the verdict sentence says to do |
|------------|----------------|----------|---------------------------------------------------|
| `verdict` | verdict | 61.3% | 150 of 150 |
| `verdict` | neutral | 61.3% | 150 of 150 |
| `facts` | neutral | 77.3% | 112 of 150 (only where the sentence says "stay") |
| `facts` | verdict | 11.3% | 23 of 150 |
| `raw` | neutral | 32.7% | 53 of 150 |

How to read it:
- **With the original sentence the answer is the sentence.** In 150 of 150 records the model chose exactly the action the sentence spells out, with either option wording. The state text carried the answer; the option text did not matter once the sentence said what to do.
- **With facts and neutral options the model answered "stay" for 31 of the 32 records where `smartPilot` turned and thrust.** Its accuracy of 77.3% is the same as the 78.0% of always answering "stay". On these records it did not turn when `smartPilot` did.
- **Option wording that states a situation can override the state text.** Facts with the original option texts gave "turn right and thrust" for all 150 records, whatever the facts said. This is consistent with the model matching the option text and ignoring the facts; the reason was not examined further.
- The `smartPilot` label is not ground truth. Where the label says "stay" and the model dodges, the model may be right; the replay in T10 is the check that matters, and there the model does not dodge better.

## Open questions

1. Why the model documentation states 7.4 to 13.9 ms. The 322M checkpoint explains a factor of 3, not a factor of 12. The upstream README quotes 13.4 ms and 7.4 ms on an M3 Max (40-core GPU, 128 GiB); this machine is an M1 Air, which is one candidate explanation. Not tested.
2. Whether Laya's rock losses come from latency, from the one-sentence state, or from the model. Partly answered by T10: with the sentence removed the loss count is the same and the pilot dodges less, so the sentence was not hiding a competent dodger. Latency is still not isolated.
3. ~~How the headless simulation compares to the browser.~~ Answered by T8: same tick rate, same 6 to 7 tick delay.

## How to reproduce

```bash
# rule pilots, long run
node scripts/dev/measure_pilots.js asteroids.html 1200000 simplePilot,smartPilot 8 --json=out.json

# three pilots (needs the Laya server)
.venv/bin/python scripts/dev/laya_server.py --port 8700
node scripts/dev/measure_pilots.js asteroids.html 8000 simplePilot,smartPilot,layaPilot 12 --lag=6 --json=out.json
node scripts/dev/measure_pilots.js asteroids.html 9000 simplePilot,smartPilot,layaPilot 1 --lag=6 --json=out.json

# latency anatomy
.venv/bin/python scripts/dev/bench_laya_latency.py --calls 30 --json=out.json

# real browser timing (add --headed for a visible window; leave it alone while it runs)
node scripts/dev/browser_check.js 60 simple,smart,laya --json=out.json
```
