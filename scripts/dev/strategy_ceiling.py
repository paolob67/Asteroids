#!/usr/bin/env python3
"""Part 4: how well can the STRATEGY (aim, escape, brake, hyperspace) be recovered from the frame text?

Same parsing and small CPU classifier as text_ceiling.py, but the label is the teacher's strategy on
that frame (meta.situation: stay -> aim, dodge -> escape, brake -> brake, hyper -> hyperspace).
Run it twice: without --ahead the classifier sees only the object list and the ship's motion
(geometry), with --ahead it also sees the look-ahead sentence.

Usage: .work/venv/bin/python scripts/dev/strategy_ceiling.py <train.jsonl> <val.jsonl> [--ahead]
"""
import sys

import numpy as np

import text_ceiling as tc   # reads --ahead from sys.argv at import

LABEL = {"stay": 0, "dodge": 1, "brake": 2, "hyper": 3}
NAMES = ["aim", "escape", "brake", "hyperspace"]


def main():
    paths = [a for a in sys.argv[1:] if not a.startswith("--")]
    X, _, _, _ = tc.load(paths[0])
    y = np.array([LABEL[r["meta"]["situation"]] for r in tc.rowsv])
    Xv, _, _, _ = tc.load(paths[1])
    yv = np.array([LABEL[r["meta"]["situation"]] for r in tc.rowsv])
    print(f"look-ahead sentence {'READ' if tc.USE_AHEAD else 'NOT read'}; train {len(X)} rows, val {len(Xv)} rows, features {X.shape[1]}")
    print("val mix:", {n: round(float(np.mean(yv == i)), 3) for i, n in enumerate(NAMES)})
    print(f"majority class accuracy {np.mean(yv == np.bincount(y).argmax()):.3f}")
    for seed in (0, 1):
        pred, loss = tc.fit(X, y, Xv, yv, 4, seed=seed)
        print(f"seed {seed}: small MLP accuracy {np.mean(pred == yv):.3f}  loss {loss:.3f}")
    cm = np.zeros((4, 4), dtype=int)
    for a, b in zip(yv, pred):
        cm[a, b] += 1
    print("confusion (rows = teacher, cols = predicted):", NAMES)
    print(cm)
    for i, n in enumerate(NAMES):
        print(f"  {n:11} recall {cm[i, i] / max(1, cm[i].sum()):.3f}  precision {cm[i, i] / max(1, cm[:, i].sum()):.3f}")


if __name__ == "__main__":
    main()
