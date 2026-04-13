---
title: Transcript Module
category: module
updated: 2026-04-12
related: [audio-pipeline, insights, web-components]
---

# Transcript

Live transcript display with speaker labels and auto-scroll.

## Component: `<mn-transcript>`

File: `src/ui/components/mn-transcript.ts`

### Layout

- Panel header: "TRANSCRIPT" (uppercase, muted, `.mn-panel-header`)
- Scrollable content area
- Each entry: speaker label on its own line above the text

### Speaker Colors

- **You** (mic): green (`--color-mn-mic`) via `.mn-speaker-you`
- **Them** (tab): blue (`--color-mn-tab`) via `.mn-speaker-them`
- Text body: secondary color via `.mn-transcript-text`

### API

| Method | Description |
|--------|-------------|
| `appendEntry(entry)` | Add a new transcript line, auto-scrolls |
| `seedEntries(entries)` | Bulk-load for session resume |
| `reset()` | Clear to "Listening..." placeholder |

### Data Flow

```
AudioCapture → STT.onTranscript → Session._transcriptLines + Analyzer.feed()
                                       ↓
                               mn-dashboard.onTranscript
                                       ↓
                              mn-transcript.appendEntry() + pipAppendTranscript()
```

## See Also

- [[audio-pipeline]] — how audio becomes transcript
- [[insights]] — analyzer consumes transcript text
- [[pip]] — transcript display in PiP overlay
