# moanete — Task Roadmap

## Phase 1: Fix What's Broken

### UI: Transcript/Chat/Summary tabs not working
- [ ] Debug TabbedContent rendering — tabs exist but content doesn't populate correctly
- [ ] Verify `append_transcript` is called and RichLog receives writes
- [ ] Test Chat tab — Input.Submitted event firing, Q&A response rendering
- [ ] Test Summary tab — `s` keybinding triggers `_run_summary`, output writes to summary-log
- [ ] Check CSS grid layout isn't clipping or hiding the bottom-bar content

### UI: Live transcript bar
- [ ] Verify `#live-transcript` Static widget updates on each transcription chunk
- [ ] Handle edge case: no transcript yet (show "listening..." placeholder)

### Screen capture not working
- [ ] Debug `describe_screen()` — is it being called? Is the screenshot being taken?
- [ ] Add actual screenshot capture (missing — `summarize.py` expects `screenshot_png_bytes` but nothing provides it)
- [ ] Implement screenshot capture using `Pillow` or `mss` (add to optional deps)
- [ ] Wire screenshot capture into the overlay (keybinding or periodic)
- [ ] Test with llava model pulled / not pulled (graceful fallback)

### STT quality is bad
- [ ] Evaluate current faster-whisper output — is the model too small? is the audio quality poor?
- [ ] Test with `small` and `medium` whisper models (tradeoff: speed vs accuracy)
- [ ] Add VAD (Voice Activity Detection) filtering before transcription — skip silence
- [ ] Investigate `whisperX` as a drop-in replacement (better accuracy, word timestamps)
- [ ] Consider `distil-whisper` models for better speed/quality balance
- [ ] Add language auto-detection or make language configurable (`WHISPER_LANGUAGE`)
- [ ] Tune `beam_size` and other transcription parameters

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
