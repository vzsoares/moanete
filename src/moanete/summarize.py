"""On-demand transcript summarization and screen description."""

from __future__ import annotations

import base64
import logging

from moanete import llm
from moanete.llm import LLMError

log = logging.getLogger(__name__)

SUMMARIZE_SYSTEM = """\
You are a meeting summarizer. Given a transcript, produce a clear, structured summary with:
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


def describe_screen(screenshot_png_bytes: bytes) -> str:
    """Describe the contents of a screenshot. Returns empty string on failure."""
    try:
        b64 = base64.b64encode(screenshot_png_bytes).decode("ascii")
        return llm.describe_image(b64, "Describe what is shown on this screen in detail.")
    except LLMError as e:
        log.warning("Screen description unavailable: %s", e)
        return ""
