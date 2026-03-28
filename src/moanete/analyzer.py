"""Real-time insight extraction from transcript chunks."""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass, field

from moanete import llm
from moanete.llm import LLMError

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a real-time meeting assistant. Given the latest transcript chunk and prior context,
extract structured insights. Respond ONLY with valid JSON — no markdown fences, no extra text.

{
  "suggestions": ["actionable suggestion", ...],
  "key_points": ["important point discussed", ...],
  "action_items": ["task someone committed to", ...],
  "questions": ["open question raised", ...]
}

Rules:
- Each list may be empty if nothing relevant was said.
- Be concise — one sentence per item max.
- Do not repeat items already in prior context.
"""


@dataclass
class Insights:
    suggestions: list[str] = field(default_factory=list)
    key_points: list[str] = field(default_factory=list)
    action_items: list[str] = field(default_factory=list)
    questions: list[str] = field(default_factory=list)


class Analyzer:
    """Accumulates transcript text and periodically extracts insights via the LLM."""

    def __init__(self, interval_s: float = 15.0) -> None:
        self._interval = interval_s
        self._transcript_chunks: list[str] = []
        self._insights = Insights()
        self._lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None
        self._last_error: str | None = None

    @property
    def insights(self) -> Insights:
        with self._lock:
            return Insights(
                suggestions=list(self._insights.suggestions),
                key_points=list(self._insights.key_points),
                action_items=list(self._insights.action_items),
                questions=list(self._insights.questions),
            )

    @property
    def last_error(self) -> str | None:
        return self._last_error

    @property
    def transcript(self) -> str:
        with self._lock:
            return " ".join(self._transcript_chunks)

    def feed(self, text: str) -> None:
        """Add a new transcript chunk."""
        with self._lock:
            self._transcript_chunks.append(text)

    def start(self) -> None:
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)

    def _loop(self) -> None:
        while self._running:
            time.sleep(self._interval)
            if not self._running:
                break
            self._analyze()

    def _analyze(self) -> None:
        with self._lock:
            if not self._transcript_chunks:
                return
            full_text = " ".join(self._transcript_chunks)

        # Build context of what we already have so the LLM doesn't repeat
        prior = {
            "suggestions": self._insights.suggestions[-5:],
            "key_points": self._insights.key_points[-5:],
            "action_items": self._insights.action_items[-5:],
            "questions": self._insights.questions[-5:],
        }

        messages = [
            {
                "role": "user",
                "content": (
                    f"Prior insights (do not repeat): {json.dumps(prior)}\n\n"
                    f"Latest transcript:\n{full_text[-3000:]}"
                ),
            }
        ]

        try:
            raw = llm.chat(messages, system=SYSTEM_PROMPT, max_tokens=512)
            self._last_error = None
        except LLMError as e:
            self._last_error = str(e)
            log.warning("Analyzer LLM error: %s", e)
            return

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            log.warning("Analyzer got non-JSON response: %.200s", raw)
            return

        with self._lock:
            for key in ("suggestions", "key_points", "action_items", "questions"):
                existing = getattr(self._insights, key)
                for item in data.get(key, []):
                    if item and item not in existing:
                        existing.append(item)
