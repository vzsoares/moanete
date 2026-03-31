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
  const isChromium = "chrome" in window;

  if (!isChromium) {
    hints.push(
      "moanete works best on a Chromium-based browser (Chrome, Edge, Brave, Arc) — PiP, Browser STT, and audio capture may not work in other browsers",
    );
    return hints;
  }

  if (!("documentPictureInPicture" in window)) {
    hints.push("PiP overlay requires Chrome/Edge 116+ — please update your browser");
  }
  return hints;
}

customElements.define("mn-compat-hints", MnCompatHints);
