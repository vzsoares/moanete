/**
 * Browser-side WebSocket client for the MCP bridge.
 *
 * Pushes session state to the MCP server and supports querying
 * external MCP servers through request/response messaging.
 */

const BRIDGE_URL = "ws://localhost:3001";
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let requestId = 0;
const pendingRequests = new Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>();

function send(type: string, data: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

function request<T>(type: string, data?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("MCP bridge not connected"));
      return;
    }
    const id = String(++requestId);
    pendingRequests.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
    });
    ws.send(JSON.stringify({ type, id, data }));

    // Timeout after 30s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error("MCP request timed out"));
      }
    }, 30_000);
  });
}

function handleResponse(msg: { type: string; id: string; data?: unknown; error?: string }): void {
  const pending = pendingRequests.get(msg.id);
  if (!pending) return;
  pendingRequests.delete(msg.id);

  if (msg.type === "mcp-error") {
    pending.reject(new Error(msg.error ?? "Unknown MCP error"));
  } else {
    pending.resolve(msg.data);
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

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(String(event.data)) as {
        type: string;
        id: string;
        data?: unknown;
        error?: string;
      };
      if (msg.type === "mcp-response" || msg.type === "mcp-error") {
        handleResponse(msg);
      }
    } catch {
      // ignore parse errors
    }
  };

  ws.onclose = () => {
    ws = null;
    // Reject pending requests
    for (const [, pending] of pendingRequests) {
      pending.reject(new Error("MCP bridge disconnected"));
    }
    pendingRequests.clear();
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

export function isBridgeConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}

// --- State pushes (browser → server) ---

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

// --- MCP client queries (browser → server → external MCP) ---

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: string;
  isError?: boolean;
}

export interface McpResourceInfo {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export function mcpListServers(): Promise<string[]> {
  return request<string[]>("mcp-list-servers");
}

export function mcpListTools(server?: string): Promise<Record<string, McpToolInfo[]>> {
  return request<Record<string, McpToolInfo[]>>("mcp-list-tools", { server });
}

export function mcpCallTool(
  server: string,
  tool: string,
  args?: Record<string, unknown>,
): Promise<McpToolCallResult> {
  return request<McpToolCallResult>("mcp-call-tool", { server, tool, args });
}

export function mcpListResources(server?: string): Promise<Record<string, McpResourceInfo[]>> {
  return request<Record<string, McpResourceInfo[]>>("mcp-list-resources", { server });
}

export function mcpReadResource(
  server: string,
  uri: string,
): Promise<{ contents: Array<{ uri: string; text?: string; mimeType?: string }> }> {
  return request("mcp-read-resource", { server, uri });
}

export interface McpConnectParams {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export function mcpConnect(
  params: McpConnectParams,
): Promise<{ connected: boolean; name: string }> {
  return request("mcp-connect", params);
}

export function mcpDisconnect(name: string): Promise<{ disconnected: boolean; name: string }> {
  return request("mcp-disconnect", { name });
}
