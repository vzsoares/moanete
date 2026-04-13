# moañete Wiki

## Architecture
- [[overview]] — High-level project overview, directory structure, data flow
- [[tech-stack]] — Vite, Bun, Biome, Tailwind v4, DaisyUI v5, browser APIs
- [[design-system]] — Custom moanete theme, color tokens, typography, component styles
- [[audio-pipeline]] — Mic/tab capture, STT routing, anti-hallucination

## Modules
- [[transcript]] — Live transcript with speaker labels
- [[insights]] — AI-generated insight cards, analyzer loop, presets
- [[chat]] — Q&A, presets (Meeting, Code Interview, LeetCode, Lecture), auto-assist
- [[pip]] — Picture-in-Picture floating overlay, style injection, view switching
- [[settings]] — Configuration modal, provider fields, insight presets, advanced collapse
- [[mcp]] — MCP server (tools/resources) + client (external servers) + WebSocket bridge

## Features
- [[use-cases]] — Meetings, lectures, exams, coding interviews, LeetCode, podcasts
- [[screen-capture]] — Frame capture, vision LLM analysis, auto-capture mode
- [[session-history]] — IndexedDB persistence, export, resume

## Concepts
- [[web-components]] — MoaneteElement base class, light DOM, event communication
- [[provider-registry]] — Pluggable STT/LLM providers, interfaces, registration
