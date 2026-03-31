import { type STTProvider, registerSTT } from "./types.ts";

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function createBrowserSTT(): STTProvider {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!Ctor) {
    throw new Error("SpeechRecognition API not available in this browser");
  }

  let recognition: SpeechRecognitionInstance | null = null;
  let onTranscript: ((text: string) => void) | null = null;
  let running = false;
  let language = "en-US";

  return {
    name: "Browser (free)",
    requiresKey: false,

    configure(config) {
      language = config.language || "en-US";
    },

    start(callback) {
      onTranscript = callback;
      const rec = new Ctor();
      recognition = rec;
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = language;

      rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result?.isFinal && onTranscript) {
            onTranscript(result[0]!.transcript.trim());
          }
        }
      };

      rec.onerror = (event) => {
        console.warn("[browser-stt] error:", event.error);
        // "no-speech" is normal — just means silence, retry
        // "aborted" happens on restart — retry
        // "not-allowed" — user denied mic, don't retry
        // "service-not-allowed" — Firefox: speech service unavailable
        // "network" — Firefox: speech service unreachable
        const fatal = ["not-allowed", "service-not-allowed"].includes(event.error);
        if (fatal) {
          console.error("[browser-stt] fatal:", event.error, "— switch to Whisper STT");
          running = false;
          return;
        }
        if (running) {
          setTimeout(() => {
            if (running) recognition?.start();
          }, 500);
        }
      };

      rec.onend = () => {
        if (running) {
          setTimeout(() => {
            if (running) recognition?.start();
          }, 100);
        }
      };

      running = true;
      rec.start();
    },

    stop() {
      running = false;
      recognition?.stop();
      recognition = null;
    },

    feedAudio(_chunk) {
      // Browser STT captures from mic directly — no manual feeding needed
    },
  };
}

registerSTT("browser", createBrowserSTT);
