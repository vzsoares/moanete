# Spec: moanete — Meeting Assistant

## Goal

A browser-based meeting assistant delivered as a plain web app (Vite SPA) with a
Picture-in-Picture floating overlay. Pluggable STT and LLM providers with a
BYOK (Bring Your Own Key) free tier and a hosted paid tier.

Uses Vite + Bun + Biome + Tailwind CSS + DaisyUI + tw-animate-css.

---

## Architecture

```
├── index.html                     # Single-page app entry point
├── package.json                   # Bun + Vite + Biome
├── biome.json                     # Linter/formatter config
└── src/
    ├── core/
    │   ├── analyzer.ts            # Real-time insight extraction (setInterval)
    │   ├── audio.ts               # Web Audio API + getUserMedia/getDisplayMedia
    │   ├── config.ts              # localStorage persistence
    │   ├── session.ts             # Orchestrator (audio → STT → analyzer → UI)
    │   └── summarizer.ts          # On-demand summarization + Q&A
    ├── providers/
    │   ├── index.ts               # Registry barrel
    │   ├── stt/
    │   │   ├── types.ts           # STT provider interface + registry
    │   │   ├── browser.ts         # Free: webkitSpeechRecognition
    │   │   ├── whisper.ts         # Free: local Whisper server (OpenAI-compatible)
    │   │   └── deepgram.ts        # Paid: Deepgram WebSocket streaming
    │   └── llm/
    │       ├── types.ts           # LLM provider interface + registry
    │       ├── ollama.ts          # Free: local Ollama
    │       ├── openai.ts          # Paid: OpenAI
    │       └── anthropic.ts       # Paid: Anthropic (needs CORS proxy)
    └── ui/
        ├── global.css             # Tailwind + DaisyUI + tw-animate-css (shared by app + PiP)
        ├── popup.ts               # Settings, session control, PiP launch
        └── pip.ts                 # Floating overlay: transcript, insights, chat
```

---

## 1. Toolchain

- **Runtime / Package manager**: Bun
- **Bundler**: Vite
- **Linter / Formatter**: Biome
- **CSS**: Tailwind CSS + DaisyUI

---

## 2. Two-tier model

| Tier | STT | LLM | Infra cost |
|------|-----|-----|------------|
| Free (BYOK) | Browser `webkitSpeechRecognition` (free), local Whisper server, or user's Deepgram key | User's own Ollama / OpenAI / Anthropic key | Zero |
| Hosted (paid) | Proxied Deepgram | Proxied Claude/GPT via backend | Server + API margin |

---

## 3. Provider system

Pluggable registry pattern — providers register via side-effect imports:

```js
// STT: { name, requiresKey, configure(config), start(onTranscript), stop(), feedAudio(chunk) }
// LLM: { name, requiresKey, configure(config), chat(messages, opts) → Promise<string> }
```

**STT providers**: `browser` (free, webkitSpeechRecognition), `whisper` (local, OpenAI-compatible endpoint), `deepgram` (WebSocket streaming)
**LLM providers**: `ollama` (local), `openai`, `anthropic` (needs CORS proxy for hosted)

---

## 4. Audio capture

- **Microphone**: `navigator.mediaDevices.getUserMedia({ audio: true })`
- **Tab/system audio**: `getDisplayMedia({ video: true, audio: true })` (video track discarded)
- **Mixing**: Web Audio API `AudioContext` → `GainNode` (normalized) → `ScriptProcessor`
- **Output**: Float32Array chunks at 16kHz mono, fed to STT provider

---

## 5. Real-Time Analysis (`core/analyzer.js`)

- Every ~15s, sends recent transcript to LLM
- **Dynamic categories** — configurable via `insightTabs` setting
- Default: Suggestions, Key Points, Action Items, Questions
- System prompt built dynamically from category names
- `toKey()` converts display names to JSON keys (e.g. "Key Points" → "key_points")
- Deduplicates against prior insights

### Prompt design
- All prompts use "court stenographer" framing — neutral, factual reporting
- Never refuses any topic (politics, legal, medical, personal, explicit)
- No disclaimers or content warnings added

### Presets
| Preset           | Categories                                        |
|------------------|---------------------------------------------------|
| Meeting          | Suggestions, Key Points, Action Items, Questions  |
| Code Interview   | Code Topics, Technical Questions, Red Flags, Strengths |
| Pair Programming | Bugs, Design Decisions, TODOs, Questions          |
| Lecture          | Key Concepts, Examples, Questions, References     |

---

## 6. Summarization & Q&A (`core/summarizer.js`)

- On-demand transcript summary via LLM
- Q&A chat with transcript + insights as context
- Same "court stenographer" system prompts

---

## 7. Picture-in-Picture overlay

Uses the Document Picture-in-Picture API (`documentPictureInPicture.requestWindow()`)
to create a floating always-on-top window with the meeting UI.

The PiP UI is built directly from the main app's JS context (no script injection
or postMessage needed). Functions in `pip.ts` operate on the PiP document but
run in the main window.

### UI layout

Minimal floating readout — no complex tabs or chat input.

```
┌──────────────────────────────┐
│ moanete              ●mic ●pc│  header + status dots
├──────────────────────────────┤
│ [Transcript] [Insights] [Sum]│  view toggle
├──────────────────────────────┤
│                              │
│ single content area          │  shows selected view
│                              │
└──────────────────────────────┘
```

---

## 8. Configuration

Stored in `localStorage`.

| Key | Default | Description |
|-----|---------|-------------|
| `sttProvider` | `browser` | `browser` or `deepgram` |
| `llmProvider` | `ollama` | `ollama`, `openai`, or `anthropic` |
| `ollamaHost` | `http://localhost:11434` | Ollama server URL |
| `ollamaModel` | `llama3.2` | Ollama text model |
| `openaiApiKey` | *(empty)* | OpenAI API key (BYOK) |
| `openaiModel` | `gpt-4o-mini` | OpenAI model |
| `anthropicApiKey` | *(empty)* | Anthropic API key (BYOK) |
| `anthropicModel` | `claude-sonnet-4-20250514` | Anthropic model |
| `anthropicBaseUrl` | `/api/anthropic` | Proxy URL for CORS |
| `deepgramApiKey` | *(empty)* | Deepgram API key (BYOK) |
| `whisperHost` | `http://localhost:8000` | Local Whisper server URL |
| `whisperModel` | `base` | Whisper model name |
| `insightTabs` | `Suggestions,Key Points,...` | Comma-separated categories |
| `analysisIntervalMs` | `15000` | LLM analysis interval |
| `captureMic` | `true` | Capture microphone |
| `captureTab` | `false` | Capture tab/system audio |

---

## 9. Data flow

```
index.html (settings + start)
    │
    ├── Session.start()
    │     ├── AudioCapture (getUserMedia + getDisplayMedia)
    │     ├── STT Provider (browser/deepgram)
    │     │     └── onTranscript → Analyzer.feed() + PiP
    │     └── Analyzer (LLM every 15s)
    │           └── onUpdate → PiP UI update
    │
    └── documentPictureInPicture.requestWindow()
          └── pip.ts (floating overlay, built from main context)
                ├── Live transcript bar
                ├── Insight tabs (configurable)
                ├── Transcript / Chat / Summary tabs
                └── Direct function calls for chat/summary
```

---

## 10. Browser compatibility

### getDisplayMedia audio (system/tab audio capture)

| OS | Chrome/Edge | Firefox |
|---|---|---|
| Windows | System audio (user must check "Share system audio") | No audio support |
| Linux | PipeWire required; tab audio works | PipeWire required; best option for system audio |
| macOS | Tab audio only (OS blocks system audio) | No audio support |

### SpeechRecognition

| Browser | Support |
|---|---|
| Chrome/Edge | Full (`webkitSpeechRecognition`, requires online) |
| Firefox | Behind flag (`media.webspeech.recognition.enable`) |
| Safari | Partial (continuous mode unreliable) |

### Document Picture-in-Picture

| Browser | Support |
|---|---|
| Chrome/Edge 116+ | Full |
| Firefox | Not implemented |
| Safari | Not implemented |

The app shows browser-specific hints at startup when limitations are detected.

---

## 11. Acceptance criteria

- [ ] Web app loads and main UI renders
- [ ] Browser SpeechRecognition captures mic and produces transcript
- [ ] System/tab audio capture works via `getDisplayMedia`
- [ ] PiP window opens and displays live transcript
- [ ] Insight tabs populate from LLM analysis
- [ ] Chat works in PiP window
- [ ] Summary generation works
- [ ] Settings persist across sessions
- [ ] Deepgram streaming STT works when API key provided
- [ ] OpenAI and Anthropic LLM providers work
- [ ] Free tier runs with zero backend (all API calls from browser)
