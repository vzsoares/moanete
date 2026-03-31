const TARGET_SAMPLE_RATE = 16000;

export type AudioSource = "mic" | "tab";

export interface AudioCaptureOptions {
  mic?: boolean;
  tab?: boolean;
}

/** Downsample from source rate to target rate using linear interpolation. */
function downsample(input: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate) return new Float32Array(input);
  const ratio = srcRate / dstRate;
  const len = Math.floor(input.length / ratio);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, input.length - 1);
    const frac = srcIdx - lo;
    out[i] = input[lo]! * (1 - frac) + input[hi]! * frac;
  }
  return out;
}

export class AudioCapture {
  private _ctx: AudioContext | null = null;
  private _micStream: MediaStream | null = null;
  private _tabStream: MediaStream | null = null;
  private _videoTrack: MediaStreamTrack | null = null;
  private _micProcessor: ScriptProcessorNode | null = null;
  private _tabProcessor: ScriptProcessorNode | null = null;
  private _onAudio: ((source: AudioSource, chunk: Float32Array) => void) | null = null;
  private _onActivity: ((source: AudioSource, level: number) => void) | null = null;
  private _onWarning: ((msg: string) => void) | null = null;

  /** Raw tab MediaStream — exposed so STT providers can use it */
  get tabStream(): MediaStream | null {
    return this._tabStream;
  }

  /** Raw mic MediaStream — exposed so STT providers can use it */
  get micStream(): MediaStream | null {
    return this._micStream;
  }

  /** Whether a screen share video track is available for frame capture */
  get hasVideoTrack(): boolean {
    return this._videoTrack !== null && this._videoTrack.readyState === "live";
  }

  set onAudio(callback: (source: AudioSource, chunk: Float32Array) => void) {
    this._onAudio = callback;
  }

  set onActivity(callback: (source: AudioSource, level: number) => void) {
    this._onActivity = callback;
  }

  set onWarning(callback: (msg: string) => void) {
    this._onWarning = callback;
  }

  async start(opts: AudioCaptureOptions = {}): Promise<void> {
    const useMic = opts.mic !== false;
    const useTab = opts.tab === true;

    // Use default sample rate — Firefox rejects cross-rate AudioNode connections
    this._ctx = new AudioContext();
    // Ensure context is running (Firefox may start suspended)
    if (this._ctx.state === "suspended") {
      await this._ctx.resume();
    }

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
      this._tabStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      // Keep the first video track for screen capture, stop the rest
      const videoTracks = this._tabStream.getVideoTracks();
      if (videoTracks.length > 0) {
        this._videoTrack = videoTracks[0]!;
        for (let i = 1; i < videoTracks.length; i++) videoTracks[i]!.stop();
      }

      if (this._tabStream.getAudioTracks().length === 0) {
        const isChromium = "chrome" in window;
        const msg = isChromium
          ? "No audio tracks received — make sure to check 'Share tab audio' in the share picker"
          : "No audio from screen share — use a Chromium-based browser (Chrome, Edge, Brave) for reliable audio capture";
        this._onWarning?.(msg);
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
    const nativeSampleRate = ctx.sampleRate;
    const mediaSource = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    mediaSource.connect(gain);

    const bufferSize = 4096;
    const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
    processor.onaudioprocess = (event: AudioProcessingEvent) => {
      const input = event.inputBuffer.getChannelData(0);

      // Downsample to 16kHz for STT providers
      const resampled = downsample(input, nativeSampleRate, TARGET_SAMPLE_RATE);
      this._onAudio?.(source, resampled);

      // Compute RMS level for activity indicator (use original for accuracy)
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

  /** Capture a single frame from the screen share video track as a base64 PNG. */
  async captureFrame(maxWidth = 1024): Promise<string> {
    if (!this._videoTrack || this._videoTrack.readyState !== "live") {
      throw new Error("No active screen share video track");
    }

    // Use ImageCapture if available, fallback to canvas
    const stream = new MediaStream([this._videoTrack]);
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    // Wait for a frame to be available
    await new Promise<void>((resolve) => {
      if (video.videoWidth > 0) {
        resolve();
        return;
      }
      video.addEventListener("loadeddata", () => resolve(), { once: true });
    });

    const scale = Math.min(1, maxWidth / video.videoWidth);
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx2d = canvas.getContext("2d")!;
    ctx2d.drawImage(video, 0, 0, w, h);

    video.pause();
    video.srcObject = null;

    // Return base64 without the data: prefix
    const dataUrl = canvas.toDataURL("image/png");
    return dataUrl.replace(/^data:image\/png;base64,/, "");
  }

  stop(): void {
    this._micProcessor?.disconnect();
    this._tabProcessor?.disconnect();
    this._videoTrack?.stop();
    for (const t of this._micStream?.getTracks() ?? []) t.stop();
    for (const t of this._tabStream?.getTracks() ?? []) t.stop();
    void this._ctx?.close();

    this._micProcessor = null;
    this._tabProcessor = null;
    this._videoTrack = null;
    this._micStream = null;
    this._tabStream = null;
    this._ctx = null;
  }
}
