#!/usr/bin/env python3
"""
Uncertainty analysis of the pilot measurements in docs/articles/data/ (no new game runs).

Reads the JSON written by scripts/dev/measure_pilots.js and prints:
  - losses per flying hour with an exact 95% confidence interval (Poisson, Garwood)
  - points per start point, and paired differences between pilots (same 12 games for every pilot):
    mean difference, 95% t interval, wins, exact two-sided sign test
  - the extra-life arithmetic: the game gives a life every 10,000 points, so points per minute
    translate into lives earned per minute, to compare with lives lost per minute

Usage: python3 scripts/dev/analyze_pilots.py [data_dir]
"""
import json
import math
import statistics as st
import sys

D = sys.argv[1] if len(sys.argv) > 1 else "docs/articles/data"
SHORT = f"{D}/pilots-2026-11-10-all3-12x8000-lag6.json"
LONG = f"{D}/pilots-2026-11-10-rules-8x1200000.json"
T_CRIT_11DF = 2.201


def lpmf(i, m):
    return -m + i * math.log(m) - math.lgamma(i + 1) if m > 0 else (0 if i == 0 else -1e9)


def cdf(k, m):
    return sum(math.exp(lpmf(i, m)) for i in range(k + 1))


def poisson_ci(k, alpha=0.05):
    lo = 0.0
    if k > 0:
        a, b = 0.0, float(k)
        for _ in range(80):
            m = (a + b) / 2
            a, b = (m, b) if 1 - cdf(k - 1, m) < alpha / 2 else (a, m)
        lo = (a + b) / 2
    a, b = float(k), k * 3 + 30.0
    for _ in range(80):
        m = (a + b) / 2
        a, b = (m, b) if cdf(k, m) > alpha / 2 else (a, m)
    return lo, (a + b) / 2


def flying_hours(r):
    return sum(x["play"] for x in r["rows"]) / 216000


def main():
    short = {r["pilot"]: r for r in json.load(open(SHORT))["results"]}
    long_ = {r["pilot"]: r for r in json.load(open(LONG))["results"]}

    print("Losses per flying hour, exact 95% interval")
    for label, runs in (("long 8 x 1,200,000", long_), ("short 12 x 8,000", short)):
        for n, r in runs.items():
            h = flying_hours(r)
            lo, hi = poisson_ci(r["losses"])
            print(f"  {label:20s} {n:12s} losses {r['losses']:5d}  {h:6.2f} h  rate {r['losses']/h:6.1f}  interval {lo/h:5.1f} to {hi/h:5.1f}")

    pts = {n: [x["points"] for x in r["rows"]] for n, r in short.items()}
    print("\nPoints within 8,000 ticks, per start point (same games for every pilot)")
    for n, v in pts.items():
        print(f"  {n:12s} mean {st.mean(v):7.0f}  sd {st.stdev(v):5.0f}  min {min(v)}  max {max(v)}")

    print("\nPaired differences in points")
    for a, b in (("smartPilot", "simplePilot"), ("layaPilot", "simplePilot"), ("smartPilot", "layaPilot")):
        diff = [x - y for x, y in zip(pts[a], pts[b])]
        n, m = len(diff), st.mean(diff)
        se = st.stdev(diff) / math.sqrt(n)
        wins = sum(1 for x in diff if x > 0)
        ties = sum(1 for x in diff if x == 0)
        nn = n - ties
        p = min(1.0, 2 * sum(math.comb(nn, i) for i in range(0, min(wins, nn - wins) + 1)) / 2 ** nn)
        print(f"  {a} minus {b}: mean {m:6.0f}  95% interval {m - T_CRIT_11DF * se:6.0f} to {m + T_CRIT_11DF * se:6.0f}  wins {wins}/{n}  sign test p = {p:.3f}")

    print("\nExtra-life arithmetic (an extra life every 10,000 points; derived, not measured)")
    for label, runs in (("long", long_), ("short", short)):
        for n, r in runs.items():
            earned = r["pointsPerMin"] / 10000
            lost = r["lossesPerHour"] / 60
            lo, hi = poisson_ci(r["losses"])
            h = flying_hours(r)
            print(f"  {label:5s} {n:12s} lives earned/min {earned:5.2f}   lives lost/min {lost:5.2f} (interval {lo/h/60:5.2f} to {hi/h/60:5.2f})   games ended {r['gamesEnded']}")

    print("\nPer start point (short run): losses, then hyperspace uses")
    for n, r in short.items():
        print(f"  {n:12s} losses {[x['losses'] for x in r['rows']]}  start points with no loss: {sum(1 for x in r['rows'] if x['losses'] == 0)}")
        print(f"  {'':12s} hyper  {[x['hypers'] for x in r['rows']]}")


if __name__ == "__main__":
    main()
