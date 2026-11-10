# Version 1 baseline

Version 1 is the result of the first porting pass: the original Atari Asteroids 6502 source translated by hand into one JavaScript file. It is frozen in [`versions/v1/`](../versions/v1/) and is the starting point for later work, and the reference for the planned article that compares this first step with a code modernization approach.

- Frozen copy: [`versions/v1/asteroids.html`](../versions/v1/asteroids.html) (SHA-256 `8b544821dd5fcc9328c854bb8c53a183ed4e9a93994bdc1e8465a27fbdac2d86`)
- Next version, frozen: [`versions/v2/asteroids.html`](../versions/v2/asteroids.html). What changed is described in [VERSION_2.md](VERSION_2.md). Version 3 is also frozen, in [`versions/v3/`](../versions/v3/); the working copy [`asteroids.html`](../asteroids.html) continues from it.
- Architecture and source mapping: [ARCHITECTURE.md](ARCHITECTURE.md)
- Fidelity notes, sound design, controls: [PORT_NOTES.md](PORT_NOTES.md)

## What was done

1. Read the original source set in [`asteroids-main/`](https://github.com/historicalsource/asteroids) (see [`ASTROD.DOC`](https://github.com/historicalsource/asteroids/blob/main/ASTROD.DOC) for the file directory) and identified the parts that define gameplay: game logic (`A35131.1A`), vector shape tables (`A35127.XX`) and the vector font (`VECAN.XX`).
2. Ported the game logic routine by routine into JavaScript, keeping the original internal units (X 0..8191, Y 0..6143) and the original constants, with the source opcode noted in comments.
3. Ported the vector tables: four rock shapes, 17 pre-rotated ship frames, the saucer, the explosion fragment directions and the full vector font.
4. Replaced the vector-beam hardware with HTML canvas strokes and the analog sound circuits with Web Audio synthesis.
5. Added the surrounding game flow: attract mode, wave transitions, game over, two-player turn switching, and the ten-entry high score table with initials entry.
6. Wrote headless validation scripts and ran them against the result.
7. Froze the result as version 1.

## Feature list in version 1

| Area | Included |
|------|----------|
| Gameplay | Ship rotate, thrust with inertia and friction, fire (4 torpedoes), hyperspace with its failure rule |
| Enemies | Large and small saucers with entry timing from the original, rocks in three sizes with the original split and velocity rules |
| Progression | Waves of 4 rocks growing by 2 up to 11, extra life every 10,000 points, 3 starting lives |
| Players | One or two players with per-player state save and restore |
| Scoring | Rock scores 100/50/20, saucer 200/1000, session high score, top-10 table with three-letter initials |
| Screens | Attract (title and score table alternate), play HUD, wave-clear flash, game over, initials entry |
| Sound | Ship fire, saucer fire, thrust, heartbeat thump with accelerating tempo, three explosion sizes, saucer sirens, extra-life arpeggio, hyperspace |
| Timing | Fixed 60 Hz logic step, independent of display refresh |

## Known deviations from the original

Documented honestly because they matter for the article's fidelity discussion. This table describes version 1 as frozen. The ones that were bugs are fixed in the working copy; see [VERSION_2.md](VERSION_2.md#1-behavior-restored-from-the-original).

| Deviation | Detail |
|-----------|--------|
| Small saucer score threshold | The original `ENEMY` compares the high byte of the BCD score (`SCORE+1`, holding the thousands and ten-thousands digits) with `30`, which is 30,000 points. Version 1 uses 3,000. |
| Radix mistakes | `A35131.1A` is assembled with `.RADIX 16`: a bare number is hex, a trailing dot marks decimal. Three constants were read with the wrong radix. (1) Saucer firing delay: the original `EFIRE` has `LDA I,10.` (decimal 10) but version 1 reuses 18 (`updateSaucer`, `edelay = 18` in the firing branch). (2) Saucer vertical speeds: `.BYTE -10,0,0,10` is hex, so +/-16, but version 1 uses +/-10. (3) Rock-hit timer: `SPLIT` has `LDA I,50` (hex 0x50 = 80) but version 1 sets `rtimer = 50` in `splitAsteroid`. The saucer entry delay `LDA I,18.` in `ENEMY` is decimal 18 and is correct in version 1. |
| Saucer direction change interval | `EFIRE` does `LDA FRAME / ASL / BNE`, which falls through when the low byte of `FRAME` is 0x00 or 0x80, so every 128 frames. Version 1 tests `(frame & 0xFF) === 0`, so every 256 frames, although its comment says 128. |
| Small saucer aiming | Uses `atan2` plus a random spread; the original calls its own `ATAN` routine and adds an error taken from a two-entry table that depends on the score (`CMP I,35`). Large saucer fires in a random direction, as in the original. |
| Explosion particles | An addition, not in the original. |
| Ship fade-in | An addition (30 frames). The original has no fade. |
| Wave-clear delay | 90 frames; original `RDELAY` is `0x7F` (127). |
| Rendering | Canvas strokes, not exact vector-beam output. |
| Two-player switching | Simplified compared with the original `NPLAYR` handling. |
| Not ported | Coin and credit handling, self test, DIP switch options, sound hardware registers. |
| Persistence | None. High scores last for the page session only. |

## Validation performed on version 1

All scripts load the inline script of the HTML file into a Node `vm` sandbox with stubbed browser objects. Run them all with `scripts/run_all.sh [file]`.

| Script | What it checks | Result at freeze |
|--------|----------------|------------------|
| [`check_syntax.js`](../scripts/check_syntax.js) | Embedded script parses | Pass |
| [`dev/simulate.js`](../scripts/dev/simulate.js) | 40 games of random input, 20,000 frames each; no exceptions, no NaN positions | Pass (saucer active for 57,828 frames) |
| [`dev/wave_test.js`](../scripts/dev/wave_test.js) | Clearing all rocks starts a larger wave; deployed ship fades in | Pass |
| [`dev/test_sounds.js`](../scripts/dev/test_sounds.js) | Every Web Audio routine and sound state transition, against a mock audio context | Pass |
| [`dev/test_hiscore.js`](../scripts/dev/test_hiscore.js) | Table insertion order, ties, initials for two players | Pass |
| [`dev/rock_speed.js`](../scripts/dev/rock_speed.js) | Prints mean rock speed per size (measurement, not pass/fail) | Large 1.66, medium 2.29, small 2.57 px per frame |

These are soak and behaviour checks. They do not compare the port against the original on a frame-by-frame basis; there is no emulator trace in this repository.

## Metrics for the article

| Metric | Original (`asteroids-main/`) | Version 1 |
|--------|-----------------------------|-----------|
| Language | 6502 assembly (MACRO-11 style) | JavaScript, HTML, no dependencies |
| Size of the source set | 3,653 lines in `A35131.1A` to `A35131.1E`; 7,722 lines across all files in `asteroids-main/` | 1,880 lines in one file, 65,686 bytes |
| Files | 16 | 1 (plus 7 validation scripts) |
| Runs on | Atari vector arcade hardware | Any modern browser |
| Build step | Cross-assembly and PROM burn | None |
| Tests | Hardware self test | 6 headless scripts |

Line counts come from `wc -l` on the files in this repository (2440 + 210 + 460 + 105 + 438 = 3,653 for the five program files). Line counts are not directly comparable: assembly needs more lines per feature, and the original also contains coin handling, self test and hardware support that version 1 does not port.

## Questions this baseline sets up for the modernization comparison

- Version 1 is a faithful manual translation. What would the same code look like after structural modernization (modules, classes or an entity list instead of module-level `let` variables, a testable core separated from the DOM)?
- Which of the known deviations are fixable by tightening the port (the radix mistakes, the direction interval and the 30,000 threshold are plain bugs), and which require a decision about what "faithful" means (canvas rendering, particles, fade-in)?
- Why did a careful manual port still carry radix errors, and would a tool-assisted translation have avoided or repeated them?
- How much of the validation can move from soak tests to deterministic tests, given the bit-exact `rand()`?
- What does persistence (high scores in `localStorage`), configuration (lives, difficulty) and touch input cost to add to this structure?

## Working with versions

```bash
# Check the frozen copy is untouched
cd versions/v1 && shasum -a 256 -c SHA256SUMS

# Validate any version
scripts/run_all.sh versions/v1/asteroids.html
scripts/run_all.sh asteroids.html

# See what changed since v1
diff -u versions/v1/asteroids.html asteroids.html
```

To freeze a later milestone (as was done for `versions/v2/`), copy the working file to `versions/vN/`, write its `SHA256SUMS`, set it read-only and add a short README like the one in `versions/v1/`.
