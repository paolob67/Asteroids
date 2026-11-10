#!/usr/bin/env python3
"""
Local Laya-MLX HTTP Server exposing TypeSafe /v1/systemone on Apple Silicon.
Usage: .venv/bin/python scripts/dev/laya_server.py [--port 8700] [--model aac6fef/laya-mlx]
"""

import sys
import json
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
import laya_mlx as laya

agent = None
model_id = "aac6fef/laya-mlx"

class SystemOneHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/v1/models" or self.path == "/models":
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            resp = {
                "models": [
                    {
                        "name": model_id,
                        "description": "Laya-MLX local decision model on Apple Silicon",
                        "release_date": "2026-10-15"
                    }
                ]
            }
            self.wfile.write(json.dumps(resp).encode('utf-8'))
        elif self.path == "/health" or self.path == "/":
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "model": model_id}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/v1/systemone" or self.path == "/systemone":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                state = data.get("state", "")
                questions = data.get("questions", {})
                
                # Run inference via Laya-MLX
                result = agent.predict(state, questions)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(result).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Override to keep console output clean
        sys.stderr.write(f"[laya-server] {self.address_string()} - {args[0]} {args[1]}\n")

def main():
    global agent, model_id
    parser = argparse.ArgumentParser(description="Laya-MLX /v1/systemone Server")
    parser.add_argument("--port", type=int, default=8700, help="Port to listen on (default 8700)")
    parser.add_argument("--model", type=str, default="aac6fef/laya-mlx", help="Hugging Face model ID")
    args = parser.parse_args()

    model_id = args.model
    print(f"[laya-server] Loading model {model_id} on Apple Silicon MLX...")
    agent = laya.load(model_id)
    print(f"[laya-server] Model loaded. Starting HTTP server on port {args.port}...")

    server = HTTPServer(('127.0.0.1', args.port), SystemOneHandler)
    print(f"[laya-server] Listening at http://127.0.0.1:{args.port}/v1/systemone (CORS enabled)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[laya-server] Shutting down.")
        server.server_close()

if __name__ == "__main__":
    main()
