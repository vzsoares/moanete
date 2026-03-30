const TARGET_SAMPLE_RATE = 16000;

export interface AudioCaptureOptions {
  mic?: boolean;
  tab?: boolean;
  tabStream?: MediaStream;
}

export class AudioCapture {
  private _ctx: AudioContext | null = null;
  private _micStream: MediaStream | null = null;
  private _tabStream: MediaStream | null = null;
  private _processor: ScriptProcessorNode | null = null;
  private _onAudio: ((chunk: Float32Array) => void) | null = null;

  set onAudio(callback: (chunk: Float32Array) => void) {
    this._onAudio = callback;
  }

  async start(opts: AudioCaptureOptions = {}): Promise<void> {
    const useMic = opts.mic !== false;
    const useTab = opts.tab === true;

    this._ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });

    const sources: MediaStreamAudioSourceNode[] = [];

    if (useMic) {
      this._micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      sources.push(this._ctx.createMediaStreamSource(this._micStream));
    }

    if (useTab) {
      if (opts.tabStream) {
        this._tabStream = opts.tabStream;
      } else {
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
      }
      sources.push(this._ctx.createMediaStreamSource(this._tabStream));
    }

    if (sources.length === 0) {
      throw new Error("No audio sources selected");
    }

    const merger = this._ctx.createGain();
    merger.gain.value = 1.0 / sources.length;
    for (const src of sources) {
      src.connect(merger);
    }

    const bufferSize = 4096;
    this._processor = this._ctx.createScriptProcessor(bufferSize, 1, 1);
    this._processor.onaudioprocess = (event: AudioProcessingEvent) => {
      const input = event.inputBuffer.getChannelData(0);
      this._onAudio?.(new Float32Array(input));
    };

    merger.connect(this._processor);
    this._processor.connect(this._ctx.destination);
  }

  stop(): void {
    this._processor?.disconnect();
    this._micStream?.getTracks().forEach((t) => t.stop());
    this._tabStream?.getTracks().forEach((t) => t.stop());
    void this._ctx?.close();

    this._processor = null;
    this._micStream = null;
    this._tabStream = null;
    this._ctx = null;
  }
}
