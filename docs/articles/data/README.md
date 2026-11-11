# Measurement data for the articles

Raw output of [`scripts/dev/measure_pilots.js`](../../../scripts/dev/measure_pilots.js). Every number quoted in an article must trace to a file here. Each `.json` holds the command line, the SHA-256 of the game file, the git commit, the machine and, for every pilot, the per-starting-point rows.

## Definitions (identical for every pilot)

| Term | Definition |
|------|------------|
| Starting point ("seed") | The game's `RAND` is advanced by `seed * 7` calls after `initGame()`. The same starting point and pilot always give the same game |
| Flying time | Ticks with `gameState === 'playing'`, at 60 ticks per second. Attract screen, gaps between waves, game over and initials entry do not count |
| Ship loss | One call that removes a life, counted inside the game code (`lives[curPlayer]--` in `explodeShip`) |
| Losses per hour | Losses divided by flying hours |
| Points per minute | Points earned divided by flying minutes (scores of finished games plus the open game) |
| Lag (Laya only) | An answer requested at tick `i` takes effect at tick `i + lag`. At 60 Hz one tick is 16.7 ms |

## Environment

| Item | Value |
|------|-------|
| Machine | Apple MacBook Air M1, 16 GB, macOS (Darwin 27.2.0) |
| Node | v26.3.1 |
| Python | 3.12.10 |
| Laya | `laya-mlx` 0.6.0, `mlx` 0.32.4, model `aac6fef/laya-mlx` |
| Game file | `asteroids.html`, SHA-256 `9cef5640c11b7382514afdd65a535a01a4d722b77a8c691573f552e8ea06edb6` (identical to `versions/v3/`) |
| Base commit | `2a5e31f` (the measurement script itself is uncommitted at the time of the runs; `gitDirty` is `true` in the files) |

## Files

| File | What it is |
|------|-----------|
| `pilots-2026-11-10-rules-8x1200000.json` | `simplePilot` and `smartPilot`, 8 starting points of 1,200,000 ticks (about 42 hours of flying each). The long run that the older docs claimed to show |
| `pilots-2026-11-10-rules-8x100000.json`, `.txt` | Same two pilots, 8 x 100,000 ticks (shorter run, kept as a stability check) |
| `pilots-2026-11-10-all3-12x8000-lag6.json` | All three pilots, 12 starting points of 8,000 ticks (about 27 minutes of flying each), Laya with a 6 tick lag. The comparison table for Part 3 |
| `browser-2026-11-11-headless-60s.json`, `browser-2026-11-11-headed-60s.json` | 60 s of each pilot in a real Chrome page (headless, then with a window): game ticks per second, frames per second, Laya request to answer in ticks. Timing check, not a scoring test (see TEST_LOG T8) |
| `pilots-2026-11-11-all3-12x8000-lag6-behaviour.json`, `pilots-2026-11-11-rules-8x100000-behaviour.json` | Same runs as T3 and T2 with the behaviour counters added (speed, drift, distance from centre, thrust bursts, threats at loss, Laya decisions per second). The headline numbers reproduce T3 exactly |
| `laya-latency-2026-11-10.json` | In-process latency of `laya-mlx` and `laya-multilingual-mlx` by device, precision and text length (tests O1 and O2) |
| `pilots-2026-11-10-all3-1x3000-lag6.json`, `1x6000`, `1x9000` | Single starting point (seed 0), three budgets, all three pilots, Laya with a 6 tick lag. Quick look, scored in points (see "Single seed, three budgets" below) |

## Why Laya runs are short

At the latency measured on this machine (about 90 to 105 ms per request, see below) one Laya tick costs far more wall-clock time than a rule-based tick, so a 1,200,000 tick run would take days. The rule-based pilots are cheap, so for them the long run exists as well. For the three-way comparison all pilots use the same short run, so every row has the same budget and the same starting points.

Rows with different budgets must not be compared with each other.

## Laya latency on this machine

The older docs state 7.4 to 13.9 ms (and 11.2 ms in an example). On this machine:

| Measurement | Result |
|-------------|--------|
| HTTP round trip, 30 requests, server idle | median 90.9 to 104.4 ms, min 87.3 ms |
| `agent.predict` called in-process, 40 calls | median 88.2 ms, min 85.3 ms |
| During the pilot runs (requests that reached the server) | see the `laya` block in the JSON |

The model call itself accounts for the time (MLX reports the GPU as the default device); HTTP adds only a few milliseconds. Whether the 7.4 to 13.9 ms figure came from a different model checkpoint, a different batch setting or a different machine state is not known. Until that is clarified, the articles must quote the figure measured here.

At 60 Hz, 90 to 100 ms is 5 to 6 ticks, which is why the comparison uses `--lag=6`.

## Reproduce

```bash
# rule-based pilots, long run (about 3 minutes)
node scripts/dev/measure_pilots.js asteroids.html 1200000 simplePilot,smartPilot 8 --json=out.json

# all three pilots (needs the Laya server; about 25 minutes)
.venv/bin/python scripts/dev/laya_server.py --port 8700      # in another terminal
node scripts/dev/measure_pilots.js asteroids.html 8000 simplePilot,smartPilot,layaPilot 12 --lag=6 --json=out.json
```

`--lag=1` models a server that answers within one frame, which this machine does not achieve.

## Single seed, three budgets (points)

One starting point (seed 0), the same game for every pilot, Laya with `--lag=6`. Points are the score earned within the budget. Flying ticks are slightly below the budget because the gaps between waves do not count.

| Budget | Pilot | Points | Ships lost | Causes | Hyperspace uses | Thrust ticks / flying ticks |
|--------|-------|--------|-----------|--------|-----------------|------------------------------|
| 3,000 ticks (50 s) | `simplePilot` | 6,560 | 0 | none | 0 | 0 / 2,746 |
| | `smartPilot` | 7,270 | 0 | none | 0 | 24 / 2,746 |
| | `layaPilot` | 6,970 | 0 | none | 0 | 48 / 2,746 |
| 6,000 ticks (100 s) | `simplePilot` | 12,190 | 1 | saucer torpedo | 0 | 0 / 5,619 |
| | `smartPilot` | 17,900 | 0 | none | 0 | 114 / 5,492 |
| | `layaPilot` | 12,910 | 3 | rock 3 | 2 | 181 / 5,619 |
| 9,000 ticks (150 s) | `simplePilot` | 16,810 | 2 | saucer torpedo 1, rock 1 | 0 | 0 / 8,492 |
| | `smartPilot` | 25,780 | 0 | none | 1 | 139 / 8,365 |
| | `layaPilot` | 23,260 | 3 | rock 3 | 2 | 262 / 8,365 |

What this shows, and what it does not:

- `layaPilot` plays the whole game with no fallback and no server error (latency median 86 to 105 ms in these runs).
- `smartPilot` scores the most at every budget. `layaPilot` is close to it at 3,000 and 9,000 ticks and close to `simplePilot` at 6,000.
- The three ships `layaPilot` lost were all to rocks. It lost none in the first 3,000 ticks, all three between ticks 3,000 and 6,000, and none between 6,000 and 9,000 (the counts are the same at 6,000 and 9,000 ticks).
- It is one game, so this is an anecdote. Points depend on how the waves and saucers fall in this particular game, and the order changes between budgets (Laya was 5,000 points behind `smartPilot` at 6,000 ticks and 2,500 behind at 9,000). Nothing here supports a ranking.
- The ship-loss counts (0, 3 and 1 or 2) are too small to use as a rate.

## Run that was abandoned

A Laya-only run with `--lag=1` (6 x 8,000 ticks) was started to see how much of Laya's weakness comes from latency. With lag 1 every tick waits for a model answer, so one starting point took 669 s and six would have taken about an hour; it was stopped after starting point 0 (3 losses, the same count as with lag 6 on that starting point). No file was kept and nothing is claimed about the effect of latency. Whether latency explains Laya's loss rate is untested.

## Latency during the runs

The median latency during the pilot runs (137 ms) is higher than when the machine was idle (91 to 104 ms). The machine was running other software at the same time.
