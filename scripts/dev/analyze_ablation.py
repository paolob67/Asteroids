#!/usr/bin/env python3
"""
Prompt-level ablation of layaPilot (no new game runs): verdict, facts, raw.

Reads docs/articles/data/ablation-<date>-{verdict,facts,raw}-12x8000-lag6.json (written by
scripts/dev/measure_pilots.js --level=...) and the T3 file for simplePilot and smartPilot, then prints
losses per flying hour with an exact 95% interval and paired differences in points and losses over the
same 12 starting points (mean difference, 95% t interval, wins, exact two-sided sign test).

Usage: python3 scripts/dev/analyze_ablation.py [data_dir] [date]
"""
import json
import math
import statistics as st
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from analyze_pilots import poisson_ci, T_CRIT_11DF  # noqa: E402

D = sys.argv[1] if len(sys.argv) > 1 else "docs/articles/data"
DATE = sys.argv[2] if len(sys.argv) > 2 else "2026-11-17"
T3 = f"{D}/pilots-2026-11-10-all3-12x8000-lag6.json"


def load(path):
    return {r["pilot"]: r for r in json.load(open(path))["results"]}


def sign_p(diff):
    nn = sum(1 for x in diff if x != 0)
    wins = sum(1 for x in diff if x > 0)
    if nn == 0:
        return 1.0
    return min(1.0, 2 * sum(math.comb(nn, i) for i in range(0, min(wins, nn - wins) + 1)) / 2 ** nn)


def paired(a, b, label_a, label_b, key):
    diff = [x - y for x, y in zip(a, b)]
    n, m = len(diff), st.mean(diff)
    se = st.stdev(diff) / math.sqrt(n)
    wins = sum(1 for x in diff if x > 0)
    print(f"  {key:6s} {label_a} minus {label_b}: mean {m:8.1f}  95% interval {m - T_CRIT_11DF * se:8.1f} to {m + T_CRIT_11DF * se:8.1f}  higher in {wins}/{n}  sign test p = {sign_p(diff):.3f}")


def main():
    t3 = load(T3)
    runs = {lvl: load(f"{D}/ablation-{DATE}-{lvl}-12x8000-lag6.json")["layaPilot"] for lvl in ("verdict", "facts", "raw")}
    runs["smartPilot"] = t3["smartPilot"]
    runs["simplePilot"] = t3["simplePilot"]
    runs["layaPilot (T3, 2026-11-10)"] = t3["layaPilot"]

    print("Losses per flying hour (exact 95% interval), points per minute, behaviour")
    for n, r in runs.items():
        h = sum(x["play"] for x in r["rows"]) / 216000
        lo, hi = poisson_ci(r["losses"])
        b = r.get("behaviour", {})
        print(f"  {n:28s} losses {r['losses']:4d} over {h:5.2f} h  rate {r['losses']/h:6.1f}  interval {lo/h:6.1f} to {hi/h:6.1f}  "
              f"points/min {r['pointsPerMin']:6d}  thrust {r['thrustPct']}%  hyper/h {r['hyperspacePerHour']}  "
              f"drift {b.get('driftPct')}%  dist {b.get('meanDistFromCentre')}  causes {r['causes']}")

    pts = {n: [x["points"] for x in r["rows"]] for n, r in runs.items()}
    los = {n: [x["losses"] for x in r["rows"]] for n, r in runs.items()}
    print("\nPaired differences over the same 12 starting points")
    for a, b in (("facts", "verdict"), ("raw", "verdict"), ("facts", "smartPilot"), ("facts", "simplePilot"),
                 ("verdict", "smartPilot"), ("verdict", "simplePilot")):
        paired(pts[a], pts[b], a, b, "points")
        paired(los[a], los[b], a, b, "losses")


if __name__ == "__main__":
    main()
