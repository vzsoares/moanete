# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "faster-whisper",
#     "fastapi",
#     "uvicorn",
#     "python-multipart",
#     "nvidia-cublas-cu12",
#     "nvidia-cudnn-cu12",
# ]
# ///
"""Minimal OpenAI-compatible Whisper STT server.

Run with: uv run scripts/whisper-server.py
"""

import io
import os
import site
import subprocess
import sys
import wave


def _ensure_cuda_libs() -> None:
    """Re-exec with LD_LIBRARY_PATH pointing to pip-installed CUDA libs."""
    if os.environ.get("_WHISPER_CUDA_READY"):
        return
    paths: list[str] = []
    for sp in site.getsitepackages():
        for lib in ("nvidia/cublas/lib", "nvidia/cudnn/lib"):
            p = os.path.join(sp, lib)
            if os.path.isdir(p):
                paths.append(p)
    if not paths:
        return
    env = os.environ.copy()
    env["LD_LIBRARY_PATH"] = ":".join(paths) + ":" + env.get("LD_LIBRARY_PATH", "")
    env["_WHISPER_CUDA_READY"] = "1"
    sys.exit(subprocess.call([sys.executable] + sys.argv, env=env))


_ensure_cuda_libs()

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
model: WhisperModel | None = None
model_name = "base"
device = "cpu"


def get_model() -> WhisperModel:
    global model
    if model is None:
        compute = "auto"
        print(f"Loading whisper model: {model_name} (device={device}, compute={compute})")
        model = WhisperModel(model_name, device=device, compute_type=compute)
    return model


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form("base"),
    language: str = Form("en"),
    response_format: str = Form("json"),
):
    audio_bytes = await file.read()

    # Read WAV and extract samples
    with io.BytesIO(audio_bytes) as buf:
        with wave.open(buf, "rb") as wf:
            frames = wf.readframes(wf.getnframes())
            sample_rate = wf.getframerate()

    # Convert to numpy array
    import numpy as np

    samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0

    segments, _ = get_model().transcribe(
        samples,
        language=language if language != "auto" else None,
        beam_size=5,
        vad_filter=True,
    )

    text = " ".join(seg.text.strip() for seg in segments)
    return {"text": text}


if __name__ == "__main__":
    if "--model" in sys.argv:
        idx = sys.argv.index("--model")
        model_name = sys.argv[idx + 1]

    if "--device" in sys.argv:
        idx = sys.argv.index("--device")
        device = sys.argv[idx + 1]

    port = 8000
    if "--port" in sys.argv:
        idx = sys.argv.index("--port")
        port = int(sys.argv[idx + 1])

    print(f"Starting whisper server on http://localhost:{port}")
    print(f"Model: {model_name} | Device: {device}")
    uvicorn.run(app, host="0.0.0.0", port=port)
