---
title: Screen Capture & Visual Analysis
category: feature
updated: 2026-04-12
related: [insights, audio-pipeline, pip]
---

# Screen Capture & Visual Analysis

Captures frames from the active screen share and analyzes them with a vision-capable LLM. Gives the AI visual context alongside audio.

## How It Works

1. User shares a tab/screen via `getDisplayMedia` (provides a video track)
2. **One-time capture:** click the camera button to capture + analyze a single frame
3. **Auto-capture:** toggle auto mode to capture every 5 seconds
4. Frame is extracted from the video track, downscaled to 800-1024px
5. Sent to vision LLM with prompt: "Extract the TEXT content visible on screen"
6. Description fed into the analyzer context, enriching insights

## Vision LLM Selection

| LLM Provider | Vision Model |
|-------------|-------------|
| Ollama | Separate model (default: `llava`, configurable). Text model unloaded before vision request to free VRAM. |
| OpenAI | Same model (GPT-4o supports vision natively) |
| Anthropic | Same model (Claude supports vision natively) |

## UI

- **Dashboard:** camera button (one-time) + auto button (toggle) in navbar. `<mn-screen-captures>` shows thumbnail grid below insights.
- **PiP:** same buttons in header, synced with dashboard state.
- **Fullscreen view:** click any thumbnail to see full-size image + description overlay.

## Storage

Screen captures (base64 image + description + timestamp) saved to session history in IndexedDB. Included in session detail view and markdown export.

## Context Integration

- Descriptions fed to `Analyzer.feedScreenContext()` — appended to the analysis prompt
- Descriptions included in chat Q&A context (`_buildQAContext`)
- Descriptions included in summary generation
- Similarity check (`isSimilar`) skips feeding duplicate screen content

## See Also

- [[insights]] — screen descriptions enrich insight generation
- [[audio-pipeline]] — audio capture uses the same `getDisplayMedia` call
- [[session-history]] — captures persisted with sessions
