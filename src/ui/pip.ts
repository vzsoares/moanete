import { toKey } from "../core/analyzer.ts";
import { loadConfig } from "../core/config.ts";
import type { TranscriptEntry } from "../core/session.ts";
/**
 * PiP UI — minimal floating overlay.
 *
 * Shows status indicators + a single content area that toggles between
 * transcript, insights, or summary. No tabs, no chat, no complex layout.
 */
import type { ChatMessage } from "../providers/llm/types.ts";
import { CHAT_PRESETS } from "./components/mn-chat.ts";
import PIP_CSS from "./global.css?inline";
import { escapeHtml, renderMarkdown } from "./util.ts";

let doc: Document | null = null;
const transcriptBuffer: string[] = [];
let currentView: "transcript" | "insights" | "chat" = "transcript";
let currentInsights: Record<string, string[]> = {};
let currentCategories: string[] = [];
let onToggleAutoCapture: (() => boolean) | null = null;
let onCaptureOnce: (() => void) | null = null;
let onChat: ((question: string, history: ChatMessage[]) => void) | null = null;
let onChatGenerate: ((prompt: string) => void) | null = null;
let onAutoAssist: ((active: boolean, prompt: string) => void) | null = null;
let chatHistory: ChatMessage[] = [];
let pipAutoActive = false;

export interface PipCallbacks {
  onChat: (question: string, history: ChatMessage[]) => void;
  onChatGenerate: (prompt: string) => void;
  onAutoAssist: (active: boolean, prompt: string) => void;
  onToggleAutoCapture: () => boolean;
  onCaptureOnce: () => void;
}

export function buildPipUI(pipDoc: Document, _cssUrl: string, callbacks: PipCallbacks): void {
  doc = pipDoc;
  onToggleAutoCapture = callbacks.onToggleAutoCapture;
  onCaptureOnce = callbacks.onCaptureOnce;
  onChat = callbacks.onChat;
  onChatGenerate = callbacks.onChatGenerate;
  onAutoAssist = callbacks.onAutoAssist;
  pipAutoActive = false;
  chatHistory = [];
  transcriptBuffer.length = 0;
  currentInsights = {};
  currentCategories = [];
  currentView = "transcript";

  const style = doc.createElement("style");
  style.textContent = PIP_CSS;
  doc.head.appendChild(style);

  doc.body.setAttribute("data-theme", "moanete");
  doc.body.className =
    "h-screen flex flex-col overflow-hidden bg-base-100 text-base-content text-sm";
  doc.body.innerHTML = `
    <header class="flex items-center gap-2 px-3 py-2 border-b border-base-content/[0.06] shrink-0">
      <span class="text-[13px] font-semibold tracking-tight text-base-content">moañete</span>
      <div class="flex-1"></div>
      <div class="flex items-center gap-1.5">
        <span id="pip-mic-dot" class="dot off" title="Mic"></span>
        <span class="text-[9px] text-base-content/30">mic</span>
        <span id="pip-tab-dot" class="dot off" title="Tab"></span>
        <span class="text-[9px] text-base-content/30">tab</span>
      </div>
      <button id="pip-btn-capture-once" class="text-[11px] text-base-content/40 hover:text-base-content/70 cursor-pointer" hidden title="Capture screen once">📸</button>
      <button id="pip-btn-screen" class="text-[11px] text-base-content/40 hover:text-base-content/70 cursor-pointer" hidden title="Auto-capture screen">🔄</button>
      <div class="flex items-center gap-1" title="Context window usage">
        <div class="w-10 h-[2px] bg-base-content/[0.06] rounded-full overflow-hidden">
          <div id="pip-ctx-bar" class="h-full bg-primary rounded-full transition-all duration-300" style="width: 0%"></div>
        </div>
        <span id="pip-ctx-label" class="text-[9px] text-base-content/30 tabular-nums">0%</span>
      </div>
    </header>

    <div class="flex gap-0.5 px-3 py-1.5 border-b border-base-content/[0.06] shrink-0">
      <button class="px-2.5 py-1 text-[11px] rounded-md text-base-content bg-base-content/[0.04]" data-view="transcript">Transcript</button>
      <button class="px-2.5 py-1 text-[11px] rounded-md text-base-content/40 hover:text-base-content/60" data-view="insights">Insights</button>
      <button class="px-2.5 py-1 text-[11px] rounded-md text-base-content/40 hover:text-base-content/60" data-view="chat">Chat</button>
    </div>

    <div id="pip-content" class="flex-1 overflow-y-auto px-3 py-2">
      <div id="pip-transcript" class="text-xs leading-relaxed whitespace-pre-wrap text-base-content/30 italic">Waiting for speech...</div>
      <div id="pip-insights" class="hidden text-xs"></div>
      <div id="pip-chat" class="hidden flex flex-col h-full">
        <div id="pip-chat-messages" class="flex-1 overflow-y-auto flex flex-col gap-2 mb-2"></div>
        <div class="flex flex-col gap-1.5 shrink-0">
          <div class="flex gap-1">
            <select id="pip-chat-preset" class="flex-1 bg-base-content/[0.04] border border-base-content/[0.08] rounded-md px-2 py-1 text-[11px] text-base-content outline-none">
              <option value="">Q&A</option>
            </select>
            <button id="pip-chat-auto" class="px-2 py-1 text-[11px] rounded-md text-base-content/40 hover:text-base-content/60 cursor-pointer" title="Auto-assist">Auto</button>
          </div>
          <div class="flex gap-1">
            <input type="text" id="pip-chat-input" class="flex-1 min-w-0 bg-base-content/[0.04] border border-base-content/[0.08] rounded-md px-2.5 py-1 text-[11px] text-base-content outline-none focus:border-primary/40 placeholder:text-base-content/30" placeholder="Ask..." />
            <button id="pip-chat-send" class="btn btn-primary btn-xs rounded-md shrink-0">Send</button>
          </div>
        </div>
      </div>
    </div>
  `;

  setupViewToggle();
  setupScreenCapture();
  setupPipChat();
}

export function destroyPipUI(): void {
  doc = null;
  onToggleAutoCapture = null;
  onCaptureOnce = null;
  onChat = null;
  onChatGenerate = null;
  onAutoAssist = null;
  pipAutoActive = false;
  chatHistory = [];
}

/** Show or hide the screen capture buttons in PiP. */
export function pipSetScreenAvailable(available: boolean, active = false): void {
  if (!doc) return;
  const autoBtn = doc.getElementById("pip-btn-screen");
  const onceBtn = doc.getElementById("pip-btn-capture-once");
  if (autoBtn) {
    (autoBtn as HTMLButtonElement).hidden = !available;
    if (active) {
      autoBtn.className = "text-[11px] text-primary cursor-pointer";
    } else {
      autoBtn.className =
        "text-[11px] text-base-content/40 hover:text-base-content/70 cursor-pointer";
    }
  }
  if (onceBtn) {
    (onceBtn as HTMLButtonElement).hidden = !available;
  }
}

function syncView(): void {
  if (!doc) return;
  for (const b of doc.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    b.className = `px-2.5 py-1 text-[11px] rounded-md cursor-pointer transition-colors ${b.dataset.view === currentView ? "text-base-content bg-base-content/[0.04]" : "text-base-content/40 hover:text-base-content/60"}`;
  }

  const views = {
    transcript: "pip-transcript",
    insights: "pip-insights",
    chat: "pip-chat",
  };
  for (const [view, id] of Object.entries(views)) {
    const el = doc.getElementById(id);
    if (!el) continue;
    if (view === currentView) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  }
}

function setupViewToggle(): void {
  if (!doc) return;
  for (const btn of doc.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    btn.addEventListener("click", () => {
      if (!doc) return;
      currentView = btn.dataset.view as typeof currentView;
      syncView();
      if (currentView === "insights") renderInsightsView();
    });
  }
}

function setupScreenCapture(): void {
  if (!doc) return;
  doc.getElementById("pip-btn-screen")!.addEventListener("click", () => {
    if (!onToggleAutoCapture) return;
    const nowActive = onToggleAutoCapture();
    pipSetScreenAvailable(true, nowActive);
  });
  doc.getElementById("pip-btn-capture-once")!.addEventListener("click", () => {
    onCaptureOnce?.();
  });
}

function getPipPresetPrompt(select: HTMLSelectElement): string {
  if (!select.value) return "";
  if (select.value === "custom") return loadConfig().customChatPrompt;
  const p = CHAT_PRESETS.find((p) => p.name === select.value);
  return p?.prompt ?? "";
}

function setupPipChat(): void {
  if (!doc) return;
  const input = doc.getElementById("pip-chat-input") as HTMLInputElement;
  const btn = doc.getElementById("pip-chat-send") as HTMLButtonElement;
  const preset = doc.getElementById("pip-chat-preset") as HTMLSelectElement;

  // Populate preset options
  for (const p of CHAT_PRESETS) {
    const opt = doc.createElement("option");
    opt.value = p.name;
    opt.textContent = p.name;
    preset.appendChild(opt);
  }
  const customOpt = doc.createElement("option");
  customOpt.value = "custom";
  customOpt.textContent = "Custom";
  preset.appendChild(customOpt);

  const send = () => {
    const presetPrompt = getPipPresetPrompt(preset);
    const q = input.value.trim();

    if (presetPrompt) {
      input.value = "";
      const label = preset.value === "custom" ? "Custom" : preset.value;
      appendPipChatMessage("user", q ? `[${label}] ${q}` : `[${label}]`);
      onChatGenerate?.(q ? `${presetPrompt}\n\nAdditional instruction: ${q}` : presetPrompt);
    } else {
      if (!q || !onChat) return;
      input.value = "";
      appendPipChatMessage("user", q);
      onChat(q, chatHistory);
    }
  };

  btn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });

  preset.addEventListener("change", () => {
    input.placeholder = preset.value ? "Extra instructions (optional)..." : "Ask...";
  });

  const autoBtn = doc.getElementById("pip-chat-auto") as HTMLButtonElement;
  autoBtn.addEventListener("click", () => {
    pipAutoActive = !pipAutoActive;
    if (pipAutoActive) {
      autoBtn.className =
        "px-2 py-1 text-[11px] rounded-md text-primary bg-primary/10 cursor-pointer";
      onAutoAssist?.(true, getPipPresetPrompt(preset));
    } else {
      autoBtn.className =
        "px-2 py-1 text-[11px] rounded-md text-base-content/40 hover:text-base-content/60 cursor-pointer";
      onAutoAssist?.(false, "");
    }
  });
}

function appendPipChatMessage(role: string, text: string, suggestions: string[] = []): void {
  if (!doc) return;
  const container = doc.getElementById("pip-chat-messages");
  if (!container) return;

  // Remove previous suggestion chips
  for (const old of container.querySelectorAll<HTMLDivElement>(".pip-chat-suggestions")) {
    old.remove();
  }

  const el = doc.createElement("div");
  const isUser = role === "user";
  el.className = `text-xs leading-snug ${isUser ? "" : ""}`;
  if (isUser) {
    el.innerHTML = `<span class="font-semibold mn-speaker-you">You:</span> <span class="text-base-content/60">${escapeHtml(text)}</span>`;
  } else {
    el.innerHTML = `<span class="font-semibold mn-speaker-them">moañete:</span><div class="mt-1 text-base-content/70">${renderMarkdown(text)}</div>`;
  }
  container.appendChild(el);

  if (suggestions.length > 0) {
    const chips = doc.createElement("div");
    chips.className = "pip-chat-suggestions flex flex-wrap gap-1 mt-1";
    for (const s of suggestions) {
      const chip = doc.createElement("button");
      chip.className =
        "px-2 py-0.5 text-[10px] rounded-full border border-base-content/[0.08] text-base-content/40 hover:text-base-content/60 hover:bg-base-content/[0.04] cursor-pointer transition-colors";
      chip.textContent = s;
      chip.addEventListener("click", () => {
        chips.remove();
        appendPipChatMessage("user", s);
        onChat?.(s, chatHistory);
      });
      chips.appendChild(chip);
    }
    container.appendChild(chips);
  }

  container.scrollTop = container.scrollHeight;
}

function renderInsightsView(): void {
  if (!doc) return;
  const container = doc.getElementById("pip-insights")!;
  container.innerHTML = "";

  if (currentCategories.length === 0) {
    container.innerHTML = '<p class="text-base-content/30 italic">No insights yet...</p>';
    return;
  }

  for (const name of currentCategories) {
    const key = toKey(name);
    const items = currentInsights[key] || [];

    const section = doc.createElement("div");
    section.className = "mb-3";
    section.innerHTML = `<h3 class="mn-panel-header mb-1">${name}</h3>`;

    if (items.length === 0) {
      section.innerHTML += '<p class="text-base-content/30 italic">Nothing yet...</p>';
    } else {
      const list = doc.createElement("div");
      list.className = "flex flex-col gap-1";
      for (const item of items.slice(-10)) {
        const card = doc.createElement("div");
        card.className = "mn-insight-card";
        card.textContent = item;
        list.appendChild(card);
      }
      section.appendChild(list);
    }

    container.appendChild(section);
  }
}

// --- Public API (called from popup.ts) ---

export function pipAppendTranscript(entry: TranscriptEntry): void {
  if (!doc) return;
  const label = entry.source === "mic" ? "You" : "Them";
  transcriptBuffer.push(`${label}: ${entry.text}`);
  const el = doc.getElementById("pip-transcript")!;
  // Remove placeholder styling but preserve hidden state
  el.classList.remove("italic", "text-base-content/50");
  el.textContent = transcriptBuffer.join("\n");
  el.scrollTop = el.scrollHeight;
}

export function updateInsights(insights: Record<string, string[]>): void {
  currentInsights = insights;
  if (currentView === "insights") renderInsightsView();
}

let lastPipCtxLabel = "";

export function pipUpdateContext(pctStr: string): void {
  if (!doc || pctStr === lastPipCtxLabel) return;
  lastPipCtxLabel = pctStr;
  const pct = Number.parseFloat(pctStr);
  const bar = doc.getElementById("pip-ctx-bar");
  const label = doc.getElementById("pip-ctx-label");
  if (bar) {
    bar.style.width = `${pct}%`;
    bar.classList.remove("bg-primary", "bg-warning", "bg-error");
    bar.classList.add(pct >= 85 ? "bg-error" : pct >= 60 ? "bg-warning" : "bg-primary");
  }
  if (label) {
    label.textContent = `${pctStr}%`;
    label.classList.remove("animate-pulse");
    void label.offsetWidth;
    label.classList.add("animate-pulse");
    setTimeout(() => label.classList.remove("animate-pulse"), 1500);
  }
}

export function pipUpdateActivity(source: "mic" | "tab", level: number): void {
  if (!doc) return;
  const dot = doc.getElementById(source === "mic" ? "pip-mic-dot" : "pip-tab-dot");
  if (!dot) return;
  if (level > 0.01) {
    dot.className = "dot on";
  } else {
    dot.className = "dot off";
  }
}

export function setChatReply(
  answer: string,
  history: ChatMessage[],
  suggestions: string[] = [],
): void {
  chatHistory = history;
  appendPipChatMessage("assistant", answer, suggestions);
}

export function rebuildInsightTabs(categories: string[]): void {
  currentCategories = categories;
  if (currentView === "insights") renderInsightsView();
}

export function seedPipState(
  categories: string[],
  insights: Record<string, string[]>,
  transcriptLines: Array<{ source: "mic" | "tab"; text: string }>,
): void {
  currentCategories = categories;
  currentInsights = insights;
  if (transcriptLines.length > 0 && doc) {
    for (const line of transcriptLines) {
      const label = line.source === "mic" ? "You" : "Them";
      transcriptBuffer.push(`${label}: ${line.text}`);
    }
    const el = doc.getElementById("pip-transcript")!;
    el.classList.remove("italic", "text-base-content/50");
    el.textContent = transcriptBuffer.join("\n");
    el.scrollTop = el.scrollHeight;
  }
  if (currentView === "insights") renderInsightsView();
}
