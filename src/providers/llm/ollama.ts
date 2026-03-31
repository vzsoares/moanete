import { type LLMProvider, type MessageContent, registerLLM } from "./types.ts";

interface OllamaMessage {
  role: string;
  content: string;
  images?: string[];
}

function toOllamaMessages(
  messages: Array<{ role: string; content: MessageContent }>,
): OllamaMessage[] {
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
    }
    // Multi-part content: extract text and images
    let text = "";
    const images: string[] = [];
    for (const part of m.content) {
      if (part.type === "text") text += part.text;
      else if (part.type === "image") images.push(part.data);
    }
    const msg: OllamaMessage = { role: m.role, content: text };
    if (images.length > 0) msg.images = images;
    return msg;
  });
}

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
      const ollamaMsgs = opts.system
        ? [{ role: "system", content: opts.system }, ...toOllamaMessages(messages)]
        : toOllamaMessages(messages);

      const payload: Record<string, unknown> = {
        model,
        messages: ollamaMsgs,
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
