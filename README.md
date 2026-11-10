# Asteroids

JavaScript canvas port of the original Atari Asteroids 6502 source, published at [historicalsource/asteroids](https://github.com/historicalsource/asteroids). That repository has no licence file, so its files are not copied into this repository (see [Original source](#original-source)).

Open [`asteroids.html`](asteroids.html) in a browser to play. No build step, no dependencies.

The page shows the game on a 4:3 monitor on the left. On the right, the top panel shows the game state (`snapshot()`) and the bottom panel shows the decision (the keys pressed and why). The **Manual | Simple | Smart | Laya** selector in the Decision panel chooses who flies: you with the keyboard, the simple v2 pilot ([Version 2](docs/VERSION_2.md#5-how-well-the-autopilot-plays)), the v3 smart pilot that looks ahead and dodges with thrust ([Version 3](docs/VERSION_3.md#3-how-well-it-plays)), or the local `Laya-MLX` decision model running on Apple Silicon ([Laya Plan](docs/LAYA.md)).

## Versions

| Version | Location | Status |
|---------|----------|--------|
| v1 | [`versions/v1/`](versions/v1/) | Frozen, read-only baseline of the first manual port. Reference for the planned article comparing this step with a code modernization approach. |
| v2 | [`versions/v2/`](versions/v2/) | Frozen, read-only. Restores behavior lost in the first port, adds the State and Decision panels, and adds a very simple autopilot (rotates and fires from the centre; no thrust, no movement, no hyperspace). |
| v3 | [`versions/v3/`](versions/v3/) | Frozen, read-only. Adds `smartPilot`, `layaPilot`, and the Manual / Simple / Smart / Laya selector. |
| Working copy | [`asteroids.html`](asteroids.html) | Currently identical to v3. All further work happens here. |

## Run the Laya server (optional)

The **Laya** button needs a local decision server. Without it the button is disabled and the game flies `smartPilot` instead. Apple Silicon is required (Python 3.12 was used for the measurements; the install also works on 3.14). From the repository root:

```bash
python3 -m venv .venv                                   # once
.venv/bin/pip install -r scripts/dev/requirements-laya.txt   # once
.venv/bin/python scripts/dev/laya_server.py --port 8700      # keep running
curl -s http://127.0.0.1:8700/health                    # from another terminal
```

The first start downloads the model weights from Hugging Face. Details, model options and troubleshooting: [Laya-MLX local autopilot plan](docs/LAYA.md#32-setup-and-serving-commands).

## Documentation

- [Version 3: smarter autopilot and controller selector](docs/VERSION_3.md): how `smartPilot` predicts and dodges, proof that it moves the ship only through the keys, and measurements against the v2 pilot.
- [Decision models and autopilot design](docs/DECISION_MODELS.md): overview of decision models (System One models like Laya, Kev, Jev, CLM), local feasibility analysis for Apple Silicon M1, selection of `laya-mlx` and `Kev` as local candidates, the `/v1/systemone` protocol, and autopilot architecture.
- [Laya-MLX local autopilot plan](docs/LAYA.md): serving specifications, sub-frame latency benchmarks on Apple Silicon M1, ModernBERT architecture, and phased implementation plan for `laya-mlx`.
- [Laya autopilot implementation guide](docs/LAYA_IMPLEMENTATION.md): end-to-end data flow, situation prompting, asynchronous browser loop, Python MLX server, low-level actuation, and offline fallback.
- [CLM reference](docs/CLM.md): architecture facts, Qwen3-8B encoder with dual projection heads, serving stack, and remote GPU deployment notes for the Contrastive Language Model.
- [Version 2: restored behavior, state, decisions, autopilot](docs/VERSION_2.md): what changed from v1 with measurements, how the state is represented, how the pilot decides, and how well it plays.
- [Version 1 baseline](docs/VERSION_1.md): what was done, feature list, known deviations from the original, validation results, article metrics.
- [Architecture](docs/ARCHITECTURE.md): structure of the script, state machine, mapping from 6502 routines to JavaScript functions, and the v2 state and decision loop, with diagrams.
- [Port notes](docs/PORT_NOTES.md): controls, sound synthesis, fidelity to the original, known approximations, validation scripts.
- [Frozen v1 README](versions/v1/README.md), [frozen v2 README](versions/v2/README.md) and [frozen v3 README](versions/v3/README.md): checksum, integrity and comparison commands.

Diagram sources (`.drawio`) and exports (`.png`) are in [`docs/diagrams/`](docs/diagrams/).

## Validation

```bash
scripts/run_all.sh                              # working copy
scripts/run_all.sh versions/v1/asteroids.html   # frozen v1
scripts/run_all.sh versions/v2/asteroids.html   # frozen v2
scripts/run_all.sh versions/v3/asteroids.html   # frozen v3

node scripts/dev/measure_autopilot.js asteroids.html 3000000   # autopilot against baselines
node scripts/dev/measure_pilots.js asteroids.html 1200000 simplePilot,smartPilot 8   # Simple against Smart
node scripts/dev/check_thrust_physics.js asteroids.html 300000 smartPilot            # pilot moves the ship only through the keys
node scripts/dev/compare_versions.js                           # v1 against v2
node scripts/dev/compare_versions.js versions/v2/asteroids.html asteroids.html   # v2 against the working copy (also v3 once the working copy diverges)
```

## Repository layout

```
asteroids.html        working copy of the game (identical to version 3 at the freeze)
versions/v1/          frozen version 1 + SHA256SUMS
versions/v2/          frozen version 2 + SHA256SUMS
versions/v3/          frozen version 3 + SHA256SUMS
docs/                 documentation and diagrams
scripts/              validation and measurement scripts (run_all.sh, check_syntax.js, dev/)
```

## Original source

The original 6502 source is not included here. [historicalsource/asteroids](https://github.com/historicalsource/asteroids) has no licence file, so redistribution rights are unclear. The documents refer to its files (for example `A35131.1A`) by name and link to them there.

To follow the references or re-run any check that mentions line numbers in the original, clone it next to this repository as `asteroids-main/`. That folder is listed in `.gitignore` and is never committed:

```bash
git clone https://github.com/historicalsource/asteroids asteroids-main
```
