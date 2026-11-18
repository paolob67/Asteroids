#!/usr/bin/env python3
"""Turn an export (export_training_set.js) into one strategy question per frame (Part 4, strategy model).

The model does not press keys. It chooses a strategy and the game's executor (spExecute) carries it out
every tick. The label is the strategy smartPilot was following on that frame, taken from meta.situation:
stay -> aim, dodge -> escape, brake -> brake, hyper -> hyperspace.

Option texts describe what the executor does, never when to choose it.

Usage:
  python3 scripts/dev/make_strategy_set.py <in.jsonl> <out.jsonl> [--cap N] [--sample N] [--seed S]
    --cap N      keep at most N rows per strategy (rare ones are kept whole); for training sets
    --sample N   keep a uniform random sample of N rows, natural class mix; for held-out sets
"""
import argparse
import collections
import json
import random

SITUATION_TO_LABEL = {"stay": "aim", "dodge": "escape", "brake": "brake", "hyper": "hyperspace"}

OPTIONS = [
    ("aim", "Hold the ship in place. Turn to the target a torpedo can reach soonest and fire when lined up. No thrust."),
    ("escape", "Fly the thrust manoeuvre that takes the ship out of the path of the objects, and fire at whatever is lined up on the way."),
    ("brake", "Thrust against the ship's drift until it is nearly still, and fire at whatever is lined up on the way."),
    ("hyperspace", "Press the hyperspace key, which jumps to a random place on the screen. The jump can destroy the ship."),
]

QUESTION = {
    "action": {
        "type": "choice",
        "instructions": "Which strategy should the ship follow for the next second to stay alive and destroy rocks and saucers?",
        "criteria": {label: text for label, text in OPTIONS},
    }
}


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
        sit = r["meta"]["situation"]
        if sit not in SITUATION_TO_LABEL:
            raise SystemExit(f"situation {sit!r} has no strategy (row {r['meta']})")
        rows.append((SITUATION_TO_LABEL[sit], r))

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
        print(f"  {label:12} {n:6} {100 * n / len(rows):5.1f}%")


if __name__ == "__main__":
    main()
