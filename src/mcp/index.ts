export { startBridge, getState } from "./bridge.ts";
export type { TranscriptLine } from "./bridge.ts";

export {
  connectAll,
  disconnectAll,
  connectOne,
  disconnectOne,
  listConnected,
  listTools,
  callTool,
  listResources,
  readResource,
} from "./client.ts";
export type { McpServerConfig, ToolCallResult, ResourceReadResult } from "./client.ts";
