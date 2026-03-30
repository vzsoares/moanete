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

## Phase 2: Chrome Extension — Core

### Scaffold (done)
- [x] Flatten repo — remove Python TUI, move web extension to root
- [x] Project structure with Vite + Bun + Biome
- [x] Chrome Extension Manifest V3
- [x] Pluggable provider registry pattern (STT + LLM)
- [x] STT providers: Browser SpeechRecognition (free), Deepgram (paid)
- [x] LLM providers: Ollama (local/free), OpenAI, Anthropic
- [x] Core engine ports: Analyzer, Summarizer, Audio capture, Config, Session orchestrator
- [x] Popup UI: settings, session control, PiP launch
- [x] PiP overlay UI: live transcript, tabbed insights, chat, summary
- [x] Catppuccin-mocha theme for all UI

### Make it runnable
- [x] Add Vite config for extension bundling (`vite-plugin-web-extension`)
- [x] Add extension icons (16/48/128px)
- [x] Convert entire codebase to TypeScript (strict mode)
- [x] Fix build output — relative paths, pip.ts bundled separately, pip.css as web-accessible resource
- [x] PiP assets (pip.js + pip.css) in `web_accessible_resources` and built into dist
- [ ] Test loading as unpacked extension in Chrome
- [ ] Test Browser SpeechRecognition STT (free tier)
- [ ] Test Deepgram WebSocket STT
- [ ] Test Document PiP window lifecycle (open, close, reconnect)
- [ ] Test tab audio capture via `getDisplayMedia`
- [ ] Wire `tabCapture` in background service worker for cleaner audio capture

### Polish
- [ ] Config modal in PiP (preset switching, language)
- [ ] Keyboard shortcuts in PiP
- [ ] Screen capture via `getDisplayMedia` + vision LLM
- [ ] Session export (markdown download)
- [ ] Error toasts / status indicators in PiP

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
