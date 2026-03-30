import { type LLMProvider, registerLLM } from "./types.ts";

function createOllamaLLM(): LLMProvider {
  let host = "http://localhost:11434";
  let model = "llama3.2";

  return {
    name: "Ollama (local)",
    requiresKey: false,

    configure(config) {
      host = config.host || host;
      model = config.model || model;
    },

    async chat(messages, opts = {}) {
      const payload: Record<string, unknown> = {
        model,
        messages: opts.system ? [{ role: "system", content: opts.system }, ...messages] : messages,
        stream: false,
        options: { num_predict: opts.maxTokens || 1024 },
      };
      if (opts.json) payload.format = "json";

      const res = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Ollama error (${res.status}): ${await res.text()}`);
      }

      const data = await res.json();
      const content = data.message?.content;
      return typeof content === "string" ? content : JSON.stringify(content);
    },
  };
}

registerLLM("ollama", createOllamaLLM);
