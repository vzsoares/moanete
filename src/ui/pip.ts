/**
 * PiP UI — builds and manages the floating overlay DOM.
 *
 * All functions operate on the PiP window's document but run in the
 * popup's JS context. No script injection needed.
 */
import type { ChatMessage } from "../providers/llm/types.ts";
import { toKey } from "../core/analyzer.ts";
import PIP_CSS from "./pip.css?inline";

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

  // Inline CSS — extension URLs can't be fetched from PiP window
  const style = doc.createElement("style");
  style.textContent = PIP_CSS;
  doc.head.appendChild(style);

  // Build DOM
  doc.body.innerHTML = `
    <header>
      <span class="dot"></span>
      <h1>moanete</h1>
    </header>

    <div id="live-transcript"><strong>Transcript</strong> listening...</div>

    <div class="tab-bar" id="top-tabs"></div>
    <div class="panels" id="top-panels"></div>

    <div class="tab-bar" id="bottom-tabs">
      <button class="active" data-panel="transcript-panel">Transcript</button>
      <button data-panel="chat-panel">Chat</button>
      <button data-panel="summary-panel">Summary</button>
    </div>

    <div class="panels" id="bottom-panels" style="flex:2">
      <div class="panel active" id="transcript-panel">
        <div id="full-transcript" class="empty">Waiting for speech...</div>
      </div>

      <div class="panel" id="chat-panel" style="display:none;flex-direction:column">
        <div id="chat-messages"></div>
        <div id="chat-input-row">
          <input type="text" id="chat-input" placeholder="Ask about the meeting..." />
          <button id="btn-send">Send</button>
        </div>
      </div>

      <div class="panel" id="summary-panel">
        <button id="btn-summarize">Generate Summary</button>
        <div id="summary-content" class="empty">No summary yet.</div>
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
  for (const bar of doc.querySelectorAll<HTMLDivElement>(".tab-bar")) {
    bar.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-panel]");
      if (!btn || !doc) return;

      const panelsContainer = bar.nextElementSibling as HTMLElement;
      for (const b of bar.querySelectorAll("button")) b.classList.remove("active");
      for (const p of panelsContainer.querySelectorAll<HTMLElement>(".panel")) {
        p.classList.remove("active");
        p.style.display = "none";
      }

      btn.classList.add("active");
      const panel = doc.getElementById(btn.dataset.panel!);
      if (panel) {
        panel.classList.add("active");
        panel.style.display = btn.dataset.panel === "chat-panel" ? "flex" : "block";
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
  el.className = `chat-msg ${role}`;
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
    el.classList.remove("empty");
    onSummarize?.();
  });
}

export function setSummary(text: string): void {
  if (!doc) return;
  const el = doc.getElementById("summary-content")!;
  el.textContent = text;
  el.classList.remove("empty");
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
    btn.textContent = name;
    btn.dataset.panel = `insight-${key}`;
    if (i === 0) btn.classList.add("active");
    topTabs.appendChild(btn);

    const panel = doc!.createElement("div");
    panel.className = `panel${i === 0 ? " active" : ""}`;
    panel.id = `insight-${key}`;
    panel.innerHTML = '<div class="empty">Nothing yet...</div>';
    topPanels.appendChild(panel);
  });
}

export function updateInsights(insights: Record<string, string[]>): void {
  if (!doc) return;
  for (const [key, items] of Object.entries(insights)) {
    const panel = doc.getElementById(`insight-${key}`);
    if (!panel) continue;

    if (items.length === 0) {
      panel.innerHTML = '<div class="empty">Nothing yet...</div>';
    } else {
      const ul = doc.createElement("ul");
      for (const item of items.slice(-10)) {
        const li = doc.createElement("li");
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
  el.classList.remove("empty");
  el.textContent = transcriptBuffer.join("\n");
  el.scrollTop = el.scrollHeight;

  // Update live bar
  const live = doc.getElementById("live-transcript")!;
  const full = transcriptBuffer.join(" ");
  const tail = full.length > 200 ? `...${full.slice(-200)}` : full;
  live.innerHTML = `<strong>Transcript</strong> ${tail}`;
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
