#!/usr/bin/env python3
"""Part 4: offline check of the fine-tuned strategy student on held-out frames (seeds the model never saw).

Reports what strategy the student chose against the strategy smartPilot was following (aim, escape,
brake, hyperspace): accuracy, the confusion matrix, and per-strategy precision and recall. Frames where
the teacher escapes but the student does not are the costly misses, so they are listed on their own.
The question is the checkpoint's own questions.json.

Usage: .work/venv/bin/python scripts/dev/eval_student_offline.py <ckpt> <val_strategy.jsonl> [--n 600] [--seed 0]
"""
import argparse
import collections
import json
import random
import time

import numpy as np
import laya

STRATS = ["aim", "escape", "brake", "hyperspace"]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("ckpt")
    p.add_argument("data")
    p.add_argument("--n", type=int, default=600)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--device", default="mps")
    a = p.parse_args()

    rows = [json.loads(l) for l in open(a.data)]
    random.Random(a.seed).shuffle(rows)
    rows = rows[:a.n]
    agent = laya.load(a.ckpt, device=a.device)
    questions = json.load(open(f"{a.ckpt}/questions.json"))

    t0 = time.time()
    pred = []
    for r in rows:
        out = agent.predict(r["state"], questions)
        pred.append(out["answers"]["action"]["choice"])
    secs = time.time() - t0

    gold = [r["expected"]["action"] for r in rows]
    acc = np.mean([p == g for p, g in zip(pred, gold)])
    print(f"{len(rows)} held-out frames, {secs / len(rows):.2f} s per answer")
    print(f"accuracy {acc:.3f}   (majority class {collections.Counter(gold).most_common(1)[0][1] / len(gold):.3f})")
    print("predicted mix:", dict(collections.Counter(pred).most_common()))
    print("teacher mix:  ", dict(collections.Counter(gold).most_common()))

    cm = np.zeros((len(STRATS), len(STRATS)), dtype=int)
    for g, q in zip(gold, pred):
        cm[STRATS.index(g), STRATS.index(q)] += 1
    print("\nconfusion (rows teacher, cols student):", STRATS)
    print(cm)
    for i, n in enumerate(STRATS):
        print(f"  {n:11} teacher {cm[i].sum():4}  recall {cm[i, i] / max(1, cm[i].sum()):.3f}  precision {cm[i, i] / max(1, cm[:, i].sum()):.3f}")

    esc = [i for i, g in enumerate(gold) if g == "escape"]
    missed = sum(1 for i in esc if pred[i] == "aim")
    print(f"\nteacher escapes on {len(esc)} frames; student chose aim on {missed} of them ({missed / max(1, len(esc)):.3f})")
    calm = [i for i, g in enumerate(gold) if g == "aim"]
    false_alarm = sum(1 for i in calm if pred[i] == "escape")
    print(f"teacher aims on {len(calm)} frames; student chose escape on {false_alarm} of them ({false_alarm / max(1, len(calm)):.3f})")


if __name__ == "__main__":
    main()
