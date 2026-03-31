import type { TranscriptEntry } from "../../core/session.ts";
import { MoaneteElement } from "../base.ts";
import { escapeHtml } from "../util.ts";

export class MnTranscript extends MoaneteElement {
  private _box: HTMLDivElement | null = null;
  private _content: HTMLDivElement | null = null;

  render(): void {
    this.className = "flex-1 flex flex-col bg-base-300 rounded-lg overflow-hidden";
    this.innerHTML = `
      <div class="px-4 py-2 border-b border-base-content/10 shrink-0">
        <h2 class="text-sm font-semibold">Transcript</h2>
      </div>
      <div class="transcript-box flex-1 overflow-y-auto p-4">
        <div class="transcript-content text-sm leading-relaxed text-base-content/50 italic whitespace-pre-wrap break-words">Start a session to see the transcript...</div>
      </div>
    `;
    this._box = this.$<HTMLDivElement>(".transcript-box");
    this._content = this.$<HTMLDivElement>(".transcript-content");
  }

  appendEntry(entry: TranscriptEntry): void {
    if (!this._content) return;
    if (this._content.classList.contains("italic")) {
      this._content.innerHTML = "";
      this._content.className =
        "transcript-content text-sm leading-relaxed whitespace-pre-wrap break-words";
    }

    const line = document.createElement("div");
    const label = entry.source === "mic" ? "You" : "Them";
    const color = entry.source === "mic" ? "text-info" : "text-warning";
    line.innerHTML = `<span class="${color} font-semibold">${label}:</span> ${escapeHtml(entry.text)}`;
    this._content.appendChild(line);

    if (this._box) this._box.scrollTop = this._box.scrollHeight;
  }

  /** Seed with prior transcript lines (for session resume). */
  seedEntries(entries: TranscriptEntry[]): void {
    if (!this._content) return;
    this._content.innerHTML = "";
    this._content.className =
      "transcript-content text-sm leading-relaxed whitespace-pre-wrap break-words";
    for (const entry of entries) {
      const div = document.createElement("div");
      const label = entry.source === "mic" ? "You" : "Them";
      const color = entry.source === "mic" ? "text-info" : "text-warning";
      div.innerHTML = `<span class="${color} font-semibold">${label}:</span> ${escapeHtml(entry.text)}`;
      this._content.appendChild(div);
    }
  }

  reset(): void {
    if (!this._content) return;
    this._content.textContent = "Listening...";
    this._content.className =
      "transcript-content text-sm leading-relaxed text-base-content/50 italic whitespace-pre-wrap break-words";
  }
}

customElements.define("mn-transcript", MnTranscript);
