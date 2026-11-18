#!/usr/bin/env bash
# Rebuilds the student3 training data from the game and checks it against the committed files, then
# (optionally) retrains the checkpoint. Run from the repository root.
#
#   scripts/dev/reproduce_student3.sh data     # regenerate data into .work/data, compare with training/student3 (about 1 min)
#   scripts/dev/reproduce_student3.sh train    # fine-tune from training/student3/*.jsonl (about 3 hours on an M1 Air 16 GB)
#
# The data step is deterministic: the strategy files come out byte for byte identical. The train step
# is not bit-exact (MPS kernels), so expect an accuracy close to 0.84 on the held-out file, not equal weights.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=${OUT:-.work/data}
CKPT=${CKPT:-.work/ckpt/student3}
PY=${PY:-.work/venv/bin/python}

case "${1:-}" in
  data)
    mkdir -p "$OUT"
    # teacher (smartPilot) on seeds 100..119 for training and 200..204 held out; seeds 0..11 are the play evaluation
    node scripts/dev/export_training_set.js "$OUT/train5.jsonl" 100 119 60000 --geometry
    node scripts/dev/export_training_set.js "$OUT/val5.jsonl"   200 204 60000 --geometry
    python3 scripts/dev/make_strategy_set.py "$OUT/train5.jsonl" "$OUT/train5_strategy.jsonl" --cap 1000
    python3 scripts/dev/make_strategy_set.py "$OUT/val5.jsonl"   "$OUT/val5_strategy.jsonl" --sample 1500 --seed 1
    for f in train5_strategy val5_strategy; do
      cmp "$OUT/$f.jsonl" "training/student3/$f.jsonl" && echo "OK: $f.jsonl identical to training/student3/$f.jsonl"
    done
    ;;
  train)
    "$PY" scripts/dev/train_student.py --data training/student3/train5_strategy.jsonl \
      --eval training/student3/val5_strategy.jsonl --out "$CKPT" --epochs 2 --micro-batch 2 --grad-accum 4
    "$PY" scripts/dev/eval_student_offline.py "$CKPT" training/student3/val5_strategy.jsonl --n 600
    ;;
  *)
    echo "usage: $0 data|train" >&2; exit 2 ;;
esac
