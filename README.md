# moanete

<!-- uv run moanete --device default --monitor auto -v -->

Offline-first meeting assistant — real-time transcription, LLM-powered insights, and Q&A.

> **Moañete** — from the Guarani language: *confirmar / fazer ser verdade*. Used when persuasion is based on proving that something is real or correct.

No audio, no screenshots, no transcripts, no queries ever leave your machine when running in Ollama mode.

## Fully Offline Setup

### 1. Install Ollama

Download from [ollama.com](https://ollama.com) and start it:

```sh
ollama serve
```

### 2. Pull models

```sh
ollama pull llama3.2 && ollama pull moondream
```

### 3. Install moanete

```sh
# Offline only (default — no cloud dependencies)
uv tool install git+https://github.com/vzsoares/moanete

# With screen capture support
uv tool install git+https://github.com/vzsoares/moanete --extra screen

# With cloud fallback (Anthropic Claude)
uv tool install git+https://github.com/vzsoares/moanete --extra cloud

# Everything
uv tool install git+https://github.com/vzsoares/moanete --extra all
```

### 4. Run

```sh
moanete          # first run triggers setup wizard
moanete --setup  # re-run setup any time
```

The setup wizard will walk you through picking your LLM backend, audio devices, and system audio monitor.

## Usage

```sh
moanete                        # start with TUI overlay
moanete --no-overlay           # terminal-only mode (prints transcripts)
moanete --list-devices         # list audio input devices + monitor sources
moanete --device 0             # use specific microphone
moanete --monitor auto         # auto-detect and capture system audio
moanete --device 0 --monitor auto  # mic + system audio (both sides of a call)
moanete --setup                # run setup wizard
moanete -v                     # verbose logging
```

### Capturing system audio

By default moanete only listens to your microphone. To also capture what others say in a call (system audio), use `--monitor auto`:

```sh
moanete --device 0 --monitor auto
```

This auto-detects your PulseAudio/PipeWire output monitor and routes it through sounddevice. You can also configure this in the setup wizard — it will be saved so you don't need to pass the flag every time.

`--list-devices` shows both input devices and available monitor sources:

```
Input devices:
  [0] USB Audio CODEC (2ch)
  [5] HD-Audio Generic: ALC892 Analog (2ch)

System audio monitors (use with --monitor auto):
  alsa_output.usb-Burr-Brown_from_TI_USB_Audio_CODEC-00.analog-stereo-output.monitor
```

### TUI keybindings

| Key   | Action                              |
|-------|-------------------------------------|
| `k`   | Focus top tabs (insights)           |
| `j`   | Focus bottom tabs                   |
| `h`   | Previous tab in focused bar         |
| `l`   | Next tab in focused bar             |
| `i`   | Enter chat input                    |
| `Esc` | Exit chat input                     |
| `s`   | Generate summary                    |
| `d`   | Describe screen (requires `mss`)    |
| `c`   | Configure insight tabs + language   |
| `q`   | Quit                                |
| `Tab` | Cycle focus                         |

The TUI has four insight panels (suggestions, key points, action items, questions) and tabbed views for transcript, chat, summary, and logs.

Type in the chat input to ask questions about the meeting.

## How it works

```
  Microphone ─┐
               ├─► Audio Capture ──► faster-whisper (STT) ──► Transcript
  System Audio ┘        │
                         └──► LLM Analyzer (every ~15s) ──► Insights
                                     │
                              ┌──────┴──────┐
                              │  TUI Overlay │
                              │  ┌─────────┐ │
                              │  │Suggestions│ │
                              │  │Key Points│ │
                              │  │Actions   │ │
                              │  │Questions │ │
                              │  ├─────────┤ │
                              │  │Chat / Q&A│ │
                              │  └─────────┘ │
                              └─────────────┘
```

1. **Audio capture** — records from your microphone and optionally system audio via `sounddevice`, with automatic sample rate conversion
2. **Transcription** — on-device speech-to-text with `faster-whisper` and VAD filtering (no audio leaves your machine)
3. **Analysis** — every ~15s the LLM extracts suggestions, key points, action items, and questions
4. **Overlay** — a terminal UI shows insights in real-time with live transcript and chat for Q&A
5. **Summaries** — press `s` to generate a structured meeting summary on demand
6. **Vision** — optional screen description via `llava` (if pulled)

## Model Recommendations

| Use case          | Recommended model | RAM needed |
|-------------------|-------------------|------------|
| Text (fast)       | llama3.2          | 4 GB       |
| Text (better)     | llama3.1:8b       | 8 GB       |
| Text (best local) | llama3.3:70b      | 40 GB      |
| Vision            | moondream         | 2 GB       |
| Vision (large)    | llava             | 8 GB       |
| Low RAM machines  | llama3.2:1b       | 2 GB       |

Override models in the setup wizard or via environment variables:

```sh
OLLAMA_MODEL=llama3.1:8b moanete
```

## Configuration

Config is stored in `~/.config/moanete/config.env`. Available settings:

| Variable              | Default                   | Description                          |
|-----------------------|---------------------------|--------------------------------------|
| `LLM_BACKEND`        | `ollama`                  | `ollama` or `anthropic`              |
| `OLLAMA_HOST`        | `http://localhost:11434`  | Ollama server URL                    |
| `OLLAMA_MODEL`       | `llama3.2`                | Text model for analysis/chat         |
| `OLLAMA_VISION_MODEL`| `llava`                   | Vision model for screen description  |
| `ANTHROPIC_API_KEY`  | *(empty)*                 | Required only if backend=anthropic   |
| `WHISPER_MODEL`      | `base`                    | faster-whisper model size            |
| `WHISPER_LANGUAGE`   | *(auto-detect)*           | Language code (e.g. `en`, `pt`, `es`)|
| `WHISPER_BEAM_SIZE`  | `5`                       | Beam size (higher = better, slower)  |
| `THEME`              | `catppuccin-mocha`        | UI theme (see available themes below) |
| `INSIGHT_TABS`       | `Suggestions,Key Points,Action Items,Questions` | Comma-separated insight categories (see presets below) |
| `BG_OPACITY`         | `1.0`                     | Background opacity (0.0–1.0)         |
| `TOP_BAR_HEIGHT`     | `1fr`                     | Insights tabs height (CSS units)     |
| `BOTTOM_BAR_HEIGHT`  | `2fr`                     | Main tabs height (CSS units)         |
| `AUDIO_DEVICE`       | *(auto)*                  | Microphone device index/name         |
| `MONITOR_DEVICE`     | *(empty)*                 | System audio: `auto`, index, or empty|

All settings can be overridden by environment variables:

```sh
WHISPER_MODEL=small OLLAMA_MODEL=mistral moanete
```

### Insight tab presets

| Context            | `INSIGHT_TABS` value |
|--------------------|----------------------|
| Meeting (default)  | `Suggestions,Key Points,Action Items,Questions` |
| Code interview     | `Code Topics,Technical Questions,Red Flags,Strengths` |
| Pair programming   | `Bugs,Design Decisions,TODOs,Questions` |
| Lecture            | `Key Concepts,Examples,Questions,References` |

```sh
INSIGHT_TABS="Bugs,Design Decisions,TODOs,Questions" moanete
```

## Development

Requires [uv](https://docs.astral.sh/uv/), [just](https://just.systems/), [ruff](https://docs.astral.sh/ruff/), [ty](https://docs.astral.sh/ty/).

```sh
just dev          # install with all extras
just run          # run the app
just lint         # ruff check + format check
just fmt          # auto-format
just check        # type check with ty
just quality      # ty + ruff check + format check
just ci           # lint + type check
```

### Project structure

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

## Requirements

- Python >= 3.11
- [Ollama](https://ollama.com) (for local LLM inference)
- A working microphone
- PulseAudio or PipeWire (for system audio capture)

## Privacy

When using Ollama (the default):
- **Audio** — captured and processed entirely on-device by `faster-whisper`
- **Transcripts** — never sent anywhere, processed locally by Ollama
- **Screenshots** — processed locally by `llava` if pulled, never uploaded
- **LLM queries** — sent only to `localhost`, never to the internet
- **System audio** — captured locally, mixed with mic, never transmitted

When using Anthropic backend, transcripts and queries are sent to Anthropic's API.

## License

[MIT](LICENSE)
