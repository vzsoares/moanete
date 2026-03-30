/**
 * Browser-side WebSocket client that pushes session state to the MCP bridge.
 * Connects to ws://localhost:3001 (the MCP server's WebSocket endpoint).
 */

const BRIDGE_URL = "ws://localhost:3001";
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function send(type: string, data: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

export function connectBridge(): void {
  if (ws?.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(BRIDGE_URL);

  ws.onopen = () => {
    console.log("[mcp-bridge] connected");
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onclose = () => {
    ws = null;
    // Silent reconnect — MCP server may not be running
    reconnectTimer = setTimeout(connectBridge, 5000);
  };

  ws.onerror = () => {
    // Suppress errors — bridge is optional
  };
}

export function disconnectBridge(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.close();
  ws = null;
}

export function pushTranscript(source: "mic" | "tab", text: string): void {
  send("transcript", { source, text, timestamp: Date.now() });
}

export function pushInsights(insights: Record<string, string[]>): void {
  send("insights", insights);
}

export function pushSummary(summary: string): void {
  send("summary", summary);
}

export function pushStatus(running: boolean): void {
  send("status", { running });
}

export function pushReset(): void {
  send("reset", null);
}
