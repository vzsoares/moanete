/**
 * PiP UI — minimal floating overlay.
 *
 * Shows status indicators + a single content area that toggles between
 * transcript, insights, or summary. No tabs, no chat, no complex layout.
 */
import type { ChatMessage } from "../providers/llm/types.ts";
import { toKey } from "../core/analyzer.ts";
import PIP_CSS from "./global.css?inline";

let doc: Document | null = null;
const transcriptBuffer: string[] = [];
let currentView: "transcript" | "insights" | "summary" = "transcript";
let currentInsights: Record<string, string[]> = {};
let currentCategories: string[] = [];
let onSummarize: (() => void) | null = null;

export interface PipCallbacks {
  onChat: (question: string, history: ChatMessage[]) => void;
  onSummarize: () => void;
}

export function buildPipUI(pipDoc: Document, _cssUrl: string, callbacks: PipCallbacks): void {
  doc = pipDoc;
  onSummarize = callbacks.onSummarize;
  transcriptBuffer.length = 0;
  currentInsights = {};
  currentCategories = [];
  currentView = "transcript";

  const style = doc.createElement("style");
  style.textContent = PIP_CSS;
  doc.head.appendChild(style);

  doc.body.setAttribute("data-theme", "dark");
  doc.body.className = "h-screen flex flex-col overflow-hidden bg-base-200 text-base-content text-sm";
  doc.body.innerHTML = `
    <header class="flex items-center gap-2 px-3 py-1.5 bg-base-300 border-b border-base-content/10 shrink-0">
      <h1 class="text-sm font-semibold text-primary">moanete</h1>
      <div class="flex-1"></div>
      <span id="mic-dot" class="w-2 h-2 rounded-full bg-success animate-pulse" title="Mic active"></span>
      <span id="pc-dot" class="w-2 h-2 rounded-full bg-base-content/30" title="PC audio inactive"></span>
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
}

export function destroyPipUI(): void {
  doc = null;
  onSummarize = null;
}

function setupViewToggle(): void {
  if (!doc) return;
  for (const btn of doc.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    btn.addEventListener("click", () => {
      if (!doc) return;
      currentView = btn.dataset.view as typeof currentView;

      for (const b of doc.querySelectorAll<HTMLButtonElement>("[data-view]")) {
        b.className = `btn btn-xs ${b.dataset.view === currentView ? "btn-primary" : "btn-ghost"}`;
      }

      doc.getElementById("pip-transcript")!.classList.toggle("hidden", currentView !== "transcript");
      doc.getElementById("pip-insights")!.classList.toggle("hidden", currentView !== "insights");
      doc.getElementById("pip-summary")!.classList.toggle("hidden", currentView !== "summary");

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
      const ul = doc.createElement("ul");
      ul.className = "list-disc list-inside flex flex-col gap-0.5 marker:text-primary";
      for (const item of items.slice(-5)) {
        const li = doc.createElement("li");
        li.className = "leading-snug";
        li.textContent = item;
        ul.appendChild(li);
      }
      section.appendChild(ul);
    }

    container.appendChild(section);
  }
}

// --- Public API (called from popup.ts) ---

export function pipAppendTranscript(text: string): void {
  if (!doc) return;
  transcriptBuffer.push(text);
  const el = doc.getElementById("pip-transcript")!;
  el.className = "text-xs leading-relaxed whitespace-pre-wrap";
  el.textContent = transcriptBuffer.join("\n");
  el.scrollTop = el.scrollHeight;
}

export function updateInsights(insights: Record<string, string[]>): void {
  currentInsights = insights;
  if (currentView === "insights") renderInsightsView();
}

export function setChatReply(_answer: string, _history: ChatMessage[]): void {
  // Chat is only in the main dashboard, not PiP
}

export function setSummary(text: string): void {
  if (!doc) return;
  const el = doc.getElementById("pip-summary-text")!;
  el.textContent = text;
  el.className = "";
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
  if (transcript) pipAppendTranscript(transcript);
  if (currentView === "insights") renderInsightsView();
}
