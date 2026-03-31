import type { ScreenCapture } from "../../core/storage.ts";
import { MoaneteElement } from "../base.ts";

export class MnScreenCaptures extends MoaneteElement {
  render(): void {
    this.className = "hidden";
    this.innerHTML = `
      <div class="bg-base-100 rounded-xl border border-base-content/10 p-3">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-xs font-semibold text-primary">Screen Captures</h3>
          <span class="capture-count badge badge-xs badge-ghost">0</span>
        </div>
        <div class="captures-grid grid grid-cols-3 gap-2 max-h-48 overflow-y-auto"></div>
      </div>
    `;
  }

  addCapture(capture: ScreenCapture): void {
    this.classList.remove("hidden");
    const grid = this.$<HTMLDivElement>(".captures-grid");
    const count = this.$<HTMLSpanElement>(".capture-count");

    const time = new Date(capture.timestamp).toLocaleTimeString();
    const card = document.createElement("div");
    card.className = "relative group cursor-pointer";
    card.innerHTML = `
      <img src="data:image/png;base64,${capture.image}" class="w-full rounded border border-base-content/10" alt="Screen capture at ${time}" />
      <div class="absolute bottom-0 left-0 right-0 bg-base-300/80 text-[10px] px-1 py-0.5 rounded-b truncate">${time}</div>
    `;

    card.addEventListener("click", () => {
      this._showFullscreen(capture);
    });

    grid.appendChild(card);
    grid.scrollTop = grid.scrollHeight;
    count.textContent = String(grid.children.length);
  }

  clear(): void {
    this.classList.add("hidden");
    this.$<HTMLDivElement>(".captures-grid").innerHTML = "";
    this.$<HTMLSpanElement>(".capture-count").textContent = "0";
  }

  private _showFullscreen(capture: ScreenCapture): void {
    const time = new Date(capture.timestamp).toLocaleTimeString();
    const overlay = document.createElement("div");
    overlay.className =
      "fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-pointer";
    overlay.innerHTML = `
      <div class="max-w-4xl max-h-full flex flex-col items-center gap-2">
        <img src="data:image/png;base64,${capture.image}" class="max-w-full max-h-[80vh] rounded-lg" alt="Screen capture" />
        <p class="text-sm text-white/70">${time} — ${capture.description.slice(0, 120)}</p>
      </div>
    `;
    overlay.addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
  }
}

customElements.define("mn-screen-captures", MnScreenCaptures);
