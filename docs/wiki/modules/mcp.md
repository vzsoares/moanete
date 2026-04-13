---
title: MCP Integration
category: module
updated: 2026-04-12
related: [provider-registry, overview]
---

# MCP Integration

Bidirectional Model Context Protocol support. moañete is both an MCP server (AI tools query live sessions) and an MCP client (connects to external servers for extended context).

## MCP Server (`src/mcp/server.ts`)

Exposes session data to AI coding assistants (Claude Code, Cursor, etc.) via stdio transport + WebSocket bridge.

### Tools

| Tool | Description |
|------|-------------|
| `get_transcript` | Current session transcript |
| `get_insights` | Extracted insights by category |
| `get_summary` | Session summary |
| `ask_question` | Ask a question about the session content |

### Resources

| URI | Description |
|-----|-------------|
| `moanete://transcript` | Live transcript |
| `moanete://insights` | Current insights |
| `moanete://status` | Session status |

### Setup

```sh
just mcp   # starts stdio server + ws://localhost:3001
```

Claude Code config:
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

## MCP Client (`src/mcp/client.ts`)

Connects to external MCP servers for extended context during sessions.

### Architecture

- `src/mcp/client.ts` — connects via stdio transport
- `src/mcp/bridge.ts` — bidirectional WebSocket bridge (browser pushes state, queries external tools)
- `src/core/mcp-bridge.ts` — browser-side WebSocket client

### UI: `<mn-mcp>`

File: `src/ui/components/mn-mcp.ts`

- Quick connect buttons (Notion preset, Custom, Remote URL)
- Connected server list with Tools/Disconnect actions
- Tool browser with Run button (prompts for JSON args)
- Tool result display

### Configuration

External servers configured in `mcp-servers.json`:

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "env": { "OPENAPI_MCP_HEADERS": "..." }
    }
  }
}
```

## WebSocket Bridge

The bridge at `ws://localhost:3001` is bidirectional:
- **Browser → Server:** pushes transcript, insights, summary, status updates
- **Server → Browser:** queries external MCP tools/resources

## See Also

- [[provider-registry]] — different extension mechanism (providers vs MCP)
- [[overview]] — project architecture
