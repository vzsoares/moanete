import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
/**
 * MCP client manager — connects to external MCP servers via stdio transport.
 *
 * Reads server definitions from mcp-servers.json and maintains persistent
 * connections. Exposes tools and resources from all connected servers.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ListResourcesResult, ListToolsResult } from "@modelcontextprotocol/sdk/types.js";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface ConnectedServer {
  config: McpServerConfig;
  client: Client;
  transport: StdioClientTransport;
}

const servers = new Map<string, ConnectedServer>();

function loadServerConfigs(): Record<string, McpServerConfig> {
  const configPath = resolve(process.cwd(), "mcp-servers.json");
  if (!existsSync(configPath)) return {};

  const raw = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as { mcpServers?: Record<string, McpServerConfig> };
  return parsed.mcpServers ?? {};
}

export async function connectAll(): Promise<string[]> {
  const configs = loadServerConfigs();
  const connected: string[] = [];

  for (const [name, config] of Object.entries(configs)) {
    if (servers.has(name)) {
      connected.push(name);
      continue;
    }

    try {
      await connectServer(name, config);
      connected.push(name);
      console.error(`[mcp-client] connected to "${name}"`);
    } catch (err) {
      console.error(`[mcp-client] failed to connect to "${name}":`, err);
    }
  }

  return connected;
}

export async function connectOne(name: string, config: McpServerConfig): Promise<void> {
  if (servers.has(name)) {
    await disconnectOne(name);
  }
  await connectServer(name, config);
  console.error(`[mcp-client] connected to "${name}"`);
}

export async function disconnectOne(name: string): Promise<void> {
  const entry = servers.get(name);
  if (!entry) return;
  try {
    await entry.client.close();
  } catch {
    // ignore
  }
  servers.delete(name);
  console.error(`[mcp-client] disconnected from "${name}"`);
}

async function connectServer(name: string, config: McpServerConfig): Promise<void> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
  });

  const client = new Client({ name: `moanete-client-${name}`, version: "0.1.0" });
  await client.connect(transport);

  servers.set(name, { config, client, transport });
}

export async function disconnectAll(): Promise<void> {
  for (const [name, entry] of servers) {
    try {
      await entry.client.close();
      console.error(`[mcp-client] disconnected from "${name}"`);
    } catch {
      // ignore cleanup errors
    }
  }
  servers.clear();
}

export function listConnected(): string[] {
  return [...servers.keys()];
}

export async function listTools(
  serverName?: string,
): Promise<Record<string, ListToolsResult["tools"]>> {
  const result: Record<string, ListToolsResult["tools"]> = {};

  const entries = serverName
    ? [[serverName, servers.get(serverName)] as const]
    : [...servers.entries()];

  for (const [name, entry] of entries) {
    if (!entry) continue;
    try {
      const resp = await entry.client.listTools();
      result[name] = resp.tools;
    } catch (err) {
      console.error(`[mcp-client] listTools failed for "${name}":`, err);
      result[name] = [];
    }
  }

  return result;
}

/** Extracts text content from a callTool response. */
function extractTextContent(content: ReadonlyArray<{ type: string; text?: string }>): string {
  return content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}

export interface ToolCallResult {
  content: string;
  isError?: boolean;
}

export async function callTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<ToolCallResult> {
  const entry = servers.get(serverName);
  if (!entry) throw new Error(`MCP server "${serverName}" not connected`);

  const resp = await entry.client.callTool({ name: toolName, arguments: args });
  const items = resp.content as ReadonlyArray<{ type: string; text?: string }>;
  return {
    content: extractTextContent(items),
    isError: resp.isError === true,
  };
}

export async function listResources(
  serverName?: string,
): Promise<Record<string, ListResourcesResult["resources"]>> {
  const result: Record<string, ListResourcesResult["resources"]> = {};

  const entries = serverName
    ? [[serverName, servers.get(serverName)] as const]
    : [...servers.entries()];

  for (const [name, entry] of entries) {
    if (!entry) continue;
    try {
      const resp = await entry.client.listResources();
      result[name] = resp.resources;
    } catch (err) {
      console.error(`[mcp-client] listResources failed for "${name}":`, err);
      result[name] = [];
    }
  }

  return result;
}

export interface ResourceReadResult {
  contents: Array<{ uri: string; text?: string; mimeType?: string }>;
}

export async function readResource(serverName: string, uri: string): Promise<ResourceReadResult> {
  const entry = servers.get(serverName);
  if (!entry) throw new Error(`MCP server "${serverName}" not connected`);

  const resp = await entry.client.readResource({ uri });
  return {
    contents: resp.contents.map((c) => ({
      uri: c.uri,
      text: "text" in c ? (c.text as string) : undefined,
      mimeType: c.mimeType,
    })),
  };
}
