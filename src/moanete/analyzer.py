"""Real-time insight extraction from transcript chunks."""

from __future__ import annotations

import json
import logging
import re
import threading
import time

from moanete import llm
from moanete.llm import LLMError

log = logging.getLogger(__name__)

_SYSTEM_TEMPLATE = """\
You are a neutral real-time meeting assistant. Your job is to extract factual insights from \
meeting transcripts regardless of topic (politics, business, legal, medical, etc.). You are \
reporting what was said, not endorsing it. Given the latest transcript chunk and prior context, \
extract structured insights. Respond ONLY with valid JSON — no markdown fences, no extra text.

{{
{json_keys}
}}

Rules:
- Each list may be empty if nothing relevant was said.
- Be concise — one sentence per item max.
- Do not repeat items already in prior context.
"""

DEFAULT_CATEGORIES = ["Suggestions", "Key Points", "Action Items", "Questions"]


def _to_key(name: str) -> str:
    """Convert a display name to a JSON/dict key: 'Key Points' -> 'key_points'."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def build_system_prompt(categories: list[str]) -> str:
    """Build the system prompt dynamically from category names."""
    json_keys = ",\n".join(
        f'  "{_to_key(c)}": ["{c.lower()} item", ...]' for c in categories
    )
    return _SYSTEM_TEMPLATE.format(json_keys=json_keys)


class Analyzer:
    """Accumulates transcript text and periodically extracts insights via the LLM."""

    def __init__(
        self,
        categories: list[str] | None = None,
        interval_s: float = 15.0,
    ) -> None:
        self._interval = interval_s
        self._categories = categories or list(DEFAULT_CATEGORIES)
        self._keys = [_to_key(c) for c in self._categories]
        self._system_prompt = build_system_prompt(self._categories)
        self._transcript_chunks: list[str] = []
        self._insights: dict[str, list[str]] = {k: [] for k in self._keys}
        self._lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None
        self._last_error: str | None = None

    @property
    def categories(self) -> list[str]:
        """Display names for insight categories."""
        return list(self._categories)

    @property
    def keys(self) -> list[str]:
        """JSON keys for insight categories."""
        return list(self._keys)

    @property
    def insights(self) -> dict[str, list[str]]:
        with self._lock:
            return {k: list(v) for k, v in self._insights.items()}

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

        prior = {k: v[-5:] for k, v in self._insights.items()}

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
            raw = llm.chat(messages, system=self._system_prompt, max_tokens=512)
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
            for key in self._keys:
                existing = self._insights[key]
                for item in data.get(key, []):
                    if item and item not in existing:
                        existing.append(item)
