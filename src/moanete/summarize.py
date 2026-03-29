"""On-demand transcript summarization and screen description."""

from __future__ import annotations

import base64
import logging

from moanete import llm
from moanete.llm import LLMError

log = logging.getLogger(__name__)

SUMMARIZE_SYSTEM = """\
You are a neutral meeting summarizer. Your job is to summarize what was said in a meeting \
regardless of topic (politics, business, legal, medical, etc.). You are reporting, not endorsing.

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


def capture_screen() -> bytes | None:
    """Take a screenshot of the primary monitor. Returns PNG bytes or None."""
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
