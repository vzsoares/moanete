export interface Config {
  sttProvider: string;
  llmProvider: string;
  ollamaHost: string;
  ollamaModel: string;
  openaiApiKey: string;
  openaiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  anthropicBaseUrl: string;
  deepgramApiKey: string;
  sttLanguage: string;
  insightTabs: string;
  analysisIntervalMs: number;
  captureMic: boolean;
  captureTab: boolean;
  theme: string;
}

export const DEFAULTS: Config = {
  sttProvider: "browser",
  llmProvider: "ollama",
  ollamaHost: "http://localhost:11434",
  ollamaModel: "llama3.2",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  anthropicApiKey: "",
  anthropicModel: "claude-sonnet-4-20250514",
  anthropicBaseUrl: "/api/anthropic",
  deepgramApiKey: "",
  sttLanguage: "en-US",
  insightTabs: "Suggestions,Key Points,Action Items,Questions",
  analysisIntervalMs: 15000,
  captureMic: true,
  captureTab: false,
  theme: "dark",
};

interface Storage {
  get(): Promise<Partial<Config>>;
  set(data: Partial<Config>): Promise<void>;
}

const storage: Storage =
  typeof chrome !== "undefined" && chrome.storage
    ? {
        async get() {
          return new Promise((resolve) =>
            chrome.storage.local.get(null, (items) => resolve(items as Partial<Config>)),
          );
        },
        async set(data) {
          return new Promise((resolve) => chrome.storage.local.set(data, resolve));
        },
      }
    : {
        async get() {
          const raw = localStorage.getItem("moanete-config");
          return raw ? (JSON.parse(raw) as Partial<Config>) : {};
        },
        async set(data) {
          const existing = JSON.parse(
            localStorage.getItem("moanete-config") || "{}",
          ) as Partial<Config>;
          localStorage.setItem("moanete-config", JSON.stringify({ ...existing, ...data }));
        },
      };

export async function loadConfig(): Promise<Config> {
  const saved = await storage.get();
  return { ...DEFAULTS, ...saved };
}

export async function saveConfig(partial: Partial<Config>): Promise<void> {
  await storage.set(partial);
}
