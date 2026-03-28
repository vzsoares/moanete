"""Unified LLM client — Ollama (default, offline) or Anthropic (cloud fallback)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from moanete import config

log = logging.getLogger(__name__)


class LLMError(Exception):
    """Non-fatal LLM error — callers should surface the message and keep running."""


# ---------------------------------------------------------------------------
# Ollama backend
# ---------------------------------------------------------------------------


def _ollama_chat(
    messages: list[dict[str, Any]],
    *,
    system: str = "",
    max_tokens: int = 1024,
    model: str | None = None,
    host: str | None = None,
) -> str:
    host = host or config.get("OLLAMA_HOST")
    model = model or config.get("OLLAMA_MODEL")

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"num_predict": max_tokens},
    }
    if system:
        payload["messages"] = [{"role": "system", "content": system}, *messages]

    try:
        r = httpx.post(f"{host}/api/chat", json=payload, timeout=120)
    except httpx.ConnectError as e:
        raise LLMError(
            "Ollama not running. Start it with: ollama serve\nInstall from: https://ollama.com"
        ) from e

    if r.status_code == 404:
        raise LLMError(f"Model '{model}' not found. Pull it with: ollama pull {model}")

    r.raise_for_status()
    return r.json()["message"]["content"]


def _ollama_describe_image(base64_png: str, prompt: str) -> str:
    host = config.get("OLLAMA_HOST")
    model = config.get("OLLAMA_VISION_MODEL")

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": prompt,
                "images": [base64_png],
            }
        ],
        "stream": False,
    }

    try:
        r = httpx.post(f"{host}/api/chat", json=payload, timeout=120)
    except httpx.ConnectError as e:
        raise LLMError("Ollama not running. Start it with: ollama serve") from e

    if r.status_code == 404:
        raise LLMError(
            f"Vision model '{model}' not found. Pull it with: ollama pull {model}\n"
            "Screen description will be skipped."
        )

    r.raise_for_status()
    return r.json()["message"]["content"]


# ---------------------------------------------------------------------------
# Anthropic backend
# ---------------------------------------------------------------------------


def _anthropic_chat(
    messages: list[dict[str, Any]],
    *,
    system: str = "",
    max_tokens: int = 1024,
) -> str:
    try:
        import anthropic
    except ImportError as e:
        raise LLMError(
            "Anthropic package not installed. Install with: uv pip install moanete[cloud]"
        ) from e

    api_key = config.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise LLMError("ANTHROPIC_API_KEY not set. Run: moanete --setup")

    client = anthropic.Anthropic(api_key=api_key)
    kwargs: dict[str, Any] = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": max_tokens,
        "messages": messages,  # type: ignore[arg-type]
    }
    if system:
        kwargs["system"] = system
    resp = client.messages.create(**kwargs)  # type: ignore[arg-type]
    block = resp.content[0]
    return str(block.text) if hasattr(block, "text") else str(block)


def _anthropic_describe_image(base64_png: str, prompt: str) -> str:
    try:
        import anthropic
    except ImportError as e:
        raise LLMError(
            "Anthropic package not installed. Install with: uv pip install moanete[cloud]"
        ) from e

    api_key = config.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise LLMError("ANTHROPIC_API_KEY not set. Run: moanete --setup")

    client = anthropic.Anthropic(api_key=api_key)
    resp = client.messages.create(  # type: ignore[arg-type]
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": base64_png,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )
    block = resp.content[0]
    return str(block.text) if hasattr(block, "text") else str(block)


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------


def chat(
    messages: list[dict[str, Any]],
    *,
    system: str = "",
    max_tokens: int = 1024,
) -> str:
    """Send a chat completion request to the configured backend.

    Returns the assistant's reply as a string.
    Raises LLMError on recoverable failures (caller should surface and continue).
    """
    backend = config.get("LLM_BACKEND")
    if backend == "anthropic":
        return _anthropic_chat(messages, system=system, max_tokens=max_tokens)
    return _ollama_chat(messages, system=system, max_tokens=max_tokens)


def describe_image(base64_png: str, prompt: str = "Describe what is on this screen.") -> str:
    """Describe an image using the vision model.

    Returns the description string, or raises LLMError if vision is unavailable.
    """
    backend = config.get("LLM_BACKEND")
    if backend == "anthropic":
        return _anthropic_describe_image(base64_png, prompt)
    return _ollama_describe_image(base64_png, prompt)
