export interface Config {
  sttProvider: string;
  llmProvider: string;
  ollamaHost: string;
  ollamaModel: string;
  ollamaVisionModel: string;
  openaiApiKey: string;
  openaiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  anthropicBaseUrl: string;
  deepgramApiKey: string;
  whisperHost: string;
  whisperModel: string;
  sttLanguage: string;
  insightTabs: string;
  analysisIntervalMs: number;
  multiAgent: boolean;
  agentPrompts: string;
  captureMic: boolean;
  captureTab: boolean;
  autoPip: boolean;
  customChatPrompt: string;
  theme: string;
}

export const DEFAULTS: Config = {
  sttProvider: "browser",
  llmProvider: "ollama",
  ollamaHost: "http://localhost:11434",
  ollamaModel: "llama3.2",
  ollamaVisionModel: "llava",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  anthropicApiKey: "",
  anthropicModel: "claude-sonnet-4-20250514",
  anthropicBaseUrl: "/api/anthropic",
  deepgramApiKey: "",
  whisperHost: "/whisper",
  whisperModel: "base",
  sttLanguage: "en-US",
  insightTabs: "Suggestions,Key Points,Action Items,Questions",
  analysisIntervalMs: 15000,
  multiAgent: true,
  agentPrompts: "",
  captureMic: true,
  captureTab: false,
  autoPip: true,
  customChatPrompt: "",
  theme: "dark",
};

const STORAGE_KEY = "moanete-config";

const storage = {
  get(): Partial<Config> {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Config>) : {};
  },
  set(data: Partial<Config>): void {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<Config>;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...data }));
  },
};

export function loadConfig(): Config {
  const saved = storage.get();
  return { ...DEFAULTS, ...saved };
}

export function saveConfig(partial: Partial<Config>): void {
  storage.set(partial);
}
