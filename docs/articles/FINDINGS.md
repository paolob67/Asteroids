# Findings: what the data supports

Final considerations from the tests already run (see [TEST_LOG.md](TEST_LOG.md)). No new game runs were needed. The uncertainty figures come from [`scripts/dev/analyze_pilots.py`](../../scripts/dev/analyze_pilots.py); its output is in [`data/analysis-2026-11-11.txt`](data/analysis-2026-11-11.txt). Decision (2026-11-11): the pilots will not be run for longer; the articles use this data and state its limits.

## 1. Claims the data supports

| # | Claim | Evidence | Strength |
|---|-------|----------|----------|
| F1 | A pilot built on a decision model is possible and plays the game | `layaPilot` ran 12 start points of 8,000 ticks and three single-seed runs with no fallback to `smartPilot` and no server error (T3, T5) | Direct |
| F2 | `smartPilot` survives far better than `simplePilot` | Long run, 8 x 1,200,000 ticks: 5.7 losses per hour (95% interval 5.0 to 6.5) against 69.1 (66.6 to 71.7). The intervals are far apart | Strong (42 flying hours each, 239 and 2,900 losses) |
| F3 | `smartPilot` survives better than `layaPilot` | Short run: 2 losses against 22 (rates 4.9 and 53.3 per hour). The intervals do not overlap (0.6 to 17.6 against 33.4 to 80.6), and the exact test gives p < 0.0001 | Moderate (0.4 flying hours each). Holds for an untuned model against a tuned rule set |
| F4 | `layaPilot` earns clearly more points than `simplePilot` in the same games | Same 12 games for every pilot: Laya ahead in 11 of 12, mean +4,192 points in 8,000 ticks (95% interval +2,710 to +5,673), sign test p = 0.006 | Moderate. Cause not tested |
| F5 | `layaPilot` and `smartPilot` score about the same in the same games | Mean difference 710 points in favour of `smartPilot`, interval -577 to +1,997, `smartPilot` ahead in 9 of 12, p = 0.15 | Cannot tell them apart |
| F6 | Drawing in the browser does not give the model more game time | 60.0 ticks per second in Chrome; the answer arrives 6 to 7 ticks after the request in the browser against the 6 assumed headless (T8) | Direct, on this machine |
| F7 | One Laya decision takes about 90 ms here, and it is model compute | In-process 88 ms; HTTP adds a few ms; CPU 3 to 4 times slower; the 322M checkpoint 27 to 35 ms (T4, T7) | Direct |

## 2. Claims the data does not support

| Do not claim | Why |
|--------------|-----|
| "Laya is worse than the rules" as a general statement | The Laya pilot is untuned (one prompt, one question, one model) and the rule pilots were tuned. F3 is about these two pilots as built |
| "Laya is worse than `simplePilot`" or "better" on survival | 22 against 14 losses, rates 53.3 (33.4 to 80.6) and 33.6 (18.4 to 56.3): the intervals overlap, p = 0.18 |
| An exact Laya loss rate | The interval is 33 to 81 losses per hour, a factor of 2.4 |
| That latency causes Laya's losses | The `--lag=1` run was too slow to finish (T6). Not tested |
| That the 322M model or a shorter question flies better | Only latency was measured (T7), not play |
| That the earlier docs' Laya claims hold ("about 11 ms", "dodges torpedoes", "never presses hyperspace") | Contradicted or not reproduced; withdrawn in the repo docs |
| That the browser and headless runs agree on points | They were not run on the same games. T8 is a timing check only |

## 3. Observations beyond the headline

1. **The extra-life rule matters for how to read "no game ended".** The game gives a life every 10,000 points. Derived from points per minute, the short run earns about 0.80 lives per minute (`simplePilot`), 1.05 (`smartPilot`) and 1.01 (`layaPilot`), and loses about 0.56, 0.08 and 0.89. So in 25 minutes of flying no pilot ran out of ships in the short run, even `layaPilot` at 0.89 lost per minute against 1.01 earned. This is arithmetic, not a measurement, and it says nothing about longer play. In the long run `simplePilot` loses 1.15 per minute against 0.95 earned, and it ended 217 games; `smartPilot` loses 0.10 against 1.40 earned and never ended one. By this arithmetic `layaPilot` sits near the break-even line, so over a longer run it could go either way. That is a hypothesis to test, not a finding.
2. **Laya's losses are spread across start points.** 10 of 12 start points had at least one Laya loss (2, 3, 3, 2, 2, 1, 2, 0, 0, 2, 2, 3 in order, with 3 as the maximum), against 9 of 12 for `simplePilot` and 1 of 12 for `smartPilot`. The Laya result is not driven by one bad game.
3. **All 22 Laya losses were rocks.** None were saucer torpedoes or hyperspace deaths. `smartPilot` lost 123 of its 239 long-run ships to its own hyperspace, a cost Laya did not show here. With 2 losses in the short run, `smartPilot`'s short-run cause is uninformative.
4. **Laya uses hyperspace about as often as `smartPilot`.** 19.4 against 14.6 uses per hour in the short run; in total 8 uses for Laya and 6 for `smartPilot` over the 12 start points. The counts are small.
5. **Laya's higher score than `simplePilot` is not explained.** `layaPilot` and `smartPilot` share the target picker (`spPickTarget`); `simplePilot` has its own, similar intercept calculation. Laya also moves (thrust 3.8% of flying ticks) and `simplePilot` never thrusts. Whether movement, target choice or simply staying alive longer explains the difference is untested.
6. **Everything is on one machine.** M1 MacBook Air, 16 GB, with other software running during the T3 run (median latency 137 ms there against 91 to 104 ms idle).

## 4. Considerations for the articles

- **Part 2** can state F2 as a result, with the long-run numbers and intervals. It is the strongest data set.
- **Part 3** should state F1 as the claim, then F3 to F5 as first observations with intervals, then F6 and F7 as how the system works, then the second table above as the list of things not yet tested. Say plainly that the Laya pilot is a first version.
- **One honest sentence for Part 3:** over about 25 minutes of play per pilot, a decision-model pilot that was not tuned scored about as many points as the tuned rule pilot and lost ships at a rate that cannot be told apart from a pilot that never dodges.
- **Wording to avoid:** "better", "worse", "beats", "loses to" without naming the pilot version, the budget and the interval.
- **Visual observation** is recorded in [OBSERVATIONS.md](OBSERVATIONS.md); the clips (V5 to V8) are planned to show it.

## 5. What would change these conclusions

| If this were run | It would answer |
|------------------|-----------------|
| Laya with the 322M checkpoint, same 12 games | Whether a 3 times faster answer changes survival (F7 against F3) |
| Laya with a shorter question text, same 12 games | Whether the criteria wording matters |
| About 10 times more Laya flying time (roughly 4 flying hours; T3 needed 26 minutes of wall time for 0.41 flying hours, so this would take about 4.3 hours) | A tighter interval on the loss rate, and whether Laya stays near the break-even line in section 3.1 |
| A Laya pilot with a safety veto | Whether Laya's rock losses are a model problem or an execution problem |

None of these is planned. They are the backlog (O2b to O6 in [WRITEUP_PLAN.md](WRITEUP_PLAN.md)).
