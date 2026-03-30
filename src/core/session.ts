import { AudioCapture } from "./audio.ts";
import { Analyzer } from "./analyzer.ts";
import { createSTT } from "../providers/stt/types.ts";
import { createLLM } from "../providers/llm/types.ts";
import { loadConfig } from "./config.ts";
import type { STTProvider } from "../providers/stt/types.ts";
import type { LLMProvider } from "../providers/llm/types.ts";
import type { Config } from "./config.ts";

// Register all providers (side-effect imports)
import "../providers/stt/browser.ts";
import "../providers/stt/deepgram.ts";
import "../providers/llm/ollama.ts";
import "../providers/llm/openai.ts";
import "../providers/llm/anthropic.ts";

export class Session {
  private _audio: AudioCapture | null = null;
  private _stt: STTProvider | null = null;
  private _llm: LLMProvider | null = null;
  private _analyzer: Analyzer | null = null;
  private _running = false;
  private _config: Config | null = null;

  onTranscript: ((text: string) => void) | null = null;
  onInsights: ((insights: Record<string, string[]>) => void) | null = null;
  onError: ((error: string) => void) | null = null;

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
      apiKey:
        cfg.llmProvider === "openai"
          ? cfg.openaiApiKey
          : cfg.anthropicApiKey,
      baseUrl:
        cfg.llmProvider === "anthropic" ? cfg.anthropicBaseUrl : undefined,
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

    // Init STT provider
    this._stt = createSTT(cfg.sttProvider);
    this._stt.configure({
      apiKey: cfg.deepgramApiKey,
      language: cfg.sttLanguage,
    });

    // Init audio capture
    this._audio = new AudioCapture();
    this._audio.onAudio = (chunk) => this._stt!.feedAudio(chunk);

    // Wire STT → analyzer + UI callback
    this._stt.start((text) => {
      this._analyzer!.feed(text);
      this.onTranscript?.(text);
    });

    // Start audio
    try {
      await this._audio.start({
        mic: cfg.captureMic,
        tab: cfg.captureTab,
      });
    } catch (e) {
      this.onError?.(`Audio error: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Start analyzer loop
    this._analyzer.start();
    this._running = true;
  }

  stop(): void {
    this._running = false;
    this._analyzer?.stop();
    this._stt?.stop();
    this._audio?.stop();
  }
}
