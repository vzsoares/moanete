import { createLLM } from "../providers/llm/types.ts";
import type { LLMProvider } from "../providers/llm/types.ts";
import { createSTT } from "../providers/stt/types.ts";
import type { STTProvider } from "../providers/stt/types.ts";
import { Analyzer } from "./analyzer.ts";
import { AudioCapture, type AudioSource } from "./audio.ts";
import { loadConfig } from "./config.ts";
import type { Config } from "./config.ts";
import type { ScreenCapture } from "./storage.ts";
import { type TranscriptLine, saveSession } from "./storage.ts";

/** Bigram similarity (Dice coefficient). Returns true if >= 0.7. */
function isSimilar(a: string, b: string, threshold = 0.7): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    const n = norm(s);
    for (let i = 0; i < n.length - 1; i++) set.add(n.slice(i, i + 2));
    return set;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return false;
  let intersection = 0;
  for (const bg of setA) {
    if (setB.has(bg)) intersection++;
  }
  return (2 * intersection) / (setA.size + setB.size) >= threshold;
}

// Register all providers (side-effect imports)
import "../providers/stt/browser.ts";
import "../providers/stt/deepgram.ts";
import "../providers/stt/whisper.ts";
import "../providers/stt/openai-whisper.ts";
import "../providers/llm/ollama.ts";
import "../providers/llm/openai.ts";
import "../providers/llm/anthropic.ts";

export interface TranscriptEntry {
  source: AudioSource;
  text: string;
}

export class Session {
  private _audio: AudioCapture | null = null;
  private _micSTT: STTProvider | null = null;
  private _tabSTT: STTProvider | null = null;
  private _llm: LLMProvider | null = null;
  private _visionLlm: LLMProvider | null = null;
  private _analyzer: Analyzer | null = null;
  private _running = false;
  private _config: Config | null = null;
  private _startedAt = 0;
  private _transcriptLines: TranscriptLine[] = [];
  private _screenCaptures: ScreenCapture[] = [];
  private _screenTimer: ReturnType<typeof setInterval> | null = null;
  private _summary = "";

  onTranscript: ((entry: TranscriptEntry) => void) | null = null;
  onInsights: ((insights: Record<string, string[]>) => void) | null = null;
  onError: ((error: string) => void) | null = null;
  onWarning: ((msg: string) => void) | null = null;
  onActivity: ((source: AudioSource, level: number) => void) | null = null;
  onScreenCapture: ((capture: ScreenCapture) => void) | null = null;

  get analyzer(): Analyzer | null {
    return this._analyzer;
  }

  get llm(): LLMProvider | null {
    return this._llm;
  }

  get visionLlm(): LLMProvider | null {
    return this._visionLlm;
  }

  get running(): boolean {
    return this._running;
  }

  /** Whether a screen share video track is available for frame capture */
  get hasVideoTrack(): boolean {
    return this._audio?.hasVideoTrack ?? false;
  }

  get screenCaptures(): ScreenCapture[] {
    return [...this._screenCaptures];
  }

  get autoCapturing(): boolean {
    return this._screenTimer !== null;
  }

  /** Capture a frame from the active screen share */
  async captureFrame(maxWidth = 1024): Promise<string> {
    if (!this._audio) throw new Error("No active audio capture");
    return this._audio.captureFrame(maxWidth);
  }

  /** Start auto-capturing screen every intervalMs and analyzing with LLM. */
  startAutoCapture(intervalMs = 5000): void {
    if (this._screenTimer) return;
    this._screenTimer = setInterval(() => this._captureAndAnalyze(), intervalMs);
    // Capture immediately on start
    this._captureAndAnalyze();
  }

  stopAutoCapture(): void {
    if (this._screenTimer) {
      clearInterval(this._screenTimer);
      this._screenTimer = null;
    }
  }

  private _lastScreenDescription = "";

  private async _captureAndAnalyze(): Promise<void> {
    if (!this._audio?.hasVideoTrack || !this._visionLlm) return;

    try {
      const image = await this._audio.captureFrame(800);

      // Build a compact prompt — we don't need the full analyzeScreen prompt,
      // just a quick description to feed into the analyzer context
      const description = await this._visionLlm!.chat(
        [
          {
            role: "user",
            content: [
              { type: "image", data: image, mediaType: "image/png" },
              {
                type: "text",
                text: "Extract the TEXT content visible on screen. Focus on: slide titles and bullet points, code and function names, questions or prompts, terminal output, chat messages. Output ONLY the extracted text, no descriptions of layout or visuals. If it's code, include the language.",
              },
            ],
          },
        ],
        { maxTokens: 200 },
      );

      const capture: ScreenCapture = {
        timestamp: Date.now(),
        image,
        description,
      };

      // Always save to history, but only push to analyzer if the screen changed
      this._screenCaptures.push(capture);
      this.onScreenCapture?.(capture);

      if (!isSimilar(this._lastScreenDescription, description)) {
        this._analyzer?.feedScreenContext(description);
        this._lastScreenDescription = description;
      }
    } catch (e) {
      console.warn("[screen-capture]", e instanceof Error ? e.message : String(e));
    }
  }

  get summary(): string {
    return this._summary;
  }

  set summary(value: string) {
    this._summary = value;
  }

  /** Seed with a prior session's data before calling start() */
  seedFrom(prior: {
    transcript: TranscriptLine[];
    insights: Record<string, string[]>;
    summary: string;
  }): void {
    this._transcriptLines = [...prior.transcript];
    this._summary = prior.summary;
    this._priorInsights = prior.insights;
    this._priorTranscriptText = prior.transcript
      .map((l) => {
        const label = l.source === "mic" ? "[You]" : "[Them]";
        return `${label} ${l.text}`;
      })
      .join(" ");
  }

  private _priorInsights: Record<string, string[]> | null = null;
  private _priorTranscriptText = "";

  async start(): Promise<void> {
    this._startedAt = Date.now();
    if (!this._transcriptLines.length) this._transcriptLines = [];
    if (!this._summary) this._summary = "";
    this._config = await loadConfig();
    const cfg = this._config;

    // Init LLM provider
    this._llm = createLLM(cfg.llmProvider);
    this._llm.configure({
      host: cfg.ollamaHost,
      model:
        cfg.llmProvider === "ollama"
          ? cfg.ollamaModel
          : cfg.llmProvider === "openai"
            ? cfg.openaiModel
            : cfg.anthropicModel,
      apiKey: cfg.llmProvider === "openai" ? cfg.openaiApiKey : cfg.anthropicApiKey,
      baseUrl: cfg.llmProvider === "anthropic" ? cfg.anthropicBaseUrl : undefined,
    });

    // Init vision LLM — for Ollama use a separate vision-capable model,
    // for OpenAI/Anthropic the default models already support vision
    if (cfg.llmProvider === "ollama" && cfg.ollamaVisionModel) {
      this._visionLlm = createLLM("ollama");
      this._visionLlm.configure({
        host: cfg.ollamaHost,
        model: cfg.ollamaVisionModel,
      });
    } else {
      this._visionLlm = this._llm;
    }

    // Init analyzer
    const categories = cfg.insightTabs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Parse custom agent prompts (JSON string → Record<string, string>)
    let agentPrompts: Record<string, string> | undefined;
    if (cfg.agentPrompts) {
      try {
        agentPrompts = JSON.parse(cfg.agentPrompts) as Record<string, string>;
      } catch {
        // ignore invalid JSON
      }
    }

    this._analyzer = new Analyzer(this._llm, {
      categories,
      intervalMs: cfg.analysisIntervalMs,
      multiAgent: cfg.multiAgent,
      agentPrompts,
    });
    this._analyzer.onUpdate = (insights) => this.onInsights?.(insights);

    // Seed analyzer with prior session data
    if (this._priorTranscriptText) {
      this._analyzer.feed(this._priorTranscriptText);
    }
    if (this._priorInsights) {
      this._analyzer.seedInsights(this._priorInsights);
    }

    // Init audio capture
    this._audio = new AudioCapture();

    const sttConfig = {
      apiKey: cfg.deepgramApiKey,
      openaiApiKey: cfg.openaiApiKey,
      language: cfg.sttLanguage,
      whisperHost: cfg.whisperHost,
      whisperModel: cfg.whisperModel,
    };

    // Init mic STT
    // Firefox SpeechRecognition exists but often fails silently (service-not-allowed, network errors).
    // Warn Firefox users to switch to Whisper for reliable STT.
    const isFirefox = navigator.userAgent.includes("Firefox");
    if (cfg.sttProvider === "browser" && isFirefox) {
      this.onWarning?.(
        "Firefox Browser STT may not work reliably — switch to Whisper (local) in Settings for better results",
      );
    }

    // When using Browser STT + tab capture, Browser STT picks up tab audio
    // from speakers and mislabels it as "You". Use feedAudio-based provider instead.
    if (cfg.captureMic) {
      let micProvider = cfg.sttProvider;
      if (cfg.captureTab && cfg.sttProvider === "browser") {
        const fallback = this._pickTabSTTProvider(cfg);
        if (fallback) {
          micProvider = fallback;
          this.onWarning?.(
            `Switched mic STT to ${fallback === "whisper" ? "Whisper" : "Deepgram"} — Browser STT picks up tab audio from speakers`,
          );
        }
      }
      this._micSTT = createSTT(micProvider);
      this._micSTT.configure(sttConfig);
      this._micSTT.start((text) => {
        this._analyzer!.feed(`[You] ${text}`);
        this._transcriptLines.push({ source: "mic", text, timestamp: Date.now() });
        this.onTranscript?.({ source: "mic", text });
      });

      // Check Whisper server reachability
      if (micProvider === "whisper") {
        this._checkWhisperServer(cfg.whisperHost);
      }
    }

    // Init tab STT — Browser SpeechRecognition can't accept custom audio sources
    // Use Deepgram or Whisper (local) for tab audio
    if (cfg.captureTab) {
      const tabProvider = this._pickTabSTTProvider(cfg);
      if (tabProvider) {
        this._tabSTT = createSTT(tabProvider);
        this._tabSTT.configure(sttConfig);
        this._tabSTT.start((text) => {
          this._analyzer!.feed(`[Them] ${text}`);
          this._transcriptLines.push({ source: "tab", text, timestamp: Date.now() });
          this.onTranscript?.({ source: "tab", text });
        });
      } else {
        this.onWarning?.("Tab audio transcription requires Whisper (local) or a Deepgram API key");
      }
    }

    // Wire audio chunks to the right STT
    this._audio.onAudio = (source, chunk) => {
      if (source === "mic") this._micSTT?.feedAudio(chunk);
      if (source === "tab") this._tabSTT?.feedAudio(chunk);
    };

    // Forward audio activity levels to UI
    this._audio.onActivity = (source, level) => {
      this.onActivity?.(source, level);
    };

    // Forward audio warnings to UI
    this._audio.onWarning = (msg) => {
      this.onWarning?.(msg);
    };

    // Start audio
    try {
      await this._audio.start({
        mic: cfg.captureMic,
        tab: cfg.captureTab,
      });

      if (cfg.captureTab && !this._audio.tabStream) {
        this.onWarning?.(
          "No audio tracks received — make sure to check 'Share tab audio' in the share picker",
        );
      }
    } catch (e) {
      this.onError?.(`Audio error: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Start analyzer loop
    this._analyzer.start();
    this._running = true;
  }

  /** Check if the Whisper server is reachable, warn if not. */
  private async _checkWhisperServer(host: string): Promise<void> {
    try {
      const res = await fetch(`${host}/v1/audio/transcriptions`, { method: "OPTIONS" });
      // Any response means the server is up (even 405 Method Not Allowed)
      if (!res.ok && res.status !== 405) {
        this.onWarning?.(
          `Whisper server responded with ${res.status} — check if it's running (just whisper)`,
        );
      }
    } catch {
      this.onWarning?.("Whisper server not reachable — start it with: just whisper");
    }
  }

  /** Pick the best STT provider for tab audio (needs feedAudio support) */
  private _pickTabSTTProvider(cfg: Config): string | null {
    // If user chose a feedAudio-capable provider, use the same for tab
    if (cfg.sttProvider === "whisper") return "whisper";
    if (cfg.sttProvider === "openai-whisper" && cfg.openaiApiKey) return "openai-whisper";
    if (cfg.sttProvider === "deepgram" && cfg.deepgramApiKey) return "deepgram";
    // Browser STT can't do tab audio — fall back in order of preference
    if (cfg.whisperHost) return "whisper";
    if (cfg.openaiApiKey) return "openai-whisper";
    if (cfg.deepgramApiKey) return "deepgram";
    return null;
  }

  async stop(): Promise<void> {
    this._running = false;
    this.stopAutoCapture();
    this._analyzer?.stop();
    this._micSTT?.stop();
    this._tabSTT?.stop();
    this._audio?.stop();

    // Auto-save to IndexedDB
    if (this._transcriptLines.length > 0 && this._analyzer) {
      const now = Date.now();
      await saveSession({
        id: `session-${this._startedAt}`,
        startedAt: this._startedAt,
        endedAt: now,
        duration: now - this._startedAt,
        transcript: this._transcriptLines,
        insights: this._analyzer.insights,
        summary: this._summary,
        categories: this._analyzer.categories,
        screenCaptures: this._screenCaptures.length > 0 ? this._screenCaptures : undefined,
      });
    }
  }
}
