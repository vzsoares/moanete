# Design System: moañete

## 1. Visual Theme & Atmosphere

Minimal, dark, calm. The AI disappears into the background — the user's content (transcript, insights) is the focus, not the chrome. Inspired by Granola's philosophy (invisible AI) with Linear/Raycast-level craft.

- **Density:** Medium. Generous whitespace in panels, compact in navbar and tabs.
- **Mood:** Professional developer tool. Not playful, not corporate. Keyboard-first, no visual clutter.
- **Elevation:** No box shadows. Depth through background opacity only (e.g., `rgba(255,255,255,0.025)` for subtle surface lift).
- **Motion:** Subtle. 150ms for hover states, 300ms for view transitions. Soft pulse animation for recording indicators.
- **Borders:** Nearly invisible. `rgba(255,255,255,0.06)` — structure is felt, not seen.

## 2. Color Palette & Roles

### Base surfaces

| Name | Value (oklch) | Hex approx | Role |
|------|---------------|-----------|------|
| Background | `oklch(0.145 0.012 265)` | `#0a0a0f` | Page background, navbar, modals |
| Surface | `oklch(0.16 0.012 265)` | `#101018` | Elevated panels (base-200) |
| Surface raised | `oklch(0.18 0.012 265)` | `#151520` | Cards, right panel (base-300) |
| Border | `oklch(0.25 0.008 265)` | `#1e1e2a` | Dividers, input borders |

### Text

| Name | Value (oklch) | Role |
|------|---------------|------|
| Primary | `oklch(0.9 0.01 265)` | Headings, body text, active labels |
| Secondary | `oklch(0.6 0.008 265)` | Transcript text, insight card content |
| Muted | `oklch(0.4 0.005 265)` | Panel headers, timestamps, placeholders |

### Accent & semantic

| Name | Value (oklch) | Hex approx | Role |
|------|---------------|-----------|------|
| Primary / Accent | `oklch(0.585 0.22 264)` | `#6366f1` | Buttons, active tabs, insight bullets, focus rings |
| Mic (You) | `oklch(0.75 0.18 155)` | `#4ade80` | Mic indicator glow, "You" speaker label |
| Tab (Them) | `oklch(0.7 0.15 250)` | `#60a5fa` | Tab indicator glow, "Them" speaker label |
| Success | `oklch(0.75 0.18 155)` | `#4ade80` | Connected states, active dots |
| Warning | `oklch(0.8 0.15 75)` | `#eab308` | Compat hints, context bar 60-85% |
| Error / Danger | `oklch(0.63 0.21 25)` | `#ef4444` | Stop button, error states, context bar 85%+ |

### DaisyUI theme name

`moanete` — defined in `src/ui/global.css` via `@plugin "daisyui/theme"`. Set on `<html data-theme="moanete">` and PiP body.

## 3. Typography Rules

| Role | Font | Size | Weight | Extras |
|------|------|------|--------|--------|
| **Sans (default)** | Inter, ui-sans-serif, system-ui, sans-serif | — | — | Used everywhere |
| **Mono** | JetBrains Mono, Fira Code, ui-monospace, monospace | — | — | Code blocks, JSON fields |
| **Logo** | Inter | 15px | 600 | `letter-spacing: -0.02em`, `tracking-tight` |
| **Panel header** | Inter | 11px | 500 | Uppercase, `letter-spacing: 0.08em`, muted color |
| **Body / transcript** | Inter | 13.5px | 400 | `line-height: 1.55` |
| **Tabs** | Inter | 12px | 400 | — |
| **Speaker label** | Inter | 11px | 600 | Colored (mic green / tab blue) |
| **Badges / labels** | Inter | 10-11px | 400 | Tabular-nums for counters |
| **Input text** | Inter | 13px | 400 | — |

## 4. Component Stylings

### Buttons

- **Primary:** Indigo background (`#6366f1`), white text, 6px radius, 150ms transition.
- **Ghost / text:** No background, muted text (`base-content/50`), hover brightens to `/80`.
- **Stop:** Subtle danger — `bg-error/10`, `border-error/20`, red text. Not a solid red button.
- **Preset pill:** `bg-base-content/[0.04]`, muted text, 6px radius, 11px font. Hover brightens.

### Tabs (insight & PiP view toggle)

- **Active:** `text-base-content`, `bg-base-content/[0.04]`, 6px radius.
- **Inactive:** `text-base-content/40`, no background. Hover: `/60`.
- Not DaisyUI tabs. Custom pill-style toggles.

### Cards (insight cards)

- Background: `rgba(255,255,255,0.025)` — barely visible surface lift.
- No border. 8px radius. 10px/14px padding.
- Hover: background rises to `rgba(255,255,255,0.04)`.
- 13px text, secondary color, 1.5 line-height.

### Inputs

- Background: `base-content/[0.04]`.
- Border: `base-content/[0.08]`, 1px solid.
- Focus: border shifts to `primary/40`.
- Placeholder: `base-content/30`.
- 8px radius (rounded-lg for chat, rounded-md for settings).

### Modals (settings, history, MCP)

- `bg-base-100` (deepest background), `border base-content/[0.06]`.
- Footer with `border-t base-content/[0.06]`, actions right-aligned.
- Max-width: `md` for settings, `2xl` for history/MCP.

### Status dots

- 7px diameter, rounded full.
- **Off:** `bg-base-content/20`.
- **On (mic):** Green with glow (`box-shadow: 0 0 6px rgba(74,222,128,0.4)`), soft pulse animation.
- **On (tab):** Blue with glow (`box-shadow: 0 0 6px rgba(96,165,250,0.4)`).
- **Error:** Solid error red.

### Compat hints banner

- Inline bar, not a card. `bg-warning/[0.06]`, `text-warning/80`, `border-b border-warning/10`.
- Dismiss button: `text-warning/40`, hover `/70`.

### Scrollbar

- 6px width, transparent track.
- Thumb: `oklch(0.3 0.008 265)`, 3px radius. Hover: `oklch(0.4)`.

## 5. Layout Principles

### Main dashboard

```
┌─────────────────────────────────────────────────────────┐
│ navbar: logo + status + controls          [Start] [PiP] │
├──────────────────────────────┬──────────────────────────┤
│                              │  insight tabs (pills)    │
│  TRANSCRIPT                  │  insight cards            │
│  (flex: 1)                   │                          │
│  Speaker labels above text   │──────────────────────────│
│  Subtle line borders         │  CHAT (panel header)     │
│                              │  preset + auto           │
│                              │  messages                │
│                              │  input + send            │
│                              │  (420px fixed)           │
└──────────────────────────────┴──────────────────────────┘
```

- **Two-panel split:** Transcript takes remaining space (`flex: 1`), right panel is `420px` fixed.
- **Transcript panel:** No background card, separated by a right border (`border-r base-content/[0.06]`).
- **Right panel:** Subtle raised background (`bg-base-200/60`).
- **Navbar:** `bg-base-100/95` with `backdrop-blur-sm`. Logo left, controls right, status dots inline.
- **No outer padding on main.** Panels touch the edges. Internal padding: `px-5` for transcript, `px-4` for insights/chat.

### PiP overlay

Compact floating window (400x500px default). Same design tokens, injected via `global.css?inline`.

```
┌────────────────────────────────┐
│ moañete  ● ● mic tab   ctx ▓▓ │  header
├────────────────────────────────┤
│ [Trans] [Insights] [Chat]     │  pill view toggles
├────────────────────────────────┤
│                                │
│  content (switches by view)    │
│                                │
├────────────────────────────────┤
│ [preset ▾]              [Auto] │  chat controls
│ [input...           ] [Send]   │
└────────────────────────────────┘
```

### Settings modal

- Grouped sections: Audio (checkboxes row), Providers (2-col grid for STT+Language, then LLM), Insights (input + preset pills).
- Advanced settings collapsed by default via `<details>` (intervals, multi-agent, agent prompts, custom chat prompt).
- Narrow modal (`max-w-md`) to reduce visual weight.

### Spacing

- Base unit: 8px (`gap-2`). Multiples of 4px.
- Panel internal padding: 16-20px (`px-4` to `px-5`).
- Between sections: 12px (`gap-3`, `mb-3`).
- Navbar padding: `px-5 py-3`.

### Grid

No CSS grid. Flexbox everywhere. Two exceptions:
- Settings provider dropdowns: `grid grid-cols-2 gap-3`.
- Screen capture thumbnails: `grid grid-cols-3 gap-2`.
