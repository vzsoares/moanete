import { toKey } from "../core/analyzer.ts";
import { type Config, loadConfig, saveConfig } from "../core/config.ts";
import {
  connectBridge,
  isBridgeConnected,
  mcpCallTool,
  mcpConnect,
  mcpDisconnect,
  mcpListServers,
  mcpListTools,
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
import type { ScreenCapture } from "../core/storage.ts";
import { analyzeScreen, answerQuestion, summarizeTranscript } from "../core/summarizer.ts";
import type { ChatMessage } from "../providers/llm/types.ts";
import {
  buildPipUI,
  destroyPipUI,
  pipAppendTranscript,
  setChatReply as pipSetChatReply,
  pipSetScreenAvailable,
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

function renderProviderFields(
  containerId: string,
  provider: string,
  fieldMap: Record<string, DynamicField[]>,
  config: Config,
): void {
  const container = $<HTMLDivElement>(containerId);
  container.innerHTML = "";

  const fields = fieldMap[provider];
  if (!fields) return;

  for (const field of fields) {
    const inputType = field.type || "text";
    const value = String(config[field.key] || "");
    const el = document.createElement("label");
    el.className = "form-control w-full";
    el.innerHTML = `<div class="label"><span class="label-text text-xs">${field.label}</span></div><input type="${inputType}" class="input input-bordered input-sm w-full" data-key="${field.key}" placeholder="${field.placeholder || ""}" value="${escapeAttr(value)}" />`;
    container.appendChild(el);
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function loadSettings(): void {
  const cfg = loadConfig();
  $<HTMLSelectElement>("#stt-provider").value = cfg.sttProvider;
  $<HTMLSelectElement>("#stt-language").value = cfg.sttLanguage;
  $<HTMLSelectElement>("#llm-provider").value = cfg.llmProvider;
  $<HTMLInputElement>("#insight-tabs").value = cfg.insightTabs;
  $<HTMLInputElement>("#analysis-interval").value = String(cfg.analysisIntervalMs / 1000);
  $<HTMLInputElement>("#capture-mic").checked = cfg.captureMic;
  $<HTMLInputElement>("#capture-tab").checked = cfg.captureTab;
  $<HTMLInputElement>("#multi-agent").checked = cfg.multiAgent;
  renderProviderFields("#stt-fields", cfg.sttProvider, STT_FIELDS, cfg);
  renderProviderFields("#llm-fields", cfg.llmProvider, LLM_FIELDS, cfg);
}

function saveSettings(): void {
  const intervalSec = Number($<HTMLInputElement>("#analysis-interval").value) || 15;

  const partial: Record<string, unknown> = {
    sttProvider: $<HTMLSelectElement>("#stt-provider").value,
    sttLanguage: $<HTMLSelectElement>("#stt-language").value,
    llmProvider: $<HTMLSelectElement>("#llm-provider").value,
    insightTabs: $<HTMLInputElement>("#insight-tabs").value,
    analysisIntervalMs: intervalSec * 1000,
    captureMic: $<HTMLInputElement>("#capture-mic").checked,
    captureTab: $<HTMLInputElement>("#capture-tab").checked,
    multiAgent: $<HTMLInputElement>("#multi-agent").checked,
  };

  for (const input of document.querySelectorAll<HTMLInputElement>(
    "#stt-fields input, #llm-fields input",
  )) {
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
      const summary = await summarizeTranscript(
        session.llm,
        session.analyzer.transcript,
        session.analyzer.screenDescriptions,
      );
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
    onChatGenerate: handlePipChatGenerate,
    onAutoAssist: () => {}, // Auto-assist handled by dashboard only
    onSummarize: handlePipSummarize,
    onToggleAutoCapture: handlePipToggleAutoCapture,
    onCaptureOnce: handlePipCaptureOnce,
  });

  if (session?.analyzer) {
    seedPipState(
      session.analyzer.categories,
      session.analyzer.insights,
      session.analyzer.transcript,
    );
  }

  if (session?.hasVideoTrack) {
    pipSetScreenAvailable(true, session.autoCapturing);
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
    pipSetChatReply(result.answer, result.history, result.suggestions);
  } catch (e) {
    pipSetChatReply(`Error: ${e instanceof Error ? e.message : String(e)}`, []);
  }
}

async function handlePipChatGenerate(prompt: string): Promise<void> {
  if (!session?.llm || !session.analyzer || !prompt) return;
  try {
    const context = buildQAContext();
    const result = await session.llm.chat(
      [{ role: "user", content: `${context}\n\nProduce the requested analysis.` }],
      { system: prompt, maxTokens: 1500 },
    );
    pipSetChatReply(result, []);
  } catch (e) {
    pipSetChatReply(`Error: ${e instanceof Error ? e.message : String(e)}`, []);
  }
}

async function handlePipSummarize(): Promise<void> {
  if (!session?.llm || !session.analyzer) return;
  try {
    const summary = await summarizeTranscript(
      session.llm,
      session.analyzer.transcript,
      session.analyzer.screenDescriptions,
    );
    pipSetSummary(summary);
  } catch (e) {
    pipSetSummary(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function handlePipToggleAutoCapture(): boolean {
  if (!session) return false;
  if (session.autoCapturing) {
    session.stopAutoCapture();
    return false;
  }
  session.startAutoCapture(5000);
  return true;
}

async function handlePipCaptureOnce(): Promise<void> {
  if (!session?.visionLlm || !session.hasVideoTrack) return;
  try {
    const frame = await session.captureFrame();
    const transcript = session.analyzer?.transcript ?? "";
    const result = await analyzeScreen(session.visionLlm, frame, transcript);
    const capture: ScreenCapture = { timestamp: Date.now(), image: frame, description: result };
    session.addScreenCapture(capture);
  } catch (e) {
    console.warn("[pip-capture]", e instanceof Error ? e.message : String(e));
  }
}

function buildQAContext(): string {
  const a = session?.analyzer;
  if (!a) return "";
  const insights = a.insights;
  const parts: string[] = [];
  const transcript = a.transcript.slice(-2000);
  if (transcript) {
    parts.push(`## Transcript (last 2000 chars)\n${transcript}`);
  }
  const screens = a.screenDescriptions;
  if (screens.length > 0) {
    parts.push(`## Screen content\n${screens.map((d, i) => `[Screen ${i + 1}] ${d}`).join("\n")}`);
  }
  const insightLines: string[] = [];
  for (let i = 0; i < a.categories.length; i++) {
    const key = a.keys[i]!;
    const items = insights[key] || [];
    if (items.length > 0) {
      insightLines.push(`${a.categories[i]}: ${items.slice(-5).join(", ")}`);
    }
  }
  if (insightLines.length > 0) {
    parts.push(`## Extracted insights\n${insightLines.join("\n")}`);
  }
  return parts.join("\n\n");
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
    hints.push("Browser speech recognition not available — use Whisper (local) for STT instead");
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

// --- MCP Servers UI ---

interface McpPreset {
  name: string;
  command: string;
  args: string;
  tokenLabel: string;
  buildEnv: (token: string) => Record<string, string>;
}

const MCP_PRESETS: Record<string, McpPreset> = {
  notion: {
    name: "notion",
    command: "npx",
    args: "-y @notionhq/notion-mcp-server",
    tokenLabel: "Notion Integration Token",
    buildEnv: (token) => ({
      OPENAPI_MCP_HEADERS: JSON.stringify({
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
      }),
    }),
  },
};

function showConnectForm(preset?: McpPreset): void {
  const form = $<HTMLDivElement>("#mcp-connect-form");
  const title = $<HTMLElement>("#mcp-form-title");
  const tokenField = $<HTMLElement>("#mcp-token-field");
  const tokenLabel = $<HTMLElement>("#mcp-token-label");

  form.classList.remove("hidden");

  if (preset) {
    title.textContent = `Connect to ${preset.name}`;
    $<HTMLInputElement>("#mcp-name").value = preset.name;
    $<HTMLInputElement>("#mcp-command").value = preset.command;
    $<HTMLInputElement>("#mcp-args").value = preset.args;
    tokenField.classList.remove("hidden");
    tokenLabel.textContent = preset.tokenLabel;
    $<HTMLInputElement>("#mcp-token").value = "";
    form.dataset.preset = preset.name;
  } else {
    title.textContent = "Connect Custom Server";
    $<HTMLInputElement>("#mcp-name").value = "";
    $<HTMLInputElement>("#mcp-command").value = "";
    $<HTMLInputElement>("#mcp-args").value = "";
    tokenField.classList.add("hidden");
    delete form.dataset.preset;
  }

  $<HTMLDivElement>("#mcp-connect-status").classList.add("hidden");
}

function hideConnectForm(): void {
  $<HTMLDivElement>("#mcp-connect-form").classList.add("hidden");
}

async function handleMcpConnect(): Promise<void> {
  const form = $<HTMLDivElement>("#mcp-connect-form");
  const status = $<HTMLDivElement>("#mcp-connect-status");
  const name = $<HTMLInputElement>("#mcp-name").value.trim();
  const command = $<HTMLInputElement>("#mcp-command").value.trim();
  const argsStr = $<HTMLInputElement>("#mcp-args").value.trim();
  const token = $<HTMLInputElement>("#mcp-token").value.trim();

  if (!name || !command) {
    status.textContent = "Name and command are required.";
    status.className = "text-xs mt-1 text-error";
    status.classList.remove("hidden");
    return;
  }

  const args = argsStr ? argsStr.split(/\s+/) : undefined;
  let env: Record<string, string> | undefined;

  const presetKey = form.dataset.preset;
  if (presetKey && MCP_PRESETS[presetKey] && token) {
    env = MCP_PRESETS[presetKey].buildEnv(token);
  }

  status.textContent = "Connecting...";
  status.className = "text-xs mt-1 text-base-content/60";
  status.classList.remove("hidden");

  try {
    await mcpConnect({ name, command, args, env });
    status.textContent = `Connected to "${name}"!`;
    status.className = "text-xs mt-1 text-success";
    hideConnectForm();
    renderMcpServers();
  } catch (err) {
    status.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
    status.className = "text-xs mt-1 text-error";
  }
}

async function renderMcpServers(): Promise<void> {
  const list = $<HTMLDivElement>("#mcp-servers-list");
  const toolsSection = $<HTMLDivElement>("#mcp-tools-section");
  const toolResult = $<HTMLDivElement>("#mcp-tool-result");

  toolsSection.classList.add("hidden");
  toolResult.classList.add("hidden");

  if (!isBridgeConnected()) {
    list.innerHTML =
      '<p class="text-sm text-error">MCP bridge not connected. Start it with <code class="badge badge-sm badge-ghost">just mcp</code></p>';
    return;
  }

  list.innerHTML = '<p class="text-sm text-base-content/40">Loading...</p>';

  try {
    const servers = await mcpListServers();

    if (servers.length === 0) {
      list.innerHTML =
        '<p class="text-sm text-base-content/40 italic">No servers connected. Use Quick Connect above to add one.</p>';
      return;
    }

    list.innerHTML = "";
    for (const name of servers) {
      const card = document.createElement("div");
      card.className =
        "bg-base-200 rounded-lg p-3 flex items-center justify-between border border-base-content/5";
      card.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="dot on"></span>
          <span class="text-sm font-semibold">${escapeHtml(name)}</span>
        </div>
        <div class="flex gap-1">
          <button class="btn btn-xs btn-primary mcp-show-tools" data-server="${escapeHtml(name)}">Tools</button>
          <button class="btn btn-xs btn-ghost text-error mcp-disconnect" data-server="${escapeHtml(name)}">Disconnect</button>
        </div>
      `;
      list.appendChild(card);
    }

    for (const btn of list.querySelectorAll<HTMLButtonElement>(".mcp-show-tools")) {
      btn.addEventListener("click", () => renderMcpTools(btn.dataset.server!));
    }

    for (const btn of list.querySelectorAll<HTMLButtonElement>(".mcp-disconnect")) {
      btn.addEventListener("click", async () => {
        await mcpDisconnect(btn.dataset.server!);
        renderMcpServers();
      });
    }
  } catch (err) {
    list.innerHTML = `<p class="text-sm text-error">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
  }
}

async function renderMcpTools(serverName: string): Promise<void> {
  const toolsSection = $<HTMLDivElement>("#mcp-tools-section");
  const toolsList = $<HTMLDivElement>("#mcp-tools-list");
  const toolResult = $<HTMLDivElement>("#mcp-tool-result");

  toolResult.classList.add("hidden");
  toolsSection.classList.remove("hidden");
  toolsList.innerHTML = '<p class="text-sm text-base-content/40">Loading tools...</p>';

  try {
    const allTools = await mcpListTools(serverName);
    const tools = allTools[serverName] ?? [];

    if (tools.length === 0) {
      toolsList.innerHTML =
        '<p class="text-sm text-base-content/40 italic">No tools available.</p>';
      return;
    }

    toolsList.innerHTML = "";
    for (const tool of tools) {
      const card = document.createElement("div");
      card.className = "bg-base-200 rounded-lg p-3 border border-base-content/5";
      card.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-semibold text-primary">${escapeHtml(tool.name)}</span>
          <button class="btn btn-xs btn-ghost mcp-call-tool" data-server="${escapeHtml(serverName)}" data-tool="${escapeHtml(tool.name)}">Run</button>
        </div>
        <p class="text-xs text-base-content/60">${escapeHtml(tool.description ?? "No description")}</p>
        ${
          tool.inputSchema
            ? `<details class="mt-1"><summary class="text-xs cursor-pointer text-base-content/40">Schema</summary><pre class="text-xs mt-1 bg-base-300 rounded p-2 overflow-auto max-h-32">${escapeHtml(JSON.stringify(tool.inputSchema, null, 2))}</pre></details>`
            : ""
        }
      `;
      toolsList.appendChild(card);
    }

    for (const btn of toolsList.querySelectorAll<HTMLButtonElement>(".mcp-call-tool")) {
      btn.addEventListener("click", () => {
        const argsStr = prompt("Arguments (JSON):", "{}");
        if (argsStr === null) return;
        callMcpTool(btn.dataset.server!, btn.dataset.tool!, argsStr);
      });
    }
  } catch (err) {
    toolsList.innerHTML = `<p class="text-sm text-error">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
  }
}

async function callMcpTool(serverName: string, toolName: string, argsJson: string): Promise<void> {
  const resultDiv = $<HTMLDivElement>("#mcp-tool-result");
  const pre = resultDiv.querySelector("pre")!;

  resultDiv.classList.remove("hidden");
  pre.textContent = "Calling...";

  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    const result = await mcpCallTool(serverName, toolName, args);
    pre.textContent = result.content || "(empty response)";
    if (result.isError) pre.classList.add("text-error");
    else pre.classList.remove("text-error");
  } catch (err) {
    pre.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    pre.classList.add("text-error");
  }
}

function setupMcpModal(): void {
  // Preset buttons
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".mcp-preset")) {
    btn.addEventListener("click", () => {
      const preset = MCP_PRESETS[btn.dataset.preset!];
      showConnectForm(preset);
    });
  }

  $<HTMLButtonElement>("#btn-mcp-connect").addEventListener("click", handleMcpConnect);
  $<HTMLButtonElement>("#btn-mcp-cancel").addEventListener("click", hideConnectForm);
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
    renderProviderFields(
      "#stt-fields",
      $<HTMLSelectElement>("#stt-provider").value,
      STT_FIELDS,
      cfg,
    );
  });
  $<HTMLSelectElement>("#llm-provider").addEventListener("change", () => {
    renderProviderFields(
      "#llm-fields",
      $<HTMLSelectElement>("#llm-provider").value,
      LLM_FIELDS,
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

  // MCP modal
  setupMcpModal();
  $<HTMLButtonElement>("#btn-mcp").addEventListener("click", () => {
    $<HTMLDialogElement>("#mcp-modal").showModal();
    renderMcpServers();
  });

  $<HTMLButtonElement>("#btn-mcp-refresh").addEventListener("click", () => renderMcpServers());

  $<HTMLButtonElement>("#btn-start").addEventListener("click", () => startSession());
  $<HTMLButtonElement>("#btn-stop").addEventListener("click", stopSession);
  $<HTMLButtonElement>("#btn-pip").addEventListener("click", openPiP);
});
