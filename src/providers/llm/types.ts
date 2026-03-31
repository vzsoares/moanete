export interface ImageContent {
  type: "image";
  /** Base64-encoded image data (no data: prefix) */
  data: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
}

export interface TextContent {
  type: "text";
  text: string;
}

export type MessageContent = string | Array<TextContent | ImageContent>;

export interface ChatMessage {
  role: string;
  content: MessageContent;
}

export interface ChatOptions {
  system?: string;
  maxTokens?: number;
  json?: boolean;
}

export interface LLMProvider {
  name: string;
  requiresKey: boolean;
  configure(config: Record<string, string | undefined>): void;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
}

export const llmRegistry = new Map<string, () => LLMProvider>();

export function registerLLM(id: string, factory: () => LLMProvider): void {
  llmRegistry.set(id, factory);
}

export function createLLM(id: string): LLMProvider {
  const factory = llmRegistry.get(id);
  if (!factory) throw new Error(`Unknown LLM provider: ${id}`);
  return factory();
}
