"""On-device speech-to-text using faster-whisper."""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from collections.abc import Callable

import numpy as np

log = logging.getLogger(__name__)


class Transcriber:
    """Buffers audio chunks and transcribes them in a background thread."""

    def __init__(
        self,
        model_size: str = "base",
        language: str | None = None,
        beam_size: int = 5,
        on_transcript: Callable[[str], None] | None = None,
        min_audio_s: float = 3.0,
        max_audio_s: float = 30.0,
    ) -> None:
        self._model_size = model_size
        self._language = language  # None = auto-detect
        self._beam_size = beam_size
        self._on_transcript = on_transcript
        self._min_samples = int(min_audio_s * 16_000)
        self._max_samples = int(max_audio_s * 16_000)
        self._buffer: deque[np.ndarray] = deque()
        self._buf_samples = 0
        self._lock = threading.Lock()
        self._model = None
        self._running = False
        self._thread: threading.Thread | None = None

    def _ensure_model(self) -> None:
        if self._model is None:
            from faster_whisper import WhisperModel

            log.info("Loading whisper model '%s'...", self._model_size)
            self._model = WhisperModel(self._model_size, device="cpu", compute_type="int8")
            log.info("Whisper model loaded")

    def feed(self, chunk: np.ndarray) -> None:
        """Accept an audio chunk from AudioCapture."""
        with self._lock:
            self._buffer.append(chunk)
            self._buf_samples += len(chunk)

    def start(self) -> None:
        self._ensure_model()
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)

    def _loop(self) -> None:
        while self._running:
            audio = self._drain_buffer()
            if audio is not None and len(audio) >= self._min_samples:
                text = self._transcribe(audio)
                if text and self._on_transcript:
                    self._on_transcript(text)
            else:
                time.sleep(0.3)

    def _drain_buffer(self) -> np.ndarray | None:
        with self._lock:
            if self._buf_samples < self._min_samples:
                return None
            chunks = list(self._buffer)
            self._buffer.clear()
            self._buf_samples = 0
        audio = np.concatenate(chunks)
        # Trim to max length
        if len(audio) > self._max_samples:
            audio = audio[-self._max_samples :]
        return audio

    def _transcribe(self, audio: np.ndarray) -> str:
        assert self._model is not None
        segments, info = self._model.transcribe(
            audio,
            beam_size=self._beam_size,
            language=self._language,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )
        if self._language is None and info.language_probability > 0.5:
            prob = info.language_probability * 100
            log.debug("Detected language: %s (%.0f%%)", info.language, prob)
        parts = [seg.text.strip() for seg in segments if seg.text.strip()]
        return " ".join(parts)
