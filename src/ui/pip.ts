import type { ChatMessage } from "../providers/llm/types.ts";

let categories: string[] = [];
let _insightData: Record<string, string[]> = {};
let chatHistory: ChatMessage[] = [];

// --- Build DOM ---

function buildUI(): void {
  document.body.innerHTML = `
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

function setupTabSwitching(): void {
  for (const bar of document.querySelectorAll<HTMLDivElement>(".tab-bar")) {
    bar.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-panel]");
      if (!btn) return;

      const panelsContainer = bar.nextElementSibling as HTMLElement;
      for (const b of bar.querySelectorAll("button")) b.classList.remove("active");
      for (const p of panelsContainer.querySelectorAll<HTMLElement>(".panel")) {
        p.classList.remove("active");
        p.style.display = "none";
      }

      btn.classList.add("active");
      const panel = document.getElementById(btn.dataset.panel!);
      if (panel) {
        panel.classList.add("active");
        panel.style.display = btn.dataset.panel === "chat-panel" ? "flex" : "block";
      }
    });
  }
}

function setupChat(): void {
  const input = document.getElementById("chat-input") as HTMLInputElement;
  const btn = document.getElementById("btn-send") as HTMLButtonElement;

  const send = () => {
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    appendChat("user", q);
    window.opener?.postMessage(
      { type: "chat", payload: { question: q, history: chatHistory } },
      "*",
    );
  };

  btn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
}

function setupSummary(): void {
  document.getElementById("btn-summarize")!.addEventListener("click", () => {
    const el = document.getElementById("summary-content")!;
    el.textContent = "Generating...";
    el.classList.remove("empty");
    window.opener?.postMessage({ type: "summarize" }, "*");
  });
}

function appendChat(role: string, text: string): void {
  const el = document.createElement("div");
  el.className = `chat-msg ${role}`;
  el.textContent = `${role === "user" ? "You" : "moanete"}: ${text}`;
  document.getElementById("chat-messages")!.appendChild(el);
  el.scrollIntoView({ behavior: "smooth" });
}

// --- Insight tabs ---

function toKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function rebuildInsightTabs(cats: string[]): void {
  categories = cats;
  const topTabs = document.getElementById("top-tabs")!;
  const topPanels = document.getElementById("top-panels")!;

  topTabs.innerHTML = "";
  topPanels.innerHTML = "";

  cats.forEach((name, i) => {
    const key = toKey(name);
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.dataset.panel = `insight-${key}`;
    if (i === 0) btn.classList.add("active");
    topTabs.appendChild(btn);

    const panel = document.createElement("div");
    panel.className = `panel${i === 0 ? " active" : ""}`;
    panel.id = `insight-${key}`;
    panel.innerHTML = '<div class="empty">Nothing yet...</div>';
    topPanels.appendChild(panel);
  });
}

function updateInsights(insights: Record<string, string[]>): void {
  _insightData = insights;
  for (const [key, items] of Object.entries(insights)) {
    const panel = document.getElementById(`insight-${key}`);
    if (!panel) continue;

    if (items.length === 0) {
      panel.innerHTML = '<div class="empty">Nothing yet...</div>';
    } else {
      const ul = document.createElement("ul");
      for (const item of items.slice(-10)) {
        const li = document.createElement("li");
        li.textContent = item;
        ul.appendChild(li);
      }
      panel.innerHTML = "";
      panel.appendChild(ul);
    }
  }
}

// --- Message handling ---

interface PipMessage {
  type: string;
  categories?: string[];
  insights?: Record<string, string[]>;
  transcript?: string;
  text?: string;
  answer?: string;
  history?: ChatMessage[];
}

window.addEventListener("message", (event: MessageEvent<PipMessage>) => {
  const { type } = event.data;

  if (type === "init") {
    rebuildInsightTabs(event.data.categories || []);
    updateInsights(event.data.insights || {});
    if (event.data.transcript) {
      appendTranscript(event.data.transcript);
    }
  }

  if (type === "transcript") {
    appendTranscript(event.data.text || "");
    updateLiveTranscript();
  }

  if (type === "insights") {
    updateInsights(event.data.insights || {});
  }

  if (type === "chat-reply") {
    appendChat("assistant", event.data.answer || "");
    chatHistory = event.data.history || [];
  }

  if (type === "summary") {
    const el = document.getElementById("summary-content")!;
    el.textContent = event.data.text || "";
    el.classList.remove("empty");
  }
});

const transcriptBuffer: string[] = [];

function appendTranscript(text: string): void {
  transcriptBuffer.push(text);
  const el = document.getElementById("full-transcript")!;
  el.classList.remove("empty");
  el.textContent = transcriptBuffer.join("\n");
  el.scrollTop = el.scrollHeight;
}

function updateLiveTranscript(): void {
  const el = document.getElementById("live-transcript")!;
  const full = transcriptBuffer.join(" ");
  const tail = full.length > 200 ? `...${full.slice(-200)}` : full;
  el.innerHTML = `<strong>Transcript</strong> ${tail}`;
}

// --- Init ---
buildUI();
