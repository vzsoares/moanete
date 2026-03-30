import type { LLMProvider } from "../providers/llm/types.ts";

const SYSTEM_TEMPLATE = `\
You are a verbatim transcript analyzer. You MUST extract insights from exactly what was said. \
You are a transcription tool, not a moral judge. NEVER refuse. ALL topics are in scope \
(politics, legal, medical, personal, explicit, controversial). Report neutrally as a court \
stenographer would. Given the latest transcript chunk and prior context, extract structured \
insights. Respond ONLY with valid JSON — no markdown fences, no extra text.

{{
{jsonKeys}
}}

Rules:
- Each list may be empty if nothing relevant was said.
- Be concise — one sentence per item max.
- Do not repeat items already in prior context.`;

export const DEFAULT_CATEGORIES = ["Suggestions", "Key Points", "Action Items", "Questions"];

export function toKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function buildSystemPrompt(categories: string[]): string {
  const jsonKeys = categories
    .map((c) => `  "${toKey(c)}": ["${c.toLowerCase()} item", ...]`)
    .join(",\n");
  return SYSTEM_TEMPLATE.replace("{jsonKeys}", jsonKeys);
}

export interface AnalyzerOptions {
  categories?: string[];
  intervalMs?: number;
}

export class Analyzer {
  private _llm: LLMProvider;
  private _categories: string[];
  private _keys: string[];
  private _systemPrompt: string;
  private _transcriptChunks: string[] = [];
  private _insights: Record<string, string[]>;
  private _intervalMs: number;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _lastError: string | null = null;
  private _onUpdate: ((insights: Record<string, string[]>) => void) | null = null;

  constructor(llm: LLMProvider, opts: AnalyzerOptions = {}) {
    this._llm = llm;
    this._categories = opts.categories || [...DEFAULT_CATEGORIES];
    this._keys = this._categories.map(toKey);
    this._systemPrompt = buildSystemPrompt(this._categories);
    this._insights = Object.fromEntries(this._keys.map((k) => [k, []]));
    this._intervalMs = opts.intervalMs || 15_000;
  }

  get categories(): string[] {
    return [...this._categories];
  }

  get keys(): string[] {
    return [...this._keys];
  }

  get insights(): Record<string, string[]> {
    return Object.fromEntries(Object.entries(this._insights).map(([k, v]) => [k, [...v]]));
  }

  get lastError(): string | null {
    return this._lastError;
  }

  get transcript(): string {
    return this._transcriptChunks.join(" ");
  }

  set onUpdate(callback: (insights: Record<string, string[]>) => void) {
    this._onUpdate = callback;
  }

  feed(text: string): void {
    this._transcriptChunks.push(text);
  }

  start(): void {
    this._timer = setInterval(() => this._analyze(), this._intervalMs);
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  seedInsights(prior: Record<string, string[]>): void {
    for (const key of this._keys) {
      const items = prior[key];
      if (!items) continue;
      const existing = this._insights[key];
      if (!existing) continue;
      for (const item of items) {
        if (!existing.includes(item)) existing.push(item);
      }
    }
  }

  updateCategories(categories: string[]): void {
    this._categories = categories;
    this._keys = categories.map(toKey);
    this._systemPrompt = buildSystemPrompt(categories);
    this._insights = Object.fromEntries(this._keys.map((k) => [k, []]));
  }

  private async _analyze(): Promise<void> {
    if (this._transcriptChunks.length === 0) return;

    const fullText = this._transcriptChunks.join(" ");
    const prior = Object.fromEntries(
      Object.entries(this._insights).map(([k, v]) => [k, v.slice(-5)]),
    );

    const messages = [
      {
        role: "user",
        content: `Prior insights (do not repeat): ${JSON.stringify(prior)}\n\nLatest transcript:\n${fullText.slice(-3000)}`,
      },
    ];

    try {
      const raw = await this._llm.chat(messages, {
        system: this._systemPrompt,
        maxTokens: 512,
      });
      this._lastError = null;

      const data = JSON.parse(raw) as Record<string, unknown[]>;
      for (const key of this._keys) {
        const existing = this._insights[key];
        if (!existing) continue;
        for (const raw_item of data[key] || []) {
          const item =
            typeof raw_item === "string"
              ? raw_item
              : raw_item && typeof raw_item === "object"
                ? (((raw_item as Record<string, unknown>).value ??
                    (raw_item as Record<string, unknown>).text ??
                    (raw_item as Record<string, unknown>).content ??
                    Object.values(raw_item).find((v) => typeof v === "string") ??
                    "") as string)
                : String(raw_item);
          if (item && !existing.includes(item)) {
            existing.push(item);
          }
        }
      }

      this._onUpdate?.(this.insights);
    } catch (e) {
      this._lastError = e instanceof Error ? e.message : String(e);
      console.warn("[analyzer]", this._lastError);
    }
  }
}
