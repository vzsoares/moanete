import { MoaneteElement } from "../base.ts";

export class MnCompatHints extends MoaneteElement {
  render(): void {
    this.className = "flex flex-col gap-1 px-4 pt-2";
    const hints = detectHints();
    for (const hint of hints) {
      this.addHint(hint);
    }
  }

  addHint(text: string): void {
    const el = document.createElement("div");
    el.className = "alert alert-warning alert-sm py-1 px-3";
    el.innerHTML = `<span>${text}</span><button class="btn btn-ghost btn-xs btn-circle">✕</button>`;
    el.querySelector("button")!.addEventListener("click", () => el.remove());
    this.appendChild(el);
  }
}

function detectHints(): string[] {
  const hints: string[] = [];
  const ua = navigator.userAgent;
  const isFirefox = ua.includes("Firefox");
  const isChromium = "chrome" in window;
  const isMac = ua.includes("Macintosh");
  const isLinux = ua.includes("Linux");

  if (!("documentPictureInPicture" in window)) {
    hints.push("PiP overlay not available in this browser (requires Chrome/Edge 116+)");
  }
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
    hints.push("Browser speech recognition not available — use Whisper (local) for STT instead");
  }
  if (isMac) {
    hints.push("System audio capture unavailable on macOS — tab audio only via Chrome");
  } else if (isLinux && isChromium) {
    hints.push("For system audio on Linux, PipeWire is required — Firefox may work better");
  } else if (isFirefox && !isLinux) {
    hints.push("Firefox does not support system audio capture on this OS");
  }
  return hints;
}

customElements.define("mn-compat-hints", MnCompatHints);
