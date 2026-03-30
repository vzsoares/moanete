const TARGET_SAMPLE_RATE = 16000;

export type AudioSource = "mic" | "tab";

export interface AudioCaptureOptions {
  mic?: boolean;
  tab?: boolean;
}

export class AudioCapture {
  private _ctx: AudioContext | null = null;
  private _micStream: MediaStream | null = null;
  private _tabStream: MediaStream | null = null;
  private _micProcessor: ScriptProcessorNode | null = null;
  private _tabProcessor: ScriptProcessorNode | null = null;
  private _onAudio: ((source: AudioSource, chunk: Float32Array) => void) | null = null;
  private _onActivity: ((source: AudioSource, level: number) => void) | null = null;

  /** Raw tab MediaStream — exposed so STT providers can use it */
  get tabStream(): MediaStream | null {
    return this._tabStream;
  }

  /** Raw mic MediaStream — exposed so STT providers can use it */
  get micStream(): MediaStream | null {
    return this._micStream;
  }

  set onAudio(callback: (source: AudioSource, chunk: Float32Array) => void) {
    this._onAudio = callback;
  }

  set onActivity(callback: (source: AudioSource, level: number) => void) {
    this._onActivity = callback;
  }

  async start(opts: AudioCaptureOptions = {}): Promise<void> {
    const useMic = opts.mic !== false;
    const useTab = opts.tab === true;

    this._ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });

    if (useMic) {
      this._micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this._micProcessor = this._wireSource(this._micStream, "mic");
    }

    if (useTab) {
      // video: true is required to trigger the share picker
      // we only use the audio track and discard video
      this._tabStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      // Stop the video track immediately — we don't need it
      for (const track of this._tabStream.getVideoTracks()) {
        track.stop();
      }

      if (this._tabStream.getAudioTracks().length === 0) {
        console.warn(
          "[audio] No audio tracks from getDisplayMedia — user may not have shared audio",
        );
        this._tabStream = null;
      } else {
        this._tabProcessor = this._wireSource(this._tabStream, "tab");
      }
    }

    if (!this._micStream && !this._tabStream) {
      throw new Error("No audio sources available");
    }
  }

  private _wireSource(stream: MediaStream, source: AudioSource): ScriptProcessorNode {
    const ctx = this._ctx!;
    const mediaSource = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    mediaSource.connect(gain);

    const bufferSize = 4096;
    const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
    processor.onaudioprocess = (event: AudioProcessingEvent) => {
      const input = event.inputBuffer.getChannelData(0);
      this._onAudio?.(source, new Float32Array(input));

      // Compute RMS level for activity indicator
      if (this._onActivity) {
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i]! * input[i]!;
        }
        const rms = Math.sqrt(sum / input.length);
        this._onActivity(source, rms);
      }
    };

    gain.connect(processor);
    processor.connect(ctx.destination);
    return processor;
  }

  stop(): void {
    this._micProcessor?.disconnect();
    this._tabProcessor?.disconnect();
    for (const t of this._micStream?.getTracks() ?? []) t.stop();
    for (const t of this._tabStream?.getTracks() ?? []) t.stop();
    void this._ctx?.close();

    this._micProcessor = null;
    this._tabProcessor = null;
    this._micStream = null;
    this._tabStream = null;
    this._ctx = null;
  }
}
