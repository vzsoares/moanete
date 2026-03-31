import { MoaneteElement } from "../base.ts";

export class MnSummary extends MoaneteElement {
  render(): void {
    this.className =
      "shrink-0 bg-base-300 border-t border-base-content/10 px-4 py-3 flex items-start gap-3";
    this.innerHTML = `
      <button class="summary-btn btn btn-ghost btn-sm shrink-0">Generate Summary</button>
      <div class="summary-content text-sm leading-relaxed text-base-content/50 italic flex-1 max-h-24 overflow-y-auto">No summary yet.</div>
    `;

    this.$<HTMLButtonElement>(".summary-btn").addEventListener("click", () => {
      this.emit("mn-summarize");
    });
  }

  setSummary(text: string): void {
    const el = this.$<HTMLDivElement>(".summary-content");
    el.textContent = text;
    el.className = "summary-content text-sm leading-relaxed flex-1 max-h-24 overflow-y-auto";
  }

  setLoading(): void {
    const el = this.$<HTMLDivElement>(".summary-content");
    el.textContent = "Generating...";
    el.className = "summary-content text-sm leading-relaxed flex-1 max-h-24 overflow-y-auto";
  }
}

customElements.define("mn-summary", MnSummary);
