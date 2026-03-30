import { type LLMProvider, registerLLM } from "./types.ts";

function createAnthropicLLM(): LLMProvider {
  let apiKey = "";
  let model = "claude-sonnet-4-20250514";
  let baseUrl = "/api/anthropic";

  return {
    name: "Anthropic Claude",
    requiresKey: true,

    configure(config) {
      apiKey = config.apiKey || "";
      model = config.model || model;
      baseUrl = config.baseUrl || baseUrl;
    },

    async chat(messages, opts = {}) {
      if (!apiKey) throw new Error("Anthropic API key not configured");

      const body: Record<string, unknown> = {
        model,
        max_tokens: opts.maxTokens || 1024,
        messages,
      };
      if (opts.system) body.system = opts.system;

      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Anthropic error (${res.status}): ${await res.text()}`);
      }

      const data = await res.json();
      return data.content[0].text;
    },
  };
}

registerLLM("anthropic", createAnthropicLLM);
