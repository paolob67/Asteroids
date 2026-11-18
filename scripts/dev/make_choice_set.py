#!/usr/bin/env python3
"""Turn the five-key export (export_training_set.js) into one choice question per frame (Part 4).

A full fine-tune on a 16 GB M1 costs about 1.45 s per training item, and laya-train makes one item
per question, so five yes/no questions per frame are five times as expensive as one choice question.
The model still decides every key: each option is one key combination smartPilot actually used.

The option set is the 13 combinations seen in the teacher's play on the training seeds. Option texts
describe keys only, never the situation that calls for them.

Usage:
  python3 scripts/dev/make_choice_set.py <in.jsonl> <out.jsonl> [--cap N] [--sample N] [--seed S]
    --cap N      keep at most N rows per key combination (rare ones are kept whole); for training sets
    --sample N   keep a uniform random sample of N rows, natural class mix; for held-out sets
"""
import argparse
import collections
import json
import random

# label -> (keys, option text). Order is fixed so every row carries the same question.
OPTIONS = [
    ("none",             "",     "Hold no key."),
    ("left",             "L",    "Hold the rotate-left key only."),
    ("right",            "R",    "Hold the rotate-right key only."),
    ("thrust",           "T",    "Hold the thrust key only."),
    ("fire",             "F",    "Press the fire key only."),
    ("left_thrust",      "LT",   "Hold rotate-left and thrust."),
    ("right_thrust",     "RT",   "Hold rotate-right and thrust."),
    ("left_fire",        "LF",   "Hold rotate-left and press fire."),
    ("right_fire",       "RF",   "Hold rotate-right and press fire."),
    ("thrust_fire",      "TF",   "Hold thrust and press fire."),
    ("left_thrust_fire", "LTF",  "Hold rotate-left and thrust, and press fire."),
    ("right_thrust_fire","RTF",  "Hold rotate-right and thrust, and press fire."),
    ("hyperspace",       "H",    "Press the hyperspace key, which jumps to a random place on the screen. The jump can destroy the ship."),
]
KEYS_TO_LABEL = {k: label for label, k, _ in OPTIONS}

QUESTION = {
    "action": {
        "type": "choice",
        "instructions": "Which keys should the ship press on this frame to stay alive and destroy rocks and saucers?",
        "criteria": {label: text for label, _, text in OPTIONS},
    }
}


def combo(e):
    if e["hyper"]:
        return "H"
    return ("L" if e["left"] else "") + ("R" if e["right"] else "") + ("T" if e["thrust"] else "") + ("F" if e["fire"] else "")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("src")
    p.add_argument("dst")
    p.add_argument("--cap", type=int, default=None)
    p.add_argument("--sample", type=int, default=None)
    p.add_argument("--seed", type=int, default=0)
    a = p.parse_args()

    rows = []
    for line in open(a.src):
        r = json.loads(line)
        k = combo(r["expected"])
        if k == "LR" or k not in KEYS_TO_LABEL:
            raise SystemExit(f"key combination {k!r} has no option; extend OPTIONS (row {r['meta']})")
        rows.append((KEYS_TO_LABEL[k], r))

    rng = random.Random(a.seed)
    if a.cap is not None:
        by = collections.defaultdict(list)
        for label, r in rows:
            by[label].append((label, r))
        rows = []
        for label, items in by.items():
            rng.shuffle(items)
            rows.extend(items[:a.cap])
    if a.sample is not None:
        rng.shuffle(rows)
        rows = rows[:a.sample]
    rng.shuffle(rows)

    counts = collections.Counter(label for label, _ in rows)
    with open(a.dst, "w") as f:
        for label, r in rows:
            f.write(json.dumps({"state": r["state"], "questions": QUESTION, "expected": {"action": label}, "meta": r["meta"]}) + "\n")
    print(f"wrote {a.dst}: {len(rows)} rows")
    for label, n in counts.most_common():
        print(f"  {label:18} {n:6} {100 * n / len(rows):5.1f}%")


if __name__ == "__main__":
    main()
