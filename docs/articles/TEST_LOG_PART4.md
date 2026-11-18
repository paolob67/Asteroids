# Test log, Part 4: teaching a model to fly (2026-11-17 to 2026-11-18)

Part 4 asks one question: can `smartPilot` (the rule-based expert) be the teacher, and a fine-tuned Laya (421M) the student that flies the ship? The success criterion is that the student matches the teacher. This log keeps the same rules as [TEST_LOG.md](TEST_LOG.md): every number traces to a file in [`data/part4/`](data/part4/), and limits are stated next to each result. Parts 1 to 3 and `versions/v3/` are frozen and were not touched; the defect that was found in Part 3's state text is in [FIXES.md](FIXES.md) (F1).

## Setup common to all tests

| Item | Value |
|------|-------|
| Machine | Apple MacBook Air M1, 16 GB, macOS (Darwin 27.2.0) |
| Teacher | `smartPilot` in the working `asteroids.html` (not the frozen v3 file) |
| Student | Laya (421M, ModernBERT), full fine-tune with the upstream PyTorch `laya` package (the `laya-mlx` port cannot train), on the Apple GPU (MPS) with gradient checkpointing |
| Training seeds | 100 to 119 (60,000 ticks each, even frames only). Seeds 0 to 11 are the in-play evaluation games of Part 3 and are refused by the export script |
| Held-out seeds | 200 to 204, never used in training |
| Question | One choice question per frame with 13 options, each a key combination `smartPilot` really used: `none, left, right, thrust, fire, left_thrust, right_thrust, left_fire, right_fire, thrust_fire, left_thrust_fire, right_thrust_fire, hyperspace` |
| Training set | 2,832 items (3,146 capped at 350 per option, then 314 kept for calibration), 2 epochs |
| Held-out set | 1,500 frames, natural key mix |

The state text is built by `layaFrameState` in the working `asteroids.html`. It states measurements and never what to do (a test rejects the words "dodge", "turn ", "danger", "safe", "should" and "must" in the object list).

## Summary

| # | Test | Question | Result in one line |
|---|------|----------|--------------------|
| T12 | First student, state text with distance, bearing and closing speed | Can the model learn the teacher's keys from the situation? | No: accuracy fell from 29.0% to 25.3%, it never pressed left or right |
| T13 | How much of the teacher is in the text? | Is the text the limit? | Yes: a small classifier reading the numbers back gets 0.58 on the turn decision; adding facts raised it to 0.87 |
| T14 | Second student, text with torpedo aim, look-ahead and brake facts | Does the model learn once the text carries the teacher's own computations? | Yes, offline: 77.7% against 21.3% before, and 25.3% for the first student |
| T15 | The student in play | Does it fly? | With instant answers yes (0 losses, 83% of the teacher's points per minute); at its real answer time of about 0.4 s no |
| T16 | The teacher with stale, held decisions | Is the delay the cause? | Yes: the teacher itself drops from 10,621 to 16 points per minute at 0.37 s |
| T17 | Strategy oracle plus executor | If the model always named the teacher's strategy, would the ship fly at a 0.37 s delay? | Yes: 10,365 points per minute and 2 losses at 22 ticks, against 16 points per minute and 12 losses when the keys are delayed (T16) |
| T18 | How much of the strategy is in the text? | Can a model read the strategy from the frame? | From the geometry alone about 0.80 (small classifier); with the look-ahead sentence 0.997, and a 10-line string rule gets 1.000 |
| T19 | Strategy student on the geometry-only text | Does a model that only chooses the strategy beat `simplePilot`? | Points yes (10,346 against 7,991 per minute, all 12 seeds). Losses not shown (10 against 14, interval of the difference includes 0). A control with no model (always `aim`) does as well as the student |

## T12. First student (`student1`)

State text: the 6 nearest objects, each with distance, bearing from the nose, closing speed and, if closing, the straight-line closest approach (distance, bearing, ticks). The ship's own motion relative to the nose. About 230 tokens. Question and options as above. 354 optimizer updates (effective batch 16), 11,976 s (3.3 h) of training. Files: `student1-train_report.json`, `student1-run_report.json`.

| Measure (1,500 held-out frames) | Before | After |
|---|---|---|
| Accuracy | 29.0% | 25.3% |
| Loss | 34.86 | 1.99 |
| Loss of a label-frequency-only prior on the same mix | | 2.21 |
| Random guess (ln 13) | | 2.56 |

On 300 held-out frames the student predicted only `fire`, `thrust` and `none`, never `left` or `right`. The loss fell below the frequency prior only slightly. It did not learn the task. The upstream documentation warns that leaving the loss plateau depends on the seed and needs a few hundred updates or more; this run had 354. The cause was not isolated by a second run with the same text, so T12 says what happened, not why. T13 gives a likely reason.

## T13. How much of the teacher can be recovered from the text?

`scripts/dev/text_ceiling.py` parses the numbers back out of each sentence and trains a small classifier (3 layers, CPU, seconds) on the 26,105 training frames, then scores it on the 6,330 held-out frames. It is a rough floor for what the text carries, not a ceiling for Laya. It also scores hand rules. A parser check found 0 mismatches between the objects in the text and the objects parsed, in all 26,105 rows.

| Text version | Turn accuracy (none, left, right) | Right side when the teacher turns | Wrong side | 13-way key accuracy | Thrust recall |
|---|---|---|---|---|---|
| Original (6 objects, closest approach) | 0.581 | 0.543 | 0.284 | 0.518 | 0.17 |
| + torpedo aim for each target | 0.612 | 0.574 | 0.288 | 0.556 | 0.23 |
| + look-ahead sentence (dodge heading) | 0.793 | 0.783 | 0.134 | 0.763 | 0.79 |
| + brake sentence, 4 objects (final) | **0.868** | **0.892** | **0.048** | **0.839** | **0.93** |

Majority class: turn 0.324, 13-way 0.269. File: `text-ceiling-final-text.txt` (final text only; the earlier rows are from runs whose output was not saved, so they are quoted from the run and not reproducible from a file).

What each addition is:
- **Torpedo aim.** For each rock or saucer: the ticks a torpedo needs and the bearing from the nose to aim at, from the same interception formula as `spIntercept`.
- **Look-ahead.** One sentence from the simulation `smartPilot` itself runs (90 ticks, every object a straight-line mover): what hits the ship if no key is pressed, and, if something does, the thrust length and heading that keep everything clear.
- **Brake.** When the ship drifts at 1.5 units per tick or more, the thrust that would cancel its motion and whether that is safe.

The additions are physics facts and contain no verdict word. They are close to the answer, though: the look-ahead names the heading the teacher turns to. `scripts/dev/check_dodge_facts.js` checks the sentences against `smartPilot` on 37,113 even frames of 4 games: 0 disagreements (hit time 1,156 of 1,156, thrust count and heading 1,068 of 1,068, safe frames 35,957 of 35,957, no safe dodge 81 of 81, and 723 braking frames of 723). It runs inside `scripts/run_all.sh`.

By teacher situation, the hand rule "follow the dodge or brake heading if the text gives one, otherwise aim at the quickest shot" scores:

| Teacher situation | Held-out frames | Rule accuracy on the turn decision |
|---|---|---|
| stay and shoot | 3,267 | 0.75 |
| dodge | 2,369 | 0.94 |
| brake | 658 | 1.00 |
| hyperspace | 36 | 0.00 |

Hyperspace is not explained by the text, and it is 0.5% of the teacher's keys.

## T14. Second student (`student2`)

Text: the 4 nearest objects with torpedo aim, then the look-ahead and brake sentences. 262 tokens on average (maximum 316 against a limit of 512). 708 optimizer updates (effective batch 8). 16,313 s (4.5 h) of training; the machine was swapping up to 12.8 GB. Files: `student2-train_report.json`, `student2-run_report.json`, `eval-offline-student2-600.txt`.

| Measure | `student1` | `student2` |
|---|---|---|
| Held-out accuracy, 1,500 frames (13 options) | 25.3% | **77.7%** |
| Before fine-tuning | 29.0% | 21.3% |
| Held-out loss | 1.99 | 0.54 |
| Calibration error (ECE) | 0.105 | 0.056 |

On a random 600 of the held-out frames (0.37 s per answer, model on the GPU):

| Key | Teacher presses it | Student presses it | Precision | Recall |
|---|---|---|---|---|
| left | 31.5% | 37.0% | 0.73 | 0.85 |
| right | 33.2% | 21.3% | 0.94 | 0.60 |
| thrust | 11.2% | 10.7% | **0.98** | **0.94** |
| fire | 34.5% | 44.0% | 0.75 | 0.96 |

| Teacher situation | Frames | 13-way accuracy | Turn accuracy |
|---|---|---|---|
| stay and shoot | 329 | 0.69 | 0.69 |
| dodge | 211 | 0.85 | 0.93 |
| brake | 57 | 0.91 | 1.00 |
| hyperspace | 3 | 1.00 | 1.00 |

When the teacher turns (388 frames) the student picks the right side 72% of the time, the wrong side 16% and no turn 12%. It leans left: it presses left on more frames than the teacher and right on fewer. It also fires more often than the teacher.

Reading: the text now carries the teacher's dodge and brake decisions, and the student reads them (thrust precision 0.98). The aiming decision (stay and shoot) is where it is weakest. The student's 77.7% is below the small classifier's 83.9% on the same text type (different sample sizes and sets, so this is a rough comparison only).

Limits: one training run per text, one seed, 2 epochs, 2,832 training items out of 26,105 available frames. How much more data or training would add was not tested.

## T15. The student in play

`scripts/dev/measure_student.js`: seed 0, the same game for `smartPilot` and the student. The harness holds each answer back until `--lag` ticks after its request, as `measure_pilots.js` does, and aborts if the student ever falls back to `smartPilot`. Files: `play-student2-lag*.txt|json`. These are single games under a minute of flying each, so they are an anecdote, not a measurement. The Part 3 protocol (seeds 0 to 11, 8,000 ticks) was not run. The key-pressing `studentPilot` that produced these runs, its 13-option key question and the `student2` checkpoint were removed on 2026-11-18, so T15 can be read from the saved files but not re-run from the current `asteroids.html`. `measure_student.js` now plays the strategy pilot (T19).

| Answer delay | Flying | Student losses | Student points per minute | `smartPilot` points per minute | Student turning | Student firing |
|---|---|---|---|---|---|---|
| 1 tick (instant), 1,500 ticks | 0.4 min | 0 | 5,323 | 6,382 | 54.2% | 22.3% |
| 6 ticks (0.1 s), 3,000 ticks | 0.8 min | 2 | 852 | 9,531 | 68.8% | 7.0% |
| 22 ticks (0.37 s, the real answer time), 3,000 ticks | 0.8 min | 1 | 444 | 9,531 | 84.6% | 4.8% |

Server latency during these runs: median 359 to 490 ms (the 1 tick run was the slowest because every tick waited). With the 22 tick delay the student chose `left` for 74.3% of the flying time and `right` for 9.5%. A person watching it in the browser saw the same: the ship turns left almost all the time and does not fire when it should, but it escapes threats by thrusting.

What the numbers say:
- With instant answers the student plays: no loss in 0.4 minutes and 83% of the teacher's points per minute. Instant means a model that answers in under 17 ms; this one takes 0.36 to 0.49 s.
- At its real answer time it does not fly. It does not stop turning and almost never fires.
- Part of the left-turning is a model bias (50.4% `left` against 3.1% `right` with instant answers), and the delay turns it into constant rotation (T16).

## T16. The teacher with stale, held decisions

The student acts on a frame that is 0.1 to 0.4 s old and holds its keys until the next answer. To see whether that alone breaks the pilot, `scripts/dev/measure_delayed_teacher.js` gives `smartPilot` the same handicap with no model involved: every N ticks it decides from the current frame, the keys take effect N ticks later and are held for N ticks, and fire and hyperspace are pulsed on even frames. Seeds 0 to 3, 8,000 ticks each. File: `delayed-teacher-4x8000.txt`.

| Delay | Flying minutes | Losses | Points per minute | Turning | Firing | Thrust |
|---|---|---|---|---|---|---|
| none (the normal pilot) | 8.2 | 0 | 10,621 | 45.9% | 26.2% | 1.4% |
| 1 tick | 8.2 | 0 | 10,010 | 48.3% | 24.6% | 2.2% |
| 6 ticks (0.10 s) | 7.9 | 6 | 680 | 84.9% | 4.0% | 2.2% |
| 12 ticks (0.20 s) | 7.4 | 7 | 284 | 92.8% | 2.8% | 4.4% |
| 22 ticks (0.37 s) | 4.5 | 12 | 16 | 85.9% | 1.2% | 6.6% |

The perfect teacher, once its keys arrive 0.1 s late, turns most of the time and almost never fires, and at 0.37 s it hardly scores. This is the same behaviour as the student's. The reason is mechanical: the ship rotates 3 angle units per tick, and `smartPilot` fires only when the nose is within 3 units of the aim point. A turn key held for 6 ticks rotates the ship by 18 units, so the nose overshoots the target before the next answer. Aiming is a feedback loop that needs a decision every tick or two.

What does survive a delay is the slow part: a dodge or a brake is a plan (turn to a heading, thrust a few times). The student reads those correctly (T14) and, in the browser, escapes well.

Limits: this is the teacher, with a hold rule that I chose (hold the keys for the full interval, no re-decision in between). A model could do something smarter than hold, but then it is no longer the model pressing keys, which is the point of the next design.

## What this means for the design

A model that presses keys directly must answer within a tick or two to aim. Nothing measured here suggests a 421M model on this machine can, and T15 shows it takes 0.36 s or more. The decision for the next step (2026-11-18, the author's proposal): split the work.

| Layer | Does | Needs to be fast? |
|---|---|---|
| Decision model | Chooses the strategy: escape, brake, use hyperspace, aim at a target and fire | No: a plan lasts a second or more |
| Code (executor) | Carries the strategy out: turns to the heading, thrusts, aims, fires, pulses hyperspace | Yes: runs every tick |

This is the structure of Part 3's `layaPilot` for "stay and fire", but here the model chooses from what `smartPilot` did, not from a sentence that names the answer. T17 and T18 test the two halves that need no training.

## T17. Strategy oracle plus executor

`smartPilot` was split in the working `asteroids.html` without changing its behaviour (6 seeds of 20,000 ticks give the same 11,842 points per minute and 4 losses before and after). The shared parts are `spDodgeSearch`, `spBrakePlan` and `spSteer`. `smartPilot` now also returns the `strategy` it used. `spExecute(snapshot, strategy)` carries one of four strategies out on the current frame, every tick:

| Strategy | What the executor does | Teacher situation it comes from |
|---|---|---|
| `escape` | Runs the dodge search, turns to the best heading, thrusts when the nose is on it, shoots whatever is lined up | Something is predicted to hit (`dodge`) |
| `brake` | Turns against the drift and thrusts while speed is 1.5 or more, shoots whatever is lined up | Safe and drifting (`brake`) |
| `hyperspace` | Pulses the hyperspace key on even frames | No dodge works and the jump is acceptable (`hyper`) |
| `aim` | Turns to the quickest torpedo shot and fires, no thrust | Safe (`stay`) |

`scripts/dev/measure_strategy_oracle.js` stands in for a perfect model: every N ticks `smartPilot` names its strategy from the current frame, the choice takes effect N ticks later, and the executor holds it and acts on the current frame every tick. Seeds 0 to 3, 8,000 ticks each. File: `strategy-oracle-4x8000.txt`. T16 is the comparison: the same delays, applied to the keys.

| Delay | Strategy chosen late, executor every tick: losses | points per minute | Keys chosen late (T16): losses | points per minute |
|---|---|---|---|---|
| none | 0 | 10,621 | 0 | 10,621 |
| 1 tick | 0 | 10,324 | 0 | 10,010 |
| 6 ticks (0.10 s) | 0 | 10,286 | 6 | 680 |
| 12 ticks (0.20 s) | 1 | 10,410 | 7 | 284 |
| 22 ticks (0.37 s) | 2 | 10,365 | 12 | 16 |

Flying time is 8.2 to 8.3 minutes in every row of the left half, so the losses are comparable (0, 0, 0, 7 and 14 per hour). Held for 0.37 s the strategy is stale, which costs a little (2 losses in 8.3 minutes against 0 with no delay), but the ship fights at full speed: firing is 28.5% of the time against 26.2% for the undelayed teacher, and the points are the same. The slow part, deciding what to do, tolerates the delay. The fast part, aiming, no longer waits for the model.

Limits: four seeds of one game each, so the loss counts (0 to 2) are too small to rank. The oracle reads the strategy from the teacher's own decision, so this is the best a strategy model can do, not what the model does. The two losses at 22 ticks were not examined; a likely cause is a dodge that starts too late when the strategy is chosen 0.37 s after the frame, but that was not tested.

## T18. How much of the strategy is in the text?

The training frames of T13 (26,105) and the held-out frames (6,330) were relabelled with the strategy the teacher used (stay is `aim`, dodge is `escape`, brake is `brake`, hyper is `hyperspace`). Two checks on CPU, no Laya training. Files: `strategy-ceiling-4-classes.txt` and `strategy-rule-check.txt`.

| Text the classifier reads | Accuracy on the strategy (4 classes) | Notes |
|---|---|---|
| Object list and ship motion only (geometry) | 0.802 and 0.795 (two seeds of a small classifier) | aim recall 0.865, escape 0.783, brake 0.521, hyperspace 0.194 |
| Plus the look-ahead and brake sentences (the final text) | 0.997 and 0.997 | brake recall 1.000, hyperspace recall 0.750 on 36 frames |
| A string rule: "a hit is predicted: escape; else a safe brake is offered: brake; else aim" | 1.000 | 6,330 of 6,330, all four classes |

Majority class is 0.516 (`aim`). So with the final text the strategy is not learned from the situation, it is read: the look-ahead sentence states what `smartPilot` itself computes ("with no key pressed a large rock hits the ship in 87 ticks"), and the strategy follows from the presence of that sentence. `check_dodge_facts.js` shows the sentence agrees with `smartPilot` on every frame. The text has no verdict word, but it does hold the teacher's own answer in the form of a fact.

That has a consequence for what Part 4 can claim. A student trained on this text will probably match the teacher's strategy, but it will do so by reading the look-ahead sentence, not by judging the object list. From the object list alone the ceiling measured here is about 0.80, and the hard classes (brake, hyperspace) are the ones that depend on the simulation. Which of the two texts to train on is a choice that has to be made explicitly: the geometry text tests whether a model can judge danger from what it sees; the look-ahead text tests whether it can use the facts it is given.

Limits: the classifier is small and untuned; 0.80 is a floor, not a ceiling for Laya. The hyperspace class has 36 held-out frames, so its recall means little.

## T19. Strategy student on the geometry-only text (decided before training)

Decision of 2026-11-18 (the author): train the strategy model on the geometry-only text, and decide later whether to add the computed look-ahead. The text is the object list and the ship's motion (4 nearest objects, each with distance, bearing, closing speed, closest approach and torpedo aim), with no look-ahead and no brake sentence (0 of 26,105 training rows contain one). Mean 230 tokens, longest 268 of 512 in a sample of 300.

| Item | Value |
|---|---|
| Labels | The strategy `smartPilot` was following: `aim`, `escape`, `brake`, `hyperspace` (from the teacher's own `why` text, as the earlier export did) |
| Question | One choice question with 4 options; each option says what the executor does and never when to choose it |
| Training frames | The same seeds as T13 (100 to 119), 26,105 frames, capped at 1,000 per strategy: 3,141 items (1,000 aim, 1,000 escape, 1,000 brake, 141 hyperspace) |
| Held-out frames | Seeds 200 to 204, 1,500 sampled in the natural mix (799 aim, 540 escape, 151 brake, 10 hyperspace) |
| Training | Same settings as the second student: 2 epochs, micro-batch 2, gradient accumulation 4, gradient checkpointing; 2,827 training items and 314 calibration items, 708 optimizer updates |
| Play | `strategyPilot` in the working `asteroids.html`: the model is asked again as soon as it has answered; `spExecute` flies the held strategy on the current frame every tick |

**Acceptance bar, fixed before the run.** The author's criterion is that the student does better than `simplePilot`. In the Part 3 protocol (seeds 0 to 11, 8,000 ticks, the real answer delay of 22 ticks) that means fewer ship losses per hour than `simplePilot`, with points per minute not lower. In Part 3 (`pilots-2026-11-10-all3-12x8000-lag6.json`, frozen game) `simplePilot` lost 14 ships in 0.42 flying hours (33.6 per hour) and scored 7,991 points per minute. The working game has the F1 fix, so `simplePilot` and `smartPilot` are measured again on the working file next to the student, and the comparison uses those rows, not the Part 3 numbers. Matching `smartPilot` (4.9 losses per hour and 10,493 points per minute in Part 3) stays the stretch goal. With 12 seeds the loss counts are small, so intervals are reported, and a result inside the interval of `simplePilot` is not called a win.

What a pass would show: a 421M model judged danger from numbers alone and the code did the flying. What a fail would show: the geometry text is not enough, and the look-ahead sentence (T18, 0.997) becomes the next experiment.

### Results

Files: `student3-train_report.json`, `student3-run_report.json`, `student3-questions.json`, `eval-offline-student3-600.txt`, `play-student3-lag22-12x8000.txt|json`, `strategy-oracle-12x8000.txt`, `control-always-aim-12x8000.txt`.

**Training.** 708 updates, 10,955 s (3.0 h), mean loss 0.898 in epoch 1 and 0.543 in epoch 2. On the 1,500 held-out frames (seeds 200 to 204): accuracy 14.7% before and 84.3% after, loss 1.40 and 0.42, calibration error (ECE) 0.211 and 0.029.

**Offline, 600 held-out frames** (0.28 s per answer on this machine): accuracy 0.860 against 0.548 for always answering `aim`.

| Teacher strategy | Frames | Student chose aim | escape | brake | hyperspace | Recall | Precision |
|---|---|---|---|---|---|---|---|
| aim | 329 | 294 | 28 | 7 | 0 | 0.894 | 0.930 |
| escape | 211 | 22 | 167 | 22 | 0 | 0.791 | 0.835 |
| brake | 57 | 0 | 2 | 55 | 0 | 0.965 | 0.655 |
| hyperspace | 3 | 0 | 3 | 0 | 0 | 0.000 | 0.000 |

On 22 of 211 frames where the teacher escapes (10.4%) the student chose `aim`, and on 28 of 329 frames where the teacher aims (8.5%) it chose `escape`. The small classifier of T18 reached 0.80 from the same text on a different, larger frame set (6,330 frames), so the two numbers are close but not on the same frames. Hyperspace has 3 frames here and 36 in T18; nothing can be said about it.

**In play.** Seeds 0 to 11, 8,000 ticks each, answer delay 22 ticks (the 0.36 s the server needs), working `asteroids.html`, all three pilots in one run. The server answered 3,879 requests (350 of them repeated and served from the harness cache), median 396 ms, 95th percentile 590 ms. The student never fell back to `smartPilot`.

| Pilot | Flying minutes | Losses | Losses per hour (95% interval, exact Poisson) | Points per minute | Time on each strategy |
|---|---|---|---|---|---|
| `simplePilot` | 25.0 | 14 | 33.6 (18.4 to 56.3) | 7,991 | |
| `smartPilot` | 24.7 | 2 | 4.9 (0.6 to 17.6) | 10,493 | |
| Student (`strategyPilot`) | 24.8 | 10 | 24.2 (11.6 to 44.5) | 10,346 | aim 84.1%, escape 13.0%, brake 2.9%, hyperspace 0% |

The student lost 7 rocks, 2 saucer torpedoes and 1 saucer body. `simplePilot` and `smartPilot` rows are the same numbers as the Part 3 run on the frozen game (14 and 2 losses, 7,991 and 10,493 points per minute), so the F1 fix did not change them on these seeds.

Differences, paired by seed (bootstrap over the 12 seeds, 10,000 resamples, 95%):

| Comparison | Losses per hour | Points per minute |
|---|---|---|
| Student minus `simplePilot` | -9.4 (-26.3 to 9.8) | +2,355 (1,778 to 2,938) |
| Student minus `smartPilot` | +19.3 (2.4 to 33.9) | -147 (-863 to 589) |

The student scored more than `simplePilot` on 12 of 12 seeds. It lost fewer ships on 7 seeds, the same on 2 and more on 3.

**Against the bar fixed before the run.** Points per minute: passed, clearly. Losses per hour: the point estimate is lower (24.2 against 33.6) but the interval of the difference includes 0 and the student's own interval contains the `simplePilot` rate, so by the rule written above it is not called a win. Against `smartPilot` the student scores the same within the interval (-147, from -863 to 589) and loses more ships (interval of the difference 2.4 to 33.9 per hour).

**Two controls, no model.** Both use the same executor.

| Strategy source | Delay | Losses | Losses per hour | Points per minute | File |
|---|---|---|---|---|---|
| Always `aim`, never anything else | none | 9 | 22 | 10,502 | `control-always-aim-12x8000.txt` |
| Strategy named by `smartPilot` (oracle) | 0 | 2 | 5 | 10,493 | `strategy-oracle-12x8000.txt` |
| Strategy named by `smartPilot` (oracle) | 22 ticks | 4 | 10 | 10,617 | `strategy-oracle-12x8000.txt` |
| Student | 22 ticks | 10 | 24 | 10,346 | `play-student3-lag22-12x8000.txt` |

What this says:
- The score does not come from the model. A pilot that always aims, with no model, scores 10,502 points per minute, the same as the student (10,346) and well above `simplePilot` (7,991). The executor's aiming (the torpedo interception of `smartPilot`) is what raises the points, and it is flown every tick.
- The loss count does not show a model effect either. Always `aim` lost 9 ships, the student 10. The 9 and the 10 were not compared with a paired test; the difference of one ship is far inside the noise.
- The model's possible contribution is the gap between always `aim` (9 losses) and the oracle at the same delay (4 losses). The student did not close any of it in this run.
- The student chose `escape` on 13.0% of the time against 6.4% for the oracle at the same delay, and never chose `hyperspace`, which `smartPilot` uses 14.6 times an hour. `smartPilot`'s 2 losses were both hyperspace deaths.

Why the student's escapes did not turn into fewer losses was not examined. The offline numbers (10.4% missed escapes, 8.5% false alarms) show it is not random, but whether the missed frames are the ones that kill was not measured.

**What is established and what is not.**
- Established: with the real answer delay, a model that only chooses the strategy and a code executor that flies it keep the ship alive and score about as many points as `smartPilot` (-147, interval -863 to 589). The same design with keys chosen by the model did not (T15, 444 points per minute).
- Established: a 421M model learns the strategy from geometry alone to 86% offline, without the look-ahead sentence.
- Not established: that the model's choices matter for survival. The bar "better than `simplePilot`" is met on points because of the executor; the control with no model meets it too.
- Not tested: more frames or epochs, the look-ahead text (T18 says 0.997 is available there), and a student that can ask again before the delay has passed.


## Open questions

1. Whether the model's strategy choices change the loss rate at all. T19 shows no difference from always `aim` (10 and 9 losses); the room is between 9 and the oracle's 4. Next candidates: the text with the look-ahead sentence (T18), more training frames, and a loss weighted toward `escape`.
2. How much of the left bias is in the training data. The teacher's turn mix on the training seeds is 34% left, 34% right and 32% none, so the data is balanced; the bias comes from the model or the capped sampling (350 per option). Not tested.
3. Whether a larger training set or more epochs would raise the aiming frames above 0.69. Not tested.
4. Whether converting the tuned checkpoint to MLX (`laya-mlx convert`) is possible and faster. Not tested.

## T20. Closing version 4: MLX student server, Laya removed, training set committed

**Question.** Can the fine-tuned checkpoint be served by the MLX stack, and can the repository hold everything needed to retrain it?

**Result.**
- `laya_mlx.load(".work/ckpt/student3")` loads the PyTorch-trained checkpoint directly. On 200 held-out frames it chose the same option as the PyTorch server on 200 of 200 frames, with median latency 184 ms against 230 to 400 ms. `student_server.py` now uses it, so serving needs no PyTorch.
- The 804 MB `model.safetensors` is above GitHub's 100 MB limit and is not committed. The two strategy files (5.0 MB and 2.4 MB) are, in `training/student3/`, with `questions.json`, pinned `requirements-train.txt` and `SHA256SUMS`.
- `scripts/dev/reproduce_student3.sh data` regenerated both strategy files from the game and they matched the files used for training byte for byte (`shasum` equal).
- A play run of the MLX server (seeds 0 and 1, 3,000 ticks, 22 tick delay) gave 0 losses and 9,367 points per minute with 176 ms median latency. This is a smoke test of the server, not a measurement; the figures for the article stay those of T19.
- `scripts/run_all.sh`: `ALL CHECKS PASSED`. The student pilot flies 5,000 ticks with no server running (the fallback path). The geometry test now runs the former F1 bearing, closing and wrap cases on `layaFrameState` (48 checks); `layaFormatState` no longer exists in the working copy.

- Version 4 frozen as `versions/v4/asteroids.html` (SHA-256 `11d74e2bed030fed947a9fc4c51f499c49f1d696a5edae534a6d6e48dfa04e1e`, `ALL CHECKS PASSED` on the frozen file, read-only with `SHA256SUMS`).

**Not measured.** A full retrain from the committed files. It takes about 3 hours and is not bit-exact on MPS.

## How to reproduce

```bash
# text checks (no model, seconds)
node scripts/dev/test_laya_geometry.js
node scripts/dev/check_dodge_facts.js

# training data (teacher on seeds 100 to 119, held-out 200 to 204), then the 13-option choice set
node scripts/dev/export_training_set.js .work/data/train4.jsonl 100 119 60000
node scripts/dev/export_training_set.js .work/data/val4.jsonl 200 204 60000
python3 scripts/dev/make_choice_set.py .work/data/train4.jsonl .work/data/train4_choice.jsonl --cap 350
python3 scripts/dev/make_choice_set.py .work/data/val4.jsonl .work/data/val4_choice.jsonl --sample 1500 --seed 1

# how much the text carries (CPU, seconds)
.work/venv/bin/python scripts/dev/text_ceiling.py .work/data/train4.jsonl .work/data/val4.jsonl --ahead

# training (about 4.5 hours on an M1 Air with 16 GB)
.work/venv/bin/python scripts/dev/train_student.py --data .work/data/train4_choice.jsonl \
  --eval .work/data/val4_choice.jsonl --out .work/ckpt/student2 --epochs 2 --micro-batch 2 --grad-accum 4

# offline evaluation of a checkpoint (the student2 runs of T14 and T15 used the 13-option key question and
# studentPilot, both removed; student2 is no longer on disk)
.work/venv/bin/python scripts/dev/eval_student_offline.py .work/ckpt/student3 .work/data/val5_strategy.jsonl --n 600

# strategy student (T19): serve it, then play seeds 0 to 11 against simplePilot and smartPilot
.venv/bin/python scripts/dev/student_server.py --ckpt .work/ckpt/student3 --port 8701   # T19 ran a PyTorch server; this one serves with laya_mlx (same answers, docs/VERSION_4.md)
node scripts/dev/measure_student.js 8000 0 11 --lag=22

# the teacher with stale, held decisions (no model)
node scripts/dev/measure_delayed_teacher.js 8000 0 3 0,1,6,12,22

# strategy oracle plus executor (no model), and the strategy labels against the text (CPU)
node scripts/dev/measure_strategy_oracle.js 8000 0 3 0,1,6,12,22
python3 scripts/dev/strategy_rule_check.py .work/data/val4.jsonl
(cd scripts/dev && ../../.work/venv/bin/python strategy_ceiling.py ../../.work/data/train4.jsonl ../../.work/data/val4.jsonl [--ahead])

```

The student3 training set, its checksums and the retrain recipe are committed in `training/student3/` (see [docs/VERSION_4.md](../VERSION_4.md#4-retrain-student3)); `scripts/dev/reproduce_student3.sh data` rebuilds the two strategy files from the game and compares them byte for byte.

The `.work/` directory (virtual environment, upstream clone, data, checkpoints) is git-ignored and not part of the repository.
