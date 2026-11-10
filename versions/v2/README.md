# Version 2 (frozen)

This directory holds the frozen second version of the JavaScript port of Atari Asteroids: the restored behavior of the original, the State and Decision panels, and a very simple autopilot.

| Item | Value |
|------|-------|
| File | [`asteroids.html`](asteroids.html) |
| SHA-256 | `dcf850dc81f418c57b90453e714d9e8c2a6e110cf24ae651e4239360031c7f42` |
| Size | 83,214 bytes, 2,218 lines |
| Files are read-only | yes (`chmod a-w`) |

## Rules

- Do not edit `asteroids.html` or `SHA256SUMS` in this directory. All new work happens on the root [`asteroids.html`](../../asteroids.html), which started as an identical copy of this file.
- To change what "version 2" means, create `versions/v3/` instead of altering this one.

## Verify integrity

```bash
cd versions/v2 && shasum -a 256 -c SHA256SUMS
```

## Verify behaviour

```bash
scripts/run_all.sh versions/v2/asteroids.html
node scripts/dev/measure_autopilot.js versions/v2/asteroids.html 3000000
```

Expected result at the time of freezing: `ALL CHECKS PASSED`, and the autopilot table in [Version 2](../../docs/VERSION_2.md#5-how-well-the-autopilot-plays) (67 games, mean score 111,999, best 557,260).

## Compare against other versions

```bash
diff -u versions/v1/asteroids.html versions/v2/asteroids.html | less
diff -u versions/v2/asteroids.html asteroids.html | less
```

## Known limits of this version

The autopilot only rotates and fires from the centre of the screen. It never thrusts, never moves the ship and never uses hyperspace. It also ignores saucer torpedoes. These limits are the starting point for version 3.
