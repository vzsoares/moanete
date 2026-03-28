"""Configuration management and setup wizard."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx

CONFIG_DIR = Path.home() / ".config" / "moanete"
CONFIG_FILE = CONFIG_DIR / "config.env"

# Defaults
DEFAULTS: dict[str, str] = {
    "LLM_BACKEND": "ollama",
    "OLLAMA_HOST": "http://localhost:11434",
    "OLLAMA_MODEL": "llama3.2",
    "OLLAMA_VISION_MODEL": "llava",
    "ANTHROPIC_API_KEY": "",
    "WHISPER_MODEL": "base",
    "AUDIO_DEVICE": "",
    "MONITOR_DEVICE": "",
}


def load_config() -> dict[str, str]:
    """Load config from env file, falling back to defaults."""
    cfg = dict(DEFAULTS)
    if CONFIG_FILE.exists():
        for line in CONFIG_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            key, _, value = line.partition("=")
            cfg[key.strip()] = value.strip()
    # Env vars override file
    for key in DEFAULTS:
        if val := os.environ.get(key):
            cfg[key] = val
    return cfg


def get(key: str) -> str:
    """Get a single config value."""
    return load_config().get(key, DEFAULTS.get(key, ""))


def save_config(cfg: dict[str, str]) -> None:
    """Persist config to disk."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    lines = [f"{k}={v}" for k, v in sorted(cfg.items()) if v]
    CONFIG_FILE.write_text("\n".join(lines) + "\n")


# ---------------------------------------------------------------------------
# Ollama health checks
# ---------------------------------------------------------------------------


def ping_ollama(host: str) -> bool:
    """Return True if Ollama is reachable."""
    try:
        r = httpx.get(f"{host}/api/tags", timeout=3)
        return r.status_code == 200
    except httpx.ConnectError:
        return False


def list_ollama_models(host: str) -> list[str]:
    """Return names of locally-available Ollama models."""
    try:
        r = httpx.get(f"{host}/api/tags", timeout=5)
        r.raise_for_status()
        return [m["name"] for m in r.json().get("models", [])]
    except Exception:
        return []


def model_available(host: str, model: str) -> bool:
    """Check if a specific model is pulled in Ollama."""
    models = list_ollama_models(host)
    # Match with or without tag — "llama3.2" matches "llama3.2:latest"
    return any(m == model or m.startswith(f"{model}:") for m in models)


# ---------------------------------------------------------------------------
# Setup wizard
# ---------------------------------------------------------------------------

_GREEN = "\033[32m"
_RED = "\033[31m"
_BOLD = "\033[1m"
_RESET = "\033[0m"
_YELLOW = "\033[33m"


def _ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    answer = input(f"{prompt}{suffix}: ").strip()
    return answer or default


def run_setup_wizard() -> None:
    """Interactive first-run configuration."""
    print(f"\n{_BOLD}moanete setup{_RESET}\n")

    cfg = dict(DEFAULTS)

    # 1. Backend selection
    print("Which LLM backend?")
    print(f"  {_BOLD}[1]{_RESET} Ollama — fully local, free, no API key needed  (default)")
    print(f"  {_BOLD}[2]{_RESET} Anthropic Claude — cloud, needs API key")
    choice = _ask("Choice", "1")

    if choice == "2":
        cfg["LLM_BACKEND"] = "anthropic"
        cfg["ANTHROPIC_API_KEY"] = _ask("Anthropic API key")
        if not cfg["ANTHROPIC_API_KEY"]:
            print(f"{_RED}API key is required for Anthropic backend.{_RESET}")
            sys.exit(1)
    else:
        cfg["LLM_BACKEND"] = "ollama"
        cfg["OLLAMA_HOST"] = _ask("Ollama host", DEFAULTS["OLLAMA_HOST"])
        cfg["OLLAMA_MODEL"] = _ask("Text model", DEFAULTS["OLLAMA_MODEL"])
        cfg["OLLAMA_VISION_MODEL"] = _ask(
            "Vision model (for screen description)", DEFAULTS["OLLAMA_VISION_MODEL"]
        )

    # 2. Whisper model
    cfg["WHISPER_MODEL"] = _ask("Whisper model (tiny/base/small/medium/large-v3)", "base")

    # 3. Audio device selection
    try:
        from moanete.audio_capture import list_devices, list_monitor_sources

        devices = list_devices()
        if devices:
            print(f"\n{_BOLD}Audio input devices:{_RESET}")
            for d in devices:
                print(f"  {_BOLD}[{d['index']}]{_RESET} {d['name']} ({d['channels']}ch)")
            print(f"  {_BOLD}[ ]{_RESET} System default")

            valid_indices = {str(d["index"]) for d in devices}

            dev_choice = _ask("\nMicrophone device index", "")
            if dev_choice:
                if dev_choice in valid_indices:
                    cfg["AUDIO_DEVICE"] = dev_choice
                else:
                    print(f"  {_YELLOW}Invalid device index, using system default.{_RESET}")

            # System audio monitor
            monitors = list_monitor_sources()
            if monitors:
                print(f"\n{_BOLD}System audio monitors (for capturing call audio):{_RESET}")
                for m in monitors:
                    print(f"  • {m['name']}")
                mon_choice = _ask(
                    "\nCapture system audio? (auto/no)",
                    "auto",
                )
                if mon_choice.lower() in ("auto", "yes", "y"):
                    cfg["MONITOR_DEVICE"] = "auto"
                    print(f"  {_GREEN}✓ System audio will be captured automatically{_RESET}")
            else:
                print(f"\n  {_YELLOW}No system audio monitors found (pactl not available?){_RESET}")
        else:
            print(f"\n  {_YELLOW}No audio input devices found.{_RESET}")
    except Exception:
        print(f"\n  {_YELLOW}Could not list audio devices (sounddevice not available).{_RESET}")

    # 4. Health checks for Ollama
    if cfg["LLM_BACKEND"] == "ollama":
        host = cfg["OLLAMA_HOST"]
        print()

        # Ping
        if ping_ollama(host):
            print(f"  Checking Ollama... {_GREEN}✓ running{_RESET}")
        else:
            print(f"  Checking Ollama... {_RED}✗ not reachable{_RESET}")
            print(f"  → Start Ollama with: {_BOLD}ollama serve{_RESET}")
            print("  → Install from: https://ollama.com")
            print("  → Config will be saved — you can start Ollama later.\n")

        # Text model
        if ping_ollama(host):
            text_model = cfg["OLLAMA_MODEL"]
            if model_available(host, text_model):
                print(f"  Checking {text_model}... {_GREEN}✓ available{_RESET}")
            else:
                print(f"  Checking {text_model}... {_RED}✗ not found{_RESET}")
                print(f"  → Pull it with: {_BOLD}ollama pull {text_model}{_RESET}")

            # Vision model
            vision_model = cfg["OLLAMA_VISION_MODEL"]
            if model_available(host, vision_model):
                print(f"  Checking {vision_model}... {_GREEN}✓ available{_RESET}")
            else:
                print(f"  Checking {vision_model}... {_YELLOW}✗ not found{_RESET}")
                print(
                    f"  → To enable screen description: {_BOLD}ollama pull {vision_model}{_RESET}"
                )
                print("  → Skipping vision for now — everything else will work fine.")

    # 4. Save
    save_config(cfg)
    print(f"\n{_GREEN}✓ Config saved to {CONFIG_FILE}{_RESET}\n")
