# Spec: moanete — Meeting Assistant

## Goal

A browser-based meeting assistant delivered as a plain web app (Vite SPA) with a
Picture-in-Picture floating overlay. Pluggable STT and LLM providers with a
BYOK (Bring Your Own Key) model — local providers or external APIs.

Uses Vite + Bun + Biome + Tailwind CSS + DaisyUI + tw-animate-css.

---

## Architecture

```
├── index.html                     # Single-page app entry point
├── justfile                       # Task runner (just dev, just whisper, etc.)
├── package.json                   # Bun + Vite + Biome
├── biome.json                     # Linter/formatter config
├── mcp-servers.json               # External MCP server config (Notion, etc.)
├── .github/workflows/ci.yml      # GitHub Actions CI (lint + typecheck + build)
├── scripts/
│   └── whisper-server.py          # Local Whisper STT server (uv run)
└── src/
    ├── mcp/
    │   ├── server.ts              # MCP stdio server (tools + resources)
    │   ├── client.ts              # MCP client manager (connects to external servers)
    │   └── bridge.ts              # Bidirectional WebSocket bridge
    ├── core/
    │   ├── analyzer.ts            # Real-time insight extraction (setInterval)
    │   ├── audio.ts               # Separate mic/tab audio capture streams
    │   ├── config.ts              # localStorage persistence
    │   ├── mcp-bridge.ts          # Browser-side WebSocket client (state push + MCP queries)
    │   ├── session.ts             # Orchestrator (audio → STT → analyzer → UI)
    │   ├── storage.ts             # IndexedDB session persistence
    │   └── summarizer.ts          # On-demand summarization + Q&A
    ├── providers/
    │   ├── index.ts               # Registry barrel
    │   ├── stt/
    │   │   ├── types.ts           # STT provider interface + registry
    │   │   ├── browser.ts         # Free: webkitSpeechRecognition (mic only)
    │   │   ├── whisper.ts         # Free: local Whisper server (mic + tab)
    │   │   ├── openai-whisper.ts  # BYOK: OpenAI Whisper API (mic + tab)
    │   │   └── deepgram.ts        # BYOK: Deepgram WebSocket streaming (mic + tab)
    │   └── llm/
    │       ├── types.ts           # LLM provider interface + registry
    │       ├── ollama.ts          # Free: local Ollama
    │       ├── openai.ts          # Paid: OpenAI
    │       └── anthropic.ts       # Paid: Anthropic (needs CORS proxy)
    └── ui/
        ├── global.css             # Tailwind + DaisyUI + tw-animate-css (shared by app + PiP)
        ├── base.ts                # MoaneteElement base class (light DOM custom elements)
        ├── index.ts               # Component barrel — registers all custom elements
        ├── util.ts                # escapeHtml, renderMarkdown, formatDuration
        ├── popup.ts               # Legacy dashboard (kept for reference)
        ├── pip.ts                 # PiP overlay (transcript/insights/summary/chat + screen capture + context indicator)
        └── components/
            ├── mn-dashboard.ts    # Full app orchestrator — composes all below
            ├── mn-transcript.ts   # Scrollable transcript display
            ├── mn-insights.ts     # Tabbed insight categories (append-only updates)
            ├── mn-chat.ts         # Chat with presets, auto-assist, markdown, follow-up suggestions
            ├── mn-summary.ts      # Summary footer with generate button
            ├── mn-settings.ts     # Full settings dialog
            ├── mn-history.ts      # Session history list/detail/resume/export
            ├── mn-screen-captures.ts # Live screen capture thumbnail grid
            ├── mn-mcp.ts          # MCP servers connect/manage/tools
            ├── mn-status.ts       # Status dot + text
            ├── mn-audio-level.ts  # Mic/Tab audio level indicator
            └── mn-compat-hints.ts # Browser compatibility warnings
```

---

## 1. Toolchain

- **Runtime / Package manager**: Bun
- **Bundler**: Vite
- **Linter / Formatter**: Biome
- **CSS**: Tailwind CSS + DaisyUI + tw-animate-css
- **Task runner**: just (justfile)

---

## 2. Provider model

| Provider type | STT | LLM | Cost |
|---------------|-----|-----|------|
| Local | Browser `webkitSpeechRecognition`, local Whisper server | Ollama | Free |
| External (BYOK) | OpenAI Whisper, Deepgram (user's API key) | OpenAI / Anthropic (user's API key) | Pay-per-use to provider |

---

## 3. Provider system

Pluggable registry pattern — providers register via side-effect imports:

```js
// STT: { name, requiresKey, configure(config), start(onTranscript), stop(), feedAudio(chunk) }
// LLM: { name, requiresKey, configure(config), chat(messages, opts) → Promise<string> }
```

**STT providers**: `browser` (free, webkitSpeechRecognition), `whisper` (local, OpenAI-compatible endpoint), `openai-whisper` (OpenAI Whisper API, BYOK), `deepgram` (WebSocket streaming)
**LLM providers**: `ollama` (local), `openai`, `anthropic` (needs CORS proxy for hosted)

---

## 4. Audio capture

- **Microphone**: `navigator.mediaDevices.getUserMedia({ audio: true })`
- **Tab/system audio**: `getDisplayMedia({ video: true, audio: true })` (video track discarded)
- **Separate streams**: mic and tab each have their own `ScriptProcessorNode` and STT instance
- **Output**: Float32Array chunks at 16kHz mono, labeled `[You]` (mic) / `[Them]` (tab)
- **Activity detection**: RMS level per source, exposed to UI for status indicators

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

### Insight presets
| Preset           | Categories                                        |
|------------------|---------------------------------------------------|
| Meeting          | Suggestions, Key Points, Action Items, Questions  |
| Code Interview   | Solution Approach, Complexity Analysis, Edge Cases, Code Suggestions |
| Pair Programming | Bugs, Design Decisions, TODOs, Questions          |
| Lecture          | Key Concepts, Examples, Questions, References     |

### Context management
- **Dirty flag** — skips analysis when no new transcript or screen data since last cycle
- **Strict dedup** — prompts tell LLM to return empty when nothing genuinely new exists
- **Rolling summary** — older transcript summarized when exceeding 100k char window
- **Insight output language** — matches configured `sttLanguage`
- **Whisper loop detection** — drops repetitive hallucinated transcripts (n-gram analysis)

---

## 6. Summarization, Q&A & Screen Analysis (`core/summarizer.ts`)

- On-demand transcript + screen summary via LLM
- Q&A chat with transcript + screen descriptions + insights as context
- Follow-up suggestions — LLM returns 3 suggested next questions after each answer
- Screen capture analysis — captures a frame from the active screen share video track, sends to a vision-capable LLM with transcript context
- Auto-capture mode — captures screen every 5 seconds, generates descriptions, feeds them into analyzer context so insights reflect what's on screen
- Screen captures (image + description + timestamp) are saved to session history in IndexedDB
- All LLM providers support multi-modal messages (text + image) for vision analysis
- Same "court stenographer" system prompts

### Chat presets
| Preset | Behavior |
|--------|----------|
| Q&A (default) | Regular question-answer about the session |
| Meeting | Structured briefing: overview, decisions, action items, next steps |
| Code Interview | Interview process coaching: communication, structure, red flags (no code hints) |
| LeetCode Coach | Socratic algorithm guide: nudges and leading questions, never reveals the answer |
| LeetCode Solve | Direct solution: optimal approach, working code, complexity analysis |
| Lecture | Study notes: topic summary, key concepts, formulas, review questions |
| Custom | User-defined prompt (configured in Settings) |

### Auto-assist mode
- Toggled via "Auto" button in chat (dashboard + PiP)
- Periodically sends full context to LLM with selected preset
- LLM responds only when it has something new/relevant (otherwise `SKIP`)
- Configurable interval (default 10s)

---

## 7. Picture-in-Picture overlay

Uses the Document Picture-in-Picture API (`documentPictureInPicture.requestWindow()`)
to create a floating always-on-top window with the meeting UI.

The PiP UI is built directly from the main app's JS context (no script injection
or postMessage needed). Functions in `pip.ts` operate on the PiP document but
run in the main window.

### UI layout

Compact floating overlay with full feature parity.

```
┌──────────────────────────────┐
│ moanete     ●mic ●tab 📸🔄 ▓│  header + dots + capture btns + context bar
├──────────────────────────────┤
│ [Trans] [Insights] [Sum] [Ch]│  view toggle
├──────────────────────────────┤
│                              │
│ content area                 │  shows selected view
│                              │
├──────────────────────────────┤
│ [preset ▾] [Auto]           │  chat: preset selector + auto-assist
│ [input...            ] [Send]│  chat: Q&A or preset generate
└──────────────────────────────┘
```

- **Chat tab** — full Q&A with preset dropdown (Meeting, Code Interview, LeetCode Coach, LeetCode Solve, Lecture, Custom), auto-assist toggle, markdown rendering, follow-up suggestions
- **Screen capture** — one-time (📸) and auto (🔄) buttons, synced with dashboard
- **Context indicator** — usage bar with color coding (green/yellow/red)

---

## 8. Configuration

App settings stored in `localStorage`. Session history stored in IndexedDB.

| Key | Default | Description |
|-----|---------|-------------|
| `sttProvider` | `browser` | `browser`, `whisper`, `openai-whisper`, or `deepgram` |
| `llmProvider` | `ollama` | `ollama`, `openai`, or `anthropic` |
| `ollamaHost` | `http://localhost:11434` | Ollama server URL |
| `ollamaModel` | `llama3.2` | Ollama text model |
| `ollamaVisionModel` | `llava` | Ollama vision model (screen capture) |
| `openaiApiKey` | *(empty)* | OpenAI API key (BYOK) |
| `openaiModel` | `gpt-4o-mini` | OpenAI model |
| `anthropicApiKey` | *(empty)* | Anthropic API key (BYOK) |
| `anthropicModel` | `claude-sonnet-4-20250514` | Anthropic model |
| `anthropicBaseUrl` | `/api/anthropic` | Proxy URL for CORS |
| `deepgramApiKey` | *(empty)* | Deepgram API key (BYOK) |
| `whisperHost` | `/whisper` | Local Whisper server URL |
| `whisperModel` | `base` | Whisper model name |
| `sttLanguage` | `en-US` | BCP-47 language code (also sets insight output language) |
| `insightTabs` | `Suggestions,Key Points,...` | Comma-separated categories |
| `analysisIntervalMs` | `15000` | LLM analysis interval |
| `multiAgent` | `true` | Parallel per-category analysis |
| `agentPrompts` | *(empty)* | Custom agent prompts JSON |
| `captureMic` | `true` | Capture microphone |
| `captureTab` | `false` | Capture tab/system audio |
| `autoPip` | `true` | Auto-open PiP on session start |
| `customChatPrompt` | *(empty)* | System prompt for the Custom chat preset |
| `autoAssistIntervalMs` | `10000` | Auto-assist check interval |
| `theme` | `dark` | UI theme |

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
- [ ] Runs with zero backend (all API calls from browser)

---

## 12. MCP Integration

### MCP Server (outbound)

moanete exposes a stdio MCP server for AI assistants (e.g. Claude Code):

**Tools:** `get_transcript`, `get_insights`, `get_summary`, `ask_question`
**Resources:** `moanete://transcript`, `moanete://insights`, `moanete://status`

### MCP Client (inbound)

moanete can connect to external MCP servers for extended context (e.g. Notion, calendar).

**Architecture:**
- `src/mcp/client.ts` — connects to external servers via stdio transport
- Config in `mcp-servers.json` (same format as Claude Code's server config)
- Bridge is bidirectional: browser queries external MCP tools/resources via WebSocket
- External tools also exposed through moanete's own MCP server (`list_external_servers`, `list_external_tools`, `call_external_tool`)

**Browser UI:** MCP Servers modal — lists connected servers, browses tools, runs tools with JSON arguments.

---

## 13. Web Components & Package

The UI is built as reusable custom elements (light DOM, no shadow DOM — inherits Tailwind/DaisyUI styles from host page).

### Components
| Tag | Purpose |
|---|---|
| `<mn-status>` | Status dot + text |
| `<mn-audio-level>` | Mic/Tab audio level indicator |
| `<mn-compat-hints>` | Browser compatibility warnings |
| `<mn-transcript>` | Scrollable transcript display |
| `<mn-chat>` | Chat with presets, auto-assist, markdown rendering, follow-up suggestions |
| `<mn-summary>` | Summary footer with generate button |
| `<mn-insights>` | Tabbed insight categories with append-only cards |
| `<mn-screen-captures>` | Live screen capture thumbnail grid (visible during session) |
| `<mn-settings>` | Full settings dialog |
| `<mn-history>` | Session history list/detail/resume/export (with capture count badges) |
| `<mn-mcp>` | MCP servers connect/manage/tools |
| `<mn-dashboard>` | Full app orchestrator — composes all above |

### Package exports
```
moanete/core       — Session, Analyzer, Config, Storage, MCP bridge client
moanete/providers  — STT + LLM provider registries and all built-in providers
moanete/mcp        — MCP server, client, bridge (Bun-only)
moanete/ui         — All custom elements + base class + utilities
```

### Hosted version integration
```ts
import "moanete/ui";
const dashboard = document.querySelector<MnDashboard>("mn-dashboard")!;
dashboard.beforeSessionStart = async () => await checkSubscription();
dashboard.onSessionEnd = (session) => saveToServer(session);
```

---

## 14. CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`):
- Runs on push to `main` and pull requests
- Steps: `bun install` → `bun run check` → `bun run typecheck` → `bun run build`
