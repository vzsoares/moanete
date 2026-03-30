import { createLLM } from "../providers/llm/types.ts";
import type { LLMProvider } from "../providers/llm/types.ts";
import { createSTT } from "../providers/stt/types.ts";
import type { STTProvider } from "../providers/stt/types.ts";
import { Analyzer } from "./analyzer.ts";
import { AudioCapture, type AudioSource } from "./audio.ts";
import { loadConfig } from "./config.ts";
import type { Config } from "./config.ts";

// Register all providers (side-effect imports)
import "../providers/stt/browser.ts";
import "../providers/stt/deepgram.ts";
import "../providers/stt/whisper.ts";
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
  private _analyzer: Analyzer | null = null;
  private _running = false;
  private _config: Config | null = null;

  onTranscript: ((entry: TranscriptEntry) => void) | null = null;
  onInsights: ((insights: Record<string, string[]>) => void) | null = null;
  onError: ((error: string) => void) | null = null;
  onWarning: ((msg: string) => void) | null = null;
  onActivity: ((source: AudioSource, level: number) => void) | null = null;

  get analyzer(): Analyzer | null {
    return this._analyzer;
  }

  get llm(): LLMProvider | null {
    return this._llm;
  }

  get running(): boolean {
    return this._running;
  }

  async start(): Promise<void> {
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

    // Init analyzer
    const categories = cfg.insightTabs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    this._analyzer = new Analyzer(this._llm, {
      categories,
      intervalMs: cfg.analysisIntervalMs,
    });
    this._analyzer.onUpdate = (insights) => this.onInsights?.(insights);

    // Init audio capture
    this._audio = new AudioCapture();

    const sttConfig = {
      apiKey: cfg.deepgramApiKey,
      language: cfg.sttLanguage,
      whisperHost: cfg.whisperHost,
      whisperModel: cfg.whisperModel,
    };

    // Init mic STT
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
        this.onTranscript?.({ source: "mic", text });
      });
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

  /** Pick the best STT provider for tab audio (needs feedAudio support) */
  private _pickTabSTTProvider(cfg: Config): string | null {
    // If user chose whisper or deepgram, use the same for tab
    if (cfg.sttProvider === "whisper") return "whisper";
    if (cfg.sttProvider === "deepgram" && cfg.deepgramApiKey) return "deepgram";
    // Browser STT can't do tab audio — fall back to whisper or deepgram
    if (cfg.whisperHost) return "whisper";
    if (cfg.deepgramApiKey) return "deepgram";
    return null;
  }

  stop(): void {
    this._running = false;
    this._analyzer?.stop();
    this._micSTT?.stop();
    this._tabSTT?.stop();
    this._audio?.stop();
  }
}
