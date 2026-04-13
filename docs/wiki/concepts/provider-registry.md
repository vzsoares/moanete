---
title: Provider Registry
category: concept
updated: 2026-04-12
related: [audio-pipeline, overview, mcp]
---

# Provider Registry

Pluggable provider pattern for STT and LLM. New providers register via side-effect imports and are created by ID at runtime.

## How It Works

```typescript
// Registration (side-effect import in src/core/session.ts)
import "../providers/stt/browser.ts";  // registers "browser"
import "../providers/llm/ollama.ts";   // registers "ollama"

// Creation
const stt = createSTT("browser");    // returns BrowserSTT instance
const llm = createLLM("ollama");     // returns OllamaLLM instance
```

## STT Interface (`src/providers/stt/types.ts`)

```typescript
interface STTProvider {
  name: string;
  requiresKey: boolean;
  configure(config: Record<string, string>): void;
  start(onTranscript: (text: string) => void): void;
  stop(): void;
  feedAudio(chunk: Float32Array): void;
}
```

**Registered providers:**

| ID | Class | Key? | Audio feed? | Notes |
|----|-------|------|-------------|-------|
| `browser` | BrowserSTT | No | No | Uses `webkitSpeechRecognition`, mic only |
| `whisper` | WhisperSTT | No | Yes | Local server at `/whisper` |
| `openai-whisper` | OpenAIWhisperSTT | Yes | Yes | OpenAI Whisper API |
| `deepgram` | DeepgramSTT | Yes | Yes | WebSocket streaming |

## LLM Interface (`src/providers/llm/types.ts`)

```typescript
interface LLMProvider {
  name: string;
  requiresKey: boolean;
  configure(config: Record<string, string | undefined>): void;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
}

interface ChatOptions {
  system?: string;
  maxTokens?: number;
  json?: boolean;  // Forces JSON output mode
}
```

**Registered providers:**

| ID | Class | Key? | JSON mode | Vision |
|----|-------|------|-----------|--------|
| `ollama` | OllamaLLM | No | `format: "json"` | Via separate vision model |
| `openai` | OpenAILLM | Yes | `response_format: { type: "json_object" }` | Built-in |
| `anthropic` | AnthropicLLM | Yes | Assistant prefill with `{` | Built-in |

## Adding a New Provider

1. Create `src/providers/stt/my-provider.ts` (or `llm/`)
2. Implement the interface
3. Call `registerSTT("my-id", () => new MyProvider())` at module scope
4. Add the side-effect import in `src/core/session.ts`
5. Add an option to `mn-settings.ts` dropdown

## See Also

- [[audio-pipeline]] — how audio flows through STT providers
- [[mcp]] — MCP server/client (different extension mechanism)
- [[insights]] — how the LLM provider generates insights
