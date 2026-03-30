import { toKey } from "../core/analyzer.ts";
import { type Config, loadConfig, saveConfig } from "../core/config.ts";
import {
  connectBridge,
  pushInsights,
  pushStatus,
  pushSummary,
  pushTranscript,
} from "../core/mcp-bridge.ts";
import { Session, type TranscriptEntry } from "../core/session.ts";
import {
  type StoredSession,
  deleteSession,
  exportSessionMarkdown,
  listSessions,
} from "../core/storage.ts";
import { answerQuestion, summarizeTranscript } from "../core/summarizer.ts";
import type { ChatMessage } from "../providers/llm/types.ts";
import {
  buildPipUI,
  destroyPipUI,
  pipAppendTranscript,
  setChatReply as pipSetChatReply,
  setSummary as pipSetSummary,
  pipUpdateActivity,
  updateInsights as pipUpdateInsights,
  seedPipState,
} from "./pip.ts";

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

let session: Session | null = null;
let chatHistory: ChatMessage[] = [];

// --- Settings UI ---

interface DynamicField {
  label: string;
  key: keyof Config;
  type?: string;
}

const KEY_FIELDS: Record<string, DynamicField> = {
  openai: { label: "OpenAI API Key", key: "openaiApiKey", type: "password" },
  anthropic: { label: "Anthropic API Key", key: "anthropicApiKey", type: "password" },
  deepgram: { label: "Deepgram API Key", key: "deepgramApiKey", type: "password" },
  whisperHost: { label: "Whisper Server URL", key: "whisperHost" },
  whisperModel: { label: "Whisper Model", key: "whisperModel" },
};

function renderKeyFields(sttProvider: string, llmProvider: string, config: Config): void {
  const container = $<HTMLDivElement>("#key-fields");
  container.innerHTML = "";

  const needed: string[] = [];
  if (sttProvider === "deepgram") needed.push("deepgram");
  if (sttProvider === "whisper") needed.push("whisperHost", "whisperModel");
  if (llmProvider === "openai") needed.push("openai");
  if (llmProvider === "anthropic") needed.push("anthropic");

  for (const id of needed) {
    const field = KEY_FIELDS[id];
    if (!field) continue;
    const inputType = field.type || "text";
    const el = document.createElement("label");
    el.className = "form-control w-full";
    el.innerHTML = `<div class="label"><span class="label-text text-xs">${field.label}</span></div><input type="${inputType}" class="input input-bordered input-sm w-full" data-key="${field.key}" value="${config[field.key] || ""}" />`;
    container.appendChild(el);
  }
}

function loadSettings(): void {
  const cfg = loadConfig();
  $<HTMLSelectElement>("#stt-provider").value = cfg.sttProvider;
  $<HTMLSelectElement>("#stt-language").value = cfg.sttLanguage;
  $<HTMLSelectElement>("#llm-provider").value = cfg.llmProvider;
  $<HTMLInputElement>("#insight-tabs").value = cfg.insightTabs;
  $<HTMLInputElement>("#capture-mic").checked = cfg.captureMic;
  $<HTMLInputElement>("#capture-tab").checked = cfg.captureTab;
  renderKeyFields(cfg.sttProvider, cfg.llmProvider, cfg);
}

function saveSettings(): void {
  const partial: Record<string, unknown> = {
    sttProvider: $<HTMLSelectElement>("#stt-provider").value,
    sttLanguage: $<HTMLSelectElement>("#stt-language").value,
    llmProvider: $<HTMLSelectElement>("#llm-provider").value,
    insightTabs: $<HTMLInputElement>("#insight-tabs").value,
    captureMic: $<HTMLInputElement>("#capture-mic").checked,
    captureTab: $<HTMLInputElement>("#capture-tab").checked,
  };

  for (const input of document.querySelectorAll<HTMLInputElement>("#key-fields input")) {
    if (input.dataset.key) {
      partial[input.dataset.key] = input.value;
    }
  }

  saveConfig(partial as Partial<Config>);
}

// --- Session control ---

function setStatus(state: string, text: string): void {
  $<HTMLSpanElement>("#status-dot").className = `dot ${state}`;
  $<HTMLSpanElement>("#status-text").textContent = text;
}

async function resumeFromSession(stored: StoredSession): Promise<void> {
  session = new Session();
  session.seedFrom({
    transcript: stored.transcript,
    insights: stored.insights,
    summary: stored.summary,
  });

  // Pre-fill the transcript UI with prior lines
  const container = $<HTMLDivElement>("#transcript-content");
  container.innerHTML = "";
  container.className = "text-sm leading-relaxed whitespace-pre-wrap break-words";
  for (const line of stored.transcript) {
    const div = document.createElement("div");
    const label = line.source === "mic" ? "You" : "Them";
    const color = line.source === "mic" ? "text-info" : "text-warning";
    div.innerHTML = `<span class="${color} font-semibold">${label}:</span> ${escapeHtml(line.text)}`;
    container.appendChild(div);
  }

  await startSession(true);
}

async function startSession(resumed?: boolean): Promise<void> {
  if (!session) session = new Session();

  session.onTranscript = (entry: TranscriptEntry) => {
    appendTranscript(entry);
    pipAppendTranscript(entry);
    pushTranscript(entry.source, entry.text);
  };

  session.onInsights = (insights) => {
    updateDashboardInsights(insights);
    pipUpdateInsights(insights);
    pushInsights(insights);
  };

  session.onError = (msg) => {
    setStatus("error", msg);
  };

  session.onWarning = (msg) => {
    const container = $<HTMLDivElement>("#compat-hints");
    const el = document.createElement("div");
    el.className = "alert alert-warning alert-sm py-1 px-3";
    el.innerHTML = `<span>${msg}</span><button class="btn btn-ghost btn-xs btn-circle">✕</button>`;
    el.querySelector("button")!.addEventListener("click", () => el.remove());
    container.appendChild(el);
  };

  session.onActivity = (source, level) => {
    // Update navbar indicators
    const dot =
      source === "mic" ? $<HTMLSpanElement>("#mic-level") : $<HTMLSpanElement>("#tab-level");
    if (level > 0.01) {
      dot.className = "w-2 h-2 rounded-full bg-success animate-pulse";
    } else {
      dot.className = "w-2 h-2 rounded-full bg-success/30";
    }
    // Update PiP indicators
    pipUpdateActivity(source, level);
  };

  try {
    await session.start();
    pushStatus(true);
    setStatus("on", "Listening...");
    $<HTMLButtonElement>("#btn-start").hidden = true;
    $<HTMLButtonElement>("#btn-stop").hidden = false;
    $<HTMLButtonElement>("#btn-pip").hidden = false;
    $<HTMLDivElement>("#audio-indicators").hidden = false;

    // Hide tab indicator if not capturing tab
    const cfg = loadConfig();
    $<HTMLSpanElement>("#tab-level").parentElement!.hidden = !cfg.captureTab;

    // Reset transcript (unless resuming — already pre-filled)
    if (!resumed) {
      const el = $<HTMLDivElement>("#transcript-content");
      el.textContent = "Listening...";
      el.className =
        "text-sm leading-relaxed text-base-content/50 italic whitespace-pre-wrap break-words";
    }
  } catch (e) {
    setStatus("error", e instanceof Error ? e.message : String(e));
  }
}

async function stopSession(): Promise<void> {
  await session?.stop();
  session = null;
  pushStatus(false);
  setStatus("off", "Stopped — session saved");
  $<HTMLButtonElement>("#btn-start").hidden = false;
  $<HTMLButtonElement>("#btn-stop").hidden = true;
  $<HTMLButtonElement>("#btn-pip").hidden = true;
  $<HTMLDivElement>("#audio-indicators").hidden = true;
  pipWindow?.close();
  await renderSessionHistory();
}

// --- Transcript display ---

function appendTranscript(entry: TranscriptEntry): void {
  const container = $<HTMLDivElement>("#transcript-content");
  if (container.classList.contains("italic")) {
    container.innerHTML = "";
    container.className = "text-sm leading-relaxed whitespace-pre-wrap break-words";
  }

  const line = document.createElement("div");
  const label = entry.source === "mic" ? "You" : "Them";
  const color = entry.source === "mic" ? "text-info" : "text-warning";
  line.innerHTML = `<span class="${color} font-semibold">${label}:</span> ${escapeHtml(entry.text)}`;
  container.appendChild(line);

  const box = $<HTMLDivElement>("#transcript-box");
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(text: string): string {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

// --- Dashboard insights ---

function updateDashboardInsights(insights: Record<string, string[]>): void {
  for (const [key, items] of Object.entries(insights)) {
    const panel = document.getElementById(`insight-${key}`);
    if (!panel) continue;

    if (items.length === 0) {
      panel.innerHTML = '<p class="text-xs text-base-content/40 italic">Nothing yet...</p>';
    } else {
      const container = document.createElement("div");
      container.className = "flex flex-col gap-2";
      for (const item of items.slice(-10)) {
        const card = document.createElement("div");
        card.className =
          "bg-base-200 rounded-lg px-3 py-2 text-xs leading-relaxed border-l-2 border-primary";
        card.textContent = item;
        container.appendChild(card);
      }
      panel.innerHTML = "";
      panel.appendChild(container);
    }
  }
}

// --- Dashboard insight tab switching ---

function setupInsightTabs(): void {
  const bar = $<HTMLDivElement>("#insight-tabs");
  bar.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-panel]");
    if (!btn) return;

    const panels = $<HTMLDivElement>("#insight-panels");
    for (const b of bar.querySelectorAll("button")) b.classList.remove("tab-active");
    for (const p of panels.querySelectorAll<HTMLElement>(".panel-item")) {
      p.classList.add("hidden");
      p.classList.remove("block");
    }

    btn.classList.add("tab-active");
    const panel = document.getElementById(btn.dataset.panel!);
    if (panel) {
      panel.classList.remove("hidden");
      panel.classList.add("block");
    }
  });
}

// --- Dashboard chat ---

function setupChat(): void {
  const input = $<HTMLInputElement>("#chat-input");
  const btn = $<HTMLButtonElement>("#btn-send");

  const send = async () => {
    const q = input.value.trim();
    if (!q || !session?.llm || !session.analyzer) return;
    input.value = "";
    appendChatMessage("user", q);

    try {
      const context = buildQAContext();
      const result = await answerQuestion(session.llm, q, context, chatHistory);
      chatHistory = result.history;
      appendChatMessage("assistant", result.answer);
    } catch (e) {
      appendChatMessage("assistant", `Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  btn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
}

function appendChatMessage(role: string, text: string): void {
  const el = document.createElement("div");
  el.className = `text-sm leading-snug ${role === "user" ? "text-info" : "text-success"}`;
  el.textContent = `${role === "user" ? "You" : "moanete"}: ${text}`;
  $<HTMLDivElement>("#chat-messages").appendChild(el);
  el.scrollIntoView({ behavior: "smooth" });
}

// --- Dashboard summary ---

function setupSummary(): void {
  $<HTMLButtonElement>("#btn-summarize").addEventListener("click", async () => {
    if (!session?.llm || !session.analyzer) return;
    const el = $<HTMLDivElement>("#summary-content");
    el.textContent = "Generating...";
    el.className = "text-sm leading-relaxed flex-1 max-h-24 overflow-y-auto";

    try {
      const summary = await summarizeTranscript(session.llm, session.analyzer.transcript);
      el.textContent = summary;
      session.summary = summary;
      pushSummary(summary);
    } catch (e) {
      el.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  });
}

// --- Picture-in-Picture ---

let pipWindow: Window | null = null;

async function openPiP(): Promise<void> {
  if (!("documentPictureInPicture" in window)) {
    alert("Document Picture-in-Picture is not supported in this browser.\nRequires Chrome 116+.");
    return;
  }

  if (!window.documentPictureInPicture) return;
  pipWindow = await window.documentPictureInPicture.requestWindow({ width: 400, height: 500 });

  buildPipUI(pipWindow.document, "", {
    onChat: handlePipChat,
    onSummarize: handlePipSummarize,
  });

  if (session?.analyzer) {
    seedPipState(
      session.analyzer.categories,
      session.analyzer.insights,
      session.analyzer.transcript,
    );
  }

  pipWindow.addEventListener("pagehide", () => {
    destroyPipUI();
    pipWindow = null;
  });
}

async function handlePipChat(question: string, history: ChatMessage[]): Promise<void> {
  if (!session?.llm || !session.analyzer) return;
  try {
    const context = buildQAContext();
    const result = await answerQuestion(session.llm, question, context, history);
    pipSetChatReply(result.answer, result.history);
  } catch (e) {
    pipSetChatReply(`Error: ${e instanceof Error ? e.message : String(e)}`, []);
  }
}

async function handlePipSummarize(): Promise<void> {
  if (!session?.llm || !session.analyzer) return;
  try {
    const summary = await summarizeTranscript(session.llm, session.analyzer.transcript);
    pipSetSummary(summary);
  } catch (e) {
    pipSetSummary(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function buildQAContext(): string {
  const a = session?.analyzer;
  if (!a) return "";
  const insights = a.insights;
  const parts = [`Transcript (last 2000 chars): ${a.transcript.slice(-2000)}`];
  for (let i = 0; i < a.categories.length; i++) {
    const key = a.keys[i]!;
    const items = insights[key] || [];
    parts.push(`${a.categories[i]}: ${items.slice(-5).join(", ")}`);
  }
  return parts.join("\n");
}

// --- Browser compatibility hints ---

function detectCompatHints(): void {
  const hints: string[] = [];
  const ua = navigator.userAgent;
  const isFirefox = ua.includes("Firefox");
  const isChromium = "chrome" in window;
  const isMac = ua.includes("Macintosh");
  const isLinux = ua.includes("Linux");

  if (!("documentPictureInPicture" in window)) {
    hints.push("PiP overlay not available in this browser (requires Chrome/Edge 116+)");
  }

  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
    hints.push("Speech recognition not available — use Chrome/Edge, or enable flag in Firefox");
  }

  if (isMac) {
    hints.push("System audio capture unavailable on macOS — tab audio only via Chrome");
  } else if (isLinux && isChromium) {
    hints.push("For system audio on Linux, PipeWire is required — Firefox may work better");
  } else if (isFirefox && !isLinux) {
    hints.push("Firefox does not support system audio capture on this OS");
  }

  const container = $<HTMLDivElement>("#compat-hints");
  for (const hint of hints) {
    const el = document.createElement("div");
    el.className = "alert alert-warning alert-sm py-1 px-3";
    el.innerHTML = `<span>${hint}</span><button class="btn btn-ghost btn-xs btn-circle">✕</button>`;
    el.querySelector("button")!.addEventListener("click", () => el.remove());
    container.appendChild(el);
  }
}

// --- Rebuild insight tabs from config ---

function rebuildDashboardInsightTabs(categories: string[]): void {
  const bar = $<HTMLDivElement>("#insight-tabs");
  const panels = $<HTMLDivElement>("#insight-panels");
  bar.innerHTML = "";
  panels.innerHTML = "";

  categories.forEach((name, i) => {
    const key = toKey(name);
    const btn = document.createElement("button");
    btn.className = `tab text-xs${i === 0 ? " tab-active" : ""}`;
    btn.textContent = name;
    btn.dataset.panel = `insight-${key}`;
    bar.appendChild(btn);

    const panel = document.createElement("div");
    panel.className = `panel-item absolute inset-0 p-3 overflow-y-auto ${i === 0 ? "block" : "hidden"}`;
    panel.id = `insight-${key}`;
    panel.innerHTML = '<p class="text-xs text-base-content/40 italic">Nothing yet...</p>';
    panels.appendChild(panel);
  });
}

// --- Session history ---

async function renderSessionHistory(): Promise<void> {
  const sessions = await listSessions();
  const list = $<HTMLDivElement>("#history-list");
  const detail = $<HTMLDivElement>("#history-detail");
  const backBtn = $<HTMLButtonElement>("#btn-history-back");

  detail.classList.add("hidden");
  detail.innerHTML = "";
  list.classList.remove("hidden");
  backBtn.classList.add("hidden");

  if (sessions.length === 0) {
    list.innerHTML = '<p class="text-sm text-base-content/40 italic">No sessions yet.</p>';
    return;
  }

  list.innerHTML = "";
  for (const s of sessions) {
    const date = new Date(s.startedAt).toLocaleString();
    const dur = formatDur(s.duration);
    const preview =
      s.transcript
        .slice(0, 2)
        .map((l) => l.text)
        .join(" ") || "Empty session";

    const card = document.createElement("div");
    card.className =
      "bg-base-200 rounded-lg p-3 cursor-pointer hover:bg-base-300 transition-colors border border-base-content/5";
    card.innerHTML = `
      <div class="flex justify-between items-center mb-1">
        <span class="text-xs font-semibold">${date}</span>
        <span class="badge badge-sm badge-ghost">${dur}</span>
      </div>
      <p class="text-xs text-base-content/60 truncate">${escapeHtml(preview)}</p>
      <div class="flex gap-1 mt-2">
        <button class="btn btn-xs btn-primary resume-btn">Resume</button>
        <button class="btn btn-xs btn-ghost view-btn">View</button>
        <button class="btn btn-xs btn-ghost export-btn">Export</button>
        <button class="btn btn-xs btn-ghost text-error delete-btn">Delete</button>
      </div>
    `;

    card.querySelector(".view-btn")!.addEventListener("click", (e) => {
      e.stopPropagation();
      showSessionDetail(s);
    });

    card.querySelector(".export-btn")!.addEventListener("click", (e) => {
      e.stopPropagation();
      downloadMarkdown(s);
    });

    card.querySelector(".delete-btn")!.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteSession(s.id);
      await renderSessionHistory();
    });

    card.querySelector(".resume-btn")!.addEventListener("click", (e) => {
      e.stopPropagation();
      $<HTMLDialogElement>("#history-modal").close();
      resumeFromSession(s);
    });

    list.appendChild(card);
  }
}

function showSessionDetail(s: StoredSession): void {
  const list = $<HTMLDivElement>("#history-list");
  const detail = $<HTMLDivElement>("#history-detail");
  const backBtn = $<HTMLButtonElement>("#btn-history-back");

  list.classList.add("hidden");
  detail.classList.remove("hidden");
  backBtn.classList.remove("hidden");

  const date = new Date(s.startedAt).toLocaleString();
  const dur = formatDur(s.duration);

  let html = `<h4 class="text-sm font-bold mb-3">${date} (${dur})</h4>`;

  // Transcript
  html += '<h5 class="text-xs font-semibold text-primary mb-1">Transcript</h5>';
  html += '<div class="mb-4 flex flex-col gap-1">';
  for (const line of s.transcript) {
    const label = line.source === "mic" ? "You" : "Them";
    const color = line.source === "mic" ? "text-info" : "text-warning";
    html += `<div class="text-xs"><span class="${color} font-semibold">${label}:</span> ${escapeHtml(line.text)}</div>`;
  }
  html += "</div>";

  // Insights
  for (const cat of s.categories) {
    const key = toKey(cat);
    const items = s.insights[key] || [];
    html += `<h5 class="text-xs font-semibold text-primary mb-1">${escapeHtml(cat)}</h5>`;
    if (items.length === 0) {
      html += '<p class="text-xs text-base-content/40 italic mb-3">Nothing</p>';
    } else {
      html += '<div class="flex flex-col gap-1 mb-3">';
      for (const item of items) {
        html += `<div class="bg-base-300 rounded px-2 py-1 text-xs border-l-2 border-primary">${escapeHtml(item)}</div>`;
      }
      html += "</div>";
    }
  }

  // Summary
  if (s.summary) {
    html += '<h5 class="text-xs font-semibold text-primary mb-1">Summary</h5>';
    html += `<p class="text-xs leading-relaxed whitespace-pre-wrap">${escapeHtml(s.summary)}</p>`;
  }

  detail.innerHTML = html;
}

function downloadMarkdown(s: StoredSession): void {
  const md = exportSessionMarkdown(s);
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `moanete-${new Date(s.startedAt).toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDur(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// --- Event listeners ---

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  detectCompatHints();
  setupInsightTabs();
  setupChat();
  setupSummary();
  connectBridge();

  const cfg = loadConfig();

  // Build insight tabs from config
  const categories = cfg.insightTabs
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  rebuildDashboardInsightTabs(categories);

  $<HTMLSelectElement>("#stt-provider").addEventListener("change", () => {
    renderKeyFields(
      $<HTMLSelectElement>("#stt-provider").value,
      $<HTMLSelectElement>("#llm-provider").value,
      cfg,
    );
  });
  $<HTMLSelectElement>("#llm-provider").addEventListener("change", () => {
    renderKeyFields(
      $<HTMLSelectElement>("#stt-provider").value,
      $<HTMLSelectElement>("#llm-provider").value,
      cfg,
    );
  });

  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
    btn.addEventListener("click", () => {
      $<HTMLInputElement>("#insight-tabs").value = btn.dataset.preset || "";
    });
  }

  // Settings modal
  $<HTMLButtonElement>("#btn-settings").addEventListener("click", () => {
    $<HTMLDialogElement>("#settings-modal").showModal();
  });

  $<HTMLButtonElement>("#btn-save").addEventListener("click", () => {
    saveSettings();
    // Rebuild insight tabs with new config
    const newCategories = $<HTMLInputElement>("#insight-tabs")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    rebuildDashboardInsightTabs(newCategories);
    $<HTMLDialogElement>("#settings-modal").close();
  });

  // History modal
  $<HTMLButtonElement>("#btn-history").addEventListener("click", async () => {
    await renderSessionHistory();
    $<HTMLDialogElement>("#history-modal").showModal();
  });

  $<HTMLButtonElement>("#btn-history-back").addEventListener("click", () => {
    $<HTMLDivElement>("#history-list").classList.remove("hidden");
    $<HTMLDivElement>("#history-detail").classList.add("hidden");
    $<HTMLButtonElement>("#btn-history-back").classList.add("hidden");
  });

  $<HTMLButtonElement>("#btn-start").addEventListener("click", () => startSession());
  $<HTMLButtonElement>("#btn-stop").addEventListener("click", stopSession);
  $<HTMLButtonElement>("#btn-pip").addEventListener("click", openPiP);
});
