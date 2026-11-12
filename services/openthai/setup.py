"""Download the pinned Apache-2.0 model and its official runtime."""
from pathlib import Path
import urllib.request
import ssl
import certifi

REVISION = "39fa41bdd49f067ba41b1d9de79c06ab506d67d4"
root = Path(__file__).resolve().parent / "model"
for name in ["det.onnx", "rec.onnx", "det.yml", "rec_dict.txt", "config.json",
             "runtime/__init__.py", "runtime/line_engine.py", "runtime/thai_norm.py",
             "NOTICE", "README.md"]:
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://huggingface.co/iapp/OpenThai2.0-OCR-Text/resolve/{REVISION}/{name}"
    print(f"Downloading {name}", flush=True)
    with urllib.request.urlopen(url, context=ssl.create_default_context(cafile=certifi.where()), timeout=60) as response:
        target.write_bytes(response.read())
print("OpenThai model ready")
