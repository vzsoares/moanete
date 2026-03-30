# Spec: moanete — Meeting Assistant

## Goal

A browser-based meeting assistant delivered as a Chrome Extension with a
Picture-in-Picture floating overlay. Pluggable STT and LLM providers with a
BYOK (Bring Your Own Key) free tier and a hosted paid tier.

Uses Vite + Bun + Biome.

---

## Architecture

```
├── manifest.json                  # Chrome Extension Manifest V3
├── package.json                   # Bun + Vite + Biome
├── biome.json                     # Linter/formatter config
├── public/
│   └── popup.html                 # Extension popup (settings + start/stop)
└── src/
    ├── background.js              # Service worker (tabCapture, keep-alive)
    ├── core/
    │   ├── analyzer.js            # Real-time insight extraction (setInterval)
    │   ├── audio.js               # Web Audio API + getUserMedia/getDisplayMedia
    │   ├── config.js              # chrome.storage.local / localStorage
    │   ├── session.js             # Orchestrator (audio → STT → analyzer → UI)
    │   └── summarizer.js          # On-demand summarization + Q&A
    ├── providers/
    │   ├── index.js               # Registry barrel
    │   ├── stt/
    │   │   ├── types.js           # STT provider interface + registry
    │   │   ├── browser.js         # Free: webkitSpeechRecognition
    │   │   └── deepgram.js        # Paid: Deepgram WebSocket streaming
    │   └── llm/
    │       ├── types.js           # LLM provider interface + registry
    │       ├── ollama.js          # Free: local Ollama
    │       ├── openai.js          # Paid: OpenAI
    │       └── anthropic.js       # Paid: Anthropic (needs CORS proxy)
    └── ui/
        ├── popup.css              # Popup styles (catppuccin)
        ├── popup.js               # Settings, session control, PiP launch
        ├── pip.css                # PiP overlay styles
        └── pip.js                 # Floating overlay: transcript, insights, chat
```

---

## 1. Toolchain

- **Runtime / Package manager**: Bun
- **Bundler**: Vite + `vite-plugin-web-extension`
- **Linter / Formatter**: Biome

---

## 2. Two-tier model

| Tier | STT | LLM | Infra cost |
|------|-----|-----|------------|
| Free (BYOK) | Browser `webkitSpeechRecognition` (free) or user's Deepgram key | User's own Ollama / OpenAI / Anthropic key | Zero |
| Hosted (paid) | Proxied Deepgram | Proxied Claude/GPT via backend | Server + API margin |

---

## 3. Provider system

Pluggable registry pattern — providers register via side-effect imports:

```js
// STT: { name, requiresKey, configure(config), start(onTranscript), stop(), feedAudio(chunk) }
// LLM: { name, requiresKey, configure(config), chat(messages, opts) → Promise<string> }
```

**STT providers**: `browser` (free, webkitSpeechRecognition), `deepgram` (WebSocket streaming)
**LLM providers**: `ollama` (local), `openai`, `anthropic` (needs CORS proxy for hosted)

---

## 4. Audio capture

- **Microphone**: `navigator.mediaDevices.getUserMedia({ audio: true })`
- **Tab/system audio**: `getDisplayMedia({ audio: true })` or `chrome.tabCapture`
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

Communication between popup (engine) and PiP (display) via `postMessage`:

| Direction | Messages |
|-----------|----------|
| Popup → PiP | `init`, `transcript`, `insights`, `chat-reply`, `summary` |
| PiP → Popup | `chat` (question), `summarize` |

### UI layout

```
┌──────────────────────────────┐
│ ● moanete                    │  header (status dot + name)
├──────────────────────────────┤
│ Transcript: last 200 chars.. │  live transcript bar
├──────────────────────────────┤
│ Suggestions│Key Points│...   │  insight tabs (dynamic)
│──────────────────────────────│
│ • insight item               │
│ • insight item               │
├──────────────────────────────┤
│ Transcript│Chat│Summary      │  bottom tabs
│──────────────────────────────│
│ content area                 │
│                              │
│ [chat input...        ][Send]│
└──────────────────────────────┘
```

---

## 8. Configuration

Stored in `chrome.storage.local` (extension) or `localStorage` (web app).

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
| `insightTabs` | `Suggestions,Key Points,...` | Comma-separated categories |
| `analysisIntervalMs` | `15000` | LLM analysis interval |
| `captureMic` | `true` | Capture microphone |
| `captureTab` | `false` | Capture tab/system audio |

---

## 9. Data flow

```
popup.html (settings + start)
    │
    ├── Session.start()
    │     ├── AudioCapture (getUserMedia + getDisplayMedia)
    │     ├── STT Provider (browser/deepgram)
    │     │     └── onTranscript → Analyzer.feed() + PiP
    │     └── Analyzer (LLM every 15s)
    │           └── onUpdate → PiP postMessage
    │
    └── documentPictureInPicture.requestWindow()
          └── pip.js (floating overlay)
                ├── Live transcript bar
                ├── Insight tabs (configurable)
                ├── Transcript / Chat / Summary tabs
                └── postMessage → parent for chat/summary
```

---

## 10. Acceptance criteria

- [ ] Extension loads in Chrome and popup renders
- [ ] Browser SpeechRecognition captures mic and produces transcript
- [ ] Tab audio capture works via `getDisplayMedia`
- [ ] PiP window opens and displays live transcript
- [ ] Insight tabs populate from LLM analysis
- [ ] Chat works in PiP window
- [ ] Summary generation works
- [ ] Settings persist across sessions
- [ ] Deepgram streaming STT works when API key provided
- [ ] OpenAI and Anthropic LLM providers work
- [ ] Free tier runs with zero backend (all API calls from extension)
