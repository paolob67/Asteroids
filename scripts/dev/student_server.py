#!/usr/bin/env python3
"""
Serves the fine-tuned Laya student (version 4, checkpoint student3) over /v1/systemone on Apple Silicon.

It loads the checkpoint with laya_mlx, the same package the version 3 Laya server used, so no PyTorch is
needed to play. The student pilot sends only the state text; the question and options come from the
checkpoint's own questions.json, which is used whenever a request has none.

Usage (from the repository root):
  .venv/bin/python scripts/dev/student_server.py [--ckpt .work/ckpt/student3] [--port 8701]
"""
import argparse
import json
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

import laya_mlx as laya

agent = None
model_id = ""
default_questions = {}


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _json(self, code, obj):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path in ("/health", "/"):
            self._json(200, {"status": "ok", "model": model_id})
        elif self.path in ("/v1/models", "/models"):
            self._json(200, {"models": [{"name": model_id, "description": "Fine-tuned Laya student (strategy chooser) on Apple Silicon MLX"}]})
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path not in ("/v1/systemone", "/systemone"):
            self.send_response(404)
            self.end_headers()
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n).decode("utf-8"))
            result = agent.predict(data.get("state", ""), data.get("questions") or default_questions)
            self._json(200, result)
        except Exception as e:
            self._json(500, {"error": str(e)})

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[student-server] {self.address_string()} - {args[0]} {args[1]}\n")


def main():
    global agent, model_id, default_questions
    p = argparse.ArgumentParser(description="Fine-tuned Laya student /v1/systemone server (MLX)")
    p.add_argument("--ckpt", default=".work/ckpt/student3", help="checkpoint directory (see docs/VERSION_4.md)")
    p.add_argument("--port", type=int, default=8701)
    a = p.parse_args()
    if not os.path.isfile(os.path.join(a.ckpt, "model.safetensors")):
        sys.exit(f"[student-server] No checkpoint at {a.ckpt}. Train one first (docs/VERSION_4.md, section 'Retrain student3').")
    model_id = os.path.basename(os.path.normpath(a.ckpt))
    print(f"[student-server] Loading {a.ckpt} on Apple Silicon MLX...")
    agent = laya.load(a.ckpt)
    with open(os.path.join(a.ckpt, "questions.json")) as f:
        default_questions = json.load(f)
    print(f"[student-server] Listening at http://127.0.0.1:{a.port}/v1/systemone (CORS enabled)")
    srv = HTTPServer(("127.0.0.1", a.port), Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n[student-server] Shutting down.")
        srv.server_close()


if __name__ == "__main__":
    main()
