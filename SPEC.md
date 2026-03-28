# Spec: moanete — Offline-First Meeting Assistant

## Goal

A meeting assistant that runs with zero internet dependency. Local LLM inference
via Ollama for real-time insights, on-device transcription via faster-whisper, and
a terminal UI for live feedback. Optionally falls back to Anthropic Claude for
cloud users.

---

## Architecture

```
src/moanete/
├── cli.py            # CLI entry point (argparse)
├── config.py         # Config management + setup wizard
├── llm.py            # Unified LLM abstraction (Ollama / Anthropic)
├── audio_capture.py  # Mic + system audio capture with mixing
├── transcribe.py     # faster-whisper on-device STT
├── analyzer.py       # Real-time insight extraction
├── summarize.py      # On-demand transcript summarization + vision
└── overlay.py        # Textual TUI with insight panels and chat
```

---

## 1. LLM Client Abstraction (`llm.py`)

Single module for all LLM calls, transparent to callers.

### Interface
- `chat(messages, system, max_tokens)` → str
- `describe_image(base64_png, prompt)` → str

### Backend selection
- `LLM_BACKEND=ollama` (default): Ollama REST API (`/api/chat`)
- `LLM_BACKEND=anthropic`: Anthropic SDK (optional dependency)

### Error handling
- Ollama not running → clear message with `ollama serve` instruction
- Model not pulled → exact `ollama pull <model>` command
- Never crash the app — surface errors in overlay, keep audio/transcription running

---

## 2. Audio Capture (`audio_capture.py`)

### Devices
- Microphone via `sounddevice` (`--device`)
- System audio via PulseAudio/PipeWire monitor (`--monitor`)
- Both can run simultaneously — mixed 50/50 for transcription

### Auto-detection
- `--monitor auto` detects PulseAudio monitor sources via `pactl`
- Loads `module-remap-source` to expose monitor to sounddevice
- Probes each device for working (channels, sample_rate) pair
- Resamples to 16 kHz mono for whisper

---

## 3. Transcription (`transcribe.py`)

- `faster-whisper` runs entirely on-device — no audio leaves the machine
- Buffers audio chunks, transcribes in a background thread
- Configurable model size: tiny, base, small, medium, large-v3

---

## 4. Real-Time Analysis (`analyzer.py`)

- Every ~15s, sends recent transcript to LLM
- Extracts structured JSON: suggestions, key_points, action_items, questions
- Deduplicates against prior insights
- Errors surfaced in overlay, never crashes

---

## 5. Summarization (`summarize.py`)

- On-demand transcript summary via `llm.chat()`
- Screen description via `llm.describe_image()` (best-effort — skips if vision model unavailable)

---

## 6. Overlay (`overlay.py`)

Textual TUI with:
- Live transcript bar (always visible, rolling last 300 chars)
- 4 insight panels: Suggestions, Key Points, Action Items, Questions
- Tabbed bottom bar: Transcript (full), Chat (Q&A), Summary, Log
- Q&A chat uses transcript + insights as context
- Logs stream into Log tab with color-coded levels

### Keybindings
- `q` — quit
- `s` — generate summary
- `Tab` — cycle focus

---

## 7. Configuration (`config.py`)

Stored in `~/.config/moanete/config.env` as KEY=VALUE pairs.
Environment variables override the file.

| Variable              | Default                   | Description                          |
|-----------------------|---------------------------|--------------------------------------|
| `LLM_BACKEND`        | `ollama`                  | `ollama` or `anthropic`              |
| `OLLAMA_HOST`        | `http://localhost:11434`  | Ollama server URL                    |
| `OLLAMA_MODEL`       | `llama3.2`                | Text model                           |
| `OLLAMA_VISION_MODEL`| `llava`                   | Vision model                         |
| `ANTHROPIC_API_KEY`  | *(empty)*                 | Required only if backend=anthropic   |
| `WHISPER_MODEL`      | `base`                    | faster-whisper model size            |
| `AUDIO_DEVICE`       | *(auto)*                  | Microphone device index/name         |
| `MONITOR_DEVICE`     | *(empty)*                 | System audio: `auto`, index, or empty|

### Setup wizard (`moanete --setup`)
1. LLM backend selection (Ollama default, Anthropic optional)
2. Model names / API key
3. Whisper model size
4. Audio device selection (lists devices with indices)
5. System audio monitor (auto-detect via pactl)
6. Ollama health checks (ping server, verify models pulled)

---

## 8. Packaging (`pyproject.toml`)

- `anthropic` is optional — in `[cloud]` extra only
- No new required deps for Ollama (uses `httpx`, already a dep)
- CLI entry point: `moanete`
- Dev tools: `ruff`, `ty` in dev dependency group

```sh
# Offline only (default)
uv tool install git+https://github.com/vzsoares/moanete

# With cloud fallback
uv tool install git+https://github.com/vzsoares/moanete --extra cloud
```

---

## 9. Model Recommendations

| Use case          | Recommended model | RAM needed |
|-------------------|-------------------|------------|
| Text (fast)       | llama3.2          | 4 GB       |
| Text (better)     | llama3.1:8b       | 8 GB       |
| Text (best local) | llama3.3:70b      | 40 GB      |
| Vision            | llava             | 8 GB       |
| Vision (small)    | llava:7b          | 6 GB       |
| Low RAM machines  | llama3.2:1b       | 2 GB       |

---

## 10. Acceptance Criteria

- [x] `moanete` runs end-to-end with Ollama and no internet connection
- [x] All four overlay panels populate with Ollama-generated insights
- [x] Q&A chat in overlay works with Ollama
- [x] Summaries work with Ollama
- [x] Screen description works if llava is pulled, skips gracefully if not
- [x] Anthropic backend still works when `LLM_BACKEND=anthropic` is set
- [x] Setup wizard detects Ollama health and missing models, prints fix commands
- [x] `anthropic` package is not installed in a default `uv tool install`
- [x] README has clear offline setup instructions
- [x] System audio capture works via `--monitor auto`
- [x] Audio devices with non-standard channels/sample rates handled gracefully
- [x] Logs visible in TUI Log tab, not bleeding into terminal
