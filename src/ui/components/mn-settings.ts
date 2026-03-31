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
  deepgram: [
    { label: "Deepgram API Key", key: "deepgramApiKey", type: "password", placeholder: "dg_..." },
  ],
};

const LLM_FIELDS: Record<string, DynamicField[]> = {
  ollama: [
    { label: "Ollama Host", key: "ollamaHost", placeholder: "http://localhost:11434" },
    { label: "Model", key: "ollamaModel", placeholder: "llama3.2" },
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
      <div class="modal-box max-w-lg max-h-[85vh] flex flex-col">
        <h3 class="text-lg font-bold mb-4">Settings</h3>
        <div class="flex-1 overflow-y-auto flex flex-col gap-5 pr-1">

          <section>
            <h4 class="text-xs font-semibold text-primary uppercase tracking-wide mb-2">Audio</h4>
            <div class="flex gap-4 flex-wrap">
              <label class="label cursor-pointer gap-2">
                <input type="checkbox" data-key="captureMic" class="checkbox checkbox-sm" />
                <span class="label-text text-xs">Microphone</span>
              </label>
              <label class="label cursor-pointer gap-2">
                <input type="checkbox" data-key="captureTab" class="checkbox checkbox-sm" />
                <span class="label-text text-xs">Tab / System Audio</span>
              </label>
            </div>
          </section>

          <section>
            <h4 class="text-xs font-semibold text-primary uppercase tracking-wide mb-2">Speech-to-Text</h4>
            <div class="flex flex-col gap-2">
              <label class="form-control w-full">
                <div class="label"><span class="label-text text-xs">Provider</span></div>
                <select data-key="sttProvider" class="select select-bordered select-sm w-full">
                  <option value="browser">Browser (free)</option>
                  <option value="whisper">Whisper (local)</option>
                  <option value="deepgram">Deepgram</option>
                </select>
              </label>
              <label class="form-control w-full">
                <div class="label"><span class="label-text text-xs">Language</span></div>
                <select data-key="sttLanguage" class="select select-bordered select-sm w-full">${langOpts}</select>
              </label>
              <div class="stt-fields flex flex-col gap-2"></div>
            </div>
          </section>

          <section>
            <h4 class="text-xs font-semibold text-primary uppercase tracking-wide mb-2">LLM</h4>
            <div class="flex flex-col gap-2">
              <label class="form-control w-full">
                <div class="label"><span class="label-text text-xs">Provider</span></div>
                <select data-key="llmProvider" class="select select-bordered select-sm w-full">
                  <option value="ollama">Ollama (local)</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </label>
              <div class="llm-fields flex flex-col gap-2"></div>
            </div>
          </section>

          <section>
            <h4 class="text-xs font-semibold text-primary uppercase tracking-wide mb-2">Analysis</h4>
            <div class="flex flex-col gap-2">
              <label class="form-control w-full">
                <div class="label"><span class="label-text text-xs">Insight Categories</span></div>
                <input type="text" data-key="insightTabs" class="input input-bordered input-sm w-full" placeholder="Suggestions,Key Points,Action Items,Questions" />
              </label>
              <div class="flex flex-wrap gap-1">
                <button class="btn btn-xs btn-ghost" data-preset="Suggestions,Key Points,Action Items,Questions">Meeting</button>
                <button class="btn btn-xs btn-ghost" data-preset="Solution Approach,Complexity Analysis,Edge Cases,Code Suggestions" data-has-prompts="code-interview">Code Interview</button>
                <button class="btn btn-xs btn-ghost" data-preset="Bugs,Design Decisions,TODOs,Questions">Pair Programming</button>
                <button class="btn btn-xs btn-ghost" data-preset="Key Concepts,Examples,Questions,References">Lecture</button>
              </div>
              <label class="form-control w-full">
                <div class="label"><span class="label-text text-xs">Analysis Interval (seconds)</span></div>
                <input type="number" data-key="analysisIntervalMs" class="input input-bordered input-sm w-full" min="5" max="120" step="5" />
              </label>
              <label class="label cursor-pointer gap-2 justify-start">
                <input type="checkbox" data-key="multiAgent" class="checkbox checkbox-sm" />
                <span class="label-text text-xs">Multi-agent (parallel analysis per category)</span>
              </label>
              <label class="form-control w-full">
                <div class="label"><span class="label-text text-xs">Agent Prompts (JSON, optional)</span></div>
                <textarea data-key="agentPrompts" class="textarea textarea-bordered textarea-sm w-full font-mono text-xs" rows="3" placeholder='{"key_points": "Custom prompt..."}'></textarea>
              </label>
            </div>
          </section>

        </div>
        <div class="modal-action">
          <button class="settings-save btn btn-primary btn-sm">Save</button>
          <form method="dialog"><button class="btn btn-ghost btn-sm">Close</button></form>
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
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        el.checked = Boolean(cfg[key]);
      } else if (key === "analysisIntervalMs") {
        el.value = String(Number(cfg[key]) / 1000);
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
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        partial[key] = el.checked;
      } else if (key === "analysisIntervalMs") {
        partial[key] = (Number(el.value) || 15) * 1000;
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
      el.className = "form-control w-full";
      el.innerHTML = `<div class="label"><span class="label-text text-xs">${field.label}</span></div><input type="${inputType}" class="input input-bordered input-sm w-full" data-key="${field.key}" placeholder="${field.placeholder || ""}" value="${escapeAttr(value)}" />`;
      container.appendChild(el);
    }
  }
}

customElements.define("mn-settings", MnSettings);
