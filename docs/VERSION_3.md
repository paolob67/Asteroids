# Version 3: a smarter autopilot and a Manual | Simple | Smart selector

Version 3 is the working copy, [`asteroids.html`](../asteroids.html). It starts from the frozen [version 2](VERSION_2.md) and adds one thing: a second autopilot, `smartPilot`, that looks ahead, moves the ship with thrust to dodge, and uses hyperspace only when nothing else works. The game rules are unchanged from version 2.

Version 3 is not frozen yet. An autopilot based on a decision model (CLM) is planned for a later step and is not part of this document. The model reference and the design decisions so far are in [CLM.md](CLM.md).

## 1. What changed

| Area | Version 2 | Version 3 |
|------|-----------|-----------|
| Controllers | Autopilot on/off switch (`simplePilot` only) | Selector with three buttons: **Manual**, **Simple** (`simplePilot`, unchanged), **Smart** (`smartPilot`) |
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

| Pilot | Ship losses per hour | Points per minute | Thrust held | Hyperspace per hour | Games that ended |
|-------|---------------------|-------------------|-------------|---------------------|------------------|
| `simplePilot` | 68.8 | 8,997 | 0.0% of ticks | 0 | 217 |
| `smartPilot` | 5.4 | 13,114 | 1.7% of ticks | 27 | 0 |

Causes of the ship losses:

| Pilot | Rocks | Saucer torpedoes | Saucer body | Hyperspace self-destruct | Unclassified |
|-------|-------|------------------|-------------|--------------------------|--------------|
| `simplePilot` | 1,763 | 1,092 | 45 | 0 | 156 |
| `smartPilot` | 109 | 0 | 7 | 123 | 0 |

How to read this:

- Games no longer end. `smartPilot` did not run out of lives in any of the 8 runs (each about 5.6 hours of play, and it earns an extra life every 10,000 points). That is why the table uses losses per hour and points per minute, not the score of finished games as in version 2.
- Losses fell by a factor of about 13, and points per minute rose by 46%. Why points rose less than losses fell was not tested.
- Saucer torpedoes, 36% of the losses of `simplePilot`, no longer kill the ship in these runs. Half of the remaining losses are the game's own hyperspace rule.
- Setting `SP_HYPER_TTC` (the hit time below which hyperspace is considered) to 24 ticks gave 8.8 losses per hour, because hyperspace was often used when a dodge would still have worked. 8 ticks gave 5.4. The safety margin was tested at 6, 12, 20 and 30 and the horizon at 90 and 150, and 12 and 90 were kept. A margin of 6 together with the 8 tick limit gave 4.5 losses per hour in one sweep, against 5.4 for the kept setting, but another sweep with the 24 tick limit gave the opposite order (8.0 against 6.7). These sweeps (`scripts/dev/tune_smart.js`) used fewer runs than the table above, so differences of this size are within noise and the setting was not changed.
- It is still not a perfect pilot. It trusts straight-line prediction, so it cannot foresee a rock that will split into new rocks after being shot, and it does not plan around the saucer's course changes.

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
| Smart | `smartPilot` |

Changing the selection releases every key, so a held key does not stay stuck. From the browser console, `AUTOPILOT = smartPilot`, `AUTOPILOT = simplePilot` and `AUTOPILOT = null` do the same, but the selector will not update its highlight.

## 6. Validation

`scripts/run_all.sh` passes on the working copy and on both frozen versions. The new selector test is skipped for versions that do not have the selector.

| Script | Purpose |
|--------|---------|
| [`dev/measure_pilots.js`](../scripts/dev/measure_pilots.js) | Section 3 table. Measurement, not pass/fail |
| [`dev/death_causes.js`](../scripts/dev/death_causes.js) | Classifies every ship loss for one pilot |
| [`dev/check_thrust_physics.js`](../scripts/dev/check_thrust_physics.js) | Section 4 check. Fails if a pilot moves the ship in any way the keys do not explain |
| [`dev/test_controller_selector.js`](../scripts/dev/test_controller_selector.js) | Fake DOM test of the Manual, Simple and Smart buttons, and 5,000 ticks with each controller |
| [`dev/tune_smart.js`](../scripts/dev/tune_smart.js) | Parameter sweep used for the tuning in section 3 |
| [`dev/lib/load_game.js`](../scripts/dev/lib/load_game.js) | Shared headless loader for the scripts above |

The selector test checks the logic of the buttons with a fake DOM. It does not check how they look in a browser.

```bash
node scripts/dev/measure_pilots.js asteroids.html 1200000 simplePilot,smartPilot 8   # about 3 minutes
node scripts/dev/check_thrust_physics.js asteroids.html 300000 smartPilot
node scripts/dev/death_causes.js asteroids.html 1500000 smartPilot
```

## 7. Not done yet

- A pilot based on a decision model (CLM, [model card](https://huggingface.co/Contrastive-LM/CLM-v0.1-8B)). CLM scores a closed list of candidate actions against a text description of the state, served from Python over HTTP on top of a Qwen3-8B encoder. The game and the model will run asynchronously: the game never waits for an answer. Details and open questions in [CLM.md](CLM.md). Planned for a later step.
- Freezing version 3 into `versions/v3/`.
