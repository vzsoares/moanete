/**
 * WebSocket bridge — bidirectional communication between browser and MCP server.
 *
 * Browser → Server (state pushes):
 *   { type: "transcript", data: { source, text, timestamp } }
 *   { type: "insights", data: Record<string, string[]> }
 *   { type: "summary", data: string }
 *   { type: "status", data: { running: boolean } }
 *
 * Browser → Server (MCP client requests):
 *   { type: "mcp-list-servers", id: string }
 *   { type: "mcp-list-tools", id: string, data: { server?: string } }
 *   { type: "mcp-call-tool", id: string, data: { server, tool, args } }
 *   { type: "mcp-list-resources", id: string, data: { server?: string } }
 *   { type: "mcp-read-resource", id: string, data: { server, uri } }
 *
 * Server → Browser (MCP client responses):
 *   { type: "mcp-response", id: string, data: unknown }
 *   { type: "mcp-error", id: string, error: string }
 */

import * as mcpClient from "./client.ts";

export interface TranscriptLine {
  source: "mic" | "tab";
  text: string;
  timestamp: number;
}

interface SessionState {
  running: boolean;
  transcript: TranscriptLine[];
  insights: Record<string, string[]>;
  summary: string;
  lastUpdate: number | null;
}

const state: SessionState = {
  running: false,
  transcript: [],
  insights: {},
  summary: "",
  lastUpdate: null,
};

export function getState(): SessionState {
  return state;
}

interface BridgeMessage {
  type: string;
  id?: string;
  data?: unknown;
}

type ServerWebSocket = Parameters<
  NonNullable<Parameters<typeof Bun.serve>[0]["websocket"]>["message"]
>[0];

async function handleMcpRequest(ws: ServerWebSocket, msg: BridgeMessage): Promise<void> {
  const id = msg.id;
  if (!id) return;

  try {
    let result: unknown;

    switch (msg.type) {
      case "mcp-list-servers":
        result = mcpClient.listConnected();
        break;

      case "mcp-list-tools": {
        const d = msg.data as { server?: string } | undefined;
        result = await mcpClient.listTools(d?.server);
        break;
      }

      case "mcp-call-tool": {
        const d = msg.data as { server: string; tool: string; args?: Record<string, unknown> };
        result = await mcpClient.callTool(d.server, d.tool, d.args);
        break;
      }

      case "mcp-list-resources": {
        const d = msg.data as { server?: string } | undefined;
        result = await mcpClient.listResources(d?.server);
        break;
      }

      case "mcp-read-resource": {
        const d = msg.data as { server: string; uri: string };
        result = await mcpClient.readResource(d.server, d.uri);
        break;
      }

      case "mcp-connect": {
        const d = msg.data as {
          name: string;
          command: string;
          args?: string[];
          env?: Record<string, string>;
        };
        await mcpClient.connectOne(d.name, {
          command: d.command,
          args: d.args,
          env: d.env,
        });
        result = { connected: true, name: d.name };
        break;
      }

      case "mcp-connect-remote": {
        const d = msg.data as {
          name: string;
          url: string;
          oauthClientId?: string;
          oauthClientSecret?: string;
        };
        await mcpClient.connectRemote(d.name, {
          url: d.url,
          oauthClientId: d.oauthClientId,
          oauthClientSecret: d.oauthClientSecret,
        });
        result = { connected: true, name: d.name };
        break;
      }

      case "mcp-disconnect": {
        const d = msg.data as { name: string };
        await mcpClient.disconnectOne(d.name);
        result = { disconnected: true, name: d.name };
        break;
      }

      default:
        return;
    }

    ws.send(JSON.stringify({ type: "mcp-response", id, data: result }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ws.send(JSON.stringify({ type: "mcp-error", id, error: message }));
  }
}

export function startBridge(port = 3001): void {
  Bun.serve({
    port,
    fetch(req, server) {
      if (server.upgrade(req)) return;
      return new Response("moanete MCP bridge", { status: 200 });
    },
    websocket: {
      open() {
        console.error("[bridge] browser connected");
      },
      message(ws, raw) {
        const msg = JSON.parse(String(raw)) as BridgeMessage;

        // MCP client requests — bidirectional
        if (msg.type.startsWith("mcp-")) {
          handleMcpRequest(ws, msg);
          return;
        }

        // State pushes — one-way
        state.lastUpdate = Date.now();

        switch (msg.type) {
          case "transcript": {
            const line = msg.data as TranscriptLine;
            state.transcript.push(line);
            break;
          }
          case "insights":
            state.insights = msg.data as Record<string, string[]>;
            break;
          case "summary":
            state.summary = msg.data as string;
            break;
          case "status": {
            const s = msg.data as { running: boolean };
            state.running = s.running;
            break;
          }
          case "reset":
            state.transcript = [];
            state.insights = {};
            state.summary = "";
            state.running = false;
            break;
        }
      },
      close() {
        console.error("[bridge] browser disconnected");
      },
    },
  });
  console.error(`[bridge] WebSocket server on ws://localhost:${port}`);
}
