"""Private CPU OCR service. The Node API authenticates app users before proxying."""
import hmac
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

root = Path(__file__).resolve().parent / "model"
sys.path.insert(0, str(root))
from runtime.line_engine import LineOCR

ocr = LineOCR(str(root), threads=2, runtime={"backend": "onnxruntime"})
token = os.environ.get("OPENTHAI_OCR_TOKEN", "")
host = os.environ.get("OPENTHAI_OCR_HOST", "127.0.0.1")
if host != "127.0.0.1" and not token:
    raise SystemExit("Set OPENTHAI_OCR_TOKEN before binding to a network interface")

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        if token and not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token):
            self.reply(401, {"error": "Unauthorized"})
            return False
        return True

    def do_GET(self):
        if self.authorized():
            self.reply(200 if self.path == "/health" else 404, {"engine": "openthai"})

    def do_POST(self):
        if not self.authorized():
            return
        if self.path != "/ocr":
            return self.reply(404, {"error": "Not found"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 8 * 1024 * 1024 or self.headers.get("Content-Type") != "image/png":
                return self.reply(400, {"error": "Invalid image"})
            self.connection.settimeout(30)
            image = self.rfile.read(size)
            import cv2
            import numpy as np
            decoded = cv2.imdecode(np.frombuffer(image, dtype=np.uint8), cv2.IMREAD_COLOR)
            if decoded is None or decoded.shape[0] * decoded.shape[1] > 16000000:
                return self.reply(400, {"error": "Invalid image dimensions"})
            result = ocr.read(decoded)
            self.reply(200, {"text": result["text"]})
        except Exception:
            self.reply(422, {"error": "Unable to read image"})

print(f"OpenThai OCR listening on {host}:8788", flush=True)
HTTPServer((host, int(os.environ.get("OPENTHAI_OCR_PORT", "8788"))), Handler).serve_forever()
