---
title: Settings Module
category: module
updated: 2026-04-12
related: [provider-registry, design-system, insights]
---

# Settings

App configuration modal. All settings persisted in `localStorage` via `src/core/config.ts`.

## Component: `<mn-settings>`

File: `src/ui/components/mn-settings.ts`

### UX Structure

The settings modal is organized to minimize clutter:

1. **Audio** (always visible) — compact checkbox row: Microphone, Tab audio, Auto PiP
2. **Providers** — STT provider + Language in a 2-column grid, LLM provider below. Dynamic fields appear based on selected provider (API keys, host URLs, model names).
3. **Insights** — category input + preset pill buttons (Meeting, Code Interview, Pair Programming, Lecture)
4. **Advanced** (collapsed by default via `<details>`) — analysis interval, auto-assist interval, multi-agent toggle, agent prompts JSON, custom chat prompt

### Dynamic Provider Fields

When the user selects a provider, additional fields appear:

| STT Provider | Fields |
|-------------|--------|
| browser | (none) |
| whisper | Server URL, Model |
| openai-whisper | API Key |
| deepgram | API Key |

| LLM Provider | Fields |
|-------------|--------|
| ollama | Host, Model, Vision Model |
| openai | API Key, Model |
| anthropic | API Key, Model, Base URL |

### Config Keys

Full config interface in `src/core/config.ts`. Key settings:

| Key | Default | Description |
|-----|---------|-------------|
| `sttProvider` | `browser` | STT provider ID |
| `llmProvider` | `ollama` | LLM provider ID |
| `insightTabs` | `Suggestions,Key Points,...` | Comma-separated categories |
| `analysisIntervalMs` | `15000` | Analysis cycle interval |
| `multiAgent` | `true` | Parallel per-category analysis |
| `autoPip` | `true` | Auto-open PiP on session start |
| `sttLanguage` | `en-US` | BCP-47 language code |

### Events

Emits `mn-settings-save` with `{ config: Partial<Config> }` on Save. The dashboard applies changes and updates the running analyzer if active.

## See Also

- [[provider-registry]] — providers configured here
- [[insights]] — categories and presets configured here
- [[design-system]] — settings modal styling
