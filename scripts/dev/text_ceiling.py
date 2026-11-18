#!/usr/bin/env python3
"""Part 4 feasibility check: how much of the teacher's key choice can be recovered from the frame text?

Parses the numbers back out of each layaFrameState() sentence and trains a small classifier on CPU
(seconds, not hours). The result is a rough ceiling for any student that only reads this text.
It also scores two hand-written rules, so the classifier has something to be compared with.

Usage: .work/venv/bin/python scripts/dev/text_ceiling.py [train.jsonl] [val.jsonl]
"""
import collections
import json
import re
import sys

import numpy as np
import torch
from torch import nn

TRAIN = sys.argv[1] if len(sys.argv) > 1 else ".work/data/train.jsonl"
VAL = sys.argv[2] if len(sys.argv) > 2 else ".work/data/val.jsonl"
N_OBJ = 4
TYPES = ["small rock", "medium rock", "large rock", "small saucer", "large saucer", "saucer torpedo"]
USE_AHEAD = "--ahead" in sys.argv                    # read the look-ahead sentence too
sys.argv = [a for a in sys.argv if a != "--ahead"]

BEAR = r"\d+ deg (?:left|right) of the nose|dead ahead|dead astern"
OBJ = re.compile(r"\d+\) (?P<type>[a-z ]+?), (?P<dist>\d+) units away, (?P<b>" + BEAR + ")"
                 r"(?:, (?P<mov>closing at (?P<cl>[\d.]+) units/tick, closest approach (?P<miss>\d+) units(?:, (?P<mb>" + BEAR + r"))? in (?P<t>\d+) ticks"
                 r"|moving away at (?P<aw>[\d.]+) units/tick|not closing))?"
                 r"(?:; a torpedo fired now meets it in (?P<st>\d+) ticks if aimed (?P<sb>" + BEAR + r")|; (?P<oor>out of torpedo range))?")


def bearing(txt):
    """Signed degrees, > 0 to the right of the nose."""
    if txt is None or txt.startswith("dead ahead"):
        return 0.0
    if txt.startswith("dead astern"):
        return 180.0
    n = float(txt.split()[0])
    return n if "right" in txt else -n


def parse(text):
    """-> (own motion flag, list of objects as dicts), nearest first."""
    objs = []
    for m in OBJ.finditer(text):
        d = m.groupdict()
        o = {"type": d["type"], "dist": float(d["dist"]), "b": bearing(d["b"]),
             "closing": float(d["cl"]) if d["cl"] else (-float(d["aw"]) if d["aw"] else 0.0),
             "miss": float(d["miss"]) if d["miss"] else 0.0,
             "mb": bearing(d["mb"]) if d["cl"] else 0.0,
             "t": float(d["t"]) if d["t"] else 0.0,
             "shot": d["st"] is not None,
             "st": float(d["st"]) if d["st"] else 0.0,
             "sb": bearing(d["sb"]) if d["st"] else 0.0}
        objs.append(o)
    return objs


def parse_ahead(text):
    """The look-ahead sentence: [has threat, ticks/90, dist/3000, bearing/180, has safe plan, impulses/16, heading/180, sin heading]."""
    m = re.search(r"a (?P<what>[a-z ]+) hits the ship in (?P<t>\d+) ticks; it is now (?P<d>\d+) units away, (?P<b>" + BEAR + r")\.", text)
    if not m:
        b = re.search(r"Thrusting (?P<n>\d+) times toward (?P<h>" + BEAR + r") slows the ship and (?P<c>keeps|does not keep) every", text)
        if not b:
            return [0.0] * 9, None
        hb = bearing(b["h"])
        # the brake plan fills the same slots as a dodge plan; a brake that is not safe is not offered as a heading
        safe = b["c"] == "keeps"
        return [0.0, 0.0, 0.0, 0.0, 0.0, 1.0 if safe else 0.0, float(b["n"]) / 16, hb / 180, np.sin(np.radians(hb))], (hb if safe else None)
    k = re.search(r"Thrusting (?P<n>\d+) times toward (?P<h>" + BEAR + r") keeps", text)
    hb = bearing(k["h"]) if k else 0.0
    f = [1.0, float(m["t"]) / 90, float(m["d"]) / 3000, bearing(m["b"]) / 180, np.sin(np.radians(bearing(m["b"]))),
         1.0 if k else 0.0, float(k["n"]) / 16 if k else 0.0, hb / 180, np.sin(np.radians(hb))]
    return f, (hb if k else None)


def features(text):
    objs = parse(text)
    f = []
    for i in range(N_OBJ):
        if i < len(objs):
            o = objs[i]
            ty = [1.0 if o["type"] == t else 0.0 for t in TYPES]
            f += [1.0, o["dist"] / 3000, o["b"] / 180, np.sin(np.radians(o["b"])), o["closing"] / 15,
                  o["miss"] / 3000, o["mb"] / 180, np.sin(np.radians(o["mb"])), o["t"] / 500,
                  1.0 if o["shot"] else 0.0, o["st"] / 70, o["sb"] / 180, np.sin(np.radians(o["sb"]))] + ty
        else:
            f += [0.0] * (13 + len(TYPES))
    f += [0.0 if "not moving" in text[:40] else 1.0]
    if USE_AHEAD:
        a, hb = parse_ahead(text)
        f += a
        for o in objs:
            o["dodge_b"] = hb
    return f, objs


def key_label(e):
    if e["hyper"]:
        return "H"
    return ("L" if e["left"] else "") + ("R" if e["right"] else "") + ("T" if e["thrust"] else "") + ("F" if e["fire"] else "")


def turn_label(e):
    return 1 if e["left"] else (2 if e["right"] else 0)   # 0 none, 1 left, 2 right


def load(path):
    X, Y, T, objs = [], [], [], []
    global rowsv
    rowsv = []
    for line in open(path):
        r = json.loads(line)
        rowsv.append(r)
        f, o = features(r["state"])
        X.append(f)
        Y.append(key_label(r["expected"]))
        T.append(turn_label(r["expected"]))
        objs.append(o)
    return np.array(X, dtype=np.float32), Y, np.array(T), objs


def fit(X, y, Xv, yv, n_class, epochs=60, seed=0):
    torch.manual_seed(seed)
    net = nn.Sequential(nn.Linear(X.shape[1], 128), nn.ReLU(), nn.Linear(128, 64), nn.ReLU(), nn.Linear(64, n_class))
    opt = torch.optim.Adam(net.parameters(), lr=2e-3)
    Xt, yt = torch.tensor(X), torch.tensor(y)
    for _ in range(epochs):
        perm = torch.randperm(len(Xt))
        for i in range(0, len(Xt), 256):
            idx = perm[i:i + 256]
            opt.zero_grad()
            nn.functional.cross_entropy(net(Xt[idx]), yt[idx]).backward()
            opt.step()
    with torch.no_grad():
        logits = net(torch.tensor(Xv))
        loss = nn.functional.cross_entropy(logits, torch.tensor(yv)).item()
    pred = logits.argmax(1).numpy()
    return pred, loss


def main():
    X, Y, T, _ = load(TRAIN)
    Xv, Yv, Tv, objv = load(VAL)
    print(f"train {len(X)} rows, val {len(Xv)} rows, features {X.shape[1]}")
    print("train turn mix (none/left/right):", np.bincount(T, minlength=3) / len(T))
    print("val   turn mix (none/left/right):", np.bincount(Tv, minlength=3) / len(Tv))

    # 1. Turn decision, 3 classes. Majority, two hand rules, then the classifier.
    maj = np.bincount(T).argmax()
    print(f"\nTURN (none/left/right) on held-out seeds")
    print(f"  majority class                 acc {np.mean(Tv == maj):.3f}")

    def rule_nearest(objs):
        if not objs or abs(objs[0]["b"]) <= 3:
            return 0
        return 2 if objs[0]["b"] > 0 else 1
    p = np.array([rule_nearest(o) for o in objv])
    print(f"  rule: face the nearest object  acc {np.mean(p == Tv):.3f}")

    def rule_nearest_closing(objs):
        c = [o for o in objs if o["closing"] > 0.5]
        if not c or abs(c[0]["b"]) <= 3:
            return 0
        return 2 if c[0]["b"] > 0 else 1
    p = np.array([rule_nearest_closing(o) for o in objv])
    print(f"  rule: face nearest closing     acc {np.mean(p == Tv):.3f}")

    def rule_quickest_shot(objs):
        c = [o for o in objs if o["shot"]]
        if not c:
            return 0
        o = min(c, key=lambda o: o["st"])
        if abs(o["sb"]) <= 3:
            return 0
        return 2 if o["sb"] > 0 else 1
    p = np.array([rule_quickest_shot(o) for o in objv])
    print(f"  rule: aim at quickest shot     acc {np.mean(p == Tv):.3f}   (teacher also dodges, so not 1.0)")

    if USE_AHEAD:
        def rule_dodge_then_shot(objs):
            hb = objs[0].get("dodge_b") if objs else None
            if hb is not None:                      # the text names a safe heading: turn toward it (teacher tolerance 2 units = 2.8 deg)
                return 0 if abs(hb) < 2.8 else (2 if hb > 0 else 1)
            return rule_quickest_shot(objs)
        p = np.array([rule_dodge_then_shot(o) for o in objv])
        print(f"  rule: follow dodge heading, else aim at quickest shot   acc {np.mean(p == Tv):.3f}")
        for sit in ("stay", "dodge", "brake", "hyper"):
            m = np.array([r["meta"]["situation"] == sit for r in rowsv])
            print(f"      {sit:6} rows {m.sum():5}  acc {np.mean(p[m] == Tv[m]):.3f}")

    pred, loss = fit(X, T, Xv, Tv, 3)
    print(f"  small MLP on parsed numbers    acc {np.mean(pred == Tv):.3f}   loss {loss:.3f}")
    cm = np.zeros((3, 3), dtype=int)
    for a, b in zip(Tv, pred):
        cm[a, b] += 1
    print("  confusion (rows = teacher none/left/right, cols = predicted):")
    print(cm)
    # the question that matters for piloting: when the teacher turns, does the model pick the right side?
    turn = Tv > 0
    side_ok = np.mean(pred[turn] == Tv[turn])
    wrong_side = np.mean((pred[turn] > 0) & (pred[turn] != Tv[turn]))
    print(f"  when the teacher turns ({turn.sum()} rows): right side {side_ok:.3f}, wrong side {wrong_side:.3f}, no turn {np.mean(pred[turn] == 0):.3f}")

    # 2. Full key combination, 13 classes, same split as the choice set.
    labels = sorted(set(Y) | set(Yv))
    idx = {k: i for i, k in enumerate(labels)}
    y = np.array([idx[k] for k in Y]); yv = np.array([idx[k] for k in Yv])
    pred13, loss13 = fit(X, y, Xv, yv, len(labels))
    print(f"\nKEY COMBINATION ({len(labels)} classes), natural mix")
    print(f"  majority class                 acc {np.mean(yv == np.bincount(y).argmax()):.3f}")
    print(f"  small MLP on parsed numbers    acc {np.mean(pred13 == yv):.3f}   loss {loss13:.3f}")
    print(f"  (Laya student1 on its held-out mix: acc 0.253, loss 1.99)")

    # 3. Per-key accuracy, which is what a pilot actually needs.
    print("\nPER KEY (is the key held / pressed on this frame?)")
    for name, ch in [("left", "L"), ("right", "R"), ("thrust", "T"), ("fire", "F")]:
        tv = np.array([ch in k for k in Yv]); tr = np.array([ch in k for k in Y])
        pk, _ = fit(X, tr.astype(int), Xv, tv.astype(int), 2, epochs=40)
        base = max(tv.mean(), 1 - tv.mean())
        tp = np.sum((pk == 1) & tv); rec = tp / max(1, tv.sum()); prec = tp / max(1, (pk == 1).sum())
        print(f"  {name:7} base rate {tv.mean():.3f}  acc {np.mean(pk == tv):.3f} (majority {base:.3f})  precision {prec:.3f}  recall {rec:.3f}")


if __name__ == "__main__":
    main()
