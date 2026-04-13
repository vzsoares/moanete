---
title: Design System
category: architecture
updated: 2026-04-12
related: [tech-stack, web-components, pip]
---

# Design System

Full specification lives in `DESIGN.md` at the project root (Google Stitch pattern). This page is a quick reference.

## Philosophy

Granola's "AI disappears" philosophy with Linear/Raycast-level craft. Dark, calm, keyboard-first. No visual clutter. The user's content is the focus, not the chrome.

## Theme

Custom DaisyUI theme named `moanete`, defined in `src/ui/global.css` via `@plugin "daisyui/theme"`. Applied via `<html data-theme="moanete">` and in PiP via `doc.body.setAttribute("data-theme", "moanete")`.

## Color Tokens

| Token | Value | Use |
|-------|-------|-----|
| `--color-mn-bg` | `oklch(0.145 0.012 265)` | Page background |
| `--color-mn-surface` | `oklch(0.18 0.012 265)` | Raised panels |
| `--color-mn-border` | `oklch(0.25 0.008 265)` | Dividers |
| `--color-mn-text` | `oklch(0.9 0.01 265)` | Primary text |
| `--color-mn-text-secondary` | `oklch(0.6 0.008 265)` | Body text |
| `--color-mn-text-muted` | `oklch(0.4 0.005 265)` | Headers, placeholders |
| `--color-mn-accent` | `oklch(0.585 0.22 264)` | Indigo accent |
| `--color-mn-mic` | `oklch(0.75 0.18 155)` | Mic/You indicator (green) |
| `--color-mn-tab` | `oklch(0.7 0.15 250)` | Tab/Them indicator (blue) |
| `--color-mn-danger` | `oklch(0.63 0.21 25)` | Error/stop |

## Typography

- **Sans:** Inter, ui-sans-serif, system-ui
- **Mono:** JetBrains Mono, Fira Code
- **Body:** 13.5px, line-height 1.55
- **Panel headers:** 11px, uppercase, letter-spacing 0.08em (`.mn-panel-header` class)
- **Speaker labels:** 11px, weight 600, colored (`.mn-speaker-you`, `.mn-speaker-them`)

## Custom CSS Classes

Defined in `src/ui/global.css`:

| Class | Use |
|-------|-----|
| `.mn-panel-header` | Uppercase muted section labels |
| `.mn-transcript-line` | Transcript entry with bottom border |
| `.mn-speaker` / `.mn-speaker-you` / `.mn-speaker-them` | Speaker labels |
| `.mn-transcript-text` | Transcript body text |
| `.mn-insight-card` | Borderless card with hover state |
| `.dot` / `.dot.on` / `.dot.off` | Status indicator dots with glow |

## Design Principles

- No shadows. Elevation through background opacity.
- Borders at `rgba(255,255,255,0.06)` — felt, not seen.
- Transitions: 150ms hover, 300ms state changes.
- Spacing: 8px base unit, multiples of 4.
- Inputs: subtle background (`base-content/[0.04]`), focus ring via `border-primary/40`.

## See Also

- [[web-components]] — how components use the design system
- [[pip]] — PiP style injection mechanism
- [[tech-stack]] — Tailwind v4 + DaisyUI v5 setup
