import { MoaneteElement } from "../base.ts";

export class MnStatus extends MoaneteElement {
  private _state: "off" | "on" | "error" = "off";
  private _text = "Stopped";

  get state(): string {
    return this._state;
  }

  set state(value: "off" | "on" | "error") {
    this._state = value;
    this._update();
  }

  get text(): string {
    return this._text;
  }

  set text(value: string) {
    this._text = value;
    this._update();
  }

  setState(state: "off" | "on" | "error", text: string): void {
    this._state = state;
    this._text = text;
    this._update();
  }

  render(): void {
    this.className = "flex items-center gap-2";
    this.innerHTML = `<span class="dot ${this._state}"></span><span class="text-xs text-base-content/60"></span>`;
    this._update();
  }

  private _update(): void {
    const dot = this.querySelector<HTMLSpanElement>("span:first-child");
    const label = this.querySelector<HTMLSpanElement>("span:last-child");
    if (dot) dot.className = `dot ${this._state}`;
    if (label) label.textContent = this._text;
  }
}

customElements.define("mn-status", MnStatus);
