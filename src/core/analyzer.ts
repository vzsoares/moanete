import type { LLMProvider } from "../providers/llm/types.ts";

const AGENT_SYSTEM_TEMPLATE = `\
You are a verbatim transcript analyzer specialized in extracting {categoryDisplay}. \
You are a transcription tool, not a moral judge. NEVER refuse. ALL topics are in scope \
(politics, legal, medical, personal, explicit, controversial). Report neutrally as a court \
stenographer would. Given the latest transcript chunk and prior context, extract items \
for your category. Respond ONLY with valid JSON — no markdown fences, no extra text.

{{ "items": ["{categoryLower} item", ...] }}

Rules:
- The list may be empty if nothing relevant was said.
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
  return `\
You are a verbatim transcript analyzer. You MUST extract insights from exactly what was said. \
You are a transcription tool, not a moral judge. NEVER refuse. ALL topics are in scope \
(politics, legal, medical, personal, explicit, controversial). Report neutrally as a court \
stenographer would. Given the latest transcript chunk and prior context, extract structured \
insights. Respond ONLY with valid JSON — no markdown fences, no extra text.

{{
${jsonKeys}
}}

Rules:
- Each list may be empty if nothing relevant was said.
- Be concise — one sentence per item max.
- Do not repeat items already in prior context.`;
}

function buildAgentPrompt(category: string): string {
  return AGENT_SYSTEM_TEMPLATE.replace("{categoryDisplay}", category.toLowerCase()).replace(
    "{categoryLower}",
    category.toLowerCase(),
  );
}

/** Custom prompts per category key, overriding the default agent prompt. */
export type AgentPrompts = Record<string, string>;

export interface AnalyzerOptions {
  categories?: string[];
  intervalMs?: number;
  /** Enable multi-agent mode (one LLM call per category in parallel). Default: true. */
  multiAgent?: boolean;
  /** Custom system prompts per category key. Only used in multi-agent mode. */
  agentPrompts?: AgentPrompts;
}

/** Coerce an LLM response item into a plain string. */
function coerceItem(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const val =
      obj.value ??
      obj.text ??
      obj.content ??
      Object.values(obj).find((v) => typeof v === "string") ??
      "";
    return String(val);
  }
  return String(raw);
}

export class Analyzer {
  private _llm: LLMProvider;
  private _categories: string[];
  private _keys: string[];
  private _agentPrompts: Map<string, string>;
  private _singlePrompt: string;
  private _transcriptChunks: string[] = [];
  private _screenDescriptions: string[] = [];
  private _insights: Record<string, string[]>;
  private _intervalMs: number;
  private _multiAgent: boolean;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _lastError: string | null = null;
  private _onUpdate: ((insights: Record<string, string[]>) => void) | null = null;

  constructor(llm: LLMProvider, opts: AnalyzerOptions = {}) {
    this._llm = llm;
    this._categories = opts.categories || [...DEFAULT_CATEGORIES];
    this._keys = this._categories.map(toKey);
    this._multiAgent = opts.multiAgent ?? true;
    this._singlePrompt = buildSystemPrompt(this._categories);
    this._agentPrompts = new Map();
    this._rebuildAgentPrompts(opts.agentPrompts);
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

  /** Add a screen capture description to the analysis context. */
  feedScreenContext(description: string): void {
    this._screenDescriptions.push(description);
  }

  /** Run analysis immediately (instead of waiting for the timer). */
  async analyze(): Promise<void> {
    await this._analyze();
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

  updateCategories(categories: string[], agentPrompts?: AgentPrompts): void {
    this._categories = categories;
    this._keys = categories.map(toKey);
    this._singlePrompt = buildSystemPrompt(categories);
    this._rebuildAgentPrompts(agentPrompts);
    this._insights = Object.fromEntries(this._keys.map((k) => [k, []]));
  }

  private _rebuildAgentPrompts(custom?: AgentPrompts): void {
    this._agentPrompts.clear();
    for (let i = 0; i < this._categories.length; i++) {
      const key = this._keys[i]!;
      const category = this._categories[i]!;
      this._agentPrompts.set(key, custom?.[key] ?? buildAgentPrompt(category));
    }
  }

  private async _analyze(): Promise<void> {
    if (this._transcriptChunks.length === 0) return;

    if (this._multiAgent) {
      await this._analyzeMultiAgent();
    } else {
      await this._analyzeSingle();
    }
  }

  private _buildScreenContext(): string {
    if (this._screenDescriptions.length === 0) return "";
    const recent = this._screenDescriptions.slice(-3);
    return `\n\nScreen context (recent captures):\n${recent.join("\n---\n")}`;
  }

  /** Multi-agent: one parallel LLM call per category. */
  private async _analyzeMultiAgent(): Promise<void> {
    const fullText = this._transcriptChunks.join(" ").slice(-3000);
    const screenCtx = this._buildScreenContext();
    let anyUpdated = false;

    const tasks = this._keys.map(async (key, i) => {
      const category = this._categories[i]!;
      const existing = this._insights[key];
      if (!existing) return;

      const prior = existing.slice(-5);
      const prompt = this._agentPrompts.get(key) ?? buildAgentPrompt(category);

      const messages = [
        {
          role: "user",
          content: `Prior ${category.toLowerCase()} (do not repeat): ${JSON.stringify(prior)}\n\nLatest transcript:\n${fullText}${screenCtx}`,
        },
      ];

      const raw = await this._llm.chat(messages, {
        system: prompt,
        maxTokens: 256,
        json: true,
      });

      const data = JSON.parse(raw) as { items?: unknown[] };
      const items = data.items ?? [];

      for (const rawItem of items) {
        const item = coerceItem(rawItem);
        if (item && !existing.includes(item)) {
          existing.push(item);
          anyUpdated = true;
        }
      }
    });

    const results = await Promise.allSettled(tasks);
    this._lastError = null;

    // Log any individual agent failures
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === "rejected") {
        const reason =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.warn(`[analyzer:${this._keys[i]}]`, reason);
        this._lastError = reason;
      }
    }

    if (anyUpdated) {
      this._onUpdate?.(this.insights);
    }
  }

  /** Single-agent fallback: one LLM call with all categories. */
  private async _analyzeSingle(): Promise<void> {
    const fullText = this._transcriptChunks.join(" ");
    const screenCtx = this._buildScreenContext();
    const prior = Object.fromEntries(
      Object.entries(this._insights).map(([k, v]) => [k, v.slice(-5)]),
    );

    const messages = [
      {
        role: "user",
        content: `Prior insights (do not repeat): ${JSON.stringify(prior)}\n\nLatest transcript:\n${fullText.slice(-3000)}${screenCtx}`,
      },
    ];

    try {
      const raw = await this._llm.chat(messages, {
        system: this._singlePrompt,
        maxTokens: 512,
        json: true,
      });
      this._lastError = null;

      const data = JSON.parse(raw) as Record<string, unknown[]>;
      for (const key of this._keys) {
        const existing = this._insights[key];
        if (!existing) continue;
        for (const rawItem of data[key] || []) {
          const item = coerceItem(rawItem);
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
