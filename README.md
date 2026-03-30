# moanete

Meeting assistant — real-time transcription, LLM-powered insights, and Q&A as a web app with a floating Picture-in-Picture overlay.

> **Moañete** — from the Guarani language: *confirmar / fazer ser verdade*. Used when persuasion is based on proving that something is real or correct.

## How it works

```
web app (settings + start)
    │
    ├── Audio Capture (mic + system audio via Web Audio API)
    │     └── STT Provider (browser free / Deepgram paid)
    │           └── onTranscript → Analyzer + PiP overlay
    │
    ├── LLM Analyzer (every ~15s) → Insights
    │
    └── PiP floating overlay
          ├── Live transcript bar
          ├── Insight tabs (Suggestions, Key Points, Action Items, Questions)
          ├── Chat (Q&A about the meeting)
          └── Summary (on demand)
```

1. Open the app → configure providers (or use free defaults)
2. Click "Start Session" → grants mic permission, starts transcription
3. Click "Pop Out (PiP)" → floating overlay appears on top of your meeting
4. The overlay shows live transcript, insights, chat, and summary

## Setup

Requires [Bun](https://bun.sh) and Chrome 116+.

```sh
bun install
bun run dev           # http://localhost:5173
bun run build         # production build → dist/
```

## Provider options

| | Free tier | Paid tier |
|---|---|---|
| **STT** | Browser SpeechRecognition (free), local Whisper server (free) | Deepgram (BYOK or hosted) |
| **LLM** | Ollama (local) or BYOK OpenAI/Anthropic | Hosted proxy (subscription) |

No backend needed for the free tier — all API calls go directly from the browser.

For local STT via Whisper (needed for tab/system audio transcription):

```sh
just whisper              # uses 'base' model, runs at http://localhost:8000
just whisper large-v3     # use a bigger model for better accuracy
```

For local LLM via Ollama:

```sh
# Install from https://ollama.com, then:
ollama serve
ollama pull llama3.2
```

## Configuration

Settings are configured in the app and stored in `localStorage`.

| Setting | Default | Options |
|---------|---------|---------|
| STT Provider | Browser (free) | `browser`, `whisper`, `deepgram` |
| LLM Provider | Ollama (local) | `ollama`, `openai`, `anthropic` |
| Insight Tabs | Suggestions, Key Points, Action Items, Questions | Any comma-separated list |
| Capture Mic | On | Toggle |
| Capture Tab Audio | Off | Toggle |

### Insight tab presets

| Context | Categories |
|---------|------------|
| Meeting (default) | Suggestions, Key Points, Action Items, Questions |
| Code Interview | Code Topics, Technical Questions, Red Flags, Strengths |
| Pair Programming | Bugs, Design Decisions, TODOs, Questions |
| Lecture | Key Concepts, Examples, Questions, References |

## Development

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev           # vite dev server → http://localhost:5173
bun run build         # production build
bun run check         # biome lint + format check
bun run fix           # biome auto-fix
```

### Tech stack

- **Bundler**: Vite
- **Runtime / Package manager**: Bun
- **Linter / Formatter**: Biome
- **CSS**: Tailwind CSS + DaisyUI + tw-animate-css

### Project structure

```
├── index.html                     # Single-page app entry point
├── justfile                       # Task runner (just dev, just whisper, etc.)
├── mcp-servers.json               # External MCP server config (Notion, etc.)
├── .github/workflows/ci.yml      # GitHub Actions CI
├── scripts/
│   └── whisper-server.py          # Local Whisper STT server (uv run)
└── src/
    ├── mcp/                       # MCP server + client + WebSocket bridge
    ├── core/                      # Audio capture, analyzer, session, config, storage
    ├── providers/
    │   ├── stt/                   # STT: browser (free), whisper (local), deepgram
    │   └── llm/                   # LLM: ollama, openai, anthropic
    └── ui/
        ├── global.css             # Tailwind + DaisyUI + tw-animate-css
        ├── popup.ts               # Dashboard UI + settings + MCP modal
        └── pip.ts                 # Minimal PiP floating overlay
```

## MCP Integration

### MCP Server

moanete exposes a Model Context Protocol (MCP) server so AI assistants like Claude Code can query the live meeting:

```sh
just mcp   # start MCP server (stdio + ws://localhost:3001)
```

Add to your Claude Code config (`.claude/settings.json`):
```json
{
  "mcpServers": {
    "moanete": {
      "command": "bun",
      "args": ["src/mcp/server.ts"],
      "cwd": "/path/to/moanete"
    }
  }
}
```

**Tools:** `get_transcript`, `get_insights`, `get_summary`, `ask_question`
**Resources:** `moanete://transcript`, `moanete://insights`, `moanete://status`

### MCP Client — External Servers

moanete can also connect to external MCP servers (like Notion) for extended context during meetings.

Configure external servers in `mcp-servers.json`:
```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "env": {
        "OPENAPI_MCP_HEADERS": "{\"Authorization\": \"Bearer YOUR_NOTION_TOKEN\", \"Notion-Version\": \"2022-06-28\"}"
      }
    }
  }
}
```

Start the MCP server (`just mcp`), then click the **MCP** button in the navbar to browse connected servers and call their tools from the app.

## Requirements

- [Bun](https://bun.sh) (for building)
- Chrome 116+ (for Document Picture-in-Picture API)
- A working microphone

## Privacy

### Free tier with Ollama
- **Audio** — captured by browser, transcribed locally via SpeechRecognition or sent to your own STT provider
- **Transcripts** — sent only to your configured LLM provider (Ollama = local)
- **API keys** — stored locally in `localStorage`, never sent to us

When using cloud providers (Anthropic, OpenAI, Deepgram), data is sent to their APIs.

## License

[MIT](LICENSE)
