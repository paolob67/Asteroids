# Observations from watching the pilots play

Source: the author watched `simplePilot`, `smartPilot` and `layaPilot` play in the browser (2026-11-11). Each observation below is followed by what the code says and what the measurements say. Statements marked "author" come only from watching; they are not measured unless a number is given.

## 1. `simplePilot`

**Author:** very precise at aiming; loses when more than one rock comes at the ship, since it only fires and never tries to escape by moving or by hyperspace. Not sure that movement or hyperspace is wired in the code.

**Code** ([`simplePilot`](../../asteroids.html), about 40 lines): the returned keys are `left`, `right` and `fire`. It never returns `thrust` or `hyper`. So it cannot move and cannot jump; both are absent, not unused. The only decision is which target to aim at (earliest interception, saucer included) and when to fire (aligned within 3 units and in torpedo range).

**Measured:**
- Thrust 0.0% of flying ticks and 0 hyperspace uses in every run (T1 to T3).
- 69.1 losses per hour over 42 flying hours; 217 games ended in the long run.
- Causes in the long run: rock 1,763, saucer torpedo 1,092, saucer body 45. Torpedoes account for 38% of its losses, which a pilot that cannot move cannot avoid.
- Number of threats closing at the tick before each loss, from the new behaviour counters (8 x 100,000 ticks): 0 threats 81, 1 threat 125, 2 threats 24, 3 threats 6 (236 losses). Most losses (53%) happen with one threat closing, not several. So "loses when more than one rock comes" is not what the counters show: with a single threat it is hit as well.

**Reading:** the aiming claim is plausible (it earns 9,527 points per minute with no movement at all). The first part of the loss explanation holds in the sense that it has no way to avoid anything. The "more than one rock" part is not supported by the counters: 206 of its 236 losses (87%) come with 0 or 1 closing threats by that count. The counter only counts rocks and the saucer that are closing within 60 ticks and 1,200 units, not saucer torpedoes. The 81 losses with 0 counted threats are close to the 80 saucer torpedo losses in the same run, which fits torpedo hits but was not checked loss by loss.

## 2. `smartPilot`

**Author:** handles movement very well. It has logic to stay alive and to brake by turning the ship round and thrusting, which keeps movement to the minimum and the ship near the centre of the field, which seems a better position. It has no logic to return to the centre after it has moved away (a possible improvement).

**Code** ([`smartPilot`](../../asteroids.html)):
- Braking: when nothing is predicted to hit and the speed is at least 1.5 units per tick, it plans a brake manoeuvre (heading opposite to the velocity, up to 20 thrust impulses) and uses it if the simulation shows the brake is also safe. This is the behaviour the author describes.
- Dodging: if something would hit within 90 ticks, it searches 16 headings x 5 thrust lengths and takes the cheapest safe one. The cost prefers fewer thrust ticks, lower end speed and a smaller turn.
- Hyperspace: only when no manoeuvre is safe, the best one still hits within 8 ticks, and the estimated risk is below 70%.
- Returning to the centre: there is no such rule. No term in the cost, the brake or the target choice refers to the field centre. The author's note is correct.

**Measured** (8 x 100,000 ticks, from the new counters; 12 x 8,000 ticks gives the same picture):
- Thrust 1.6% of flying ticks; thrust bursts about 18 per minute, each about 3 ticks long.
- Drifting (speed at least 1.5) 7% of flying ticks.
- Mean distance from the field centre about 2,090 units in the 100,000 tick run (the field is 8,192 x 6,144 units, so the centre to the nearest edge is 3,072). In the 12 x 8,000 tick run it was 936. These differ by more than a factor of 2. A likely reason is that every short run starts in the centre and has little time to drift away (a guess, not tested), so the 8,000 tick figure is biased low and neither figure shows that the pilot returns to the centre. The distance for `simplePilot` is 0 because it never moves; it starts in the centre and stays there.

**Reading:** the braking and "move little" claims are confirmed by the code and by the numbers (1.6% thrust, 7% drift). "Stays near the centre" cannot be shown with these numbers: it never moves far because it moves little, not because it returns. The author's improvement idea (return to centre) is a real gap in the code.

## 3. `layaPilot`

**Author:** capable of moving out of the way of rocks it cannot destroy, but its movements look less controlled and the ship drifts around the field for longer. Sometimes it flies into approaching rocks and has no time to react. This may be due to latency, with the pilot taking fewer decisions during play.

**Code** ([`layaPilot`](../../asteroids.html)):
- The pilot picks one of four actions; the choice stays in force until the next answer arrives (about every 6 to 7 ticks).
- `turn_left_and_thrust` and `turn_right_and_thrust` hold `left` (or `right`) AND `thrust` for as long as the choice stays that way. There is no brake and no "stop thrusting when the heading is right" logic, and no sense of where the thrust will take the ship. This matches "less controlled movement" and "drifts for longer". Compare `smartPilot`, which thrusts only when the nose is within 12 units of the plan heading, for a planned number of impulses, and then brakes.
- The direction of the dodge is decided by the text: "incoming from the right, turn left". The text is built from the single threat with the lowest time to collision; it knows nothing about other rocks, so a dodge away from one rock can point towards another. This matches "runs into approaching rocks".
- Fewer decisions: the request is sent only when no earlier request is pending, so the rate is one decision per answer: about 10 requests per second at 6 ticks each. `smartPilot` decides on every tick (60 per second). This matches the author's guess about the number of decisions. In the 1,500 tick trial above the counters showed 10.0 answers per second.

**Measured** (12 x 8,000 ticks, `--lag=6`, same 12 games for every pilot; table in section 4):
- Drifting (speed at least 1.5 units per tick) 41.4% of flying ticks, against 6.6% for `smartPilot`. Mean speed 3.05 against 0.50.
- Mean distance from the field centre 1,959 units against 936 for `smartPilot` at the same budget (about 2.1 times).
- Thrust is used in fewer, longer bursts: 7.8 bursts per minute of 18.5 ticks on average, against 16.8 per minute of 3.0 ticks for `smartPilot`. A thrust of that length keeps pushing the ship long after the dodge is done.
- It makes 10.05 decisions per second (one per answer), against 60 for `smartPilot`. The chosen action changes 18.6 times per minute. 95.9% of flying time is spent on `stay_and_fire`, 4.1% on the two dodges, and hyperspace is chosen for under 0.1%.
- Threats closing at the tick before each loss: 1 threat 13, 2 threats 6, 3 threats 2, none 1 (22 losses). 8 of 22 losses (36%) happen with two or more rocks closing, against 2 of 14 (14%) for `simplePilot`. The model's state sentence describes only the nearest of these.
- All 22 losses were rocks.

**Reading:** the code and the numbers support all three of the author's points. Drifting 41% of the time against 7%, a mean speed six times higher, and thrust bursts six times longer are the measured form of "less controlled" and "drifts for longer". The ship also spends more time away from the centre. The cause is open: the lack of braking, the one-threat state sentence and the latency all fit what was seen, and none has been separated from the others. The lag-1 experiment that would have isolated latency was too slow to finish (T6). One thing speaks against latency as the main cause: the missing brake. Even with an instant answer, the pilot has no action that stops thrusting after a dodge except `stay_and_fire`, and that does not brake the ship.

## 4. Behaviour numbers

Measured with counters added on 2026-11-11 (`behaviour` block in the JSON files). They only read the game state.

Short run, 12 x 8,000 ticks, Laya with `--lag=6` (file `pilots-2026-11-11-all3-12x8000-lag6-behaviour.json`). The headline numbers of this re-run are identical to the run of 2026-11-10 (14, 2 and 22 losses; same points).

| Measure (per flying tick unless stated) | `simplePilot` | `smartPilot` | `layaPilot` |
|-----------------------------------------|---------------|--------------|-------------|
| Mean speed (units per tick) | 0.00 | 0.50 | 3.05 |
| Ticks at speed 1.5 or more | 0.0% | 6.6% | 41.4% |
| Mean distance from the field centre (units) | 0 | 936 | 1,959 |
| Thrust bursts per minute | 0 | 16.8 | 7.8 |
| Mean length of a thrust burst (ticks) | none | 3.0 | 18.5 |
| Decisions per second | 60 (every tick) | 60 (every tick) | 10.05 (one per answer) |
| Hyperspace uses (12 games) | 0 | 6 | 8 |
| Losses with 2 or more closing threats | 2 of 14 | 0 of 2 | 8 of 22 |

Long run for the rule pilots (8 x 100,000 ticks, file `pilots-2026-11-11-rules-8x100000-behaviour.json`): `smartPilot` mean speed 0.56, drifting 7.3%, distance from centre 2,093, 17.9 bursts per minute of 3.2 ticks. `simplePilot` never moves.

Limits:
- Speed and distance come from per-tick samples of one set of games, so they carry no interval here. The gaps between pilots (6 times in drift, 2 times in distance) are far larger than the variation between games for the rule pilots (the 100,000 tick and 8,000 tick runs agree on speed and drift).
- "Closing threats" counts rocks and saucers closing within 60 ticks and 1,200 units. It does not count saucer torpedoes.
- Distance from the centre depends on the budget (936 and 2,093 for `smartPilot` at 8,000 and 100,000 ticks). Compare pilots only at the same budget.


## 5. What this means for the articles

- Part 2: the three-sentence description of `simplePilot` (aim only, cannot move), `smartPilot` (lookahead, brakes, hyperspace last, no return to centre) is now checked against the code. The "cannot move" point can be stated as fact. The "loses when more than one rock comes" point should not be, in that form.
- Part 3: the author's observations on Laya are the most useful content in the article, because they are about how it plays. They are consistent with the code. The sentence "may be due to latency" must stay as a hypothesis.
- New improvement ideas that came out of watching: return to the centre after moving (`smartPilot`); brake or stop thrusting after a dodge (`layaPilot`); let the state sentence mention more than one threat (`layaPilot`).
