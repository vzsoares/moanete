import { type LLMProvider, type MessageContent, registerLLM } from "./types.ts";

type OpenAIContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

function toOpenAIContent(content: MessageContent): OpenAIContent {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return { type: "text" as const, text: part.text };
    return {
      type: "image_url" as const,
      image_url: { url: `data:${part.mediaType};base64,${part.data}` },
    };
  });
}

function createOpenAILLM(): LLMProvider {
  let apiKey = "";
  let model = "gpt-4o-mini";
  let baseUrl = "https://api.openai.com/v1";

  return {
    name: "OpenAI",
    requiresKey: true,

    configure(config) {
      apiKey = config.apiKey || "";
      model = config.model || model;
      baseUrl = config.baseUrl || baseUrl;
    },

    async chat(messages, opts = {}) {
      if (!apiKey) throw new Error("OpenAI API key not configured");

      const openaiMsgs = messages.map((m) => ({
        role: m.role,
        content: toOpenAIContent(m.content),
      }));

      const body: Record<string, unknown> = {
        model,
        messages: opts.system
          ? [{ role: "system", content: opts.system }, ...openaiMsgs]
          : openaiMsgs,
        max_tokens: opts.maxTokens || 1024,
      };
      if (opts.json) body.response_format = { type: "json_object" };

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`OpenAI error (${res.status}): ${await res.text()}`);
      }

      const data = await res.json();
      return data.choices[0].message.content;
    },
  };
}

registerLLM("openai", createOpenAILLM);
