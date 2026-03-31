/**
 * Analyzer tests — verify single-agent and multi-agent modes,
 * insight deduplication, category management, and JSON coercion.
 */
import { describe, expect, test } from "vitest";
import { Analyzer, toKey } from "../src/core/analyzer.ts";
import type { LLMProvider } from "../src/providers/llm/types.ts";

function mockLLM(response: string): LLMProvider {
  return {
    name: "mock",
    requiresKey: false,
    configure() {},
    async chat() {
      return response;
    },
  };
}

describe("Analyzer", () => {
  test("initializes with default categories", () => {
    const a = new Analyzer(mockLLM("{}"));
    expect(a.categories).toEqual(["Suggestions", "Key Points", "Action Items", "Questions"]);
    expect(a.keys).toEqual(["suggestions", "key_points", "action_items", "questions"]);
  });

  test("initializes with custom categories", () => {
    const a = new Analyzer(mockLLM("{}"), { categories: ["Bugs", "TODOs"] });
    expect(a.categories).toEqual(["Bugs", "TODOs"]);
    expect(a.keys).toEqual(["bugs", "todos"]);
  });

  test("feed() accumulates transcript text", () => {
    const a = new Analyzer(mockLLM("{}"));
    a.feed("[You] hello");
    a.feed("[Them] world");
    expect(a.transcript).toBe("[You] hello [Them] world");
  });

  test("seedInsights() merges without duplicates", () => {
    const a = new Analyzer(mockLLM("{}"));
    a.seedInsights({ suggestions: ["item1", "item2"] });
    a.seedInsights({ suggestions: ["item2", "item3"] });
    expect(a.insights.suggestions).toEqual(["item1", "item2", "item3"]);
  });

  test("updateCategories() resets insights", () => {
    const a = new Analyzer(mockLLM("{}"));
    a.seedInsights({ suggestions: ["old"] });
    a.updateCategories(["Bugs", "TODOs"]);
    expect(a.categories).toEqual(["Bugs", "TODOs"]);
    expect(a.insights).toEqual({ bugs: [], todos: [] });
  });

  test("insights getter returns a copy", () => {
    const a = new Analyzer(mockLLM("{}"));
    a.seedInsights({ suggestions: ["item1"] });
    const copy = a.insights;
    copy.suggestions!.push("should not appear");
    expect(a.insights.suggestions).toEqual(["item1"]);
  });

  test("single-agent mode parses multi-key JSON response", async () => {
    const response = JSON.stringify({
      suggestions: ["use TypeScript"],
      key_points: ["architecture discussion"],
      action_items: [],
      questions: ["when is the deadline?"],
    });

    const a = new Analyzer(mockLLM(response), { multiAgent: false });
    a.feed("some transcript text");

    // Trigger analysis manually
    await a.analyze();

    expect(a.insights.suggestions).toEqual(["use TypeScript"]);
    expect(a.insights.key_points).toEqual(["architecture discussion"]);
    expect(a.insights.action_items).toEqual([]);
    expect(a.insights.questions).toEqual(["when is the deadline?"]);
  });

  test("multi-agent mode parses per-category JSON response", async () => {
    // In multi-agent mode, each call returns { items: [...] }
    let callCount = 0;
    const llm: LLMProvider = {
      name: "multi-mock",
      requiresKey: false,
      configure() {},
      async chat() {
        callCount++;
        return JSON.stringify({ items: [`item from call ${callCount}`] });
      },
    };

    const a = new Analyzer(llm, { multiAgent: true, categories: ["A", "B"] });
    a.feed("text");

    await a.analyze();

    // Should have made 2 calls (one per category)
    expect(callCount).toBe(2);
    expect(a.insights.a!.length).toBe(1);
    expect(a.insights.b!.length).toBe(1);
  });

  test("coerces object items to strings", async () => {
    const response = JSON.stringify({
      items: [
        "plain string",
        { value: "from value" },
        { text: "from text" },
        { content: "from content" },
        { other: "from other" },
      ],
    });

    const a = new Analyzer(mockLLM(response), { multiAgent: true, categories: ["Test"] });
    a.feed("text");

    await a.analyze();

    expect(a.insights.test).toEqual([
      "plain string",
      "from value",
      "from text",
      "from content",
      "from other",
    ]);
  });

  test("onUpdate callback fires after analysis", async () => {
    const response = JSON.stringify({ items: ["new insight"] });
    const a = new Analyzer(mockLLM(response), { multiAgent: true, categories: ["Test"] });
    a.feed("text");

    let updated = false;
    a.onUpdate = () => {
      updated = true;
    };

    await a.analyze();
    expect(updated).toBe(true);
  });

  test("handles LLM errors gracefully", async () => {
    const llm: LLMProvider = {
      name: "error-mock",
      requiresKey: false,
      configure() {},
      async chat() {
        throw new Error("API down");
      },
    };

    const a = new Analyzer(llm, { multiAgent: false });
    a.feed("text");

    // Should not throw
    await a.analyze();
    expect(a.lastError).toBe("API down");
  });
});

describe("toKey", () => {
  test("converts various formats", () => {
    expect(toKey("Key Points")).toBe("key_points");
    expect(toKey("Action Items")).toBe("action_items");
    expect(toKey("Q&A")).toBe("q_a");
    expect(toKey("TODOs")).toBe("todos");
    expect(toKey("  Leading Spaces  ")).toBe("leading_spaces");
  });
});
