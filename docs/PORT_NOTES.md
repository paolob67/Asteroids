# Asteroids JavaScript Port: Notes

Port of the original Atari Asteroids 6502 source (`asteroids-main/`) to a single self-contained file, [`asteroids.html`](../asteroids.html), which runs on an HTML canvas. Open it in a browser; no build step.

## Controls

| Key | Action |
|-----|--------|
| Left / Right | Rotate |
| Up | Thrust |
| Space | Fire |
| Shift | Hyperspace |
| 1 / 2 | Start one or two player game |

On the initials screen (after a top-10 score), Left / Right selects the letter and Shift accepts it.

The **Manual | Simple | Smart | Laya** selector in the Decision panel (right side of the screen) chooses who flies. Manual is the keyboard, Simple is `simplePilot` ([Version 2](VERSION_2.md#4-decision-making)), Smart is `smartPilot`, the autopilot built on rules in the code ([Version 3](VERSION_3.md#2-how-smartpilot-works)), and Laya is `layaPilot`, the autopilot built on a local decision model ([Version 3](VERSION_3.md#2b-how-layapilot-works-a-decision-model)). From the browser console, `AUTOPILOT = simplePilot`, `AUTOPILOT = smartPilot`, `AUTOPILOT = layaPilot` and `AUTOPILOT = null` do the same (the selector highlight does not follow), and `LOG_STATE = true` prints one JSON line per tick with the state and the decision.

The high score and the top-10 table are kept for the current page session only (no persistence across reloads).

## Sound synthesis

Sound effects are synthesized in real time using the Web Audio API to recreate the original analog audio circuits of the 1979 arcade cabinet:

- **Ship Fire (`SHPFIR`)**: Fast downward exponential frequency sweep (1000 Hz to 220 Hz) with rapid decay.
- **Saucer Fire (`SCRFIR`)**: Distinct tonal sweep (880 Hz to 440 Hz).
- **Thrust (`SHPSND`)**: Filtered low-pass noise combined with a 50 Hz sub-bass tone while thrust is engaged.
- **Thump / Heartbeat (`THUMP`)**: Two alternating pitches (115 Hz and 98 Hz) that accelerate in tempo as the wave progresses.
- **Explosions (`EXPSND`)**: Three distinct noise envelopes tailored to object size:
  - Large (ship, large rock, large saucer): Deep low-pass noise sweep with a 0.9s tail.
  - Medium (medium rock, small saucer): 0.5s mid-frequency noise burst.
  - Small (small rock): 0.25s crisp band-pass noise crack.
- **Saucer Hum (`SCRSND`, `SCRSEL`)**: Continuous frequency-modulated sirens:
  - Large Saucer: Low warble (~550 Hz modulated at 3.5 Hz).
  - Small Saucer: High-pitched urgent warble (~1100 Hz modulated at 7.5 Hz).
- **Extra Life (`TONE`)**: 3-tone arpeggio (880 Hz, 1175 Hz, 1760 Hz) triggered at 10,000-point milestones.
- **Hyperspace**: Resonant band-pass noise sweep simulating the hyperspace jump.

## Fidelity to the original

The port keeps the original internal units: X is 0..8191, Y is 0..6143, and one canvas pixel equals 8 internal units (1024x768 canvas).

- Motion: signed 8-bit `XINC`/`YINC` added every frame; thrust, friction and clamping follow `MOTION` and `MOVE`.
- Collision: the `COLIDE` box test with corner clipping and the original per-object thresholds.
- Shapes: the original vector tables (rocks, 17 ship frames, saucer) drawn at the original per-object scale (full, 1/2, 1/4).
- Random numbers: bit-exact `RAND` routine.
- Timing: game logic advances in fixed 60 Hz steps (the original ran one step per 16 ms frame), independent of the display refresh rate.
- Rock speed: `NEWVEL` is ported exactly. Fresh rocks get a random speed; each split adds a random delta to the parent's velocity, so speeds drift upward as rocks break up. Speed does not scale with the wave number in the original code.
- Waves: `NEWAST` logic (2 more rocks per wave, up to 11). A wave-clear flash shows between waves, and a blinking GAME OVER screen is shown at the end.

## Known approximations

- Explosion particles are an addition and not in the original.
- Drawing uses canvas strokes, not the exact vector beam output.
- Ship fade-in (30 frames of rising opacity when a ship is deployed) is an addition. The original has no fade: after `SDELAY` expires and `NEARBY` finds the centre clear, the ship simply appears (it only uses a 1/4 size picture).
- Two-player switching is simplified. The "PLAYER N" delay (`GDELAY`, 128 frames) is stored but not used; the label is always shown in a two-player game.
- The version 1 deviations that were bugs are fixed in version 2: saucer firing delay, saucer vertical speeds and rock-hit timer (radix), saucer direction change interval, small-saucer threshold (3,000 became 30,000), wave-clear delay (90 became 127 frames), small-saucer aiming (now the original `ATAN` routine and error tables, tightened at 35,000 points), large-saucer fire, saucer entry and exit at the screen edge, and the ship return delay after a death (`SDELAY` 16 ticks). [VERSION_2.md](VERSION_2.md#1-behavior-restored-from-the-original) lists each one with the measured effect. See [Version 1 baseline](VERSION_1.md#known-deviations-from-the-original) for the original list.

## Validation scripts

Run all of them at once with `scripts/run_all.sh [file]` (defaults to `asteroids.html`).

- `node scripts/check_syntax.js asteroids.html`: syntax check of the embedded script.
- `node scripts/dev/rock_speed.js asteroids.html`: prints mean rock speed per split generation.
- `node scripts/dev/simulate.js asteroids.html`: headless soak test (40 games of random input) that checks for exceptions and NaN values.
- `node scripts/dev/wave_test.js asteroids.html`: clears all rocks and checks that the next, larger wave starts and that a deployed ship fades in.
- `node scripts/dev/test_sounds.js asteroids.html`: verifies all Web Audio synthesis routines and sound state transitions.
- `node scripts/dev/test_hiscore.js asteroids.html`: high score table order, ties and initials for two players.
- `node scripts/dev/measure_pilots.js [file] [ticks] [pilots] [seeds]`: compares pilots by ship losses per hour and points per minute, over several starting points. `check_thrust_physics.js` proves a pilot moves the ship only through the keys, `death_causes.js` classifies ship losses, `test_controller_selector.js` tests the selector buttons (see [Version 3](VERSION_3.md#6-validation)).
- `node scripts/dev/run_autopilot.js`: runs `simplePilot` headlessly for a number of ticks and prints the final state.
- `node scripts/dev/measure_autopilot.js asteroids.html 3000000`: compares the autopilot with a player that presses nothing and one that presses random keys (measurement, not pass/fail).
- `node scripts/dev/compare_versions.js [fileA fileB]`: measures the gameplay constants that differ between two builds, v1 and v2 by default (measurement, not pass/fail).
