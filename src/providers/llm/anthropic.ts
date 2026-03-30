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

      // Prefill assistant with "{" to force JSON output
      const msgs = opts.json ? [...messages, { role: "assistant", content: "{" }] : messages;
      const body: Record<string, unknown> = {
        model,
        max_tokens: opts.maxTokens || 1024,
        messages: msgs,
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
      const text = data.content[0].text;
      return opts.json ? `{${text}` : text;
    },
  };
}

registerLLM("anthropic", createAnthropicLLM);
