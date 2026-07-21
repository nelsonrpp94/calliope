#!/usr/bin/env python3
"""Calliope local TTS server.

Serves Piper neural speech synthesis over localhost HTTP so browser
extensions (which may be sandboxed away from speech-dispatcher, e.g. in
snap-packaged browsers) can still use the locally installed voices.

Endpoints:
  GET  /voices  -> {"voices": [...], "default": "..."}
  POST /tts     -> body {"text": "...", "voice": "..."}; returns audio/wav
"""
import json
import os
import re
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PIPER = Path.home() / ".local/opt/piper/piper"
MODEL_DIR = Path.home() / ".local/share/piper"
PORT = 8473
DEFAULT_VOICE = "en_US-lessac-medium"
VOICE_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def list_voices():
    return sorted(p.name[:-5] for p in MODEL_DIR.glob("*.onnx"))


def synthesize(text, voice):
    if not VOICE_RE.match(voice):
        raise ValueError(f"invalid voice name: {voice!r}")
    model = MODEL_DIR / f"{voice}.onnx"
    if not model.exists():
        raise ValueError(f"unknown voice: {voice}")
    # Piper synthesizes per input line; collapse to one line.
    text = " ".join(text.split())
    fd, out_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        subprocess.run(
            [str(PIPER), "--model", str(model), "--output_file", out_path],
            input=text.encode("utf-8"),
            check=True,
            capture_output=True,
            timeout=120,
        )
        return Path(out_path).read_bytes()
    finally:
        os.unlink(out_path)


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, status, obj):
        self._send(status, json.dumps(obj).encode(), "application/json")

    def do_OPTIONS(self):
        self._send(204, b"", "text/plain")

    def do_GET(self):
        if self.path == "/voices":
            voices = list_voices()
            default = DEFAULT_VOICE if DEFAULT_VOICE in voices else (
                voices[0] if voices else None
            )
            self._send_json(200, {"voices": voices, "default": default})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/tts":
            self._send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length))
            text = payload.get("text", "").strip()
            voice = payload.get("voice") or DEFAULT_VOICE
            if not text:
                self._send_json(400, {"error": "empty text"})
                return
            wav = synthesize(text, voice)
            self._send(200, wav, "audio/wav")
        except ValueError as err:
            self._send_json(400, {"error": str(err)})
        except subprocess.TimeoutExpired:
            self._send_json(500, {"error": "synthesis timed out"})
        except subprocess.CalledProcessError as err:
            detail = err.stderr.decode(errors="replace")[-200:]
            self._send_json(500, {"error": f"piper failed: {detail}"})
        except Exception as err:  # noqa: BLE001 - report anything to the client
            self._send_json(500, {"error": str(err)})

    def log_message(self, fmt, *args):
        pass  # keep the journal quiet


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"calliope-piper listening on http://127.0.0.1:{PORT}")
    server.serve_forever()
