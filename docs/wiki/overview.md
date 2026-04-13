---
title: Project Overview
category: architecture
updated: 2026-04-12
related: [tech-stack, design-system, use-cases]
---

# moañete — Project Overview

Real-time AI assistant that listens to any audio your browser can capture and sees your screen. Transcription, insights, and Q&A, all in-browser. No backend required.

The name comes from Guarani: *confirmar / fazer ser verdade* (confirm / make true).

## What It Does

1. Captures audio — mic, browser tab, or both
2. Transcribes in real time with speaker labels (You / Them)
3. AI extracts insights every ~15 seconds (customizable categories)
4. Chat with presets (Meeting, Code Interview, LeetCode, Lecture, Custom)
5. Screen capture + AI analysis (code, slides, exams)
6. Floating PiP overlay so you can keep working
7. Session history with export

## Architecture at a Glance

Browser-based Vite SPA. No server needed. All API calls go directly from the browser to configured providers.

```
Audio (mic + tab) → STT Provider → Transcript
                                      ↓
                              LLM Analyzer (every ~15s) → Insights
                                      ↓
                              Web Components (mn-*) → Dashboard + PiP
```

See [[tech-stack]] for the full stack, [[provider-registry]] for how providers plug in.

## Key Directories

```
src/
├── core/          — Audio capture, analyzer, session, config, storage
├── providers/     — Pluggable STT and LLM providers
│   ├── stt/       — browser, whisper, openai-whisper, deepgram
│   └── llm/       — ollama, openai, anthropic
├── mcp/           — MCP server + client + WebSocket bridge
└── ui/            — Web components, PiP, global CSS
    └── components/ — mn-dashboard, mn-transcript, mn-chat, etc.
```

## See Also

- [[tech-stack]] — frameworks, runtime, tooling
- [[design-system]] — visual design tokens and component styles
- [[use-cases]] — meetings, lectures, exams, and more
- [[provider-registry]] — how STT and LLM providers plug in
