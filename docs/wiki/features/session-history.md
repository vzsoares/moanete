---
title: Session History
category: feature
updated: 2026-04-12
related: [transcript, insights, chat]
---

# Session History

Stores completed sessions in IndexedDB for review, export, and resume.

## Storage (`src/core/storage.ts`)

Each session record includes:
- `id`, `startedAt`, `duration`
- `transcript` — array of `{ source, text, timestamp }`
- `insights` — `Record<string, string[]>` by category key
- `categories` — array of category names
- `summary` — generated on session stop
- `chatMessages` — array of `{ role, text, timestamp }`
- `screenCaptures` — array of `{ timestamp, image (base64), description }`

## Component: `<mn-history>`

File: `src/ui/components/mn-history.ts`

### List View

Session cards showing:
- Date + duration badge
- Screen capture count badge (if any)
- Transcript preview (first 2 lines)
- Summary preview (first 120 chars)
- Action buttons: Resume, View, Export, Delete

### Detail View

Full session breakdown:
- Summary (rendered as markdown)
- Transcript with speaker colors
- Insights by category
- Chat messages
- Screen capture descriptions with timestamps

### Export

Downloads a markdown file (`moanete-YYYY-MM-DD.md`) with full session data via `exportSessionMarkdown()`.

### Resume

Loads prior transcript + insights into a new session and continues from where it left off. Seeds the analyzer with prior context.

## Auto-Save

Sessions auto-save on stop. Before stopping, the dashboard generates a summary (if LLM is available) to include in the saved session.

## See Also

- [[transcript]] — transcript data stored per session
- [[insights]] — insights stored per session
- [[chat]] — chat messages stored per session
- [[screen-capture]] — captures stored per session
