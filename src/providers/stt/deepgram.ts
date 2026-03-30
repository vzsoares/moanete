import { type STTProvider, registerSTT } from "./types.ts";

function createDeepgramSTT(): STTProvider {
  let socket: WebSocket | null = null;
  let apiKey = "";
  let language = "en";
  let onTranscript: ((text: string) => void) | null = null;
  let running = false;

  const provider: STTProvider = {
    name: "Deepgram",
    requiresKey: true,

    configure(config) {
      apiKey = config.apiKey || "";
      // Deepgram uses short language codes (en, pt, es, etc.)
      language = (config.language || "en-US").split("-")[0] || "en";
    },

    start(callback) {
      if (!apiKey) throw new Error("Deepgram API key not configured");
      onTranscript = callback;
      running = true;

      const params = new URLSearchParams({
        model: "nova-2",
        language,
        punctuate: "true",
        interim_results: "true",
        vad_events: "true",
        encoding: "linear16",
        sample_rate: "16000",
        channels: "1",
      });

      socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ["token", apiKey]);

      socket.onmessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data as string);
        const alt = data.channel?.alternatives?.[0];
        if (alt?.transcript && data.is_final && onTranscript) {
          onTranscript((alt.transcript as string).trim());
        }
      };

      socket.onerror = (e) => console.error("[deepgram] ws error:", e);
      socket.onclose = () => {
        if (running) {
          console.warn("[deepgram] connection closed, reconnecting...");
          setTimeout(() => {
            if (running && onTranscript) provider.start(onTranscript);
          }, 1000);
        }
      };
    },

    stop() {
      running = false;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "CloseStream" }));
      }
      socket?.close();
      socket = null;
    },

    feedAudio(chunk) {
      if (socket?.readyState === WebSocket.OPEN) {
        const pcm = new Int16Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
          pcm[i] = Math.max(-32768, Math.min(32767, chunk[i]! * 32768));
        }
        socket.send(pcm.buffer);
      }
    },
  };

  return provider;
}

registerSTT("deepgram", createDeepgramSTT);
