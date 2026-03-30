#!/usr/bin/env bun
/**
 * MCP server for moanete — exposes live session data to AI assistants.
 *
 * Runs as stdio MCP server (for Claude Code) + WebSocket server on :3001
 * that receives state pushes from the browser app.
 *
 * Usage: bun src/mcp/server.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { type TranscriptLine, getState, startBridge } from "./bridge.ts";

function formatTranscript(lines: TranscriptLine[]): string {
  return lines.map((l) => `${l.source === "mic" ? "You" : "Them"}: ${l.text}`).join("\n");
}

function formatInsights(insights: Record<string, string[]>): string {
  const parts: string[] = [];
  for (const [key, items] of Object.entries(insights)) {
    if (items.length > 0) {
      parts.push(`## ${key}\n${items.map((i) => `- ${i}`).join("\n")}`);
    }
  }
  return parts.join("\n\n") || "No insights yet.";
}

const server = new McpServer({
  name: "moanete",
  version: "0.1.0",
});

// --- Tools ---

server.tool("get_transcript", "Get the current meeting transcript", {}, () => {
  const state = getState();
  const text = state.transcript.length
    ? formatTranscript(state.transcript)
    : "No transcript yet — session may not be running.";
  return { content: [{ type: "text" as const, text }] };
});

server.tool("get_insights", "Get current meeting insights", {}, () => {
  const state = getState();
  return { content: [{ type: "text" as const, text: formatInsights(state.insights) }] };
});

server.tool("get_summary", "Get the meeting summary (if generated)", {}, () => {
  const state = getState();
  return {
    content: [{ type: "text" as const, text: state.summary || "No summary generated yet." }],
  };
});

server.tool(
  "ask_question",
  "Get meeting context to answer a question",
  { question: z.string().describe("The question to answer about the meeting") },
  ({ question }) => {
    const state = getState();
    const context = [
      `Meeting transcript:\n${formatTranscript(state.transcript)}`,
      `\nInsights:\n${formatInsights(state.insights)}`,
      `\nSummary: ${state.summary || "Not yet generated"}`,
    ].join("\n");
    return {
      content: [{ type: "text" as const, text: `Context for "${question}":\n\n${context}` }],
    };
  },
);

// --- Resources ---

server.resource(
  "transcript",
  "moanete://transcript",
  { description: "Live meeting transcript" },
  () => {
    const state = getState();
    const text = formatTranscript(state.transcript) || "No transcript yet.";
    return { contents: [{ uri: "moanete://transcript", text }] };
  },
);

server.resource(
  "insights",
  "moanete://insights",
  { description: "Current meeting insights" },
  () => {
    const state = getState();
    return {
      contents: [{ uri: "moanete://insights", text: JSON.stringify(state.insights, null, 2) }],
    };
  },
);

server.resource("status", "moanete://status", { description: "Session status" }, () => {
  const state = getState();
  const info = {
    running: state.running,
    transcriptLines: state.transcript.length,
    insightCategories: Object.keys(state.insights),
    hasSummary: !!state.summary,
    lastUpdate: state.lastUpdate ? new Date(state.lastUpdate).toISOString() : null,
  };
  return { contents: [{ uri: "moanete://status", text: JSON.stringify(info, null, 2) }] };
});

// --- Start ---

async function main() {
  startBridge();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp] moanete MCP server running (stdio + ws://localhost:3001)");
}

main();
