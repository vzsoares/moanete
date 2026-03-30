/**
 * PiP UI — builds and manages the floating overlay DOM.
 *
 * All functions operate on the PiP window's document but run in the
 * main app's JS context. No script injection needed.
 */
import type { ChatMessage } from "../providers/llm/types.ts";
import { toKey } from "../core/analyzer.ts";
import PIP_CSS from "./global.css?inline";

let doc: Document | null = null;
let chatHistory: ChatMessage[] = [];
const transcriptBuffer: string[] = [];
let onChat: ((question: string, history: ChatMessage[]) => void) | null = null;
let onSummarize: (() => void) | null = null;

export interface PipCallbacks {
  onChat: (question: string, history: ChatMessage[]) => void;
  onSummarize: () => void;
}

export function buildPipUI(pipDoc: Document, _cssUrl: string, callbacks: PipCallbacks): void {
  doc = pipDoc;
  onChat = callbacks.onChat;
  onSummarize = callbacks.onSummarize;
  chatHistory = [];
  transcriptBuffer.length = 0;

  // Inline CSS — PiP window can't access parent stylesheets
  const style = doc.createElement("style");
  style.textContent = PIP_CSS;
  doc.head.appendChild(style);

  // Build DOM
  doc.body.setAttribute("data-theme", "dark");
  doc.body.className = "h-screen flex flex-col overflow-hidden bg-base-200 text-base-content text-sm";
  doc.body.innerHTML = `
    <header class="flex items-center gap-2 px-3 py-1.5 bg-base-300 border-b border-base-content/10 shrink-0">
      <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
      <h1 class="text-sm font-semibold text-primary">moanete</h1>
    </header>

    <div id="live-transcript" class="px-3 py-1.5 bg-base-300 border-b border-base-content/10 text-xs text-base-content/60 truncate shrink-0 min-h-7">
      <strong class="text-base-content/80">Transcript</strong> listening...
    </div>

    <div class="tabs tabs-bordered shrink-0 bg-base-300" id="top-tabs"></div>
    <div class="relative flex-1 overflow-hidden" id="top-panels"></div>

    <div class="tabs tabs-bordered shrink-0 bg-base-300" id="bottom-tabs">
      <button class="tab tab-active" data-panel="transcript-panel">Transcript</button>
      <button class="tab" data-panel="chat-panel">Chat</button>
      <button class="tab" data-panel="summary-panel">Summary</button>
    </div>

    <div class="relative flex-2 overflow-hidden" id="bottom-panels">
      <div class="panel-item absolute inset-0 p-2 overflow-y-auto block" id="transcript-panel">
        <div id="full-transcript" class="whitespace-pre-wrap leading-relaxed text-xs text-base-content/50 italic">Waiting for speech...</div>
      </div>

      <div class="panel-item absolute inset-0 p-2 overflow-y-auto hidden flex-col" id="chat-panel">
        <div id="chat-messages" class="flex-1 overflow-y-auto flex flex-col gap-1.5"></div>
        <div id="chat-input-row" class="flex gap-1 pt-1.5 shrink-0">
          <input type="text" id="chat-input" class="input input-bordered input-sm flex-1" placeholder="Ask about the meeting..." />
          <button id="btn-send" class="btn btn-primary btn-sm">Send</button>
        </div>
      </div>

      <div class="panel-item absolute inset-0 p-2 overflow-y-auto hidden" id="summary-panel">
        <button id="btn-summarize" class="btn btn-ghost btn-sm mb-2">Generate Summary</button>
        <div id="summary-content" class="whitespace-pre-wrap leading-relaxed text-base-content/50 italic">No summary yet.</div>
      </div>
    </div>
  `;

  setupTabSwitching();
  setupChat();
  setupSummary();
}

export function destroyPipUI(): void {
  doc = null;
  onChat = null;
  onSummarize = null;
}

// --- Tab switching ---

function setupTabSwitching(): void {
  if (!doc) return;
  for (const bar of doc.querySelectorAll<HTMLDivElement>(".tabs")) {
    bar.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-panel]");
      if (!btn || !doc) return;

      const panelsContainer = bar.nextElementSibling as HTMLElement;
      for (const b of bar.querySelectorAll("button")) b.classList.remove("tab-active");
      for (const p of panelsContainer.querySelectorAll<HTMLElement>(".panel-item")) {
        p.classList.add("hidden");
        p.classList.remove("block", "flex");
      }

      btn.classList.add("tab-active");
      const panel = doc.getElementById(btn.dataset.panel!);
      if (panel) {
        panel.classList.remove("hidden");
        panel.classList.add(btn.dataset.panel === "chat-panel" ? "flex" : "block");
      }
    });
  }
}

// --- Chat ---

function setupChat(): void {
  if (!doc) return;
  const input = doc.getElementById("chat-input") as HTMLInputElement;
  const btn = doc.getElementById("btn-send") as HTMLButtonElement;

  const send = () => {
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    appendChat("user", q);
    onChat?.(q, chatHistory);
  };

  btn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
}

export function appendChat(role: string, text: string): void {
  if (!doc) return;
  const el = doc.createElement("div");
  el.className = `text-sm leading-snug ${role === "user" ? "text-info" : "text-success"}`;
  el.textContent = `${role === "user" ? "You" : "moanete"}: ${text}`;
  doc.getElementById("chat-messages")!.appendChild(el);
  el.scrollIntoView({ behavior: "smooth" });
}

export function setChatReply(answer: string, history: ChatMessage[]): void {
  appendChat("assistant", answer);
  chatHistory = history;
}

// --- Summary ---

function setupSummary(): void {
  if (!doc) return;
  doc.getElementById("btn-summarize")!.addEventListener("click", () => {
    const el = doc!.getElementById("summary-content")!;
    el.textContent = "Generating...";
    el.className = "whitespace-pre-wrap leading-relaxed";
    onSummarize?.();
  });
}

export function setSummary(text: string): void {
  if (!doc) return;
  const el = doc.getElementById("summary-content")!;
  el.textContent = text;
  el.className = "whitespace-pre-wrap leading-relaxed";
}

// --- Insights ---

export function rebuildInsightTabs(categories: string[]): void {
  if (!doc) return;
  const topTabs = doc.getElementById("top-tabs")!;
  const topPanels = doc.getElementById("top-panels")!;

  topTabs.innerHTML = "";
  topPanels.innerHTML = "";

  categories.forEach((name, i) => {
    const key = toKey(name);
    const btn = doc!.createElement("button");
    btn.className = `tab${i === 0 ? " tab-active" : ""}`;
    btn.textContent = name;
    btn.dataset.panel = `insight-${key}`;
    topTabs.appendChild(btn);

    const panel = doc!.createElement("div");
    panel.className = `panel-item absolute inset-0 p-2 overflow-y-auto ${i === 0 ? "block" : "hidden"}`;
    panel.id = `insight-${key}`;
    panel.innerHTML = '<div class="text-base-content/50 italic">Nothing yet...</div>';
    topPanels.appendChild(panel);
  });
}

export function updateInsights(insights: Record<string, string[]>): void {
  if (!doc) return;
  for (const [key, items] of Object.entries(insights)) {
    const panel = doc.getElementById(`insight-${key}`);
    if (!panel) continue;

    if (items.length === 0) {
      panel.innerHTML = '<div class="text-base-content/50 italic">Nothing yet...</div>';
    } else {
      const ul = doc.createElement("ul");
      ul.className = "list-disc list-inside flex flex-col gap-1 marker:text-primary";
      for (const item of items.slice(-10)) {
        const li = doc.createElement("li");
        li.className = "leading-snug";
        li.textContent = item;
        ul.appendChild(li);
      }
      panel.innerHTML = "";
      panel.appendChild(ul);
    }
  }
}

// --- Transcript ---

export function pipAppendTranscript(text: string): void {
  if (!doc) return;
  transcriptBuffer.push(text);
  const el = doc.getElementById("full-transcript")!;
  el.className = "whitespace-pre-wrap leading-relaxed text-xs";
  el.textContent = transcriptBuffer.join("\n");
  el.scrollTop = el.scrollHeight;

  // Update live bar
  const live = doc.getElementById("live-transcript")!;
  const full = transcriptBuffer.join(" ");
  const tail = full.length > 200 ? `...${full.slice(-200)}` : full;
  live.innerHTML = `<strong class="text-base-content/80">Transcript</strong> ${tail}`;
}

export function seedPipState(
  categories: string[],
  insights: Record<string, string[]>,
  transcript: string,
): void {
  rebuildInsightTabs(categories);
  updateInsights(insights);
  if (transcript) {
    pipAppendTranscript(transcript);
  }
}
