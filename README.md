# Asteroids

JavaScript canvas port of the original Atari Asteroids 6502 source, published at [historicalsource/asteroids](https://github.com/historicalsource/asteroids). That repository has no licence file, so its files are not copied into this repository (see [Original source](#original-source)).

Open [`asteroids.html`](asteroids.html) in a browser to play. No build step, no dependencies.

The page shows the game on a 4:3 monitor on the left. On the right, the top panel shows the game state (`snapshot()`) and the bottom panel shows the decision (the keys pressed and why). The **Manual | Simple | Smart | Laya** selector in the Decision panel chooses who flies: you with the keyboard, the simple v2 pilot ([Version 2](docs/VERSION_2.md#5-how-well-the-autopilot-plays)), the v3 smart pilot built on rules implemented in the code (it predicts the next 90 ticks and dodges with thrust, [Version 3](docs/VERSION_3.md#3-how-well-it-plays)), or the v3 pilot built on a decision model, `Laya-MLX`, running locally on Apple Silicon ([Laya Plan](docs/LAYA.md)).

## Versions

| Version | Location | Status |
|---------|----------|--------|
| v1 | [`versions/v1/`](versions/v1/) | Frozen, read-only baseline of the initial port produced with Bob. Reference for the article series on code modernization. |
| v2 | [`versions/v2/`](versions/v2/) | Frozen, read-only. Restores behavior lost in the first port, adds the State and Decision panels, and adds a very simple autopilot (rotates and fires from the centre; no thrust, no movement, no hyperspace). |
| v3 | [`versions/v3/`](versions/v3/) | Frozen, read-only. Adds two autopilots, `smartPilot` (rules in the code) and `layaPilot` (decision model), and the Manual / Simple / Smart / Laya selector. |
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

- [Article series](docs/articles/README.md): write-up plan, outlines and LinkedIn texts for the three-part series on code modernization with Bob.
- [Version 3: two new autopilots, rules in the code and a decision model](docs/VERSION_3.md): how `smartPilot` (rule-based lookahead) and `layaPilot` (decision model) fly, proof that they move the ship only through the keys, and measurements of both against the v2 pilot.
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

### Pilot measurements for the articles

These scripts produce and analyse the numbers in [`docs/articles/data/`](docs/articles/data/README.md). The Laya ones need the server from [Run the Laya server](#run-the-laya-server-optional).

```bash
node scripts/dev/measure_pilots.js asteroids.html 8000 simplePilot,smartPilot,layaPilot 12 --lag=6 --json=out.json   # all three pilots
python3 scripts/dev/analyze_pilots.py docs/articles/data          # 95% intervals and paired comparisons from the JSON files
node scripts/dev/browser_check.js 60 smart,laya --json=out.json   # real Chrome: ticks per second, Laya latency in ticks
.venv/bin/python scripts/dev/bench_laya_latency.py                # laya-mlx latency by device, precision and text length
node scripts/dev/death_causes.js asteroids.html 1000000 smartPilot   # classify every ship loss
node scripts/dev/export_pilot_log.js asteroids.html 600000 smartPilot 0 /tmp/smart_0.jsonl   # pilot log for offline model tests
node scripts/dev/eval_laya_offline.js /tmp/smart_0.jsonl 100      # Laya against a recorded pilot log
```

### Article images

LinkedIn articles have no tables or code blocks, so both are exported as PNG from JSON specs in [`docs/articles/linkedin/`](docs/articles/linkedin/README.md). Edit the JSON and re-export; do not edit the PNGs. The snippets use the Carbon Gray 100 theme with IBM Plex Mono and need a local Google Chrome. The tables need the draw.io app.

```bash
node scripts/dev/make_snippet_images.js docs/articles/linkedin/snippets.json docs/diagrams   # code snippets to docs/diagrams/snippet-<id>.png
node scripts/dev/make_article_tables.js docs/articles/linkedin/tables.json docs/diagrams      # tables to .drawio, then export each to PNG with the draw.io CLI
```

## Repository layout

```
asteroids.html        working copy of the game (identical to version 3 at the freeze)
versions/v1/          frozen version 1 + SHA256SUMS
versions/v2/          frozen version 2 + SHA256SUMS
versions/v3/          frozen version 3 + SHA256SUMS
docs/                 documentation (VERSION_*.md, ARCHITECTURE.md, LAYA*.md, ...)
docs/diagrams/        .drawio sources and .png exports (diagrams, article tables), snippet-*.png (article code snippets)
docs/articles/        article series material: plan, outlines, findings, test log, linkedin/ texts with tables.json and snippets.json
docs/articles/data/   raw measurement files (JSON) behind every quoted number
scripts/              validation scripts (run_all.sh, check_syntax.js)
scripts/dev/          measurement, analysis and tuning scripts (JavaScript and Python), laya_server.py
```

## Original source

The original 6502 source is not included here. [historicalsource/asteroids](https://github.com/historicalsource/asteroids) has no licence file, so redistribution rights are unclear. The documents refer to its files (for example `A35131.1A`) by name and link to them there.

To follow the references or re-run any check that mentions line numbers in the original, clone it next to this repository as `asteroids-main/`. That folder is listed in `.gitignore` and is never committed:

```bash
git clone https://github.com/historicalsource/asteroids asteroids-main
```
