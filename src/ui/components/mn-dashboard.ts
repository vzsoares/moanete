import { type Config, loadConfig, saveConfig } from "../../core/config.ts";
import {
  connectBridge,
  pushInsights,
  pushStatus,
  pushSummary,
  pushTranscript,
} from "../../core/mcp-bridge.ts";
import { Session, type TranscriptEntry } from "../../core/session.ts";
import type { StoredSession } from "../../core/storage.ts";
import { answerQuestion, summarizeTranscript } from "../../core/summarizer.ts";
import type { ChatMessage } from "../../providers/llm/types.ts";
import { MoaneteElement } from "../base.ts";
import {
  buildPipUI,
  destroyPipUI,
  pipAppendTranscript,
  setChatReply as pipSetChatReply,
  setSummary as pipSetSummary,
  pipUpdateActivity,
  updateInsights as pipUpdateInsights,
  seedPipState,
} from "../pip.ts";
import type { MnAudioLevel } from "./mn-audio-level.ts";
import type { MnChat } from "./mn-chat.ts";
import type { MnCompatHints } from "./mn-compat-hints.ts";
import type { MnHistory } from "./mn-history.ts";
import type { MnInsights } from "./mn-insights.ts";
import type { MnMcp } from "./mn-mcp.ts";
import type { MnSettings } from "./mn-settings.ts";
import type { MnStatus } from "./mn-status.ts";
import type { MnSummary } from "./mn-summary.ts";
import type { MnTranscript } from "./mn-transcript.ts";

export class MnDashboard extends MoaneteElement {
  private _session: Session | null = null;
  private _chatHistory: ChatMessage[] = [];
  private _pipWindow: Window | null = null;

  /** Hook: called before session starts. Return false to block. */
  beforeSessionStart: (() => Promise<boolean> | boolean) | null = null;
  /** Hook: called after session stops with the saved session data. */
  onSessionEnd: ((session: StoredSession) => void) | null = null;

  render(): void {
    this.className = "h-screen flex flex-col bg-base-200 overflow-hidden";
    this.innerHTML = `
      <!-- Navbar -->
      <nav class="navbar bg-base-300 border-b border-base-content/10 px-4 gap-2 shrink-0">
        <div class="flex-none"><h1 class="text-lg font-bold text-primary">moanete</h1></div>
        <mn-status></mn-status>
        <div class="audio-indicators flex items-center gap-3 ml-2" hidden>
          <mn-audio-level class="mic-level" label="Mic"></mn-audio-level>
          <mn-audio-level class="tab-level" label="Tab"></mn-audio-level>
        </div>
        <div class="flex-1"></div>
        <div class="flex items-center gap-2">
          <button class="btn-start btn btn-primary btn-sm">Start Session</button>
          <button class="btn-stop btn btn-error btn-sm" hidden>Stop</button>
          <button class="btn-pip btn btn-ghost btn-sm" hidden>PiP</button>
          <button class="btn-mcp btn btn-ghost btn-sm gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            MCP
          </button>
          <button class="btn-history btn btn-ghost btn-sm gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            History
          </button>
          <button class="btn-settings btn btn-ghost btn-sm btn-circle" aria-label="Settings">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
        </div>
      </nav>

      <mn-compat-hints></mn-compat-hints>

      <!-- Main dashboard -->
      <main class="flex-1 flex overflow-hidden p-4 gap-4">
        <mn-transcript></mn-transcript>
        <aside class="w-96 flex flex-col gap-4 shrink-0">
          <mn-insights></mn-insights>
          <mn-chat></mn-chat>
        </aside>
      </main>

      <mn-summary></mn-summary>

      <!-- Modals -->
      <mn-settings></mn-settings>
      <mn-history></mn-history>
      <mn-mcp></mn-mcp>
    `;

    this._bindNavbar();
    this._bindComponents();
    this._initConfig();
    connectBridge();
  }

  private _initConfig(): void {
    const cfg = loadConfig();
    const settings = this.$<MnSettings>("mn-settings");
    settings.config = cfg;

    const insights = this.$<MnInsights>("mn-insights");
    const categories = cfg.insightTabs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    insights.categories = categories;
  }

  private _bindNavbar(): void {
    this.$<HTMLButtonElement>(".btn-start").addEventListener("click", () => this._startSession());
    this.$<HTMLButtonElement>(".btn-stop").addEventListener("click", () => this._stopSession());
    this.$<HTMLButtonElement>(".btn-pip").addEventListener("click", () => this._openPiP());
    this.$<HTMLButtonElement>(".btn-settings").addEventListener("click", () =>
      this.$<MnSettings>("mn-settings").open(),
    );
    this.$<HTMLButtonElement>(".btn-history").addEventListener("click", () =>
      this.$<MnHistory>("mn-history").open(),
    );
    this.$<HTMLButtonElement>(".btn-mcp").addEventListener("click", () =>
      this.$<MnMcp>("mn-mcp").open(),
    );
  }

  private _bindComponents(): void {
    // Settings save
    this.addEventListener("mn-settings-save", ((e: CustomEvent<{ config: Partial<Config> }>) => {
      saveConfig(e.detail.config);
      const cfg = loadConfig();
      const categories = cfg.insightTabs
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      this.$<MnInsights>("mn-insights").categories = categories;
    }) as EventListener);

    // Chat send
    this.addEventListener("mn-chat-send", ((e: CustomEvent<{ question: string }>) => {
      this._handleChat(e.detail.question);
    }) as EventListener);

    // Summary
    this.addEventListener("mn-summarize", () => this._handleSummarize());

    // Session resume
    this.addEventListener("mn-session-resume", ((e: CustomEvent<{ session: StoredSession }>) => {
      this._resumeSession(e.detail.session);
    }) as EventListener);
  }

  private async _startSession(resumed?: boolean): Promise<void> {
    if (this.beforeSessionStart) {
      const allowed = await this.beforeSessionStart();
      if (!allowed) return;
    }

    if (!this._session) this._session = new Session();

    this._session.onTranscript = (entry: TranscriptEntry) => {
      this.$<MnTranscript>("mn-transcript").appendEntry(entry);
      pipAppendTranscript(entry);
      pushTranscript(entry.source, entry.text);
    };

    this._session.onInsights = (insights) => {
      this.$<MnInsights>("mn-insights").updateInsights(insights);
      pipUpdateInsights(insights);
      pushInsights(insights);
    };

    this._session.onError = (msg) => {
      this.$<MnStatus>("mn-status").setState("error", msg);
    };

    this._session.onWarning = (msg) => {
      this.$<MnCompatHints>("mn-compat-hints").addHint(msg);
    };

    this._session.onActivity = (source, level) => {
      const selector = source === "mic" ? ".mic-level" : ".tab-level";
      this.querySelector<MnAudioLevel>(selector)?.setLevel(level);
      pipUpdateActivity(source, level);
    };

    try {
      await this._session.start();
      pushStatus(true);
      this.$<MnStatus>("mn-status").setState("on", "Listening...");
      this.$<HTMLButtonElement>(".btn-start").hidden = true;
      this.$<HTMLButtonElement>(".btn-stop").hidden = false;
      this.$<HTMLButtonElement>(".btn-pip").hidden = false;
      this.$<HTMLDivElement>(".audio-indicators").hidden = false;

      const cfg = loadConfig();
      const tabLevel = this.querySelector<MnAudioLevel>(".tab-level");
      if (tabLevel) tabLevel.hidden = !cfg.captureTab;

      if (!resumed) {
        this.$<MnTranscript>("mn-transcript").reset();
      }
    } catch (e) {
      this.$<MnStatus>("mn-status").setState("error", e instanceof Error ? e.message : String(e));
    }
  }

  private async _stopSession(): Promise<void> {
    await this._session?.stop();
    this._session = null;
    pushStatus(false);
    this.$<MnStatus>("mn-status").setState("off", "Stopped — session saved");
    this.$<HTMLButtonElement>(".btn-start").hidden = false;
    this.$<HTMLButtonElement>(".btn-stop").hidden = true;
    this.$<HTMLButtonElement>(".btn-pip").hidden = true;
    this.$<HTMLDivElement>(".audio-indicators").hidden = true;
    this._pipWindow?.close();
  }

  private async _resumeSession(stored: StoredSession): Promise<void> {
    this._session = new Session();
    this._session.seedFrom({
      transcript: stored.transcript,
      insights: stored.insights,
      summary: stored.summary,
    });
    this.$<MnTranscript>("mn-transcript").seedEntries(
      stored.transcript.map((l) => ({ source: l.source, text: l.text })),
    );
    await this._startSession(true);
  }

  private async _handleChat(question: string): Promise<void> {
    if (!this._session?.llm || !this._session.analyzer) return;
    try {
      const context = this._buildQAContext();
      const result = await answerQuestion(this._session.llm, question, context, this._chatHistory);
      this._chatHistory = result.history;
      this.$<MnChat>("mn-chat").appendMessage("assistant", result.answer);
    } catch (e) {
      this.$<MnChat>("mn-chat").appendMessage(
        "assistant",
        `Error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async _handleSummarize(): Promise<void> {
    if (!this._session?.llm || !this._session.analyzer) return;
    const summary = this.$<MnSummary>("mn-summary");
    summary.setLoading();
    try {
      const text = await summarizeTranscript(this._session.llm, this._session.analyzer.transcript);
      summary.setSummary(text);
      this._session.summary = text;
      pushSummary(text);
    } catch (e) {
      summary.setSummary(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async _openPiP(): Promise<void> {
    if (!("documentPictureInPicture" in window)) {
      alert("Document Picture-in-Picture is not supported in this browser.\nRequires Chrome 116+.");
      return;
    }
    if (!window.documentPictureInPicture) return;
    this._pipWindow = await window.documentPictureInPicture.requestWindow({
      width: 400,
      height: 500,
    });

    buildPipUI(this._pipWindow.document, "", {
      onChat: (question, history) => this._handlePipChat(question, history),
      onSummarize: () => this._handlePipSummarize(),
    });

    if (this._session?.analyzer) {
      seedPipState(
        this._session.analyzer.categories,
        this._session.analyzer.insights,
        this._session.analyzer.transcript,
      );
    }

    this._pipWindow.addEventListener("pagehide", () => {
      destroyPipUI();
      this._pipWindow = null;
    });
  }

  private async _handlePipChat(question: string, history: ChatMessage[]): Promise<void> {
    if (!this._session?.llm || !this._session.analyzer) return;
    try {
      const context = this._buildQAContext();
      const result = await answerQuestion(this._session.llm, question, context, history);
      pipSetChatReply(result.answer, result.history);
    } catch (e) {
      pipSetChatReply(`Error: ${e instanceof Error ? e.message : String(e)}`, []);
    }
  }

  private async _handlePipSummarize(): Promise<void> {
    if (!this._session?.llm || !this._session.analyzer) return;
    try {
      const text = await summarizeTranscript(this._session.llm, this._session.analyzer.transcript);
      pipSetSummary(text);
    } catch (e) {
      pipSetSummary(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private _buildQAContext(): string {
    const a = this._session?.analyzer;
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
}

customElements.define("mn-dashboard", MnDashboard);
