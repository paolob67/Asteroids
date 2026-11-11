#!/usr/bin/env python3
"""
Latency benchmark for laya-mlx, outside HTTP (tests O1 and O2 of docs/articles/WRITEUP_PLAN.md).

Loads the model in-process for each configuration (checkpoint, device, dtype, compile) and times
agent.predict() on the three kinds of state sentence that layaPilot sends (Safe, Danger, Fatal),
with the real question set from asteroids.html. Also times a very short and a long state sentence,
and (O3) the same states with a shortened question text. Records which action is chosen.

Usage:
  .venv/bin/python scripts/dev/bench_laya_latency.py [--calls 40] [--json out.json] [--quick]

Run it while the pilot runs are stopped. The Laya server may stay up (it is idle between requests).
"""

import argparse
import json
import platform
import statistics
import time

import laya_mlx as laya

QUESTIONS = {
    "action": {
        "type": "choice",
        "instructions": "Determine the required flight action for the spaceship.",
        "criteria": {
            "stay_and_fire": "Safe situation. Aim weapons towards target rock and fire.",
            "turn_left_and_thrust": "Asteroid on right side. Turn left and thrust away to dodge.",
            "turn_right_and_thrust": "Asteroid on left side. Turn right and thrust away to dodge.",
            "hyperspace": "Fatal emergency when collision is unavoidable. Hyperspace escape jump.",
        },
    }
}

# Same wording as layaFormatState() in asteroids.html.
STATES = {
    "safe": "Situation: Safe. No collision danger. Ship speed is 1.8 px/tick. Target large rock is 412 units away. Ready to aim and shoot.",
    "danger": "Situation: Danger. large rock is incoming from the right on a collision path in 31 ticks. Pilot needs to turn left and thrust to dodge.",
    "fatal": "Situation: Fatal collision emergency. saucer torpedo is incoming from the left on a collision path in 6 ticks. Pilot needs to hyperspace to escape.",
}

# Question-length probe (O3): same options, minimal criteria text.
QUESTIONS_SHORT = {
    "action": {
        "type": "choice",
        "instructions": "Choose the ship action.",
        "criteria": {
            "stay_and_fire": "Safe. Fire.",
            "turn_left_and_thrust": "Threat on right. Turn left.",
            "turn_right_and_thrust": "Threat on left. Turn right.",
            "hyperspace": "Collision unavoidable. Jump.",
        },
    }
}

# Input length probes (O1): the same question with a very short and a long state.
SHORT_STATE = "Danger from the right."
LONG_STATE = " ".join([STATES["danger"]] * 4)

CONFIGS = [
    # name, model, kwargs
    ("laya-mlx fp16 gpu (server default)", "aac6fef/laya-mlx", dict(device="gpu", dtype="float16")),
    ("laya-mlx fp16 cpu", "aac6fef/laya-mlx", dict(device="cpu", dtype="float16")),
    ("laya-mlx fp32 gpu", "aac6fef/laya-mlx", dict(device="gpu", dtype="float32")),
    ("laya-mlx fp32 cpu", "aac6fef/laya-mlx", dict(device="cpu", dtype="float32")),
    ("laya-mlx bf16 gpu", "aac6fef/laya-mlx", dict(device="gpu", dtype="bfloat16")),
    ("laya-mlx fp16 gpu compile", "aac6fef/laya-mlx", dict(device="gpu", dtype="float16", compile=True)),
    ("laya-mlx fp16 gpu cache_prompts", "aac6fef/laya-mlx", dict(device="gpu", dtype="float16", cache_prompts=True)),
    ("laya-multilingual fp16 gpu", "aac6fef/laya-multilingual-mlx", dict(device="gpu", dtype="float16")),
    ("laya-multilingual fp16 cpu", "aac6fef/laya-multilingual-mlx", dict(device="cpu", dtype="float16")),
]
QUICK = {0, 1, 5, 7}


def stats(ms):
    s = sorted(ms)
    return {
        "n": len(s),
        "median": round(statistics.median(s), 1),
        "min": round(s[0], 1),
        "p95": round(s[min(len(s) - 1, int(0.95 * len(s)))], 1),
    }


def time_predict(agent, state, calls, questions=QUESTIONS):
    for _ in range(5):  # warm up (kernel compilation, caches)
        agent.predict(state, questions)
    out = []
    answer = None
    for _ in range(calls):
        t = time.perf_counter()
        answer = agent.predict(state, questions)
        out.append((time.perf_counter() - t) * 1000)
    return stats(out), answer


def choice_of(answer):
    # Result shape: {"answers": {"action": {"choice": ..., "probabilities": {...}, "confidence": ...}}}
    a = answer["answers"]["action"]
    return {"choice": a["choice"], "p": round(a["probabilities"][a["choice"]], 3), "confidence": round(a["confidence"], 3)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--calls", type=int, default=40)
    ap.add_argument("--json", default=None)
    ap.add_argument("--quick", action="store_true", help="run only 4 representative configurations")
    args = ap.parse_args()

    import mlx.core as mx

    report = {
        "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        "machine": platform.platform(),
        "mlx": mx.__version__ if hasattr(mx, "__version__") else None,
        "laya_mlx": getattr(laya, "__version__", None),
        "default_device": str(mx.default_device()),
        "calls": args.calls,
        "configs": [],
    }
    print(f"default device: {report['default_device']}, {args.calls} timed calls per state, 5 warm-up calls")

    for i, (name, model, kw) in enumerate(CONFIGS):
        if args.quick and i not in QUICK:
            continue
        t = time.perf_counter()
        try:
            agent = laya.load(model, **kw)
        except Exception as e:  # report and go on
            print(f"{name}: load failed: {type(e).__name__}: {e}")
            report["configs"].append({"name": name, "error": f"{type(e).__name__}: {e}"})
            continue
        load_s = time.perf_counter() - t
        row = {"name": name, "model": model, "options": {k: str(v) for k, v in kw.items()}, "load_s": round(load_s, 1), "predict_ms": {}, "answers": {}}
        for label, state in list(STATES.items()) + [("short-state", SHORT_STATE), ("long-state", LONG_STATE)]:
            st, ans = time_predict(agent, state, args.calls)
            row["predict_ms"][label] = st
            row["answers"][label] = choice_of(ans)
        # O3: same states with the short question text
        for label, state in STATES.items():
            st, ans = time_predict(agent, state, args.calls, QUESTIONS_SHORT)
            row["predict_ms"][label + "+short-question"] = st
            row["answers"][label + "+short-question"] = choice_of(ans)
        print(f"{name:40s} " + "  ".join(f"{k}={v['median']:6.1f}" for k, v in row["predict_ms"].items()) + f"   (load {load_s:.0f}s)")
        report["configs"].append(row)
        del agent
        laya.agent.clear_cache() if hasattr(laya, "agent") and hasattr(laya.agent, "clear_cache") else None

    if args.json:
        with open(args.json, "w") as f:
            json.dump(report, f, indent=2)
            f.write("\n")
        print(f"wrote {args.json}")


if __name__ == "__main__":
    main()
