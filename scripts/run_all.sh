#!/usr/bin/env bash
# Runs every validation script against a given HTML file (default: asteroids.html).
# Usage: scripts/run_all.sh [path/to/asteroids.html]
set -u
cd "$(dirname "$0")/.."
target="${1:-asteroids.html}"
fail=0
for s in check_syntax.js dev/rock_speed.js dev/simulate.js dev/wave_test.js dev/test_sounds.js dev/test_hiscore.js dev/test_controller_selector.js; do
  echo "== $s"
  if ! node "scripts/$s" "$target"; then echo "FAILED: $s"; fail=1; fi
done
if [ "$fail" -eq 0 ]; then echo "ALL CHECKS PASSED for $target"; else echo "SOME CHECKS FAILED for $target"; exit 1; fi
