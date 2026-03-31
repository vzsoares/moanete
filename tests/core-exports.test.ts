/**
 * Verify that all moanete/core exports are importable and have the expected shape.
 * These tests guarantee the public API surface won't accidentally break for consumers.
 */
import { describe, expect, test } from "vitest";
import {
  Analyzer,
  DEFAULTS,
  DEFAULT_CATEGORIES,
  Session,
  answerQuestion,
  buildSystemPrompt,
  connectBridge,
  deleteSession,
  disconnectBridge,
  exportSessionMarkdown,
  getSession,
  isBridgeConnected,
  listSessions,
  loadConfig,
  mcpCallTool,
  mcpConnect,
  mcpDisconnect,
  mcpListResources,
  mcpListServers,
  mcpListTools,
  mcpReadResource,
  pushInsights,
  pushReset,
  pushStatus,
  pushSummary,
  pushTranscript,
  saveConfig,
  saveSession,
  summarizeTranscript,
  toKey,
} from "../src/core/index.ts";

describe("moanete/core exports", () => {
  test("Analyzer class is exported and constructible", () => {
    expect(Analyzer).toBeDefined();
    expect(typeof Analyzer).toBe("function");
  });

  test("DEFAULT_CATEGORIES has expected defaults", () => {
    expect(DEFAULT_CATEGORIES).toEqual(["Suggestions", "Key Points", "Action Items", "Questions"]);
  });

  test("toKey converts category names to JSON keys", () => {
    expect(toKey("Key Points")).toBe("key_points");
    expect(toKey("Action Items")).toBe("action_items");
    expect(toKey("Q&A")).toBe("q_a");
  });

  test("buildSystemPrompt generates valid prompt with categories", () => {
    const prompt = buildSystemPrompt(["Bugs", "TODOs"]);
    expect(prompt).toContain("bugs");
    expect(prompt).toContain("todos");
    expect(prompt).toContain("JSON");
  });

  test("Session class is exported", () => {
    expect(Session).toBeDefined();
    expect(typeof Session).toBe("function");
  });

  test("Config functions are exported", () => {
    expect(typeof loadConfig).toBe("function");
    expect(typeof saveConfig).toBe("function");
    expect(DEFAULTS).toBeDefined();
    expect(DEFAULTS.sttProvider).toBe("browser");
    expect(DEFAULTS.llmProvider).toBe("ollama");
  });

  test("Storage functions are exported", () => {
    expect(typeof saveSession).toBe("function");
    expect(typeof listSessions).toBe("function");
    expect(typeof getSession).toBe("function");
    expect(typeof deleteSession).toBe("function");
    expect(typeof exportSessionMarkdown).toBe("function");
  });

  test("Summarizer functions are exported", () => {
    expect(typeof summarizeTranscript).toBe("function");
    expect(typeof answerQuestion).toBe("function");
  });

  test("MCP bridge functions are exported", () => {
    expect(typeof connectBridge).toBe("function");
    expect(typeof disconnectBridge).toBe("function");
    expect(typeof isBridgeConnected).toBe("function");
    expect(typeof pushTranscript).toBe("function");
    expect(typeof pushInsights).toBe("function");
    expect(typeof pushSummary).toBe("function");
    expect(typeof pushStatus).toBe("function");
    expect(typeof pushReset).toBe("function");
    expect(typeof mcpListServers).toBe("function");
    expect(typeof mcpListTools).toBe("function");
    expect(typeof mcpCallTool).toBe("function");
    expect(typeof mcpListResources).toBe("function");
    expect(typeof mcpReadResource).toBe("function");
    expect(typeof mcpConnect).toBe("function");
    expect(typeof mcpDisconnect).toBe("function");
  });
});
