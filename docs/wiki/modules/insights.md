---
title: Insights Module
category: module
updated: 2026-04-12
related: [transcript, provider-registry, chat]
---

# Insights

AI-generated insight cards extracted from the transcript every ~15 seconds.

## Analyzer (`src/core/analyzer.ts`)

- Runs on a `setInterval` (default 15s, configurable via `analysisIntervalMs`)
- Sends recent transcript + screen descriptions to the LLM
- Requests JSON response with one key per category
- Deduplicates against prior insights
- Supports multi-agent mode (parallel LLM calls, one per category)

### Dirty Flag

The analyzer skips cycles when no new transcript or screen data has arrived since the last analysis. Saves LLM tokens.

### Context Window

Tracks `contextSize` (ratio of used vs max). Rolls older transcript into a summary when the window exceeds ~100k chars.

### Insight Language

Output language matches the configured `sttLanguage` (e.g., `pt-BR` produces Portuguese insights).

## Component: `<mn-insights>`

File: `src/ui/components/mn-insights.ts`

### Layout

- Pill-style tab bar (not DaisyUI tabs): active tab has subtle background
- Absolute-positioned panels that toggle visibility
- Cards use `.mn-insight-card` class (borderless, hover state)

### Presets

| Preset | Categories |
|--------|------------|
| Meeting | Suggestions, Key Points, Action Items, Questions |
| Code Interview | Solution Approach, Complexity Analysis, Edge Cases, Code Suggestions |
| Pair Programming | Bugs, Design Decisions, TODOs, Questions |
| Lecture | Key Concepts, Examples, Questions, References |

Custom categories via comma-separated input in settings.

### Append-Only Rendering

`updateInsights()` only appends new items (compares `childElementCount` vs array length). No full re-render on update.

## See Also

- [[transcript]] — source data for analysis
- [[chat]] — also uses LLM, shares context
- [[provider-registry]] — LLM provider for analysis
- [[screen-capture]] — visual context fed into analyzer
