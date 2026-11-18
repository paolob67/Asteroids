#!/usr/bin/env python3
"""Part 4: how much of the strategy label can be read from the frame text with fixed string rules?

The label is the teacher's strategy on that frame, taken from smartPilot's own play
(meta.situation): stay -> aim, dodge -> escape, brake -> brake, hyper -> hyperspace.
No model is trained here. The rules look only at the sentences of the text, so the score is a floor
for what the text carries and shows which classes depend on something the text does not state.

Usage: python3 scripts/dev/strategy_rule_check.py <val.jsonl> [train.jsonl]
"""
import collections
import json
import re
import sys

LABEL = {"stay": "aim", "dodge": "escape", "brake": "brake", "hyper": "hyperspace"}
STRATS = ["aim", "escape", "brake", "hyperspace"]


def rule(text):
    if "With no key pressed a " in text:                      # something is predicted to hit
        m = re.search(r"delays the hit to (\d+) ticks", text)
        if m and int(m.group(1)) <= 8:
            return "hyperspace"                               # no safe dodge and the hit is close
        return "escape"
    if re.search(r"slows the ship and keeps every object clear", text):
        return "brake"
    return "aim"


def load(path):
    return [json.loads(l) for l in open(path)]


def report(rows, name):
    conf = collections.Counter()
    for r in rows:
        conf[(LABEL[r["meta"]["situation"]], rule(r["state"]))] += 1
    n = len(rows)
    ok = sum(v for (a, b), v in conf.items() if a == b)
    print(f"{name}: {n} frames, rule accuracy {ok / n:.3f}")
    print(f"{'label':12}" + "".join(f"{p:>12}" for p in STRATS) + f"{'recall':>10}")
    for a in STRATS:
        tot = sum(conf[(a, b)] for b in STRATS)
        row = "".join(f"{conf[(a, b)]:>12}" for b in STRATS)
        print(f"{a:12}{row}{(conf[(a, a)] / tot if tot else 0):>10.3f}")
    for b in STRATS:
        tot = sum(conf[(a, b)] for a in STRATS)
        print(f"precision {b:11} {(conf[(b, b)] / tot if tot else 0):.3f}")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        report(load(p), p)
