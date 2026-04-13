---
title: Chat Module
category: module
updated: 2026-04-12
related: [insights, transcript, pip]
---

# Chat

Q&A and preset-based chat powered by the configured LLM.

## Component: `<mn-chat>`

File: `src/ui/components/mn-chat.ts`

### Modes

1. **Q&A mode** (preset = empty): user types a question, gets an answer with context from transcript + insights + screen
2. **Preset mode** (preset selected): user clicks Send to generate a structured analysis using the preset's system prompt. Optional extra instructions in the input field.
3. **Auto-assist mode**: LLM monitors the session on an interval and speaks up only when relevant. Responds with "SKIP" when nothing new to say.

### Presets

Defined in `CHAT_PRESETS` array in `mn-chat.ts`:

| Name | Behavior |
|------|----------|
| Q&A | Regular question-answer |
| Meeting | Structured briefing: overview, decisions, action items, next steps |
| Code Interview | Interview process coaching (no code hints) |
| LeetCode Coach | Socratic nudges toward solution (never reveals answer) |
| LeetCode Solve | Direct solution with code, complexity, edge cases |
| Lecture | Study notes: topic, key concepts, formulas, review questions |
| Custom | User-defined system prompt from settings |

### Chat Context (`_buildQAContext`)

Built in `mn-dashboard.ts`, includes:
- Last 2000 chars of transcript
- Screen descriptions (if any)
- Extracted insights by category

### Follow-Up Suggestions

After each assistant response, `answerQuestion()` in `src/core/summarizer.ts` returns 3 suggested follow-up questions. Rendered as clickable pill chips.

### Markdown Rendering

Assistant responses rendered via `renderMarkdown()` in `src/ui/util.ts` — supports code blocks, inline code, bold, italic, lists.

## See Also

- [[insights]] — shares LLM and context with chat
- [[pip]] — full chat available in PiP overlay
- [[transcript]] — source context for Q&A
