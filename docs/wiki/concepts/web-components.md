---
title: Web Components
category: concept
updated: 2026-04-12
related: [design-system, tech-stack, overview]
---

# Web Components

All UI is built as light DOM custom elements extending `MoaneteElement`. No Shadow DOM — components inherit Tailwind/DaisyUI styles from the host page.

## Base Class (`src/ui/base.ts`)

```typescript
abstract class MoaneteElement extends HTMLElement {
  connectedCallback(): void { this.render(); }
  abstract render(): void;
  protected $<T>(selector: string): T;   // scoped querySelector
  protected $$<T>(selector: string): NodeListOf<T>;  // scoped querySelectorAll
  protected emit<T>(name: string, detail?: T): void;  // CustomEvent dispatch
}
```

## Component Inventory

| Tag | File | Purpose |
|-----|------|---------|
| `<mn-dashboard>` | `mn-dashboard.ts` | Root orchestrator, composes all components |
| `<mn-transcript>` | `mn-transcript.ts` | Scrollable transcript with speaker labels |
| `<mn-insights>` | `mn-insights.ts` | Tabbed insight categories with cards |
| `<mn-chat>` | `mn-chat.ts` | Chat with presets, auto-assist, markdown |
| `<mn-settings>` | `mn-settings.ts` | Settings modal (providers, insights, advanced) |
| `<mn-history>` | `mn-history.ts` | Session history list/detail/resume/export |
| `<mn-mcp>` | `mn-mcp.ts` | MCP server connect/manage/tools |
| `<mn-status>` | `mn-status.ts` | Status dot + text |
| `<mn-audio-level>` | `mn-audio-level.ts` | Audio level indicator |
| `<mn-compat-hints>` | `mn-compat-hints.ts` | Browser compatibility warnings |
| `<mn-screen-captures>` | `mn-screen-captures.ts` | Screen capture thumbnail grid |

## Communication Pattern

Components communicate via CustomEvents:

| Event | Source | Payload | Handler |
|-------|--------|---------|---------|
| `mn-settings-save` | `mn-settings` | `{ config: Partial<Config> }` | `mn-dashboard` |
| `mn-chat-send` | `mn-chat` | `{ question: string }` | `mn-dashboard` |
| `mn-chat-generate` | `mn-chat` | `{ prompt: string }` | `mn-dashboard` |
| `mn-chat-auto` | `mn-chat` | `{ active: boolean, prompt: string }` | `mn-dashboard` |
| `mn-session-resume` | `mn-history` | `{ session: StoredSession }` | `mn-dashboard` |

## Entry Point

`index.html` loads a single element:

```html
<body>
  <mn-dashboard></mn-dashboard>
  <script type="module" src="/src/ui/index.ts"></script>
</body>
```

`src/ui/index.ts` is a barrel that imports all component files, triggering their `customElements.define()` calls.

## Package Exports

The components are designed for reuse in a hosted version:

```
moanete/core       — Session, Analyzer, Config, Storage, MCP bridge
moanete/providers  — STT + LLM registries and built-in providers
moanete/mcp        — MCP server, client, bridge (Bun-only)
moanete/ui         — All custom elements + base class + utilities
```

## See Also

- [[design-system]] — visual tokens applied to components
- [[tech-stack]] — Tailwind v4 + DaisyUI v5 setup
- [[pip]] — PiP overlay (vanilla DOM, not web components)
