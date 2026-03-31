import { toKey } from "../core/analyzer.ts";
import type { TranscriptEntry } from "../core/session.ts";
/**
 * PiP UI — minimal floating overlay.
 *
 * Shows status indicators + a single content area that toggles between
 * transcript, insights, or summary. No tabs, no chat, no complex layout.
 */
import type { ChatMessage } from "../providers/llm/types.ts";
import PIP_CSS from "./global.css?inline";

let doc: Document | null = null;
const transcriptBuffer: string[] = [];
let currentView: "transcript" | "insights" | "summary" = "transcript";
let currentInsights: Record<string, string[]> = {};
let currentCategories: string[] = [];
let onSummarize: (() => void) | null = null;
let onToggleAutoCapture: (() => boolean) | null = null;

export interface PipCallbacks {
  onChat: (question: string, history: ChatMessage[]) => void;
  onSummarize: () => void;
  onToggleAutoCapture: () => boolean;
}

export function buildPipUI(pipDoc: Document, _cssUrl: string, callbacks: PipCallbacks): void {
  doc = pipDoc;
  onSummarize = callbacks.onSummarize;
  onToggleAutoCapture = callbacks.onToggleAutoCapture;
  transcriptBuffer.length = 0;
  currentInsights = {};
  currentCategories = [];
  currentView = "transcript";

  const style = doc.createElement("style");
  style.textContent = PIP_CSS;
  doc.head.appendChild(style);

  doc.body.setAttribute("data-theme", "dark");
  doc.body.className =
    "h-screen flex flex-col overflow-hidden bg-base-200 text-base-content text-sm";
  doc.body.innerHTML = `
    <header class="flex items-center gap-2 px-3 py-1.5 bg-base-300 border-b border-base-content/10 shrink-0">
      <h1 class="text-sm font-semibold text-primary">moanete</h1>
      <div class="flex-1"></div>
      <span class="text-[10px] text-base-content/40">mic</span>
      <span id="pip-mic-dot" class="w-2 h-2 rounded-full bg-base-content/20" title="Mic"></span>
      <span class="text-[10px] text-base-content/40">tab</span>
      <span id="pip-tab-dot" class="w-2 h-2 rounded-full bg-base-content/20" title="Tab"></span>
      <button id="pip-btn-screen" class="btn btn-ghost btn-xs" hidden title="Auto-capture screen">📷</button>
    </header>

    <div class="flex gap-1 px-3 py-1 bg-base-300 border-b border-base-content/10 shrink-0">
      <button class="btn btn-xs btn-primary" data-view="transcript">Transcript</button>
      <button class="btn btn-xs btn-ghost" data-view="insights">Insights</button>
      <button class="btn btn-xs btn-ghost" data-view="summary">Summary</button>
    </div>

    <div id="pip-content" class="flex-1 overflow-y-auto p-3">
      <div id="pip-transcript" class="text-xs leading-relaxed whitespace-pre-wrap text-base-content/50 italic">Waiting for speech...</div>
      <div id="pip-insights" class="hidden text-xs"></div>
      <div id="pip-summary" class="hidden text-xs leading-relaxed text-base-content/50 italic">
        <button id="pip-btn-summarize" class="btn btn-ghost btn-xs mb-2">Generate Summary</button>
        <div id="pip-summary-text">No summary yet.</div>
      </div>
    </div>
  `;

  setupViewToggle();
  setupPipSummary();
  setupScreenCapture();
}

export function destroyPipUI(): void {
  doc = null;
  onSummarize = null;
  onToggleAutoCapture = null;
}

/** Show or hide the screen capture button in PiP. */
export function pipSetScreenAvailable(available: boolean, active = false): void {
  if (!doc) return;
  const btn = doc.getElementById("pip-btn-screen");
  if (!btn) return;
  (btn as HTMLButtonElement).hidden = !available;
  if (active) {
    btn.classList.add("btn-accent");
    btn.classList.remove("btn-ghost");
  } else {
    btn.classList.remove("btn-accent");
    btn.classList.add("btn-ghost");
  }
}

function syncView(): void {
  if (!doc) return;
  for (const b of doc.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    b.className = `btn btn-xs ${b.dataset.view === currentView ? "btn-primary" : "btn-ghost"}`;
  }

  const views = { transcript: "pip-transcript", insights: "pip-insights", summary: "pip-summary" };
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

function setupPipSummary(): void {
  if (!doc) return;
  doc.getElementById("pip-btn-summarize")!.addEventListener("click", () => {
    if (!doc) return;
    doc.getElementById("pip-summary-text")!.textContent = "Generating...";
    onSummarize?.();
  });
}

function setupScreenCapture(): void {
  if (!doc) return;
  doc.getElementById("pip-btn-screen")!.addEventListener("click", () => {
    if (!onToggleAutoCapture) return;
    const nowActive = onToggleAutoCapture();
    pipSetScreenAvailable(true, nowActive);
  });
}

function renderInsightsView(): void {
  if (!doc) return;
  const container = doc.getElementById("pip-insights")!;
  container.innerHTML = "";

  if (currentCategories.length === 0) {
    container.innerHTML = '<p class="text-base-content/40 italic">No insights yet...</p>';
    return;
  }

  for (const name of currentCategories) {
    const key = toKey(name);
    const items = currentInsights[key] || [];

    const section = doc.createElement("div");
    section.className = "mb-3";
    section.innerHTML = `<h3 class="font-semibold text-primary text-xs mb-1">${name}</h3>`;

    if (items.length === 0) {
      section.innerHTML += '<p class="text-base-content/40 italic">Nothing yet...</p>';
    } else {
      const list = doc.createElement("div");
      list.className = "flex flex-col gap-1.5";
      for (const item of items.slice(-5)) {
        const card = doc.createElement("div");
        card.className = "bg-base-200 rounded px-2 py-1 leading-snug border-l-2 border-primary";
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

export function pipUpdateActivity(source: "mic" | "tab", level: number): void {
  if (!doc) return;
  const dot = doc.getElementById(source === "mic" ? "pip-mic-dot" : "pip-tab-dot");
  if (!dot) return;
  if (level > 0.01) {
    dot.className = "w-2 h-2 rounded-full bg-success animate-pulse";
  } else {
    dot.className = "w-2 h-2 rounded-full bg-success/30";
  }
}

export function setChatReply(_answer: string, _history: ChatMessage[]): void {
  // Chat is only in the main dashboard, not PiP
}

export function setSummary(text: string): void {
  if (!doc) return;
  const el = doc.getElementById("pip-summary-text")!;
  el.textContent = typeof text === "string" ? text : String(text);
  el.classList.remove("italic", "text-base-content/50");
}

export function rebuildInsightTabs(categories: string[]): void {
  currentCategories = categories;
  if (currentView === "insights") renderInsightsView();
}

export function seedPipState(
  categories: string[],
  insights: Record<string, string[]>,
  transcript: string,
): void {
  currentCategories = categories;
  currentInsights = insights;
  if (transcript && doc) {
    // Seed with raw transcript text (already has [You]/[Them] labels from analyzer)
    transcriptBuffer.push(transcript);
    const el = doc.getElementById("pip-transcript")!;
    el.classList.remove("italic", "text-base-content/50");
    el.textContent = transcriptBuffer.join("\n");
  }
  if (currentView === "insights") renderInsightsView();
}
