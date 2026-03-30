# moanete — Task Roadmap

## Phase 1: TUI Prototype (archived)

> The Python TUI (`src/moanete/`) served as the initial prototype. All tasks
> completed. Code remains in the repo for reference but is no longer the active
> frontend. The web-based Chrome Extension is now the sole focus.

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
- [x] STT providers: Browser SpeechRecognition (free), Deepgram (paid)
- [x] LLM providers: Ollama (local/free), OpenAI, Anthropic
- [x] Core engine: Analyzer, Summarizer, Audio capture, Config, Session orchestrator
- [x] Configurable STT language dropdown (20 languages, BCP 47 tags)
- [x] Inline PiP CSS

### Convert extension → plain web app
- [ ] Remove extension scaffolding (manifest.json, background.ts, chrome.* APIs, vite-plugin-web-extension)
- [ ] Replace `chrome.storage` with `localStorage` / IndexedDB in config.ts
- [ ] Single `index.html` entry point — full-page app (not a popup)
- [ ] Plain Vite SPA build (`bun run dev` → `http://localhost:5173`)

### Fix broken features
- [ ] **Fix PiP** — debug with Playwright MCP, ensure Document PiP API works from regular web page
- [x] **Fix PC audio capture** — was using `video: false` which skips the share picker; now uses `video: true` and discards the video track
- [ ] Test Browser SpeechRecognition STT end-to-end
- [ ] Test Deepgram WebSocket STT

### Browser + OS audio compatibility research
- [ ] Research `getDisplayMedia` audio support per browser per OS:
  - Windows: Chrome/Edge/Firefox system audio on screen share?
  - Linux: Firefox + PipeWire system audio? Chrome tab-only?
  - macOS: any browser with system audio? (likely tab-only everywhere)
- [ ] Research `SpeechRecognition` support: Chrome yes, Firefox behind flag, Safari partial
- [ ] Research Document PiP support: Chromium-only? Firefox alternative?
- [ ] Add browser detection — show hint when current browser has limitations
  - e.g. "For system audio on Linux, use Firefox" when Chrome + Linux detected
  - e.g. "PiP not available in this browser" when Firefox detected
- [ ] Document findings in SPEC.md compatibility section

### Redesign UI
- [ ] **Full web app UI** — proper dashboard, not a tiny popup
- [ ] Dashboard view: live transcript, insights, chat, summary all visible
- [ ] Settings page with provider config, language, presets
- [ ] Session history browser
- [ ] **Simplify PiP overlay** — minimal floating widget:
  - Two status indicators: mic active (green dot) + PC audio active (green dot)
  - One main content area showing the current result (transcript, insights, or summary)
  - Simple selector/toggle to switch what the main area shows
  - No tabs, no chat input, no complex layout — just a clean floating readout

### Playwright testing
- [ ] Add Playwright as dev dependency
- [ ] Use Playwright MCP to interactively debug PiP and audio issues
- [ ] Write e2e test: open app → start session → verify transcript appears
- [ ] Write e2e test: open PiP → verify overlay renders with status indicators
- [ ] Write e2e test: settings persist across reload
- [ ] Add `bun run test` script

---

## Phase 3: Hosted Version

- [ ] Backend proxy for Anthropic/OpenAI API calls (CORS)
- [ ] Auth + user accounts
- [ ] Billing / subscription management
- [ ] Usage dashboard
- [ ] Publish to Chrome Web Store

---

## Phase 4: Session History

- [ ] Define session data model: id, timestamp, transcript, insights, summary
- [ ] Store sessions in `chrome.storage.local` or IndexedDB
- [ ] Auto-save transcript and insights on session end
- [ ] Save final summary if one was generated
- [ ] Session list view in popup (date, duration, preview)
- [ ] Session detail view (full transcript + insights)
- [ ] Export session as markdown

---

## Phase 5: MCP Integration

### MCP server
- [ ] Implement moanete as an MCP server
- [ ] Expose tools: `get_transcript`, `get_insights`, `get_summary`, `ask_question`
- [ ] Expose resources: live transcript, current insights, session history
- [ ] Allow AI assistants (Claude Code, etc.) to query the meeting in real-time

### MCP client
- [ ] Allow moanete to connect to external MCP servers for extended context
- [ ] Example: connect to a calendar MCP to show meeting agenda alongside insights
- [ ] Example: connect to a notes MCP to auto-save action items

---

## Phase 6: AI Enhancements

### Structured output
- [ ] Use OpenAI/Anthropic structured output for insight extraction
- [ ] More reliable than hoping the LLM outputs valid JSON

### Multi-agent
- [ ] Separate analyzer into specialized agents (one per insight type)
- [ ] Run them in parallel for faster insight extraction
- [ ] Allow custom agent prompts via config

---

## Phase 7: Testing & CI

- [ ] Add GitHub Actions workflow for Biome check
- [ ] Add integration test with mock audio stream
- [ ] Add test for provider abstraction with mock API responses
- [ ] Test Chrome Extension in CI (puppeteer or playwright)
