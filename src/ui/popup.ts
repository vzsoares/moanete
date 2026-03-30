import { loadConfig, saveConfig, type Config } from "../core/config.ts";
import { Session } from "../core/session.ts";
import { answerQuestion, summarizeTranscript } from "../core/summarizer.ts";
import type { ChatMessage } from "../providers/llm/types.ts";

const $ = <T extends HTMLElement>(sel: string): T =>
  document.querySelector<T>(sel)!;

let session: Session | null = null;

// --- Settings UI ---

const KEY_FIELDS: Record<string, { label: string; key: keyof Config }> = {
  openai: { label: "OpenAI API Key", key: "openaiApiKey" },
  anthropic: { label: "Anthropic API Key", key: "anthropicApiKey" },
  deepgram: { label: "Deepgram API Key", key: "deepgramApiKey" },
};

function renderKeyFields(sttProvider: string, llmProvider: string, config: Config): void {
  const container = $<HTMLDivElement>("#key-fields");
  container.innerHTML = "";

  const needed = new Set<string>();
  if (sttProvider === "deepgram") needed.add("deepgram");
  if (llmProvider === "openai") needed.add("openai");
  if (llmProvider === "anthropic") needed.add("anthropic");

  for (const id of needed) {
    const field = KEY_FIELDS[id];
    if (!field) continue;
    const el = document.createElement("label");
    el.innerHTML = `${field.label}<input type="password" data-key="${field.key}" value="${config[field.key] || ""}" />`;
    container.appendChild(el);
  }
}

async function loadSettings(): Promise<void> {
  const cfg = await loadConfig();
  $<HTMLSelectElement>("#stt-provider").value = cfg.sttProvider;
  $<HTMLSelectElement>("#stt-language").value = cfg.sttLanguage;
  $<HTMLSelectElement>("#llm-provider").value = cfg.llmProvider;
  $<HTMLInputElement>("#insight-tabs").value = cfg.insightTabs;
  $<HTMLInputElement>("#capture-mic").checked = cfg.captureMic;
  $<HTMLInputElement>("#capture-tab").checked = cfg.captureTab;
  renderKeyFields(cfg.sttProvider, cfg.llmProvider, cfg);
}

async function saveSettings(): Promise<void> {
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

  await saveConfig(partial as Partial<Config>);
}

// --- Session control ---

function setStatus(state: string, text: string): void {
  $<HTMLSpanElement>("#status-dot").className = `dot ${state}`;
  $<HTMLSpanElement>("#status-text").textContent = text;
}

async function startSession(): Promise<void> {
  session = new Session();

  session.onTranscript = (text) => {
    appendTranscript(text);
    pipWindow?.postMessage({ type: "transcript", text }, "*");
  };

  session.onInsights = (insights) => {
    pipWindow?.postMessage({ type: "insights", insights }, "*");
  };

  session.onError = (msg) => {
    setStatus("error", msg);
  };

  try {
    await session.start();
    setStatus("on", "Listening...");
    $<HTMLButtonElement>("#btn-start").hidden = true;
    $<HTMLButtonElement>("#btn-stop").hidden = false;
    $<HTMLButtonElement>("#btn-pip").hidden = false;
    $<HTMLDivElement>("#transcript-box").hidden = false;
  } catch (e) {
    setStatus("error", e instanceof Error ? e.message : String(e));
  }
}

function stopSession(): void {
  session?.stop();
  session = null;
  setStatus("off", "Stopped");
  $<HTMLButtonElement>("#btn-start").hidden = false;
  $<HTMLButtonElement>("#btn-stop").hidden = true;
  $<HTMLButtonElement>("#btn-pip").hidden = true;
  $<HTMLDivElement>("#transcript-box").hidden = true;
  pipWindow?.close();
}

// --- Transcript display ---

function appendTranscript(text: string): void {
  const el = $<HTMLDivElement>("#transcript-content");
  if (el.textContent === "Listening...") {
    el.textContent = "";
  }
  el.textContent += `${text}\n`;
  const box = $<HTMLDivElement>("#transcript-box");
  box.scrollTop = box.scrollHeight;
}

// --- Picture-in-Picture ---

let pipWindow: Window | null = null;

async function openPiP(): Promise<void> {
  if (!("documentPictureInPicture" in window)) {
    alert(
      "Document Picture-in-Picture is not supported in this browser.\nRequires Chrome 116+.",
    );
    return;
  }

  pipWindow = await (
    window as unknown as { documentPictureInPicture: { requestWindow(opts: { width: number; height: number }): Promise<Window> } }
  ).documentPictureInPicture.requestWindow({
    width: 400,
    height: 500,
  });

  const link = pipWindow.document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("pip.css");
  pipWindow.document.head.appendChild(link);

  const script = pipWindow.document.createElement("script");
  script.type = "module";
  script.src = chrome.runtime.getURL("src/ui/pip.js");
  pipWindow.document.head.appendChild(script);

  if (session?.analyzer) {
    pipWindow.addEventListener("load", () => {
      pipWindow!.postMessage(
        {
          type: "init",
          categories: session!.analyzer!.categories,
          insights: session!.analyzer!.insights,
          transcript: session!.analyzer!.transcript,
        },
        "*",
      );
    });
  }

  window.addEventListener("message", handlePipMessage);
  pipWindow.addEventListener("pagehide", () => {
    pipWindow = null;
  });
}

async function handlePipMessage(event: MessageEvent): Promise<void> {
  if (!session?.llm || !session.analyzer) return;
  const { type, payload } = event.data;

  if (type === "chat") {
    try {
      const context = buildQAContext();
      const result = await answerQuestion(
        session.llm,
        payload.question,
        context,
        payload.history || [],
      );
      pipWindow?.postMessage({ type: "chat-reply", ...result }, "*");
    } catch (e) {
      pipWindow?.postMessage(
        {
          type: "chat-reply",
          answer: `Error: ${e instanceof Error ? e.message : String(e)}`,
          history: [] as ChatMessage[],
        },
        "*",
      );
    }
  }

  if (type === "summarize") {
    try {
      const summary = await summarizeTranscript(session.llm, session.analyzer.transcript);
      pipWindow?.postMessage({ type: "summary", text: summary }, "*");
    } catch (e) {
      pipWindow?.postMessage(
        { type: "summary", text: `Error: ${e instanceof Error ? e.message : String(e)}` },
        "*",
      );
    }
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

// --- Event listeners ---

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();

  const cfg = await loadConfig();
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

  $<HTMLButtonElement>("#btn-save").addEventListener("click", saveSettings);
  $<HTMLButtonElement>("#btn-start").addEventListener("click", startSession);
  $<HTMLButtonElement>("#btn-stop").addEventListener("click", stopSession);
  $<HTMLButtonElement>("#btn-pip").addEventListener("click", openPiP);
});
