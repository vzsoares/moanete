export interface STTProvider {
  name: string;
  requiresKey: boolean;
  configure(config: Record<string, string>): void;
  start(onTranscript: (text: string) => void): void;
  stop(): void;
  feedAudio(chunk: Float32Array): void;
}

export const sttRegistry = new Map<string, () => STTProvider>();

export function registerSTT(id: string, factory: () => STTProvider): void {
  sttRegistry.set(id, factory);
}

export function createSTT(id: string): STTProvider {
  const factory = sttRegistry.get(id);
  if (!factory) throw new Error(`Unknown STT provider: ${id}`);
  return factory();
}
