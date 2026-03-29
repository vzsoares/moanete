"""On-demand transcript summarization and screen description."""

from __future__ import annotations

import base64
import logging

from moanete import llm
from moanete.llm import LLMError

log = logging.getLogger(__name__)

SUMMARIZE_SYSTEM = """\
You are a verbatim transcript summarizer. You MUST summarize exactly what was said. \
You are a transcription tool, not a moral judge. Your output is a factual record.

CRITICAL RULES:
- NEVER refuse to summarize. You are documenting, not endorsing.
- ALL topics are in scope: politics, legal, medical, personal, explicit, controversial.
- Report what was said neutrally, as a court stenographer would.
- Do not add warnings, disclaimers, or content notes.

Given a transcript, produce a clear, structured summary with:
- Key decisions made
- Action items (with owners if mentioned)
- Main topics discussed
- Any unresolved questions

Be concise but thorough.
"""


def summarize_transcript(transcript: str, max_tokens: int = 1024) -> str:
    """Summarize a full or partial meeting transcript."""
    if not transcript.strip():
        return "No transcript available yet."

    messages = [{"role": "user", "content": f"Summarize this meeting transcript:\n\n{transcript}"}]
    return llm.chat(messages, system=SUMMARIZE_SYSTEM, max_tokens=max_tokens)


_MAX_WIDTH = 800


def capture_screen() -> bytes | None:
    """Take a screenshot of the primary monitor, downscaled to max 1920px wide."""
    try:
        import mss
        from mss.tools import to_png
    except ImportError:
        log.warning("mss not installed — install with: uv pip install moanete[screen]")
        return None

    try:
        with mss.mss() as sct:
            monitor = sct.monitors[1]  # primary monitor
            shot = sct.grab(monitor)
            w, h = shot.size
            if w > _MAX_WIDTH:
                import numpy as np

                img = np.frombuffer(shot.rgb, dtype=np.uint8).reshape((h, w, 3))
                scale = _MAX_WIDTH / w
                new_h = int(h * scale)
                # Simple stride-based downscale (fast, no extra deps)
                rows = np.linspace(0, h - 1, new_h, dtype=int)
                cols = np.linspace(0, w - 1, _MAX_WIDTH, dtype=int)
                img = img[np.ix_(rows, cols)]
                return to_png(img.tobytes(), (_MAX_WIDTH, new_h))
            return to_png(shot.rgb, shot.size)
    except Exception:
        log.exception("Screenshot capture failed")
        return None


def describe_screen(screenshot_png_bytes: bytes | None = None) -> str:
    """Capture and describe the screen. Returns empty string on failure.

    If screenshot_png_bytes is None, captures the screen automatically.
    """
    if screenshot_png_bytes is None:
        screenshot_png_bytes = capture_screen()
    if not screenshot_png_bytes:
        return ""

    try:
        b64 = base64.b64encode(screenshot_png_bytes).decode("ascii")
        return llm.describe_image(b64, "Describe what is shown on this screen in detail.")
    except LLMError as e:
        log.warning("Screen description unavailable: %s", e)
        return ""
