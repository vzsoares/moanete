# moanete — Task Roadmap

## Phase 1: Fix What's Broken

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

---

## Phase 2: Session History

### Store sessions
- [ ] Define session data model: id, timestamp, transcript, insights, summary
- [ ] Store sessions as JSON files in `~/.local/share/moanete/sessions/`
- [ ] Auto-save transcript and insights on quit (or periodically)
- [ ] Save final summary if one was generated

### List and review sessions
- [ ] `moanete --history` — list past sessions (date, duration, preview)
- [ ] `moanete --history <id>` — print full transcript + insights for a session
- [ ] `moanete --export <id>` — export session as markdown
- [ ] Add "Sessions" tab in TUI to browse past meetings

---

## Phase 3: MCP Integration

### MCP server
- [ ] Implement moanete as an MCP server (`mcp` protocol)
- [ ] Expose tools: `get_transcript`, `get_insights`, `get_summary`, `ask_question`
- [ ] Expose resources: live transcript, current insights, session history
- [ ] Allow AI assistants (Claude Code, etc.) to query the meeting in real-time

### MCP client
- [ ] Allow moanete to connect to external MCP servers for extended context
- [ ] Example: connect to a calendar MCP to show meeting agenda alongside insights
- [ ] Example: connect to a notes MCP to auto-save action items

---

## Phase 4: Skill / AI Integration

### Claude Code skill
- [ ] Create a Claude Code skill that connects to moanete's MCP server
- [ ] Commands: `/meeting summary`, `/meeting ask <question>`, `/meeting actions`
- [ ] Allow developers to query their ongoing meeting from the terminal

### Ollama function calling
- [ ] Use Ollama's tool/function calling for structured insight extraction
- [ ] Replace JSON-prompt-and-parse with native structured output
- [ ] More reliable than hoping the LLM outputs valid JSON

### Multi-agent
- [ ] Separate analyzer into specialized agents (one per insight type)
- [ ] Run them in parallel for faster insight extraction
- [ ] Allow custom agent prompts via config

---

## Phase 5: Cross-Platform & Testing

### System tests
- [ ] Test on Arch/Manjaro (PipeWire + PulseAudio compat layer)
- [ ] Test on Ubuntu/Debian (PulseAudio native)
- [ ] Test on Fedora (PipeWire native)
- [ ] Test on macOS (CoreAudio — no pactl, different monitor approach)
- [ ] Test on NixOS (potential sandboxing issues with audio)
- [ ] Document platform-specific quirks in README

### macOS support
- [ ] Replace `pactl` monitor detection with CoreAudio equivalent
- [ ] Test `sounddevice` device probing on macOS
- [ ] Handle macOS microphone permissions (prompt user)
- [ ] Test with Homebrew-installed Ollama

### CI
- [ ] Add GitHub Actions workflow for lint + type check
- [ ] Add integration test that runs with a mock audio stream
- [ ] Add test for LLM abstraction with mock Ollama responses
