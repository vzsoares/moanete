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
    this.className = "flex-1 flex flex-col bg-base-300 rounded-lg overflow-hidden";
    this.innerHTML = `
      <div class="insight-tabs tabs tabs-bordered bg-base-300 shrink-0"></div>
      <div class="insight-panels flex-1 relative overflow-hidden"></div>
    `;
    this._rebuildTabs();
    this._bindTabClicks();
  }

  updateInsights(insights: Record<string, string[]>): void {
    for (const [key, items] of Object.entries(insights)) {
      const panel = this.querySelector<HTMLDivElement>(`#insight-${key}`);
      if (!panel) continue;

      if (items.length === 0) {
        panel.innerHTML = '<p class="text-xs text-base-content/40 italic">Nothing yet...</p>';
      } else {
        const container = document.createElement("div");
        container.className = "flex flex-col gap-2";
        for (const item of items.slice(-10)) {
          const card = document.createElement("div");
          card.className =
            "bg-base-200 rounded-lg px-3 py-2 text-xs leading-relaxed border-l-2 border-primary";
          card.textContent = item;
          container.appendChild(card);
        }
        panel.innerHTML = "";
        panel.appendChild(container);
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
      btn.className = `tab text-xs${i === 0 ? " tab-active" : ""}`;
      btn.textContent = name;
      btn.dataset.panel = `insight-${key}`;
      bar.appendChild(btn);

      const panel = document.createElement("div");
      panel.className = `panel-item absolute inset-0 p-3 overflow-y-auto ${i === 0 ? "block" : "hidden"}`;
      panel.id = `insight-${key}`;
      panel.innerHTML = '<p class="text-xs text-base-content/40 italic">Nothing yet...</p>';
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

      for (const b of bar.querySelectorAll("button")) b.classList.remove("tab-active");
      for (const p of panels.querySelectorAll<HTMLElement>(".panel-item")) {
        p.classList.add("hidden");
        p.classList.remove("block");
      }

      btn.classList.add("tab-active");
      const panel = this.querySelector<HTMLElement>(`#${btn.dataset.panel}`);
      if (panel) {
        panel.classList.remove("hidden");
        panel.classList.add("block");
      }
    });
  }
}

customElements.define("mn-insights", MnInsights);
