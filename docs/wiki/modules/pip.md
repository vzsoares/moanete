---
title: Picture-in-Picture Overlay
category: module
updated: 2026-04-12
related: [design-system, chat, transcript, insights]
---

# Picture-in-Picture Overlay

Floating always-on-top window using the Document PiP API. Full feature parity with the main dashboard in a compact form factor.

## Implementation (`src/ui/pip.ts`)

Not a web component. Built as vanilla DOM functions operating on a separate `Document` object created by `documentPictureInPicture.requestWindow()`.

### Style Injection

The PiP document doesn't inherit the main page's styles. Styles are injected via Vite's `?inline` import:

```typescript
import PIP_CSS from "./global.css?inline";
// ...
const style = doc.createElement("style");
style.textContent = PIP_CSS;
doc.head.appendChild(style);
doc.body.setAttribute("data-theme", "moanete");
```

This means all design tokens, custom classes (`.mn-panel-header`, `.mn-insight-card`), and Tailwind utilities work in PiP.

### Layout (400x500px default)

```
┌────────────────────────────────┐
│ moañete  ● mic ● tab   ctx ▓▓ │  header (status dots + context bar)
├────────────────────────────────┤
│ [Trans] [Insights] [Chat]     │  pill view toggles
├────────────────────────────────┤
│ content (switches by view)     │
├────────────────────────────────┤
│ [preset ▾]              [Auto] │  chat controls (visible in chat view)
│ [input...           ] [Send]   │
└────────────────────────────────┘
```

### View Switching

Three mutually exclusive views toggled by pill buttons:
- **Transcript:** plain text, auto-scrolls
- **Insights:** grouped by category with `.mn-insight-card` cards
- **Chat:** messages + preset selector + auto-assist + input

### User Gesture Requirement

`documentPictureInPicture.requestWindow()` requires a user click event. Cannot be auto-opened programmatically. The dashboard shows a "PiP" button after session start.

### Browser Support

Chrome/Edge 116+ only. Firefox and Safari do not implement Document PiP. The app shows a compat hint if PiP is unavailable.

## Exported Functions

| Function | Purpose |
|----------|---------|
| `buildPipUI()` | Create PiP DOM, inject styles, bind events |
| `destroyPipUI()` | Cleanup on PiP close |
| `pipAppendTranscript()` | Add transcript line |
| `updateInsights()` | Refresh insight cards |
| `pipUpdateContext()` | Update context bar |
| `pipUpdateActivity()` | Update mic/tab dots |
| `setChatReply()` | Push chat response |
| `seedPipState()` | Sync state on PiP open |
| `pipSetScreenAvailable()` | Show/hide capture buttons |

## See Also

- [[design-system]] — PiP uses the same design tokens
- [[chat]] — full chat in PiP
- [[transcript]] — transcript view in PiP
- [[web-components]] — main app uses web components, PiP does not
