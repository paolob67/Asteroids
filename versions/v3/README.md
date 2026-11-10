# Version 3 (frozen)

This directory holds the frozen third version of the JavaScript port of Atari Asteroids: the version 2 game plus `smartPilot`, `layaPilot` and the Manual / Simple / Smart / Laya selector.

| Item | Value |
|------|-------|
| File | [`asteroids.html`](asteroids.html) |
| SHA-256 | `9cef5640c11b7382514afdd65a535a01a4d722b77a8c691573f552e8ea06edb6` |
| Size | 109,340 bytes, 2,754 lines |
| Files are read-only | yes (`chmod a-w`) |

## Rules

- Do not edit `asteroids.html` or `SHA256SUMS` in this directory. All new work happens on the root [`asteroids.html`](../../asteroids.html), which started as an identical copy of this file.
- To change what "version 3" means, create `versions/v4/` instead of altering this one.

## Verify integrity

```bash
cd versions/v3 && shasum -a 256 -c SHA256SUMS
```

## Verify behaviour

```bash
scripts/run_all.sh versions/v3/asteroids.html
node scripts/dev/measure_pilots.js versions/v3/asteroids.html 1200000 simplePilot,smartPilot 8
```

Expected result at the time of freezing: `ALL CHECKS PASSED`, and the pilot table in [Version 3](../../docs/VERSION_3.md#3-how-well-it-plays).

## Run the Laya server

The `Laya` button needs the local server. Without it, the game falls back to `smartPilot` and `run_all.sh` still passes. Apple Silicon is required (Python 3.12 was used for the measurements; the install also works on 3.14). From the repository root:

```bash
python3 -m venv .venv                                        # once
.venv/bin/pip install -r scripts/dev/requirements-laya.txt   # once
.venv/bin/python scripts/dev/laya_server.py --port 8700      # keep running
curl -s http://127.0.0.1:8700/health                         # from another terminal
```

The first start downloads the model weights from Hugging Face. More in [LAYA.md](../../docs/LAYA.md#32-setup-and-serving-commands).

## Compare against other versions

```bash
diff -u versions/v2/asteroids.html versions/v3/asteroids.html | less
diff -u versions/v3/asteroids.html asteroids.html | less
```
