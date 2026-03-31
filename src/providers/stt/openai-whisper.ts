import { type STTProvider, registerSTT } from "./types.ts";

const BUFFER_SECONDS = 4;
const SAMPLE_RATE = 16000;
const BUFFER_SIZE = SAMPLE_RATE * BUFFER_SECONDS;

function float32ToWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function createOpenAIWhisperSTT(): STTProvider {
  let apiKey = "";
  let model = "whisper-1";
  let language = "en";
  let onTranscript: ((text: string) => void) | null = null;
  let running = false;
  let errorCount = 0;
  let audioBuffer: Float32Array[] = [];
  let bufferedSamples = 0;
  let processing = false;
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  async function flush(): Promise<void> {
    if (processing || bufferedSamples === 0 || !onTranscript || !apiKey) return;
    processing = true;

    const merged = new Float32Array(bufferedSamples);
    let offset = 0;
    for (const chunk of audioBuffer) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    audioBuffer = [];
    bufferedSamples = 0;

    // Skip silence
    let energy = 0;
    for (let i = 0; i < merged.length; i++) {
      energy += merged[i]! * merged[i]!;
    }
    const rms = Math.sqrt(energy / merged.length);
    if (rms < 0.005) {
      processing = false;
      return;
    }

    const wav = float32ToWav(merged, SAMPLE_RATE);
    const form = new FormData();
    form.append("file", wav, "audio.wav");
    form.append("model", model);
    form.append("language", language);
    form.append("response_format", "json");

    try {
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!res.ok) {
        const text = await res.text();
        console.warn("[openai-whisper-stt] API error:", res.status, text);
        processing = false;
        return;
      }
      const data = (await res.json()) as { text?: string };
      const text = data.text?.trim();
      if (text) {
        onTranscript(text);
      }
    } catch (e) {
      errorCount++;
      if (errorCount <= 3) {
        console.error("[openai-whisper-stt] fetch error:", e);
      }
    }

    processing = false;
  }

  return {
    name: "OpenAI Whisper",
    requiresKey: true,

    configure(config) {
      apiKey = config.apiKey || config.openaiApiKey || "";
      model = config.openaiWhisperModel || "whisper-1";
      language = (config.language || "en-US").split("-")[0] || "en";
    },

    start(callback) {
      onTranscript = callback;
      running = true;
      audioBuffer = [];
      bufferedSamples = 0;
      flushTimer = setInterval(() => {
        if (running) flush();
      }, BUFFER_SECONDS * 1000);
    },

    stop() {
      running = false;
      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
      audioBuffer = [];
      bufferedSamples = 0;
    },

    feedAudio(chunk) {
      if (!running) return;
      audioBuffer.push(chunk);
      bufferedSamples += chunk.length;

      if (bufferedSamples >= BUFFER_SIZE) {
        flush();
      }
    },
  };
}

registerSTT("openai-whisper", createOpenAIWhisperSTT);
