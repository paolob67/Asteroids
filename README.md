# Asteroids

JavaScript canvas port of the original Atari Asteroids 6502 source, published at [historicalsource/asteroids](https://github.com/historicalsource/asteroids). That repository has no licence file, so its files are not copied into this repository (see [Original source](#original-source)).

Open [`asteroids.html`](asteroids.html) in a browser to play. No build step, no dependencies.

The page shows the game on a 4:3 monitor on the left. On the right, the top panel shows the game state (`snapshot()`) and the bottom panel shows the decision (the keys pressed and why). The **Manual | Simple | Smart** selector in the Decision panel chooses who flies: you with the keyboard, the very simple v2 pilot ([Version 2](docs/VERSION_2.md#5-how-well-the-autopilot-plays)), or the v3 pilot that looks ahead, dodges with thrust and uses hyperspace as a last resort ([Version 3](docs/VERSION_3.md#3-how-well-it-plays)).

## Versions

| Version | Location | Status |
|---------|----------|--------|
| v1 | [`versions/v1/`](versions/v1/) | Frozen, read-only baseline of the first manual port. Reference for the planned article comparing this step with a code modernization approach. |
| v2 | [`versions/v2/`](versions/v2/) | Frozen, read-only. Restores behavior lost in the first port, adds the State and Decision panels, and adds a very simple autopilot (rotates and fires from the centre; no thrust, no movement, no hyperspace). |
| v3 (working copy) | [`asteroids.html`](asteroids.html) | Adds `smartPilot` and the Manual / Simple / Smart selector. Not frozen. All further work happens here. |

## Documentation

- [Version 3: smarter autopilot and controller selector](docs/VERSION_3.md): how `smartPilot` predicts and dodges, proof that it moves the ship only through the keys, and measurements against the v2 pilot.
- [CLM decision model](docs/CLM.md): reference links for the model ([model card](https://huggingface.co/Contrastive-LM/CLM-v0.1-8B), [code](https://github.com/Contrastive-LM/CLM)), what it can and cannot do, how it is served, and the design decisions for the planned CLM autopilot.
- [Version 2: restored behavior, state, decisions, autopilot](docs/VERSION_2.md): what changed from v1 with measurements, how the state is represented, how the pilot decides, and how well it plays.
- [Version 1 baseline](docs/VERSION_1.md): what was done, feature list, known deviations from the original, validation results, article metrics.
- [Architecture](docs/ARCHITECTURE.md): structure of the script, state machine, mapping from 6502 routines to JavaScript functions, and the v2 state and decision loop, with diagrams.
- [Port notes](docs/PORT_NOTES.md): controls, sound synthesis, fidelity to the original, known approximations, validation scripts.
- [Frozen v1 README](versions/v1/README.md) and [frozen v2 README](versions/v2/README.md): checksum, integrity and comparison commands.

Diagram sources (`.drawio`) and exports (`.png`) are in [`docs/diagrams/`](docs/diagrams/).

## Validation

```bash
scripts/run_all.sh                              # working copy
scripts/run_all.sh versions/v1/asteroids.html   # frozen v1
scripts/run_all.sh versions/v2/asteroids.html   # frozen v2

node scripts/dev/measure_autopilot.js asteroids.html 3000000   # autopilot against baselines
node scripts/dev/measure_pilots.js asteroids.html 1200000 simplePilot,smartPilot 8   # Simple against Smart
node scripts/dev/check_thrust_physics.js asteroids.html 300000 smartPilot            # pilot moves the ship only through the keys
node scripts/dev/compare_versions.js                           # v1 against v2
node scripts/dev/compare_versions.js versions/v2/asteroids.html asteroids.html   # v2 against the working copy
```

## Repository layout

```
asteroids.html        working copy of the game (version 3)
versions/v1/          frozen version 1 + SHA256SUMS
versions/v2/          frozen version 2 + SHA256SUMS
docs/                 documentation and diagrams
scripts/              validation and measurement scripts (run_all.sh, check_syntax.js, dev/)
```

## Original source

The original 6502 source is not included here. [historicalsource/asteroids](https://github.com/historicalsource/asteroids) has no licence file, so redistribution rights are unclear. The documents refer to its files (for example `A35131.1A`) by name and link to them there.

To follow the references or re-run any check that mentions line numbers in the original, clone it next to this repository as `asteroids-main/`. That folder is listed in `.gitignore` and is never committed:

```bash
git clone https://github.com/historicalsource/asteroids asteroids-main
```
