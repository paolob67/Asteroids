#!/usr/bin/env python3
"""Fine-tune Laya to imitate smartPilot (Part 4), on Apple Silicon.

Thin wrapper over laya.train.finetune. The laya-train command turns gradient checkpointing on only
for CUDA and has no flag for it, and a full fine-tune of the 421M model runs out of GPU memory on a
16 GB M1 without it (measured: micro-batch 4 fails). This script turns it on and exposes the knobs
that matter here.

Usage (from the repository root, with the training venv):
  .work/venv/bin/python scripts/dev/train_student.py --data .work/data/train.jsonl \
      --eval .work/data/val.jsonl --out .work/ckpt/student1 --epochs 2 --micro-batch 2 --grad-accum 16
"""
import argparse
import json
import os
import time

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

from laya.train import TrainConfig, finetune  # noqa: E402


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data", required=True)
    p.add_argument("--eval", default=None, help="held-out JSONL (different seeds from --data)")
    p.add_argument("--out", required=True)
    p.add_argument("--base", default="english", help="english, multilingual, typed-decisions, a Hub id or a directory")
    p.add_argument("--epochs", type=int, default=2)
    p.add_argument("--micro-batch", type=int, default=2)
    p.add_argument("--grad-accum", type=int, default=16)
    p.add_argument("--loss", default="soft-ce", choices=["soft-ce", "rlcd"])
    p.add_argument("--encoder-lr", type=float, default=2.5e-5)
    p.add_argument("--head-lr", type=float, default=1e-4)
    p.add_argument("--freeze-encoder", action="store_true")
    p.add_argument("--device", default="mps")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--no-checkpointing", action="store_true")
    a = p.parse_args()

    cfg = TrainConfig(
        epochs=a.epochs, micro_batch=a.micro_batch, grad_accum=a.grad_accum, loss=a.loss,
        encoder_lr=a.encoder_lr, head_lr=a.head_lr, freeze_encoder=a.freeze_encoder,
        gradient_checkpointing=not a.no_checkpointing, seed=a.seed, eval_data=a.eval,
        log_every=10,
    )
    t0 = time.time()
    report = finetune(a.data, a.base, a.out, cfg, device=a.device)
    report["wall_seconds"] = round(time.time() - t0, 1)
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "run_report.json"), "w") as f:
        json.dump(report, f, indent=2, default=str)
    print(json.dumps({k: report.get(k) for k in ("train_items", "calibration_items", "skipped", "epoch_loss", "wall_seconds")}, default=str))


if __name__ == "__main__":
    main()
