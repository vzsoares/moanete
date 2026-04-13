import type { TranscriptEntry } from "../../core/session.ts";
import { MoaneteElement } from "../base.ts";
import { escapeHtml } from "../util.ts";

export class MnTranscript extends MoaneteElement {
  private _box: HTMLDivElement | null = null;
  private _content: HTMLDivElement | null = null;

  render(): void {
    this.className = "flex-1 flex flex-col overflow-hidden border-r border-base-content/[0.06]";
    this.innerHTML = `
      <div class="px-5 py-3 shrink-0">
        <h2 class="mn-panel-header">Transcript</h2>
      </div>
      <div class="transcript-box flex-1 overflow-y-auto px-5 pb-5">
        <div class="transcript-content text-[13.5px] leading-relaxed text-base-content/40 italic whitespace-pre-wrap break-words">Start a session to see the transcript...</div>
      </div>
    `;
    this._box = this.$<HTMLDivElement>(".transcript-box");
    this._content = this.$<HTMLDivElement>(".transcript-content");
  }

  appendEntry(entry: TranscriptEntry): void {
    if (!this._content) return;
    if (this._content.classList.contains("italic")) {
      this._content.innerHTML = "";
      this._content.className = "transcript-content whitespace-pre-wrap break-words";
    }

    const line = document.createElement("div");
    line.className = "mn-transcript-line";
    const label = entry.source === "mic" ? "You" : "Them";
    const speakerClass = entry.source === "mic" ? "mn-speaker-you" : "mn-speaker-them";
    line.innerHTML = `<span class="mn-speaker ${speakerClass}">${label}</span><span class="mn-transcript-text">${escapeHtml(entry.text)}</span>`;
    this._content.appendChild(line);

    if (this._box) this._box.scrollTop = this._box.scrollHeight;
  }

  /** Seed with prior transcript lines (for session resume). */
  seedEntries(entries: TranscriptEntry[]): void {
    if (!this._content) return;
    this._content.innerHTML = "";
    this._content.className = "transcript-content whitespace-pre-wrap break-words";
    for (const entry of entries) {
      const div = document.createElement("div");
      div.className = "mn-transcript-line";
      const label = entry.source === "mic" ? "You" : "Them";
      const speakerClass = entry.source === "mic" ? "mn-speaker-you" : "mn-speaker-them";
      div.innerHTML = `<span class="mn-speaker ${speakerClass}">${label}</span><span class="mn-transcript-text">${escapeHtml(entry.text)}</span>`;
      this._content.appendChild(div);
    }
  }

  reset(): void {
    if (!this._content) return;
    this._content.textContent = "Listening...";
    this._content.className =
      "transcript-content text-[13.5px] leading-relaxed text-base-content/40 italic whitespace-pre-wrap break-words";
  }
}

customElements.define("mn-transcript", MnTranscript);
