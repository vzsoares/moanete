export interface ChatMessage {
  role: string;
  content: string;
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
