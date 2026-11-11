# Version 3: two new autopilots, one built on rules in the code and one on a decision model

Version 3 is frozen in [`versions/v3/`](../versions/v3/) (SHA-256 `9cef5640c11b7382514afdd65a535a01a4d722b77a8c691573f552e8ea06edb6`). It starts from the frozen [version 2](VERSION_2.md), whose only autopilot (`simplePilot`) rotates and fires from the centre of the screen. The game rules are unchanged. What changes is who can fly the ship. Version 3 adds two new pilots that solve the same problem in opposite ways:

- **`smartPilot`: rules implemented in the code.** A hand-written autopilot that predicts where every rock, saucer and torpedo will be over the next 90 ticks, replays the ship's own physics, and picks the cheapest manoeuvre that avoids every hit. Hyperspace is the last resort. Every decision can be explained by reading the code.
- **`layaPilot`: a decision model.** A small neural model (`laya-mlx`, running locally on Apple Silicon) receives a short text description of the situation and chooses one of four actions. The behaviour comes from the model, not from rules about manoeuvres.

Both have the same interface as `simplePilot`: a snapshot in, five booleans (`left`, `right`, `thrust`, `fire`, `hyper`) out. A selector in the Decision panel switches between Manual, Simple, Smart and Laya at any time, and the same measurement scripts score all of them. This makes version 3 a direct comparison between the two approaches, with `simplePilot` as the baseline.

The root [`asteroids.html`](../asteroids.html) was identical to the frozen file at the moment of freezing and is now the working copy for later work. See [`versions/v3/README.md`](../versions/v3/README.md) for the checksum and verification commands. Autopilots based on other decision models (Kev, Jev, CLM) are planned for later steps and are not part of this document. The decision model landscape, Apple Silicon M1 feasibility, and autopilot design decisions are in [DECISION_MODELS.md](DECISION_MODELS.md), with dedicated plans in [LAYA.md](LAYA.md) and [CLM.md](CLM.md).

## 1. What changed

| Area | Version 2 | Version 3 |
|------|-----------|-----------|
| Controllers | Autopilot on/off switch (`simplePilot` only) | Selector with four buttons: **Manual**, **Simple** (`simplePilot`), **Smart** (`smartPilot`, rule-based), **Laya** (`layaPilot`, decision model) |
| `snapshot()` | No fractional velocity, exploding rocks looked alive | Adds `ship.vxf`, `ship.vyf` (needed to predict the ship's path) and `exploding` on rocks and the saucer |
| Decision panel | Keys light only on the tick they are held | A key held in the last 0.4 s stays dimly lit, and a line says whether the ship is thrusting, coasting or at rest. With Laya it also shows the model's choice, probability, confidence and latency |
| Measurement | `measure_autopilot.js` | Adds `measure_pilots.js` (several seeds, losses per hour, causes), `death_causes.js`, `check_thrust_physics.js` and `test_controller_selector.js` |

## 2. How `smartPilot` works

It never writes to the ship. The only way it changes the ship's speed is the THRUST key, which the game turns into a push along the nose (see section 4).

Every tick it asks: if I do nothing special, does anything hit me in the next 90 ticks?

1. **Prediction.** Rocks, the saucer and saucer torpedoes never change course, so each is moved forward in a straight line. The ship's own motion (rotation, thrust, friction) is replayed tick by tick with a copy of the game's `updateShip` rules, so a ship that is already drifting is handled. Hits use the game's own `COLIDE` rule plus a small safety margin.
2. **Nothing hits.** Stay in place, aim and shoot. If the ship is drifting and braking is also safe, turn against the drift and thrust.
3. **Something hits.** Try 16 headings times 5 thrust lengths (plus the direction opposite to the current drift). Each candidate is: turn to the heading, thrust N times, then coast. The cheapest candidate that avoids every hit is used, so a rock arriving from a different angle while the pilot aims at another is handled by moving, not by luck.
4. **No manoeuvre is safe and the hit is 8 ticks away or less.** Estimate the risk of hyperspace and press it if the risk is below 70%. The risk combines the original's self-destruct rule (`HYPER`: a random y of 0x18 or more, then a rock count at or above a random limit of 4 to 18) with the chance of re-entering, 48 ticks later, in the path of something.
5. **Shooting.** Target choice uses the same interception maths as `simplePilot`, with the thing on a collision course counted double, a saucer counted a bit more than a rock, and exploding rocks skipped. The pilot fires whenever the nose is on the target, including while it dodges.

## 2b. How `layaPilot` works (a decision model)

`layaPilot` delegates the question "what should the ship do now?" to a local decision model. The model is [`laya-mlx`](LAYA.md), a 421M-parameter encoder that scores a fixed set of candidate actions in a single forward pass, with calibrated probabilities. It is served by a small Python daemon on `127.0.0.1:8700` ([`laya_server.py`](../scripts/dev/laya_server.py)) and called from the page with `fetch()`.

1. **Describe the situation.** The pilot turns the snapshot into one sentence in the ship's own frame: either "Safe" (with the speed and the nearest target), or "Danger" (which rock or saucer, which side, ticks to collision, which way to turn), or "Fatal collision emergency" when impact is 8 ticks away or less. The sentence is built by a few lines of JavaScript, so the geometry is still computed by code; the model does not see coordinates.
2. **Ask the model.** The request carries the sentence and one question with four options: `stay_and_fire`, `turn_left_and_thrust`, `turn_right_and_thrust` and `hyperspace`, each with a short criteria text. The model answers with the chosen option, its probability and its confidence.
3. **Act on the answer.** The last answer is turned into keys every tick. The request is asynchronous, so the 60 Hz loop never waits for the model; the ship follows the most recent decision, which on the machine used for the measurements is about 90 to 140 ms old (5 to 8 ticks). `stay_and_fire` aims and shoots with the same target picker as `smartPilot` (`spPickTarget`); the dodge options hold turn and thrust; `hyperspace` presses the hyperspace key.
4. **No server, no problem.** If the server is not running, the pilot falls back to `smartPilot` and says so in the Decision panel, retrying every 3 seconds.

There is no safety check between the model and the keys: whatever the model chooses is executed. The measurements in section 3 therefore show the model's own behaviour. Setup is in [LAYA.md](LAYA.md#32-setup-and-serving-commands).

## 3. How well it plays

[`scripts/dev/measure_pilots.js`](../scripts/dev/measure_pilots.js) runs each pilot from several starting points. A starting point means: the game's `RAND` is advanced by a different number of calls after `initGame()`. The runs are repeatable. All three pilots use one definition: flying time is the ticks spent in the `playing` state, and a loss is a call that removes a life. Definitions, environment and raw files are in [`docs/articles/data/`](articles/data/README.md).

The two rule-based pilots were run for 8 starting points of 1,200,000 ticks (about 42 flying hours each). `layaPilot` is slow (one answer takes about 90 to 140 ms on the test machine), so all three pilots were also run together for 12 starting points of 8,000 ticks (about 0.41 flying hours each), with `layaPilot` answers delayed by 6 ticks. Rows from runs of different length must not be compared with each other.

Long run, rule-based pilots (8 x 1,200,000 ticks):

| Pilot | Control Paradigm | Ship Losses / Hour (range over starting points) | Points / Minute | Thrust Engaged | Hyperspace / Hour | Games Ended |
|---|---|---|---|---|---|---|
| `simplePilot` | Fixed heuristic (no dodging) | 69.1 (66.9 to 70.7) | 9,527 | 0.0% | 0.0 | 217 |
| `smartPilot` | Rules in code: trajectory lookahead | 5.7 (3.5 to 7.1) | 13,992 | 1.7% | 29.1 | 0 |

Short run, all three pilots (12 x 8,000 ticks, `--lag=6`):

| Pilot | Control Paradigm | Ship Losses / Hour | Losses | Points / Minute | Thrust Engaged | Hyperspace / Hour |
|---|---|---|---|---|---|---|
| `simplePilot` | Fixed heuristic (no dodging) | 33.6 | 14 | 7,991 | 0.0% | 0.0 |
| `smartPilot` | Rules in code: trajectory lookahead | 4.9 | 2 | 10,493 | 1.4% | 14.6 |
| `layaPilot` | Decision model (`laya-mlx`) | 53.3 | 22 | 10,096 | 3.8% | 19.4 |

Causes of the ship losses:

| Run | Pilot | Rocks | Saucer Torpedoes | Saucer Body | Hyperspace Self-Destruct | Total Losses |
|---|---|---|---|---|---|---|
| Long | `simplePilot` | 1,763 | 1,092 | 45 | 0 | 2,900 |
| Long | `smartPilot` | 109 | 0 | 7 | 123 | 239 |
| Short | `simplePilot` | 12 | 2 | 0 | 0 | 14 |
| Short | `smartPilot` | 0 | 0 | 0 | 2 | 2 |
| Short | `layaPilot` | 22 | 0 | 0 | 0 | 22 |

What the comparison shows:

- **Rules in code win on survival.** In the long run `smartPilot` loses a ship about 12 times less often than `simplePilot` (5.7 against 69.1 per hour) and scores 47% more points per minute. It sees every body over a 90-tick horizon, including the pieces rocks will split into, and picks a manoeuvre that clears all of them. `simplePilot` also ended 217 games; `smartPilot` never ended one.
- **In the short run the decision model does not beat the baseline.** `layaPilot` scores almost as many points as `smartPilot` (10,096 against 10,493 per minute) probably because it shares the target picker with `smartPilot`, but it lost 22 ships against 14 for `simplePilot` and 2 for `smartPilot`. An exact test on the loss counts says `smartPilot` is better than both others (p = 0.004 against `simplePilot`, p < 0.0001 against `layaPilot`), while `layaPilot` and `simplePilot` cannot be told apart (p = 0.18). With 14, 2 and 22 losses the individual rates are imprecise.
- **The two look different on screen.** `smartPilot` plans a path and moves in short, smooth taps (thrust engaged 1.4% of the time). `layaPilot` reacts to each new classification with bursts of turning and thrust (3.8%), so the ship drifts more and corrects often.
- **Hyperspace.** `smartPilot` uses it when no manoeuvre is safe (14.6 per hour in the short run) and in the long run 123 of its 239 losses were hyperspace self-destructs. `layaPilot` also pressed it (19.4 per hour).
- **Cost of a decision.** `smartPilot` answers in about 0.15 ms inside the page. `layaPilot` needs a server round trip. On the test machine (M1, 16 GB) that was a median of 91 to 104 ms when idle and 137 ms (95th percentile 156 ms) during the runs, which is 5 to 8 ticks at 60 Hz. Earlier versions of this document quoted 7.4 to 13.9 ms; that was not reproduced and has been withdrawn.

## 4. The ship only moves like the game allows

The pilot cannot set the ship's velocity: it can only hold the five keys, and `updateShip()` does the rest. [`scripts/dev/check_thrust_physics.js`](../scripts/dev/check_thrust_physics.js) proves this for a run. Each tick it replays the game's movement rules from the held keys alone (rotate, thrust along the nose, friction) and compares the result with the real ship.

For `smartPilot`: 184,025 ticks checked, 0 mismatches. Position, velocity (including the fractional part) and angle after every tick matched the replay exactly, so every speed gain happened on a tick where THRUST was held, in the direction the nose pointed. The replay uses the pilot's own copy of the movement rules (`spShipStep`), so the check also fails if that copy drifts from `updateShip()`. The same check passes for `simplePilot`.

Because thrust is used in short taps (the median burst is 2 ticks, 85% are under 6 ticks), the ship spends most of its time coasting on inertia. In version 2 this looked like the ship moving by itself, as the THRUST key was lit for only a fraction of a second. The Decision panel now keeps a recently pressed key dimly lit for 0.4 s, says "thrusting along the nose" or "coasting at N units/tick, last thrust X s ago", and the reason text says when THRUST is waiting for the ship to finish turning.

## 5. The screen

The Decision panel header now has one selector instead of the switch:

| Button | Controller |
|--------|-----------|
| Manual | The keyboard (default) |
| Simple | `simplePilot`, as in version 2 |
| Smart | `smartPilot` (rules in code: lookahead and physics simulation) |
| Laya | `layaPilot` (local decision model on Apple Silicon via `/v1/systemone`) |

Changing the selection releases every key, so a held key does not stay stuck. From the browser console, `AUTOPILOT = smartPilot`, `AUTOPILOT = simplePilot`, `AUTOPILOT = layaPilot` and `AUTOPILOT = null` do the same, but the selector will not update its highlight.

When using **Laya**, the local MLX decision server must be running:
```bash
.venv/bin/python scripts/dev/laya_server.py --port 8700
```
Setup (virtual environment, `requirements-laya.txt`, first-run model download) is in [LAYA.md](LAYA.md#32-setup-and-serving-commands). Verify the server with `curl -s http://127.0.0.1:8700/health`. If the server is offline when Laya is selected, the Decision panel shows a connection notice and the ship is flown by `smartPilot` until the server answers.

## 6. Validation

`scripts/run_all.sh` passes on the working copy and on all three frozen versions. The new selector test is skipped for versions that do not have the selector.

| Script | Purpose |
|--------|---------|
| [`dev/measure_pilots.js`](../scripts/dev/measure_pilots.js) | Section 3 table. Measurement, not pass/fail |
| [`dev/death_causes.js`](../scripts/dev/death_causes.js) | Classifies every ship loss for one pilot |
| [`dev/check_thrust_physics.js`](../scripts/dev/check_thrust_physics.js) | Section 4 check. Fails if a pilot moves the ship in any way the keys do not explain |
| [`dev/test_controller_selector.js`](../scripts/dev/test_controller_selector.js) | Fake DOM test of the Manual, Simple, Smart, and Laya buttons, and 5,000 ticks with each controller |
| [`dev/eval_laya_offline.js`](../scripts/dev/eval_laya_offline.js) | Offline evaluation harness for Laya-MLX against recorded pilot logs |
| [`dev/laya_server.py`](../scripts/dev/laya_server.py) | Local Python MLX HTTP daemon exposing TypeSafe `/v1/systemone` |
| [`dev/tune_smart.js`](../scripts/dev/tune_smart.js) | Parameter sweep used for the tuning in section 3 |
| [`dev/lib/load_game.js`](../scripts/dev/lib/load_game.js) | Shared headless loader for the scripts above |

The selector test checks the logic of the buttons with a fake DOM. It does not check how they look in a browser.

```bash
node scripts/dev/measure_pilots.js asteroids.html 1200000 simplePilot,smartPilot 8   # about 3 minutes
node scripts/dev/check_thrust_physics.js asteroids.html 300000 smartPilot
node scripts/dev/death_causes.js asteroids.html 1500000 smartPilot
```

## 7. Not done yet

- A safety check between the decision model and the keys. `layaPilot` currently executes the model's choice as is. A lightweight lookahead that vetoes actions leading to a collision within 8 ticks is planned in [LAYA.md](LAYA.md#phase-4-performance-measurement-and-shielding).
- Pilots based on the other decision models: `Kev` (Qwen base with pointer readout), hosted Jev and remote CLM-8B. Details, model comparisons, and hardware feasibility in [DECISION_MODELS.md](DECISION_MODELS.md), [LAYA.md](LAYA.md), and [CLM.md](CLM.md). Planned for a later step.
