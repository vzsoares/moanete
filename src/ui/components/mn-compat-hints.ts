import { MoaneteElement } from "../base.ts";

export class MnCompatHints extends MoaneteElement {
  render(): void {
    this.className = "flex flex-col";
    const hints = detectHints();
    for (const hint of hints) {
      this.addHint(hint);
    }
  }

  addHint(text: string): void {
    const el = document.createElement("div");
    el.className =
      "flex items-center gap-2 px-5 py-2 text-xs text-warning/80 bg-warning/[0.06] border-b border-warning/10";
    el.innerHTML = `<span class="flex-1">${text}</span><button class="text-warning/40 hover:text-warning/70 cursor-pointer text-sm">✕</button>`;
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
