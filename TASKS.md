# moanete — Task Roadmap

## Phase 1: TUI Prototype (archived)

> The Python TUI (`src/moanete/`) served as the initial prototype. All tasks
> completed. Code remains in the repo for reference but is no longer the active
> frontend. The plain web app (Vite SPA) is now the sole focus.

<details>
<summary>Completed TUI tasks</summary>

### UI: Transcript/Chat/Summary tabs not working
- [x] Debug TabbedContent rendering — replaced CSS grid with vertical layout (TabbedContent breaks inside grid)
- [x] Verify `append_transcript` is called and RichLog receives writes
- [x] Test Chat tab — Input.Submitted event firing, Q&A response rendering
- [x] Test Summary tab — `s` keybinding triggers `_run_summary`, output writes to summary-log
- [x] Fix CSS grid layout clipping bottom-bar content — switched to Horizontal containers + TabbedContent

### UI: Live transcript bar
- [x] Verify `#live-transcript` Static widget updates on each transcription chunk
- [x] Handle edge case: no transcript yet (show "listening..." placeholder)

### Screen capture not working
- [x] Implement screenshot capture using `mss` (optional dep: `moanete[screen]`)
- [x] Add `capture_screen()` in `summarize.py` — grabs primary monitor, downscaled to 800px
- [x] Wire screenshot capture into the overlay (`d` keybinding)
- [x] Graceful fallback when `mss` not installed or vision model unavailable
- [x] Fix llava OOM crash — switched default to `moondream` (1.6B, ~1GB VRAM)
- [x] Auto-unload text model before vision request to free VRAM
- [x] Show actual vision error in Summary tab instead of generic message

### STT quality is bad
- [x] Add VAD (Voice Activity Detection) filtering — `vad_filter=True` with silero, 500ms silence threshold
- [x] Add language auto-detection or make language configurable (`WHISPER_LANGUAGE`)
- [x] Tune `beam_size` (default 1→5, configurable via `WHISPER_BEAM_SIZE`)
- [x] ~~Remaining items~~ — STT quality confirmed good enough with current setup

### UI enhancements (added during Phase 1)
- [x] Configurable background opacity (`BG_OPACITY`)
- [x] Responsive layout — insight panels auto-hide below 20 lines
- [x] Insight panels refactored to top TabbedContent (dynamic, configurable)
- [x] Configurable insight categories via `INSIGHT_TABS` with presets (Meeting, Code Interview, Pair Programming, Lecture)
- [x] In-app config modal (`c` key) — change tabs + whisper language live, saves to config.env
- [x] Configurable theme (`THEME`, default: catppuccin-mocha)
- [x] Vim-style navigation: `j`/`k` top/bottom bars, `h`/`l` cycle tabs, `i` enter chat, `Esc` exit chat
- [x] Configurable tab heights (`TOP_BAR_HEIGHT`, `BOTTOM_BAR_HEIGHT`)
- [x] Hardened LLM prompts — "court stenographer" framing, never refuses any topic
- [x] Clean shutdown — `threading.Event` instead of `time.sleep` for instant stop

</details>

---

## Phase 2: Web App — Core

### Scaffold (done)
- [x] Flatten repo — remove Python TUI, move to root
- [x] Project structure with Vite + Bun + Biome + TypeScript
- [x] Pluggable provider registry pattern (STT + LLM)
- [x] STT providers: Browser SpeechRecognition (free), Whisper (local), Deepgram (paid)
- [x] LLM providers: Ollama (local/free), OpenAI, Anthropic
- [x] Core engine: Analyzer, Summarizer, Audio capture, Config, Session orchestrator
- [x] Configurable STT language dropdown (20 languages, BCP 47 tags)
- [x] Inline PiP CSS

### Convert extension → plain web app
- [x] Remove extension scaffolding (manifest.json, background.ts, chrome.* APIs, vite-plugin-web-extension)
- [x] Replace `chrome.storage` with `localStorage` in config.ts
- [x] Single `index.html` entry point — full-page app (not a popup)
- [x] Plain Vite SPA build (`bun run dev` → `http://localhost:5173`)
- [x] Add Tailwind CSS + DaisyUI + tw-animate-css (single `global.css`)

### Fix broken features
- [x] **Fix PiP** — removed `chrome.runtime.getURL`, Document PiP API works from plain web page
- [x] **Fix PC audio capture** — was using `video: false` which skips the share picker; now uses `video: true` and discards the video track
- [x] **Separate mic/machine transcription** — two independent STT instances, labeled "You" (mic) vs "Them" (tab). Tab audio uses Deepgram (Browser STT can't accept custom audio sources). Analyzer receives `[You]`/`[Them]` prefixed text for better summaries.
- [x] Test Browser SpeechRecognition STT end-to-end — code reviewed, no chrome dependencies
- [x] Test Deepgram WebSocket STT — code reviewed, WebSocket streaming works independently

### Browser + OS audio compatibility research
- [x] Research `getDisplayMedia` audio support per browser per OS
- [x] Research `SpeechRecognition` support: Chrome yes, Firefox behind flag, Safari partial
- [x] Research Document PiP support: Chromium-only, no Firefox/Safari
- [x] Add browser detection — show hints for PiP, STT, and audio limitations
- [x] Document findings in SPEC.md compatibility section (§10)

### Redesign UI
- [x] **Full web app UI** — dashboard layout with navbar, transcript, insights, chat, summary
- [x] Dashboard view: live transcript (left), insights + chat (right), summary (footer)
- [x] Settings in modal dialog (gear icon in navbar)
- [x] Session history browser (clock icon in navbar, modal with list/detail/export/delete)
- [x] **Simplify PiP overlay** — minimal floating widget with mic/PC status dots, single content area with transcript/insights/summary toggle

### Fix PiP bugs
- [x] Tab auto-switches to Transcript — `pipAppendTranscript` was clobbering class, removing `hidden`
- [x] Transcript tab broken styling — same class clobber; now only removes placeholder classes
- [x] Summary `[object Object]` — added safety `String()` in Ollama provider + PiP setSummary
- [x] Insights `[object Object]` — analyzer now coerces non-string items from LLM JSON response
- [x] You/Them mixed — Browser STT picks up tab audio from speakers; auto-switch to Whisper/Deepgram for mic when tab capture is enabled

### Whisper STT
- [x] Fix CORS — Vite proxy `/whisper` → `localhost:8000`, no more cross-origin issues

### Playwright testing (done)
- [x] E2e: app loads with all components (Chrome + Firefox)
- [x] E2e: settings modal — open/close, provider fields, presets, persist across reload
- [x] E2e: insight tab switching
- [x] E2e: history/MCP modals render
- [x] E2e: MCP presets and remote URL form
- [ ] E2e: start session → verify transcript (needs mic mock)

---

## Phase 3: Session History (done)

- [x] Define session data model: id, timestamps, transcript lines (with source + timestamp), insights, summary, categories
- [x] Store sessions in IndexedDB (`src/core/storage.ts`)
- [x] Auto-save transcript and insights on session stop
- [x] Save summary if one was generated before stopping
- [x] Session list view (date, duration, preview) — history modal
- [x] Session detail view (full transcript with You/Them labels + insights + summary)
- [x] Export session as markdown (download .md file)
- [x] Resume session — loads prior transcript/insights into a new session, continues from where it left off

---

## Phase 4: MCP Integration

### MCP server (done)
- [x] Implement moanete as an MCP server (`src/mcp/server.ts`)
- [x] WebSocket bridge (`src/mcp/bridge.ts`) — browser pushes state, MCP server reads it
- [x] Browser-side bridge client (`src/core/mcp-bridge.ts`) — auto-connects, pushes transcript/insights/summary/status
- [x] Tools: `get_transcript`, `get_insights`, `get_summary`, `ask_question`
- [x] Resources: `moanete://transcript`, `moanete://insights`, `moanete://status`
- [x] `just mcp` command to start the server

### MCP client (done)
- [x] Allow moanete to connect to external MCP servers for extended context
- [x] MCP client manager (`src/mcp/client.ts`) — connects to external servers via stdio transport
- [x] Bidirectional WebSocket bridge — browser can query external MCP tools/resources
- [x] Server-side proxy tools: `list_external_servers`, `list_external_tools`, `call_external_tool`
- [x] Browser UI: MCP Servers modal with server list, tool browsing, and tool calling
- [x] Config via `mcp-servers.json` (includes Notion MCP example)
- [ ] Example: connect to a calendar MCP to show meeting agenda alongside insights
- [ ] Example: connect to a notes MCP to auto-save action items

---

## Phase 5: AI Enhancements

### Structured output (done)
- [x] Ollama: `format: "json"` forces JSON mode
- [x] OpenAI: `response_format: { type: "json_object" }`
- [x] Anthropic: assistant prefill with `{` to nudge JSON
- [x] Added `json?: boolean` to `ChatOptions`, analyzer passes `json: true`

### Multi-agent (done)
- [x] Separate analyzer into specialized agents (one per insight type)
- [x] Run them in parallel via `Promise.allSettled` for faster insight extraction
- [x] Allow custom agent prompts via config (`agentPrompts` JSON in settings)
- [x] Fallback to single-agent mode via `multiAgent: false` config option

---

## Phase 6: Testing & CI

- [x] Add GitHub Actions workflow for Biome check
- [x] Add integration tests with mock providers (Vitest + happy-dom)
- [x] Test provider abstraction with mock API responses
- [x] E2E tests — Playwright (Chrome + Firefox, 34 tests)

---

## Phase 7: Web Components & Package

- [x] `MoaneteElement` base class (light DOM, no shadow DOM)
- [x] Leaf components: `mn-status`, `mn-audio-level`, `mn-compat-hints`, `mn-transcript`, `mn-chat`, `mn-summary`
- [x] Composite components: `mn-insights`, `mn-settings`, `mn-history`, `mn-mcp`
- [x] `mn-dashboard` orchestrator — full app in a single custom element
- [x] `index.html` simplified to `<mn-dashboard></mn-dashboard>`
- [x] Package exports: `moanete/core`, `moanete/providers`, `moanete/mcp`, `moanete/ui`
- [x] Hooks for hosted version: `beforeSessionStart`, `onSessionEnd`
- [x] All config fields exposed in settings UI (audio, STT, LLM, analysis)
- [~] PiP kept as vanilla DOM — separate Document registry makes web components impractical, and the hosted version won't customize PiP

---

## Phase 8: Integration Tests

Ensure the package exports are stable and consumable by the hosted version repo.

### Package export tests
- [x] Test `moanete/core` — import Session, Analyzer, Config, Storage, MCP bridge
- [x] Test `moanete/providers` — import createLLM, createSTT, register custom providers
- [x] Test `moanete/ui` — import and instantiate all custom elements (Vitest + happy-dom)
- [x] Test `moanete/ui/base` — extend MoaneteElement, verify lifecycle hooks, emit(), $()

### Provider contract tests
- [x] Mock LLM provider — verify chat() interface, JSON mode, error handling
- [x] Mock STT provider — verify start/stop/feedAudio/configure interface
- [x] Test provider registry — register, create, override
- [x] Built-in providers register correctly via barrel import

### Analyzer tests
- [x] Default and custom categories
- [x] Single-agent mode — multi-key JSON parsing
- [x] Multi-agent mode — parallel per-category calls
- [x] Insight deduplication, seeding, coercion of object items
- [x] Error handling — graceful failure with lastError
- [x] onUpdate callback fires after analysis

### Web component contract tests
- [x] `<mn-settings>` — renders form, populates from config, emits `mn-settings-save`, preset buttons
- [x] `<mn-history>` — renders dialog structure
- [x] `<mn-chat>` — emits `mn-chat-send` with question, appendMessage
- [x] `<mn-summary>` — emits `mn-summarize`, setSummary, setLoading
- [x] `<mn-insights>` — accepts categories + insights, renders tabs
- [x] `<mn-transcript>` — appendEntry, seedEntries, reset
- [x] `<mn-status>` — setState updates dot and text
- [x] `<mn-audio-level>` — setLevel updates animation

### Utility tests
- [x] escapeHtml, escapeAttr, formatDuration

### CI
- [x] Vitest + happy-dom in `just verify` and GitHub Actions (68 tests)

---

## Phase 9: Polish & Features

### README & repo
- [x] Add table of contents to README
- [ ] Generate GitHub repo description + topics
- [x] FIX github CI

### Code Interview preset
- [x] Add a preset optimized for code interviews — tailored categories and agent prompts
- [x] Categories: Solution Approach, Complexity Analysis, Edge Cases, Code Suggestions
- [x] Agent prompts tuned to analyze coding questions, suggest algorithms, identify patterns
- [x] Add as a preset button in settings

### Screen capture & visual analysis
- [x] Capture a frame from the active screen share video track
- [x] Send frame to a vision-capable LLM (GPT-4o, Claude, moondream/Ollama)
- [x] Display visual analysis results in the UI (summary panel)
- [x] Add "Analyze Screen" button (visible when screen share is active)
- [x] Useful for reading code on screen, whiteboard diagrams, shared slides
- [x] Auto-capture mode (every 5s) — descriptions fed into analyzer context for richer insights
- [x] Screen captures (image + description + timestamp) saved to session history in IndexedDB
- [x] Screen captures displayed in history detail view with thumbnails
