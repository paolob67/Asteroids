# Version 3: a smarter autopilot and a Manual | Simple | Smart selector

Version 3 is frozen in [`versions/v3/`](../versions/v3/) (SHA-256 `9cef5640c11b7382514afdd65a535a01a4d722b77a8c691573f552e8ea06edb6`). It starts from the frozen [version 2](VERSION_2.md) and adds one thing: a second autopilot, `smartPilot`, that looks ahead, moves the ship with thrust to dodge, and uses hyperspace only when nothing else works. The game rules are unchanged from version 2.

The root [`asteroids.html`](../asteroids.html) was identical to the frozen file at the moment of freezing and is now the working copy for later work. See [`versions/v3/README.md`](../versions/v3/README.md) for the checksum and verification commands. Autopilots based on other decision models (such as Kev, Jev, or CLM) are planned for later steps and are not part of this document. The decision model landscape, Apple Silicon M1 feasibility, and autopilot design decisions are in [DECISION_MODELS.md](DECISION_MODELS.md), with dedicated plans in [LAYA.md](LAYA.md) and [CLM.md](CLM.md).

## 1. What changed

| Area | Version 2 | Version 3 |
|------|-----------|-----------|
| Controllers | Autopilot on/off switch (`simplePilot` only) | Selector with four buttons: **Manual**, **Simple** (`simplePilot`), **Smart** (`smartPilot`), **Laya** (`layaPilot`) |
| `snapshot()` | No fractional velocity, exploding rocks looked alive | Adds `ship.vxf`, `ship.vyf` (needed to predict the ship's path) and `exploding` on rocks and the saucer |
| Decision panel | Keys light only on the tick they are held | A key held in the last 0.4 s stays dimly lit, and a line says whether the ship is thrusting, coasting or at rest |
| Measurement | `measure_autopilot.js` | Adds `measure_pilots.js` (several seeds, losses per hour, causes), `death_causes.js`, `check_thrust_physics.js` and `test_controller_selector.js` |

## 2. How `smartPilot` works

It has the same interface as `simplePilot`: a snapshot in, five booleans (`left`, `right`, `thrust`, `fire`, `hyper`) out. It never writes to the ship. The only way it changes the ship's speed is the THRUST key, which the game turns into a push along the nose (see section 4).

Every tick it asks: if I do nothing special, does anything hit me in the next 90 ticks?

1. **Prediction.** Rocks, the saucer and saucer torpedoes never change course, so each is moved forward in a straight line. The ship's own motion (rotation, thrust, friction) is replayed tick by tick with a copy of the game's `updateShip` rules, so a ship that is already drifting is handled. Hits use the game's own `COLIDE` rule plus a small safety margin.
2. **Nothing hits.** Stay in place, aim and shoot. If the ship is drifting and braking is also safe, turn against the drift and thrust.
3. **Something hits.** Try 16 headings times 5 thrust lengths (plus the direction opposite to the current drift). Each candidate is: turn to the heading, thrust N times, then coast. The cheapest candidate that avoids every hit is used, so a rock arriving from a different angle while the pilot aims at another is handled by moving, not by luck.
4. **No manoeuvre is safe and the hit is 8 ticks away or less.** Estimate the risk of hyperspace and press it if the risk is below 70%. The risk combines the original's self-destruct rule (`HYPER`: a random y of 0x18 or more, then a rock count at or above a random limit of 4 to 18) with the chance of re-entering, 48 ticks later, in the path of something.
5. **Shooting.** Target choice uses the same interception maths as `simplePilot`, with the thing on a collision course counted double, a saucer counted a bit more than a rock, and exploding rocks skipped. The pilot fires whenever the nose is on the target, including while it dodges.

## 3. How well it plays

[`scripts/dev/measure_pilots.js`](../scripts/dev/measure_pilots.js) runs each pilot for 8 starting points of 1,200,000 ticks (44.4 hours of play at 60 Hz in total). A starting point means: the game's `RAND` is advanced by a different number of calls after `initGame()`. The runs are repeatable.

| Pilot | Control Paradigm | Ship Losses / Hour | Points / Minute | Thrust Engaged | Hyperspace / Hour | Games Ended | Median Latency |
|---|---|---|---|---|---|---|---|
| `simplePilot` | Fixed heuristic (no dodging) | 43.9 | 9,017 | 0.0% | 0.0 | 0 | < 0.01 ms |
| `smartPilot` | Trajectory physics lookahead | 7.7 | 11,842 | 1.4% | 27.0 | 0 | ~0.15 ms |
| `layaPilot` | Neural decision model (`laya-mlx`) | 36.6 | 11,289 | 5.1% | 0.0 | 0 | 11.2 ms |

Causes of the ship losses (measured across 120,000 ticks per pilot):

| Pilot | Rocks | Saucer Torpedoes | Saucer Body | Hyperspace Self-Destruct | Total Losses |
|---|---|---|---|---|---|
| `simplePilot` | 16 | 7 | 0 | 0 | 23 |
| `smartPilot` | 2 | 0 | 0 | 2 | 4 |
| `layaPilot` | 16 | 2 | 1 | 0 | 19 |

How to read this and what the gameplay reveals:

- **Scoring capacity**: `layaPilot` scores 11,289 points per minute, approaching `smartPilot` (11,842 points/min) and significantly exceeding `simplePilot` (9,017 points/min). Because it maintains high target aiming accuracy when in safe flight mode, it clears waves quickly.
- **Visual appearance vs underlying mechanics**: Watching `layaPilot` in the browser UI can make it look erratic or unpolished compared to `smartPilot`. `smartPilot` plans multi-second trajectories with exact inertia calculations, making smooth, calculated maneuvers. In contrast, `layaPilot` receives discrete tactical classifications from the neural model every ~11 ms. When threats appear, it reacts with bursts of turning and thrust (5.1% thrust engagement vs 1.4% in `smartPilot`), leading to noticeable ship drift and reactive course corrections.
- **Survival trade-offs**: While `layaPilot` successfully dodges saucer torpedoes (only 2 losses compared to 7 in `simplePilot`), its rock loss rate (36.6 losses/hour) remains significantly higher than `smartPilot` (7.7 losses/hour). This happens because a language/decision model evaluates an egocentric threat description rather than simulating the full multi-body physics envelope of splitting rocks across a 90-tick horizon.
- **Latency profile**: Running locally on Apple Silicon Metal via Apple's MLX framework, `layaPilot` achieves an average inference latency of 11.2 ms, comfortably fitting within the 16.6 ms budget of a 60 Hz frame without blocking browser rendering.
- **Hyperspace discipline**: With calibrated prompt formulations, `layaPilot` avoids panic hyperspace triggers during safe flight, keeping hyperspace strictly for unavoidable collision emergencies.

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
| Smart | `smartPilot` (rule-based lookahead and physics simulation) |
| Laya | `layaPilot` (local decision model on Apple Silicon via `/v1/systemone`) |

Changing the selection releases every key, so a held key does not stay stuck. From the browser console, `AUTOPILOT = smartPilot`, `AUTOPILOT = simplePilot`, `AUTOPILOT = layaPilot` and `AUTOPILOT = null` do the same, but the selector will not update its highlight.

When using **Laya**, the local MLX decision server must be running:
```bash
.venv/bin/python scripts/dev/laya_server.py --port 8700
```
Setup (virtual environment, `requirements-laya.txt`, first-run model download) is in [LAYA.md](LAYA.md#32-setup-and-serving-commands). Verify the server with `curl -s http://127.0.0.1:8700/health`. If the server is offline when Laya is selected, the Decision panel alerts you with a connection notice.

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

- Pilots based on the other decision models: `Kev` (Qwen base with pointer readout), hosted Jev and remote CLM-8B. `laya-mlx` is done and included in this version. Details, model comparisons, and hardware feasibility in [DECISION_MODELS.md](DECISION_MODELS.md), [LAYA.md](LAYA.md), and [CLM.md](CLM.md). Planned for a later step.
