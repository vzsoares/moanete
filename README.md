# moanete

**Your AI meeting copilot** — get real-time transcription, smart insights, and a Q&A chat during any meeting, all from your browser.

> **Moañete** — from the Guarani language: *confirmar / fazer ser verdade*. Used when persuasion is based on proving that something is real or correct.

## Table of Contents

- [What does it do?](#what-does-it-do)
- [Quick Start (Docker)](#quick-start-docker)
- [Quick Start (manual)](#quick-start-manual)
- [Provider options](#provider-options)
- [Configuration](#configuration)
- [Development](#development)
- [MCP Integration](#mcp-integration)
- [Browser compatibility](#browser-compatibility)
- [Privacy](#privacy)

## What does it do?

moanete listens to your meeting (mic and/or system audio), transcribes it in real time, and uses an AI to extract useful insights while the meeting is happening. It runs entirely in your browser — no account required.

**Key features:**
- Live transcript (who said what)
- AI-generated insights every ~15 seconds (key points, action items, suggestions, questions)
- Chat — ask questions about the meeting in real time
- On-demand summary
- Screen capture analysis — analyze what's on screen (code, slides, whiteboard) with a vision-capable LLM
- Floating Picture-in-Picture overlay you can keep on top of your meeting window
- Session history — review, export, or resume past meetings
- Fully local & free with Ollama + Whisper, or bring your own API keys

**How to use it:**
1. Open the app in Chrome
2. Click **Start Session** — allow mic access when prompted
3. Click **Pop Out (PiP)** to get a floating overlay on top of your meeting
4. Talk! The transcript and insights update automatically
5. Use the **Chat** tab to ask questions, or click **Summarize** when you're done

## Quick Start (Docker)

> **You need:** [Docker](https://docs.docker.com/get-docker/) installed and running. That's it.

One command gets everything running — the web app, a local speech-to-text engine, and a local AI model:

```sh
git clone https://github.com/vzsoares/moanete.git
cd moanete
docker compose up --build
```

Open **http://localhost:5173** in **Chrome** (other browsers have limited support). That's it!

The first run downloads AI models automatically (~2-4 GB), so it may take a few minutes. After that, starts are fast.

<details>
<summary>With NVIDIA GPU (faster)</summary>

If you have an NVIDIA GPU and want faster transcription and AI responses:

```sh
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

Requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html).

</details>

<details>
<summary>What's running behind the scenes</summary>

| Service | URL | What it does |
|---------|-----|--------------|
| Web app | http://localhost:5173 | The moanete interface |
| Whisper | http://localhost:8000 | Converts speech to text (locally) |
| Ollama | http://localhost:11434 | AI model for insights and chat (locally) |
| MCP bridge | ws://localhost:3001 | Optional — lets AI coding assistants read your meeting |

</details>

<details>
<summary>Useful Docker commands</summary>

```sh
docker compose up -d              # run in background
docker compose logs -f app        # follow app logs
docker compose down                # stop everything
docker compose down -v             # stop and delete downloaded models
```

</details>

## Quick Start (manual)

> **You need:** [Bun](https://bun.sh) and **Chrome 116+**.

```sh
git clone https://github.com/vzsoares/moanete.git
cd moanete
bun install
bun run dev           # opens at http://localhost:5173
```

This runs the web app only. For AI features, you'll also need an LLM — the easiest free option is [Ollama](https://ollama.com):

```sh
# In a separate terminal:
ollama serve
ollama pull llama3.2
```

The app auto-detects Ollama at `localhost:11434`. No config needed.

## Provider options

| | Local (free) | External (BYOK) |
|---|---|---|
| **STT** | Browser SpeechRecognition, local Whisper server | Deepgram |
| **LLM** | Ollama | OpenAI, Anthropic |

No backend needed — all API calls go directly from the browser.

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
| Code Interview | Solution Approach, Complexity Analysis, Edge Cases, Code Suggestions |
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

## Browser compatibility

**Chrome/Edge** is recommended — it has full support for all features (PiP overlay, speech recognition, system audio capture).

| Feature | Chrome/Edge | Firefox | Safari |
|---------|-------------|---------|--------|
| Speech-to-text | Full | Behind flag | Partial |
| System/tab audio | Full | Linux only (PipeWire) | No |
| PiP overlay | Full (116+) | No | No |

The app detects your browser and shows hints when features are limited.

## Privacy

### With local providers (Ollama + Browser STT)
- **Audio** — captured by browser, transcribed locally via SpeechRecognition or sent to your own STT provider
- **Transcripts** — sent only to your configured LLM provider (Ollama = local)
- **API keys** — stored locally in `localStorage`, never sent to us

When using cloud providers (Anthropic, OpenAI, Deepgram), data is sent to their APIs.

## License

[MIT](LICENSE)
