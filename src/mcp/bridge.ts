/**
 * WebSocket bridge — receives state pushes from the browser app.
 *
 * The browser connects to ws://localhost:3001 and sends JSON messages:
 *   { type: "transcript", data: { source, text, timestamp } }
 *   { type: "insights", data: Record<string, string[]> }
 *   { type: "summary", data: string }
 *   { type: "status", data: { running: boolean } }
 */

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
  type: "transcript" | "insights" | "summary" | "status" | "reset";
  data: unknown;
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
      message(_ws, raw) {
        const msg = JSON.parse(String(raw)) as BridgeMessage;
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
            if (!s.running) {
              // Session ended — keep data for queries
            }
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
