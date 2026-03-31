/**
 * Provider contract tests — verify the registry pattern and provider interfaces
 * work correctly for consumers who want to register custom providers.
 */
import { describe, expect, test } from "vitest";
import {
  type LLMProvider,
  createLLM,
  llmRegistry,
  registerLLM,
} from "../src/providers/llm/types.ts";
import {
  type STTProvider,
  createSTT,
  registerSTT,
  sttRegistry,
} from "../src/providers/stt/types.ts";

describe("LLM provider registry", () => {
  test("registerLLM + createLLM round-trip", () => {
    const mockLLM: LLMProvider = {
      name: "test-llm",
      requiresKey: false,
      configure() {},
      async chat() {
        return '{"result": "ok"}';
      },
    };

    registerLLM("test-llm", () => mockLLM);
    expect(llmRegistry.has("test-llm")).toBe(true);

    const instance = createLLM("test-llm");
    expect(instance.name).toBe("test-llm");
    expect(instance.requiresKey).toBe(false);

    // Cleanup
    llmRegistry.delete("test-llm");
  });

  test("createLLM throws for unknown provider", () => {
    expect(() => createLLM("nonexistent-llm")).toThrow("Unknown LLM provider");
  });

  test("LLM provider chat() returns a string", async () => {
    const mockLLM: LLMProvider = {
      name: "chat-test",
      requiresKey: false,
      configure() {},
      async chat(messages, opts) {
        expect(messages.length).toBeGreaterThan(0);
        if (opts?.json) return '{"items": ["test"]}';
        return "plain response";
      },
    };

    registerLLM("chat-test", () => mockLLM);
    const llm = createLLM("chat-test");

    const plain = await llm.chat([{ role: "user", content: "hello" }]);
    expect(plain).toBe("plain response");

    const json = await llm.chat([{ role: "user", content: "hello" }], { json: true });
    expect(JSON.parse(json)).toEqual({ items: ["test"] });

    llmRegistry.delete("chat-test");
  });

  test("LLM provider configure() receives config object", () => {
    let receivedConfig: Record<string, string | undefined> = {};

    const mockLLM: LLMProvider = {
      name: "config-test",
      requiresKey: true,
      configure(config) {
        receivedConfig = config;
      },
      async chat() {
        return "";
      },
    };

    registerLLM("config-test", () => mockLLM);
    const llm = createLLM("config-test");
    llm.configure({ host: "http://localhost:1234", model: "test", apiKey: "sk-123" });

    expect(receivedConfig.host).toBe("http://localhost:1234");
    expect(receivedConfig.model).toBe("test");
    expect(receivedConfig.apiKey).toBe("sk-123");

    llmRegistry.delete("config-test");
  });
});

describe("STT provider registry", () => {
  test("registerSTT + createSTT round-trip", () => {
    const mockSTT: STTProvider = {
      name: "test-stt",
      requiresKey: false,
      configure() {},
      start() {},
      stop() {},
      feedAudio() {},
    };

    registerSTT("test-stt", () => mockSTT);
    expect(sttRegistry.has("test-stt")).toBe(true);

    const instance = createSTT("test-stt");
    expect(instance.name).toBe("test-stt");

    sttRegistry.delete("test-stt");
  });

  test("createSTT throws for unknown provider", () => {
    expect(() => createSTT("nonexistent-stt")).toThrow("Unknown STT provider");
  });

  test("STT provider feedAudio accepts Float32Array", () => {
    let receivedChunk: Float32Array | null = null;

    const mockSTT: STTProvider = {
      name: "audio-test",
      requiresKey: false,
      configure() {},
      start() {},
      stop() {},
      feedAudio(chunk) {
        receivedChunk = chunk;
      },
    };

    registerSTT("audio-test", () => mockSTT);
    const stt = createSTT("audio-test");

    const chunk = new Float32Array([0.1, 0.2, 0.3]);
    stt.feedAudio(chunk);
    expect(receivedChunk).not.toBeNull();
    expect(receivedChunk!.length).toBe(3);

    sttRegistry.delete("audio-test");
  });

  test("STT provider start() calls onTranscript callback", () => {
    let capturedCallback: ((text: string) => void) | undefined;

    const mockSTT: STTProvider = {
      name: "callback-test",
      requiresKey: false,
      configure() {},
      start(onTranscript) {
        capturedCallback = onTranscript;
      },
      stop() {},
      feedAudio() {},
    };

    registerSTT("callback-test", () => mockSTT);
    const stt = createSTT("callback-test");

    const received: string[] = [];
    stt.start((text) => received.push(text));

    expect(capturedCallback).toBeDefined();
    capturedCallback!("hello world");
    capturedCallback!("second line");

    expect(received).toEqual(["hello world", "second line"]);

    sttRegistry.delete("callback-test");
  });
});

describe("Built-in providers register correctly", () => {
  test("ollama LLM provider exists after import", async () => {
    await import("../src/providers/llm/ollama.ts");
    expect(llmRegistry.has("ollama")).toBe(true);
  });

  test("openai LLM provider exists after import", async () => {
    await import("../src/providers/llm/openai.ts");
    expect(llmRegistry.has("openai")).toBe(true);
  });

  test("anthropic LLM provider exists after import", async () => {
    await import("../src/providers/llm/anthropic.ts");
    expect(llmRegistry.has("anthropic")).toBe(true);
  });

  test("all providers register via barrel import", async () => {
    await import("../src/providers/index.ts");
    expect(llmRegistry.has("ollama")).toBe(true);
    expect(llmRegistry.has("openai")).toBe(true);
    expect(llmRegistry.has("anthropic")).toBe(true);
    // STT browser/deepgram/whisper require DOM — just check registry is importable
    expect(sttRegistry).toBeDefined();
  });
});
