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
├── transcribe.py     # faster-whisper on-device STT with VAD
├── analyzer.py       # Real-time insight extraction (dynamic categories)
├── summarize.py      # On-demand summarization + screen capture/description
└── overlay.py        # Textual TUI with dual tabbed layout and config modal
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

### VRAM management
- Before vision requests, all loaded models are unloaded via `/api/generate` with `keep_alive: 0`
- Waits for VRAM to free before loading vision model
- Text model reloads automatically on next analyzer cycle

### Error handling
- Ollama not running → clear message with `ollama serve` instruction
- Model not pulled → exact `ollama pull <model>` command
- HTTP 4xx/5xx → surfaced as `LLMError` with response body
- Never crash the app — surface errors in overlay, keep audio/transcription running

### Prompt design
- All prompts use "court stenographer" framing — neutral, factual reporting
- Never refuses any topic (politics, legal, medical, personal, explicit)
- No disclaimers or content warnings added

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
- VAD filtering enabled (silero, 500ms silence threshold) — skips silence
- Configurable language (`WHISPER_LANGUAGE`) — blank for auto-detect
- Configurable beam size (`WHISPER_BEAM_SIZE`, default 5)
- Clean shutdown via `threading.Event` (instant stop, no blocking)

---

## 4. Real-Time Analysis (`analyzer.py`)

- Every ~15s, sends recent transcript to LLM
- **Dynamic categories** — configurable via `INSIGHT_TABS` config
- Default: Suggestions, Key Points, Action Items, Questions
- System prompt built dynamically from category names
- `_to_key()` converts display names to JSON keys (e.g. "Key Points" → "key_points")
- Deduplicates against prior insights
- Clean shutdown via `threading.Event`

---

## 5. Summarization & Screen Capture (`summarize.py`)

### Summarization
- On-demand transcript summary via `llm.chat()`

### Screen capture
- Screenshot via `mss` (optional dep: `moanete[screen]`)
- Downscaled to max 800px width to fit in VRAM
- Vision description via `llm.describe_image()` (default model: `moondream`)
- Auto-unloads text model before vision request to free VRAM

---

## 6. Overlay (`overlay.py`)

Textual TUI with dual-tabbed layout:

```
┏━ Transcript ━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ live rolling transcript (Static widget)  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
 Suggestions  Key Points  Actions  Questions   ← top tabs (configurable)
─────────────────────────────────────────────
  • insight items...

 Transcript  Chat  Summary  Log                ← bottom tabs
─────────────────────────────────────────────
  content...
                                      footer
```

### Features
- **Top tabs**: Dynamic insight categories (configurable via `INSIGHT_TABS`)
- **Bottom tabs**: Transcript (full log), Chat (Q&A), Summary, Log
- **Config modal** (`c` key): Change insight tabs (with presets) + whisper language live
- **Theme support**: Configurable via `THEME` (default: catppuccin-mocha)
- **Background opacity**: Configurable via `BG_OPACITY` for compositor transparency
- **Responsive**: Top tabs auto-hide when terminal < 20 lines
- **Tab heights**: Configurable via `TOP_BAR_HEIGHT` / `BOTTOM_BAR_HEIGHT`

### Keybindings
| Key   | Action                     |
|-------|----------------------------|
| `k`   | Focus top tabs (insights)  |
| `j`   | Focus bottom tabs          |
| `h`   | Previous tab               |
| `l`   | Next tab                   |
| `i`   | Enter chat input           |
| `Esc` | Exit chat input            |
| `s`   | Generate summary           |
| `d`   | Describe screen            |
| `c`   | Open config modal          |
| `q`   | Quit                       |
| `Tab` | Cycle focus                |

### Navigation implementation
- Uses `check_action()` to block nav keys when typing in Input
- Focuses internal `Tabs` widget (not `TabbedContent` which has `can_focus=False`)
- Initial focus set on mount for immediate key binding responsiveness

### Config modal presets
| Preset           | Categories                                        |
|------------------|---------------------------------------------------|
| Meeting          | Suggestions, Key Points, Action Items, Questions  |
| Code Interview   | Code Topics, Technical Questions, Red Flags, Strengths |
| Pair Programming | Bugs, Design Decisions, TODOs, Questions          |
| Lecture          | Key Concepts, Examples, Questions, References     |

---

## 7. Configuration (`config.py`)

Stored in `~/.config/moanete/config.env` as KEY=VALUE pairs.
Environment variables override the file.

| Variable              | Default                                          | Description                          |
|-----------------------|--------------------------------------------------|--------------------------------------|
| `LLM_BACKEND`        | `ollama`                                         | `ollama` or `anthropic`              |
| `OLLAMA_HOST`        | `http://localhost:11434`                         | Ollama server URL                    |
| `OLLAMA_MODEL`       | `llama3.2`                                       | Text model                           |
| `OLLAMA_VISION_MODEL`| `moondream`                                      | Vision model                         |
| `ANTHROPIC_API_KEY`  | *(empty)*                                        | Required only if backend=anthropic   |
| `WHISPER_MODEL`      | `base`                                           | faster-whisper model size            |
| `WHISPER_LANGUAGE`   | *(auto-detect)*                                  | Language code (e.g. en, pt, es)      |
| `WHISPER_BEAM_SIZE`  | `5`                                              | Beam size (1-10)                     |
| `INSIGHT_TABS`       | `Suggestions,Key Points,Action Items,Questions`  | Comma-separated insight categories   |
| `THEME`              | `catppuccin-mocha`                               | Textual UI theme                     |
| `BG_OPACITY`         | `1.0`                                            | Background opacity (0.0-1.0)         |
| `TOP_BAR_HEIGHT`     | `1fr`                                            | Insight tabs height (CSS units)      |
| `BOTTOM_BAR_HEIGHT`  | `2fr`                                            | Main tabs height (CSS units)         |
| `AUDIO_DEVICE`       | *(auto)*                                         | Microphone device index/name         |
| `MONITOR_DEVICE`     | *(empty)*                                        | System audio: `auto`, index, or empty|

### Setup wizard (`moanete --setup`)
1. LLM backend selection (Ollama default, Anthropic optional)
2. Model names / API key
3. Whisper model size, language, beam size
4. Audio device selection (lists devices with indices)
5. System audio monitor (auto-detect via pactl)
6. Ollama health checks (ping server, verify models pulled)

---

## 8. Packaging (`pyproject.toml`)

- `anthropic` is optional — in `[cloud]` extra only
- `mss` is optional — in `[screen]` extra only
- `[all]` extra includes cloud + screen
- No new required deps for Ollama (uses `httpx`, already a dep)
- CLI entry point: `moanete`
- Dev tools: `ruff`, `ty` in dev dependency group

```sh
# Offline only (default)
uv tool install git+https://github.com/vzsoares/moanete

# With screen capture
uv tool install git+https://github.com/vzsoares/moanete --extra screen

# Everything
uv tool install git+https://github.com/vzsoares/moanete --extra all
```

---

## 9. Model Recommendations

| Use case          | Recommended model | RAM needed |
|-------------------|-------------------|------------|
| Text (fast)       | llama3.2          | 4 GB       |
| Text (better)     | llama3.1:8b       | 8 GB       |
| Text (best local) | llama3.3:70b      | 40 GB      |
| Vision            | moondream         | 2 GB       |
| Vision (large)    | llava             | 8 GB       |
| Low RAM machines  | llama3.2:1b       | 2 GB       |

---

## 10. Acceptance Criteria

- [x] `moanete` runs end-to-end with Ollama and no internet connection
- [x] Insight tabs populate with Ollama-generated insights
- [x] Q&A chat in overlay works with Ollama
- [x] Summaries work with Ollama
- [x] Screen description works with moondream, skips gracefully if not available
- [x] Anthropic backend still works when `LLM_BACKEND=anthropic` is set
- [x] Setup wizard detects Ollama health and missing models, prints fix commands
- [x] `anthropic` package is not installed in a default `uv tool install`
- [x] README has clear offline setup instructions
- [x] System audio capture works via `--monitor auto`
- [x] Audio devices with non-standard channels/sample rates handled gracefully
- [x] Logs visible in TUI Log tab, not bleeding into terminal
- [x] Vim-style navigation works (j/k/h/l/i/Esc)
- [x] Insight categories configurable and changeable at runtime
- [x] Theme and opacity configurable
- [x] Clean shutdown (no 5s hang on Ctrl+C)
