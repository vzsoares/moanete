import { type LLMProvider, type MessageContent, registerLLM } from "./types.ts";

type AnthropicContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    >;

function toAnthropicContent(content: MessageContent): AnthropicContent {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return { type: "text" as const, text: part.text };
    return {
      type: "image" as const,
      source: { type: "base64" as const, media_type: part.mediaType, data: part.data },
    };
  });
}

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

      const anthropicMsgs = messages.map((m) => ({
        role: m.role,
        content: toAnthropicContent(m.content),
      }));

      // Prefill assistant with "{" to force JSON output
      const msgs = opts.json
        ? [...anthropicMsgs, { role: "assistant", content: "{" }]
        : anthropicMsgs;
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
