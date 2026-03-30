# moanete

Meeting assistant — real-time transcription, LLM-powered insights, and Q&A as a web app with a floating Picture-in-Picture overlay.

> **Moañete** — from the Guarani language: *confirmar / fazer ser verdade*. Used when persuasion is based on proving that something is real or correct.

## How it works

```
web app (settings + start)
    │
    ├── Audio Capture (mic + system audio via Web Audio API)
    │     └── STT Provider (browser free / Deepgram paid)
    │           └── onTranscript → Analyzer + PiP overlay
    │
    ├── LLM Analyzer (every ~15s) → Insights
    │
    └── PiP floating overlay
          ├── Live transcript bar
          ├── Insight tabs (Suggestions, Key Points, Action Items, Questions)
          ├── Chat (Q&A about the meeting)
          └── Summary (on demand)
```

1. Open the app → configure providers (or use free defaults)
2. Click "Start Session" → grants mic permission, starts transcription
3. Click "Pop Out (PiP)" → floating overlay appears on top of your meeting
4. The overlay shows live transcript, insights, chat, and summary

## Setup

Requires [Bun](https://bun.sh) and Chrome 116+.

```sh
bun install
bun run dev           # http://localhost:5173
bun run build         # production build → dist/
```

## Provider options

| | Free tier | Paid tier |
|---|---|---|
| **STT** | Browser SpeechRecognition (built-in, free) | Deepgram (BYOK or hosted) |
| **LLM** | Ollama (local) or BYOK OpenAI/Anthropic | Hosted proxy (subscription) |

No backend needed for the free tier — all API calls go directly from the browser.

For local LLM via Ollama:

```sh
# Install from https://ollama.com, then:
ollama serve
ollama pull llama3.2
```

## Configuration

Settings are configured in the app and stored in `localStorage`.

| Setting | Default | Options |
|---------|---------|---------|
| STT Provider | Browser (free) | `browser`, `deepgram` |
| LLM Provider | Ollama (local) | `ollama`, `openai`, `anthropic` |
| Insight Tabs | Suggestions, Key Points, Action Items, Questions | Any comma-separated list |
| Capture Mic | On | Toggle |
| Capture Tab Audio | Off | Toggle |

### Insight tab presets

| Context | Categories |
|---------|------------|
| Meeting (default) | Suggestions, Key Points, Action Items, Questions |
| Code Interview | Code Topics, Technical Questions, Red Flags, Strengths |
| Pair Programming | Bugs, Design Decisions, TODOs, Questions |
| Lecture | Key Concepts, Examples, Questions, References |

## Development

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev           # vite dev server → http://localhost:5173
bun run build         # production build
bun run check         # biome lint + format check
bun run fix           # biome auto-fix
```

### Tech stack

- **Bundler**: Vite
- **Runtime / Package manager**: Bun
- **Linter / Formatter**: Biome
- **CSS**: Tailwind CSS + DaisyUI

### Project structure

```
├── index.html                     # Single-page app entry point
├── package.json                   # Bun + Vite + Biome
├── biome.json                     # Linter/formatter config
└── src/
    ├── core/
    │   ├── analyzer.ts            # Real-time insight extraction
    │   ├── audio.ts               # Audio capture + mixing
    │   ├── config.ts              # Settings persistence (localStorage)
    │   ├── session.ts             # Orchestrator
    │   └── summarizer.ts          # Summarization + Q&A
    ├── providers/
    │   ├── stt/                   # STT: browser (free), deepgram
    │   └── llm/                   # LLM: ollama, openai, anthropic
    └── ui/
        ├── popup.{ts,css}         # Main app UI (Tailwind + DaisyUI)
        └── pip.{ts,css}           # PiP floating overlay
```

## Requirements

- [Bun](https://bun.sh) (for building)
- Chrome 116+ (for Document Picture-in-Picture API)
- A working microphone

## Privacy

### Free tier with Ollama
- **Audio** — captured by browser, transcribed locally via SpeechRecognition or sent to your own STT provider
- **Transcripts** — sent only to your configured LLM provider (Ollama = local)
- **API keys** — stored locally in `localStorage`, never sent to us

When using cloud providers (Anthropic, OpenAI, Deepgram), data is sent to their APIs.

## License

[MIT](LICENSE)
