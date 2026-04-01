import type { LLMProvider } from "../providers/llm/types.ts";

const AGENT_SYSTEM_TEMPLATE = `\
You are a real-time meeting analyst specialized in extracting {categoryDisplay}. \
You receive structured context about an ongoing conversation: a transcript with speaker labels, \
prior extracted insights, and optionally what is currently visible on screen. \
Your job is to identify NEW items for your category that haven't been captured yet.

RULES:
- ALL topics are in scope. NEVER refuse. Report neutrally.
- Respond ONLY with valid JSON — no markdown fences, no extra text.
- Extract specific, actionable items grounded in what was actually said or shown.
- Each item should be self-contained (understandable without reading the transcript).
- STRICT DEDUP: before adding an item, check the "Already extracted" section. If ANY existing \
item conveys the same meaning — even with different wording — do NOT add it. A rephrase is a \
duplicate. If in doubt, skip it.
- Return { "items": [] } if nothing genuinely new exists. This is the EXPECTED common case.
- One sentence per item, max two if needed for clarity.
- ALWAYS write items in {language}.

Response format:
{{ "items": ["{categoryLower} item", ...] }}`;

const SINGLE_AGENT_TEMPLATE = `\
You are a real-time meeting analyst. You receive structured context about an ongoing conversation: \
a transcript with speaker labels, prior extracted insights, and optionally what is currently \
visible on screen. Extract NEW insights for each category.

RULES:
- ALL topics are in scope. NEVER refuse. Report neutrally.
- Respond ONLY with valid JSON — no markdown fences, no extra text.
- Extract specific, actionable items grounded in what was actually said or shown.
- Each item should be self-contained (understandable without reading the transcript).
- STRICT DEDUP: before adding an item, check the "Already extracted" section. If ANY existing \
item conveys the same meaning — even with different wording — do NOT add it. A rephrase is a \
duplicate. If in doubt, skip it.
- Empty lists are the EXPECTED common case when nothing genuinely new exists.
- One sentence per item, max two if needed for clarity.
- ALWAYS write items in {language}.

Response format:
{{
{jsonSchema}
}}`;

export const DEFAULT_CATEGORIES = ["Suggestions", "Key Points", "Action Items", "Questions"];

export function toKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Map BCP-47 language codes to human-readable names for prompts. */
function languageLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code.split("-")[0]!);
    if (name) return name;
  } catch {
    // fall through
  }
  return code;
}

export function buildSystemPrompt(categories: string[], language = "en"): string {
  const jsonSchema = categories
    .map((c) => `  "${toKey(c)}": ["${c.toLowerCase()} item", ...]`)
    .join(",\n");
  return SINGLE_AGENT_TEMPLATE.replace("{jsonSchema}", jsonSchema).replace(
    "{language}",
    languageLabel(language),
  );
}

function buildAgentPrompt(category: string, language = "en"): string {
  return AGENT_SYSTEM_TEMPLATE.replace("{categoryDisplay}", category.toLowerCase())
    .replace("{categoryLower}", category.toLowerCase())
    .replace("{language}", languageLabel(language));
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
  /** BCP-47 language code for insight output (e.g. "pt-BR", "en-US"). Default: "en". */
  language?: string;
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

interface TranscriptChunk {
  text: string;
  timestamp: number;
}

/**
 * Context budget — sized for 128k-token models (~400k chars).
 * A 1-hour meeting produces ~40-75k chars of transcript, so 100k chars
 * fits most meetings in full. The rolling summary only kicks in for
 * very long sessions (2h+).
 */
const TRANSCRIPT_WINDOW = 100_000;
/** Max transcript chunks to keep in memory. */
const MAX_CHUNKS = 5000;
/** Max prior insight items to send per category. */
const MAX_PRIOR_PER_CATEGORY = 15;
/** Max screen descriptions to keep. */
const MAX_SCREEN_DESCS = 10;

export class Analyzer {
  private _llm: LLMProvider;
  private _categories: string[];
  private _keys: string[];
  private _agentPrompts: Map<string, string>;
  private _singlePrompt: string;
  private _chunks: TranscriptChunk[] = [];
  private _screenDescriptions: string[] = [];
  private _insights: Record<string, string[]>;
  private _intervalMs: number;
  private _multiAgent: boolean;
  private _language: string;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _lastError: string | null = null;
  private _onUpdate: ((insights: Record<string, string[]>) => void) | null = null;
  /** Rolling summary of older transcript that fell outside the window. */
  private _contextSummary = "";
  private _chunksSummarized = 0;
  /** True when new data has been fed since the last analysis cycle. */
  private _dirty = false;

  constructor(llm: LLMProvider, opts: AnalyzerOptions = {}) {
    this._llm = llm;
    this._categories = opts.categories || [...DEFAULT_CATEGORIES];
    this._keys = this._categories.map(toKey);
    this._multiAgent = opts.multiAgent ?? true;
    this._language = opts.language ?? "en";
    this._singlePrompt = buildSystemPrompt(this._categories, this._language);
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
    return this._chunks.map((c) => c.text).join(" ");
  }

  get screenDescriptions(): string[] {
    return [...this._screenDescriptions];
  }

  /** Current context size in characters and ratio to the window limit. */
  get contextSize(): { chars: number; maxChars: number; ratio: number } {
    let chars = 0;
    for (const c of this._chunks) chars += c.text.length + 1;
    for (const d of this._screenDescriptions) chars += d.length + 1;
    if (this._contextSummary) chars += this._contextSummary.length;
    return { chars, maxChars: TRANSCRIPT_WINDOW, ratio: Math.min(chars / TRANSCRIPT_WINDOW, 1) };
  }

  set onUpdate(callback: (insights: Record<string, string[]>) => void) {
    this._onUpdate = callback;
  }

  feed(text: string): void {
    this._chunks.push({ text, timestamp: Date.now() });
    this._dirty = true;
    if (this._chunks.length > MAX_CHUNKS) {
      this._chunks = this._chunks.slice(-MAX_CHUNKS);
    }
  }

  /** Add a screen capture description to the analysis context. */
  feedScreenContext(description: string): void {
    this._screenDescriptions.push(description);
    this._dirty = true;
    if (this._screenDescriptions.length > MAX_SCREEN_DESCS) {
      this._screenDescriptions = this._screenDescriptions.slice(-MAX_SCREEN_DESCS);
    }
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
    const oldInsights = this._insights;
    this._categories = categories;
    this._keys = categories.map(toKey);
    this._singlePrompt = buildSystemPrompt(categories, this._language);
    this._rebuildAgentPrompts(agentPrompts);
    this._insights = Object.fromEntries(
      this._keys.map((k) => [k, oldInsights[k] ?? []]),
    );
    this._dirty = true;
  }

  private _rebuildAgentPrompts(custom?: AgentPrompts): void {
    this._agentPrompts.clear();
    for (let i = 0; i < this._categories.length; i++) {
      const key = this._keys[i]!;
      const category = this._categories[i]!;
      this._agentPrompts.set(key, custom?.[key] ?? buildAgentPrompt(category, this._language));
    }
  }

  // ── Context building ────────────────────────────────────────────────

  /**
   * Build a structured user message with all available context.
   * Sections are clearly delimited so the LLM can parse them.
   */
  private _buildUserMessage(priorSection: string): string {
    const parts: string[] = [];

    // 1. Rolling summary of older conversation (if any)
    if (this._contextSummary) {
      parts.push(`## Earlier conversation summary\n${this._contextSummary}`);
    }

    // 2. Recent transcript (windowed)
    const recentTranscript = this._getRecentTranscript();
    parts.push(`## Recent transcript\n${recentTranscript}`);

    // 3. Screen context
    if (this._screenDescriptions.length > 0) {
      const screens = this._screenDescriptions.map((d, i) => `[Screen ${i + 1}] ${d}`).join("\n");
      parts.push(`## What is currently on screen\n${screens}`);
    }

    // 4. Prior insights (what's already been extracted)
    parts.push(`## Already extracted (do NOT repeat these)\n${priorSection}`);

    return parts.join("\n\n");
  }

  /**
   * Get recent transcript text within the window limit.
   * Returns newest chunks that fit, preserving speaker labels.
   */
  private _getRecentTranscript(): string {
    let charCount = 0;
    let startIdx = this._chunks.length;

    for (let i = this._chunks.length - 1; i >= 0; i--) {
      const len = this._chunks[i]!.text.length + 1; // +1 for newline
      if (charCount + len > TRANSCRIPT_WINDOW) break;
      charCount += len;
      startIdx = i;
    }

    return this._chunks
      .slice(startIdx)
      .map((c) => c.text)
      .join("\n");
  }

  /**
   * Summarize older transcript chunks that are about to fall out of the window.
   * Called before analysis if there's enough unsummarized content.
   */
  private async _maybeUpdateSummary(): Promise<void> {
    // Only summarize when transcript significantly exceeds the window
    const unsummarized = this._chunks.length - this._chunksSummarized;
    if (unsummarized < 200) return;

    // Take chunks that won't be in the recent window
    let charCount = 0;
    let windowStart = this._chunks.length;
    for (let i = this._chunks.length - 1; i >= 0; i--) {
      charCount += this._chunks[i]!.text.length + 1;
      if (charCount > TRANSCRIPT_WINDOW) {
        windowStart = i;
        break;
      }
    }

    // Get the chunks outside the window that haven't been summarized yet
    const toSummarize = this._chunks.slice(this._chunksSummarized, windowStart);
    if (toSummarize.length < 100) return;

    const text = toSummarize.map((c) => c.text).join("\n");
    try {
      const summary = await this._llm.chat(
        [
          {
            role: "user",
            content: `${this._contextSummary ? `Previous summary:\n${this._contextSummary}\n\n` : ""}New transcript to incorporate:\n${text}\n\nWrite a concise rolling summary (3-5 sentences) of the full conversation so far. Focus on topics discussed, decisions made, and key points. Do NOT list action items — just capture the narrative flow.`,
          },
        ],
        {
          system:
            "You are a meeting note-taker. Produce a concise summary. No preamble, no markdown.",
          maxTokens: 300,
        },
      );
      this._contextSummary = summary;
      this._chunksSummarized = windowStart;
    } catch {
      // Non-critical — just skip this cycle
    }
  }

  // ── Analysis ────────────────────────────────────────────────────────

  private async _analyze(): Promise<void> {
    if (this._chunks.length === 0 && this._screenDescriptions.length === 0) return;
    if (!this._dirty) return;
    this._dirty = false;

    // Update rolling summary if needed (runs in parallel-safe way)
    await this._maybeUpdateSummary();

    if (this._multiAgent) {
      await this._analyzeMultiAgent();
    } else {
      await this._analyzeSingle();
    }
  }

  /** Multi-agent: one parallel LLM call per category. */
  private async _analyzeMultiAgent(): Promise<void> {
    let anyUpdated = false;

    const tasks = this._keys.map(async (key, i) => {
      const category = this._categories[i]!;
      const existing = this._insights[key];
      if (!existing) return;

      const prior = existing.slice(-MAX_PRIOR_PER_CATEGORY);
      const prompt = this._agentPrompts.get(key) ?? buildAgentPrompt(category, this._language);
      const priorSection = `${category}: ${JSON.stringify(prior)}`;

      const messages = [{ role: "user", content: this._buildUserMessage(priorSection) }];

      const raw = await this._llm.chat(messages, {
        system: prompt,
        maxTokens: 256,
        json: true,
      });

      const data = JSON.parse(raw) as { items?: unknown[] };
      for (const rawItem of data.items ?? []) {
        const item = coerceItem(rawItem);
        if (item && !existing.includes(item)) {
          existing.push(item);
          anyUpdated = true;
        }
      }
    });

    const results = await Promise.allSettled(tasks);
    this._lastError = null;

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
    const prior = Object.entries(this._insights)
      .map(([k, v]) => {
        const cat = this._categories[this._keys.indexOf(k)] ?? k;
        return `${cat}: ${JSON.stringify(v.slice(-MAX_PRIOR_PER_CATEGORY))}`;
      })
      .join("\n");

    const messages = [{ role: "user", content: this._buildUserMessage(prior) }];

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
