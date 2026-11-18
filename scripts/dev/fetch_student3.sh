#!/usr/bin/env bash
# Downloads the trained student3 checkpoint (version 4) from the GitHub release and unpacks it to
# .work/ckpt/student3, so the student server can run without the 3 hour retrain.
#
#   scripts/dev/fetch_student3.sh [destination-dir]      (default .work/ckpt)
#
# The archive holds the files laya_mlx needs to serve the model (model.safetensors, encoder/config.json,
# tokenizer/, rl_agent_config.json, questions.json) and the two training reports. It does not hold the
# training state (checkpoint_latest/), which is only needed to resume training.
set -euo pipefail
cd "$(dirname "$0")/../.."
DEST=${1:-.work/ckpt}
TAG=v4-student3
URL=https://github.com/paolob67/Asteroids/releases/download/$TAG/student3.tar.gz
SHA256=7dcee73e18295bd839020d55d3d6be643f60cc3cc90fe2a6b10eff1fa7756c2e

if [ -f "$DEST/student3/model.safetensors" ]; then
  echo "$DEST/student3 already exists; remove it first to download again." >&2; exit 0
fi
mkdir -p "$DEST"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/student3.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
echo "Downloading $URL (about 780 MB)..."
curl -fL -sS -o "$TMP/student3.tar.gz" "$URL"
GOT=$(shasum -a 256 "$TMP/student3.tar.gz" | cut -d' ' -f1)
if [ "$GOT" != "$SHA256" ]; then
  echo "Checksum mismatch: expected $SHA256, got $GOT" >&2; exit 1
fi
tar -xzf "$TMP/student3.tar.gz" -C "$DEST"
echo "OK: $DEST/student3 ready. Start the server: .venv/bin/python scripts/dev/student_server.py"
