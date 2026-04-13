import { toKey } from "../../core/analyzer.ts";
import { MoaneteElement } from "../base.ts";

export class MnInsights extends MoaneteElement {
  private _categories: string[] = [];

  get categories(): string[] {
    return [...this._categories];
  }

  set categories(value: string[]) {
    this._categories = value;
    this._rebuildTabs();
  }

  render(): void {
    this.className = "flex-1 flex flex-col overflow-hidden";
    this.innerHTML = `
      <div class="insight-tabs flex gap-0.5 px-4 pt-3 shrink-0"></div>
      <div class="insight-panels flex-1 relative overflow-hidden"></div>
    `;
    this._rebuildTabs();
    this._bindTabClicks();
  }

  updateInsights(insights: Record<string, string[]>): void {
    for (const [key, items] of Object.entries(insights)) {
      const panel = this.querySelector<HTMLDivElement>(`#insight-${key}`);
      if (!panel) continue;

      if (items.length === 0) continue;

      // Get or create the container
      let container = panel.querySelector<HTMLDivElement>(".insight-list");
      if (!container) {
        panel.innerHTML = "";
        container = document.createElement("div");
        container.className = "insight-list flex flex-col gap-2";
        panel.appendChild(container);
      }

      // Only append items that are new
      const existing = container.childElementCount;
      for (const item of items.slice(existing)) {
        const card = document.createElement("div");
        card.className = "mn-insight-card animate-fade-in";
        card.textContent = item;
        container.appendChild(card);
      }
    }
  }

  private _rebuildTabs(): void {
    const bar = this.querySelector<HTMLDivElement>(".insight-tabs");
    const panels = this.querySelector<HTMLDivElement>(".insight-panels");
    if (!bar || !panels) return;

    bar.innerHTML = "";
    panels.innerHTML = "";

    this._categories.forEach((name, i) => {
      const key = toKey(name);
      const btn = document.createElement("button");
      btn.className = `px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${i === 0 ? "text-base-content bg-base-content/[0.04]" : "text-base-content/40 hover:text-base-content/60"}`;
      btn.textContent = name;
      btn.dataset.panel = `insight-${key}`;
      bar.appendChild(btn);

      const panel = document.createElement("div");
      panel.className = `panel-item absolute inset-0 px-4 py-3 overflow-y-auto ${i === 0 ? "block" : "hidden"}`;
      panel.id = `insight-${key}`;
      panel.innerHTML = '<p class="text-[13px] text-base-content/30 italic">Nothing yet...</p>';
      panels.appendChild(panel);
    });
  }

  private _bindTabClicks(): void {
    const bar = this.querySelector<HTMLDivElement>(".insight-tabs");
    if (!bar) return;

    bar.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-panel]");
      if (!btn) return;

      const panels = this.querySelector<HTMLDivElement>(".insight-panels");
      if (!panels) return;

      for (const b of bar.querySelectorAll("button")) {
        b.className =
          "px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer text-base-content/40 hover:text-base-content/60";
      }
      for (const p of panels.querySelectorAll<HTMLElement>(".panel-item")) {
        p.classList.add("hidden");
        p.classList.remove("block");
      }

      btn.className =
        "px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer text-base-content bg-base-content/[0.04]";
      const panel = this.querySelector<HTMLElement>(`#${btn.dataset.panel}`);
      if (panel) {
        panel.classList.remove("hidden");
        panel.classList.add("block");
      }
    });
  }
}

customElements.define("mn-insights", MnInsights);
