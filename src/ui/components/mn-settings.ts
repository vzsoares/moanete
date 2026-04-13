import type { Config } from "../../core/config.ts";
import { MoaneteElement } from "../base.ts";
import { escapeAttr } from "../util.ts";

const CODE_INTERVIEW_PROMPTS: Record<string, string> = {
  solution_approach: `You are a coding interview coach analyzing a live transcript. Extract the candidate's solution approach — algorithm choices, data structures mentioned, strategy reasoning, and any pivots in thinking. Respond ONLY with valid JSON.

{ "items": ["solution approach item", ...] }

Rules:
- Focus on HOW the candidate is solving the problem, not WHAT the problem is.
- Note when they consider alternatives or change approach.
- Be concise — one sentence per item max.
- Do not repeat items already in prior context.`,

  complexity_analysis: `You are a coding interview coach analyzing a live transcript. Extract any mentions of time/space complexity, performance trade-offs, scalability concerns, or Big-O analysis. Respond ONLY with valid JSON.

{ "items": ["complexity item", ...] }

Rules:
- Capture both correct and incorrect complexity claims (note which).
- Include trade-off discussions (e.g. "using a hash map trades O(n) space for O(1) lookup").
- Be concise — one sentence per item max.
- Do not repeat items already in prior context.`,

  edge_cases: `You are a coding interview coach analyzing a live transcript. Extract edge cases discussed, boundary conditions mentioned, error handling considerations, and any inputs that could break the solution. Respond ONLY with valid JSON.

{ "items": ["edge case item", ...] }

Rules:
- Include both edge cases the candidate identified AND ones they missed that are obvious from context.
- Note null/empty inputs, overflow, off-by-one, and concurrency concerns.
- Be concise — one sentence per item max.
- Do not repeat items already in prior context.`,

  code_suggestions: `You are a coding interview coach analyzing a live transcript. Suggest code improvements, cleaner patterns, missing optimizations, or alternative implementations based on what the candidate is discussing. Respond ONLY with valid JSON.

{ "items": ["suggestion item", ...] }

Rules:
- Be constructive — suggest specific improvements, not vague advice.
- Reference the candidate's actual code or pseudocode when possible.
- Include language-idiomatic suggestions when the language is known.
- Be concise — one sentence per item max.
- Do not repeat items already in prior context.`,
};

interface DynamicField {
  label: string;
  key: keyof Config;
  type?: string;
  placeholder?: string;
}

const STT_FIELDS: Record<string, DynamicField[]> = {
  whisper: [
    { label: "Whisper Server URL", key: "whisperHost", placeholder: "/whisper" },
    { label: "Whisper Model", key: "whisperModel", placeholder: "base" },
  ],
  "openai-whisper": [
    { label: "OpenAI API Key", key: "openaiApiKey", type: "password", placeholder: "sk-..." },
  ],
  deepgram: [
    { label: "Deepgram API Key", key: "deepgramApiKey", type: "password", placeholder: "dg_..." },
  ],
};

const LLM_FIELDS: Record<string, DynamicField[]> = {
  ollama: [
    { label: "Ollama Host", key: "ollamaHost", placeholder: "http://localhost:11434" },
    { label: "Model", key: "ollamaModel", placeholder: "llama3.2" },
    { label: "Vision Model (screen capture)", key: "ollamaVisionModel", placeholder: "llava" },
  ],
  openai: [
    { label: "API Key", key: "openaiApiKey", type: "password", placeholder: "sk-..." },
    { label: "Model", key: "openaiModel", placeholder: "gpt-4o-mini" },
  ],
  anthropic: [
    { label: "API Key", key: "anthropicApiKey", type: "password", placeholder: "sk-ant-..." },
    { label: "Model", key: "anthropicModel", placeholder: "claude-sonnet-4-20250514" },
    { label: "Base URL", key: "anthropicBaseUrl", placeholder: "/api/anthropic" },
  ],
};

const LANGUAGES = [
  ["en-US", "English (US)"],
  ["en-GB", "English (UK)"],
  ["pt-BR", "Portuguese (Brazil)"],
  ["pt-PT", "Portuguese (Portugal)"],
  ["es-ES", "Spanish (Spain)"],
  ["es-MX", "Spanish (Mexico)"],
  ["fr-FR", "French"],
  ["de-DE", "German"],
  ["it-IT", "Italian"],
  ["ja-JP", "Japanese"],
  ["ko-KR", "Korean"],
  ["zh-CN", "Chinese (Simplified)"],
  ["zh-TW", "Chinese (Traditional)"],
  ["ru-RU", "Russian"],
  ["ar-SA", "Arabic"],
  ["hi-IN", "Hindi"],
  ["nl-NL", "Dutch"],
  ["pl-PL", "Polish"],
  ["tr-TR", "Turkish"],
  ["uk-UA", "Ukrainian"],
];

export class MnSettings extends MoaneteElement {
  private _config: Config | null = null;

  set config(value: Config) {
    this._config = value;
    if (this.isConnected) this._loadValues();
  }

  open(): void {
    this.$<HTMLDialogElement>("dialog").showModal();
  }

  close(): void {
    this.$<HTMLDialogElement>("dialog").close();
  }

  render(): void {
    const langOpts = LANGUAGES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");

    this.innerHTML = `
    <dialog class="modal">
      <div class="modal-box max-w-md max-h-[85vh] flex flex-col bg-base-100 border border-base-content/[0.06]">
        <h3 class="text-[15px] font-semibold mb-5 text-base-content">Settings</h3>
        <div class="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">

          <!-- Audio — always visible, compact -->
          <section class="mb-3">
            <h4 class="mn-panel-header mb-2">Audio</h4>
            <div class="flex gap-5 flex-wrap">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" data-key="captureMic" class="checkbox checkbox-xs" />
                <span class="text-xs text-base-content/60">Microphone</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" data-key="captureTab" class="checkbox checkbox-xs" />
                <span class="text-xs text-base-content/60">Tab audio</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" data-key="autoPip" class="checkbox checkbox-xs" />
                <span class="text-xs text-base-content/60">Auto PiP</span>
              </label>
            </div>
          </section>

          <!-- Providers — grouped together -->
          <section class="mb-3">
            <h4 class="mn-panel-header mb-2">Providers</h4>
            <div class="flex flex-col gap-3">
              <div class="grid grid-cols-2 gap-3">
                <label class="flex flex-col gap-1">
                  <span class="text-[11px] text-base-content/40">STT Provider</span>
                  <select data-key="sttProvider" class="select select-sm bg-base-content/[0.04] border-base-content/[0.08] text-xs w-full">
                    <option value="browser">Browser (free)</option>
                    <option value="whisper">Whisper (local)</option>
                    <option value="openai-whisper">OpenAI Whisper</option>
                    <option value="deepgram">Deepgram</option>
                  </select>
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-[11px] text-base-content/40">Language</span>
                  <select data-key="sttLanguage" class="select select-sm bg-base-content/[0.04] border-base-content/[0.08] text-xs w-full">${langOpts}</select>
                </label>
              </div>
              <div class="stt-fields flex flex-col gap-2"></div>
              <label class="flex flex-col gap-1">
                <span class="text-[11px] text-base-content/40">LLM Provider</span>
                <select data-key="llmProvider" class="select select-sm bg-base-content/[0.04] border-base-content/[0.08] text-xs w-full">
                  <option value="ollama">Ollama (local)</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </label>
              <div class="llm-fields flex flex-col gap-2"></div>
            </div>
          </section>

          <!-- Insight presets — compact preset buttons -->
          <section class="mb-3">
            <h4 class="mn-panel-header mb-2">Insights</h4>
            <div class="flex flex-col gap-2">
              <input type="text" data-key="insightTabs" class="w-full bg-base-content/[0.04] border border-base-content/[0.08] rounded-md px-3 py-1.5 text-xs text-base-content outline-none focus:border-primary/40 placeholder:text-base-content/30" placeholder="Suggestions,Key Points,Action Items,Questions" />
              <div class="flex flex-wrap gap-1">
                <button class="px-2.5 py-1 text-[11px] rounded-md bg-base-content/[0.04] text-base-content/50 hover:text-base-content/80 hover:bg-base-content/[0.06] transition-colors cursor-pointer" data-preset="Suggestions,Key Points,Action Items,Questions">Meeting</button>
                <button class="px-2.5 py-1 text-[11px] rounded-md bg-base-content/[0.04] text-base-content/50 hover:text-base-content/80 hover:bg-base-content/[0.06] transition-colors cursor-pointer" data-preset="Solution Approach,Complexity Analysis,Edge Cases,Code Suggestions" data-has-prompts="code-interview">Code Interview</button>
                <button class="px-2.5 py-1 text-[11px] rounded-md bg-base-content/[0.04] text-base-content/50 hover:text-base-content/80 hover:bg-base-content/[0.06] transition-colors cursor-pointer" data-preset="Bugs,Design Decisions,TODOs,Questions">Pair Programming</button>
                <button class="px-2.5 py-1 text-[11px] rounded-md bg-base-content/[0.04] text-base-content/50 hover:text-base-content/80 hover:bg-base-content/[0.06] transition-colors cursor-pointer" data-preset="Key Concepts,Examples,Questions,References">Lecture</button>
              </div>
            </div>
          </section>

          <!-- Advanced — collapsed by default -->
          <details class="mb-3">
            <summary class="mn-panel-header cursor-pointer hover:text-base-content/60 transition-colors select-none">Advanced</summary>
            <div class="flex flex-col gap-3 mt-3">
              <div class="grid grid-cols-2 gap-3">
                <label class="flex flex-col gap-1">
                  <span class="text-[11px] text-base-content/40">Analysis interval (s)</span>
                  <input type="number" data-key="analysisIntervalMs" data-multiplier="1000" class="w-full bg-base-content/[0.04] border border-base-content/[0.08] rounded-md px-3 py-1.5 text-xs text-base-content outline-none focus:border-primary/40" min="5" max="120" step="5" />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-[11px] text-base-content/40">Auto-assist interval (s)</span>
                  <input type="number" data-key="autoAssistIntervalMs" data-multiplier="1000" class="w-full bg-base-content/[0.04] border border-base-content/[0.08] rounded-md px-3 py-1.5 text-xs text-base-content outline-none focus:border-primary/40" min="5" step="1" />
                </label>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" data-key="multiAgent" class="checkbox checkbox-xs" />
                <span class="text-xs text-base-content/60">Multi-agent (parallel analysis)</span>
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[11px] text-base-content/40">Agent prompts (JSON)</span>
                <textarea data-key="agentPrompts" class="w-full bg-base-content/[0.04] border border-base-content/[0.08] rounded-md px-3 py-1.5 text-xs text-base-content font-mono outline-none focus:border-primary/40 placeholder:text-base-content/30" rows="3" placeholder='{"key_points": "Custom prompt..."}'></textarea>
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[11px] text-base-content/40">Custom chat prompt</span>
                <textarea data-key="customChatPrompt" class="w-full bg-base-content/[0.04] border border-base-content/[0.08] rounded-md px-3 py-1.5 text-xs text-base-content font-mono outline-none focus:border-primary/40 placeholder:text-base-content/30" rows="3" placeholder="System prompt for Custom chat preset..."></textarea>
              </label>
            </div>
          </details>

        </div>
        <div class="flex items-center justify-end gap-2 pt-4 border-t border-base-content/[0.06]">
          <form method="dialog"><button class="btn btn-ghost btn-sm text-base-content/50">Cancel</button></form>
          <button class="settings-save btn btn-primary btn-sm">Save</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>
    `;

    // Preset buttons
    for (const btn of this.$$<HTMLButtonElement>("[data-preset]")) {
      btn.addEventListener("click", () => {
        const tabsInput = this.querySelector<HTMLInputElement>('[data-key="insightTabs"]');
        if (tabsInput) tabsInput.value = btn.dataset.preset || "";

        const promptsArea = this.querySelector<HTMLTextAreaElement>('[data-key="agentPrompts"]');
        if (promptsArea) {
          promptsArea.value =
            btn.dataset.hasPrompts === "code-interview"
              ? JSON.stringify(CODE_INTERVIEW_PROMPTS, null, 2)
              : "";
        }
      });
    }

    // Provider change → re-render fields
    this.querySelector<HTMLSelectElement>('[data-key="sttProvider"]')?.addEventListener(
      "change",
      () => {
        this._renderProviderFields(
          ".stt-fields",
          this.querySelector<HTMLSelectElement>('[data-key="sttProvider"]')!.value,
          STT_FIELDS,
        );
      },
    );
    this.querySelector<HTMLSelectElement>('[data-key="llmProvider"]')?.addEventListener(
      "change",
      () => {
        this._renderProviderFields(
          ".llm-fields",
          this.querySelector<HTMLSelectElement>('[data-key="llmProvider"]')!.value,
          LLM_FIELDS,
        );
      },
    );

    // Save
    this.$<HTMLButtonElement>(".settings-save").addEventListener("click", () => {
      this.emit("mn-settings-save", { config: this._collectValues() });
      this.close();
    });

    if (this._config) this._loadValues();
  }

  private _loadValues(): void {
    if (!this._config) return;
    const cfg = this._config;

    // Selects, text inputs, and textareas
    for (const el of this.$$<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>(
      "select[data-key], input[data-key], textarea[data-key]",
    )) {
      const key = el.dataset.key as keyof Config;
      const multiplier = Number(el.dataset.multiplier) || 0;
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        el.checked = Boolean(cfg[key]);
      } else if (multiplier) {
        el.value = String(Number(cfg[key]) / multiplier);
      } else {
        el.value = String(cfg[key] ?? "");
      }
    }

    this._renderProviderFields(".stt-fields", cfg.sttProvider, STT_FIELDS);
    this._renderProviderFields(".llm-fields", cfg.llmProvider, LLM_FIELDS);
  }

  private _collectValues(): Partial<Config> {
    const partial: Record<string, unknown> = {};

    for (const el of this.$$<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>(
      "select[data-key], input[data-key], textarea[data-key]",
    )) {
      const key = el.dataset.key;
      if (!key) continue;
      const multiplier = Number(el.dataset.multiplier) || 0;
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        partial[key] = el.checked;
      } else if (multiplier) {
        partial[key] = (Number(el.value) || 0) * multiplier;
      } else {
        partial[key] = el.value;
      }
    }

    // Collect dynamic provider fields
    for (const el of this.$$<HTMLInputElement>(
      ".stt-fields input[data-key], .llm-fields input[data-key]",
    )) {
      if (el.dataset.key) partial[el.dataset.key] = el.value;
    }

    return partial as Partial<Config>;
  }

  private _renderProviderFields(
    containerSel: string,
    provider: string,
    fieldMap: Record<string, DynamicField[]>,
  ): void {
    const container = this.querySelector<HTMLDivElement>(containerSel);
    if (!container) return;
    container.innerHTML = "";

    const fields = fieldMap[provider];
    if (!fields) return;

    for (const field of fields) {
      const inputType = field.type || "text";
      const value = this._config ? String(this._config[field.key] || "") : "";
      const el = document.createElement("label");
      el.className = "flex flex-col gap-1";
      el.innerHTML = `<span class="text-[11px] text-base-content/40">${field.label}</span><input type="${inputType}" class="w-full bg-base-content/[0.04] border border-base-content/[0.08] rounded-md px-3 py-1.5 text-xs text-base-content outline-none focus:border-primary/40 placeholder:text-base-content/30" data-key="${field.key}" placeholder="${field.placeholder || ""}" value="${escapeAttr(value)}" />`;
      container.appendChild(el);
    }
  }
}

customElements.define("mn-settings", MnSettings);
