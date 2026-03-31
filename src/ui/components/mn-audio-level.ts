import { MoaneteElement } from "../base.ts";

export class MnAudioLevel extends MoaneteElement {
  private _level = 0;
  private _label = "Mic";

  get label(): string {
    return this._label;
  }

  set label(value: string) {
    this._label = value;
    const span = this.querySelector<HTMLSpanElement>(".level-label");
    if (span) span.textContent = value;
  }

  setLevel(level: number): void {
    this._level = level;
    const dot = this.querySelector<HTMLSpanElement>(".level-dot");
    if (!dot) return;
    if (level > 0.01) {
      dot.className = "level-dot w-2 h-2 rounded-full bg-success animate-pulse";
    } else {
      dot.className = "level-dot w-2 h-2 rounded-full bg-success/30";
    }
  }

  render(): void {
    this.className = "flex items-center gap-1.5";
    this.innerHTML = `
      <span class="level-dot w-2 h-2 rounded-full bg-base-content/20"></span>
      <span class="level-label text-xs text-base-content/50">${this._label}</span>
    `;
  }
}

customElements.define("mn-audio-level", MnAudioLevel);
