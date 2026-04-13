---
title: Tech Stack
category: architecture
updated: 2026-04-12
related: [overview, design-system, web-components]
---

# Tech Stack

## Runtime & Tooling

| Tool | Version | Role |
|------|---------|------|
| Bun | latest | Runtime, package manager, script runner |
| Vite | 6.x | Bundler, dev server, HMR |
| Biome | latest | Linter + formatter (replaces ESLint + Prettier) |
| TypeScript | 5.x | Type checking (`tsc --noEmit`), no emit |
| just | latest | Task runner (`justfile`) |

## Frontend

| Library | Version | Role |
|---------|---------|------|
| Tailwind CSS | 4.x | Utility-first CSS (v4 CSS-based config, no `tailwind.config.js`) |
| DaisyUI | 5.x | Component library (custom `moanete` theme) |
| tw-animate-css | 1.x | Animation utilities |

No framework (React, Vue, etc.). Pure web components via `MoaneteElement` base class. See [[web-components]].

## Browser APIs

| API | Used For |
|-----|----------|
| `getUserMedia` | Microphone capture |
| `getDisplayMedia` | Tab/system audio + screen capture |
| `webkitSpeechRecognition` | Free browser-based STT |
| `documentPictureInPicture` | Floating PiP overlay (Chrome 116+) |
| `IndexedDB` | Session history persistence |
| `localStorage` | Config persistence |
| `ScriptProcessorNode` | Audio chunk processing for STT providers |

## Testing

| Tool | Role |
|------|------|
| Vitest | Unit + integration tests (68 tests) |
| happy-dom | DOM environment for component tests |
| Playwright | E2E tests (Chrome + Firefox) |

## CI

GitHub Actions: `bun install` → `biome check` → `tsc --noEmit` → `vite build`

## Key Commands

```sh
just dev       # Vite dev server at localhost:5173
just verify    # lint + types + tests + build
just whisper   # Local Whisper STT server
just mcp       # MCP server (stdio + ws://localhost:3001)
```

## See Also

- [[overview]] — project overview
- [[design-system]] — visual tokens and theme
- [[web-components]] — component architecture
