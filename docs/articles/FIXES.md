# Fixes to the working game after version 3

Version 3 is frozen in [`versions/v3/`](../../versions/v3/README.md) and Part 3 of the series describes it as published. Defects found afterwards are fixed only in the root [`asteroids.html`](../../asteroids.html) and recorded here, so that the articles stay reproducible from the frozen file.

| ID | Found | What | Fixed in | Test |
|----|-------|------|----------|------|
| F1 | 2026-11-17 | `layaFormatState` mirrored every bearing and used the wrong sign for the ship's vertical velocity | root `asteroids.html` | `scripts/dev/test_laya_geometry.js` (18 checks, part of `scripts/run_all.sh`) |

## F1: wrong bearings and closing speeds in the state sentence

**Found while:** preparing training data for Part 4. Before exporting, the sentence was compared with the geometry of recorded `smartPilot` games.

**What was wrong.** Two conventions were mixed in [`layaFormatState`](../../asteroids.html):

1. **Bearing.** The offset to an object (`dx`, `dy`) is in screen coordinates (y grows downward). `ship.angle` counts counter-clockwise (y up). The code computed `atan2(dy, dx) - shipAngle`, which mirrors the bearing. A rock straight ahead was reported "180 deg left of the nose"; a rock behind was reported "dead ahead".
2. **Closing speed.** `ship.vy` is y-up; every other `vy` in the snapshot is y-down (see the snapshot conventions in the game file). The code subtracted them as if they shared a sign. When the ship moved vertically, a rock it was flying toward could be reported as "moving away".

**Fix.** The bearing is now `shipAngle - atan2(-dy, dx)`, positive to the right of the nose. The relative vertical velocity is `item.vy + ship.vy`. Nothing else in the function changed.

**Measured size of the defect, on version 3 text** (`smartPilot`, seed 100, 60,000 ticks, the 3 listed objects at every active tick, 154,153 object descriptions):

| Check | Wrong |
|---|---|
| Bearing off by more than 10 degrees | 94.1% |
| Left or right side reversed | 46.2% |
| Nearest object, side reversed | 41.5% |
| Closing or receding sign wrong | 1.7% |

**What it affects in Part 3.** Everything `layaPilot` read through `layaFormatState`, at all three prompt levels where bearings appear (`verdict` and `facts`; `raw` uses world axes and is not affected by the bearing part). In the `verdict` prompt, the side to dodge came from the same wrong bearing. `smartPilot` and `simplePilot` do not use this function, so Parts 1 and 2 are not affected.

**What was not done.** The Part 3 measurements were not repeated with the fixed text. The Part 3 numbers describe `versions/v3` and remain valid for it. Whether the fix changes the Part 3 conclusions (for example the facts-only result) is not known, and no claim is made either way. To check, run the Part 3 commands against the root file, which now has the fix.

**Verification.**

```bash
node scripts/dev/test_laya_geometry.js                          # root file: 18 of 18 pass
node scripts/dev/test_laya_geometry.js versions/v3/asteroids.html   # frozen file: 10 of 18 fail, by design
cd versions/v3 && shasum -a 256 -c SHA256SUMS                   # frozen file unchanged
```
