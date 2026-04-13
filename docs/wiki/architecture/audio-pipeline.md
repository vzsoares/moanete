---
title: Audio Pipeline
category: architecture
updated: 2026-04-12
related: [provider-registry, transcript, overview]
---

# Audio Pipeline

How audio flows from mic/tab to transcript.

## Flow

```
getUserMedia (mic) ──┐
                     ├──→ AudioCapture ──→ ScriptProcessorNode ──→ Float32Array chunks
getDisplayMedia (tab)┘         │                                        │
                               │                                        ↓
                               │                                  STT Provider
                               │                                  (feedAudio)
                               │                                        │
                               └── onActivity (level) ──→ UI dots       ↓
                                                                   onTranscript
                                                                        │
                                                              ┌─────────┴─────────┐
                                                              ↓                   ↓
                                                         Analyzer.feed()    TranscriptEntry
                                                         "[You] text"       { source, text }
                                                              ↓                   ↓
                                                         LLM insights       UI + PiP + MCP
```

## Audio Capture (`src/core/audio.ts`)

- **Mic:** `navigator.mediaDevices.getUserMedia({ audio: true })`
- **Tab:** `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })` — video track discarded, audio track kept
- Separate `ScriptProcessorNode` per source, outputting Float32Array at 16kHz mono
- RMS level detection per source, exposed via `onActivity` callback

## STT Routing

Each audio source gets its own STT instance:

| Source | Default STT | Notes |
|--------|-------------|-------|
| Mic | `config.sttProvider` | Browser STT, Whisper, Deepgram, or OpenAI Whisper |
| Tab | Whisper or Deepgram | Browser STT can't accept custom audio — needs `feedAudio` |

When using Browser STT + tab capture, the mic STT auto-switches to Whisper or Deepgram to avoid echo (Browser STT picks up tab audio from speakers).

## Transcript Labels

- Mic STT emits → `[You] text` fed to analyzer, `{ source: "mic" }` to UI
- Tab STT emits → `[Them] text` fed to analyzer, `{ source: "tab" }` to UI

## Anti-Hallucination

- **Repetition loop detection:** `isRepetitiveLoop()` in `src/core/session.ts` — uses n-gram analysis to detect Whisper hallucinations (e.g., "o que e o que e o que e...")
- **Similarity dedup:** `isSimilar()` uses bigram Dice coefficient to skip near-duplicate transcripts

## See Also

- [[provider-registry]] — how STT providers plug in
- [[transcript]] — the transcript UI component
- [[screen-capture]] — visual context alongside audio
