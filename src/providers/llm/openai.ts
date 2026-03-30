import { type LLMProvider, registerLLM } from "./types.ts";

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

      const body: Record<string, unknown> = {
        model,
        messages: opts.system ? [{ role: "system", content: opts.system }, ...messages] : messages,
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
