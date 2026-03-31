import { toKey } from "../../core/analyzer.ts";
import {
  type StoredSession,
  deleteSession,
  exportSessionMarkdown,
  listSessions,
} from "../../core/storage.ts";
import { MoaneteElement } from "../base.ts";
import { escapeHtml, formatDuration, renderMarkdown } from "../util.ts";

export class MnHistory extends MoaneteElement {
  open(): void {
    this.renderList();
    this.$<HTMLDialogElement>("dialog").showModal();
  }

  close(): void {
    this.$<HTMLDialogElement>("dialog").close();
  }

  render(): void {
    this.innerHTML = `
    <dialog class="modal">
      <div class="modal-box max-w-2xl max-h-[80vh] flex flex-col">
        <h3 class="text-lg font-bold mb-4">Session History</h3>
        <div class="history-list flex-1 overflow-y-auto flex flex-col gap-2">
          <p class="text-sm text-base-content/40 italic">No sessions yet.</p>
        </div>
        <div class="history-detail hidden flex-1 overflow-y-auto"></div>
        <div class="modal-action">
          <button class="history-back btn btn-ghost btn-sm hidden">Back</button>
          <form method="dialog"><button class="btn btn-ghost btn-sm">Close</button></form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>
    `;

    this.$<HTMLButtonElement>(".history-back").addEventListener("click", () => {
      this.$(".history-list").classList.remove("hidden");
      this.$(".history-detail").classList.add("hidden");
      this.$(".history-back").classList.add("hidden");
    });
  }

  async renderList(): Promise<void> {
    const sessions = await listSessions();
    const list = this.$<HTMLDivElement>(".history-list");
    const detail = this.$<HTMLDivElement>(".history-detail");
    const backBtn = this.$<HTMLButtonElement>(".history-back");

    detail.classList.add("hidden");
    detail.innerHTML = "";
    list.classList.remove("hidden");
    backBtn.classList.add("hidden");

    if (sessions.length === 0) {
      list.innerHTML = '<p class="text-sm text-base-content/40 italic">No sessions yet.</p>';
      return;
    }

    list.innerHTML = "";
    for (const s of sessions) {
      const date = new Date(s.startedAt).toLocaleString();
      const dur = formatDuration(s.duration);
      const preview =
        s.transcript
          .slice(0, 2)
          .map((l) => l.text)
          .join(" ") || "Empty session";

      const card = document.createElement("div");
      card.className =
        "bg-base-200 rounded-lg p-3 cursor-pointer hover:bg-base-300 transition-colors border border-base-content/5";
      card.innerHTML = `
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs font-semibold">${date}</span>
          <div class="flex gap-1">
            ${s.screenCaptures?.length ? `<span class="badge badge-sm badge-ghost">${s.screenCaptures.length} captures</span>` : ""}
            <span class="badge badge-sm badge-ghost">${dur}</span>
          </div>
        </div>
        <p class="text-xs text-base-content/60 truncate">${escapeHtml(preview)}</p>
        ${s.summary ? `<p class="text-xs text-base-content/40 truncate mt-1">${escapeHtml(s.summary.slice(0, 120))}</p>` : ""}
        <div class="flex gap-1 mt-2">
          <button class="btn btn-xs btn-primary resume-btn">Resume</button>
          <button class="btn btn-xs btn-ghost view-btn">View</button>
          <button class="btn btn-xs btn-ghost export-btn">Export</button>
          <button class="btn btn-xs btn-ghost text-error delete-btn">Delete</button>
        </div>
      `;

      card.querySelector(".view-btn")!.addEventListener("click", (e) => {
        e.stopPropagation();
        this._showDetail(s);
      });
      card.querySelector(".export-btn")!.addEventListener("click", (e) => {
        e.stopPropagation();
        this._download(s);
      });
      card.querySelector(".delete-btn")!.addEventListener("click", async (e) => {
        e.stopPropagation();
        await deleteSession(s.id);
        this.renderList();
      });
      card.querySelector(".resume-btn")!.addEventListener("click", (e) => {
        e.stopPropagation();
        this.close();
        this.emit("mn-session-resume", { session: s });
      });

      list.appendChild(card);
    }
  }

  private _showDetail(s: StoredSession): void {
    this.$(".history-list").classList.add("hidden");
    this.$(".history-detail").classList.remove("hidden");
    this.$(".history-back").classList.remove("hidden");

    const detail = this.$<HTMLDivElement>(".history-detail");
    const date = new Date(s.startedAt).toLocaleString();
    const dur = formatDuration(s.duration);

    let html = `<h4 class="text-sm font-bold mb-3">${date} (${dur})</h4>`;

    if (s.summary) {
      html += '<h5 class="text-xs font-semibold text-primary mb-1">Summary</h5>';
      html += `<div class="text-xs leading-relaxed mb-4 prose prose-xs max-w-none">${renderMarkdown(s.summary)}</div>`;
    }

    html += '<h5 class="text-xs font-semibold text-primary mb-1">Transcript</h5>';
    html += '<div class="mb-4 flex flex-col gap-1">';
    for (const line of s.transcript) {
      const label = line.source === "mic" ? "You" : "Them";
      const color = line.source === "mic" ? "text-info" : "text-warning";
      html += `<div class="text-xs"><span class="${color} font-semibold">${label}:</span> ${escapeHtml(line.text)}</div>`;
    }
    html += "</div>";

    for (const cat of s.categories) {
      const key = toKey(cat);
      const items = s.insights[key] || [];
      html += `<h5 class="text-xs font-semibold text-primary mb-1">${escapeHtml(cat)}</h5>`;
      if (items.length === 0) {
        html += '<p class="text-xs text-base-content/40 italic mb-3">Nothing</p>';
      } else {
        html += '<div class="flex flex-col gap-1 mb-3">';
        for (const item of items) {
          html += `<div class="bg-base-300 rounded px-2 py-1 text-xs border-l-2 border-primary">${escapeHtml(item)}</div>`;
        }
        html += "</div>";
      }
    }

    if (s.chatMessages && s.chatMessages.length > 0) {
      html += '<h5 class="text-xs font-semibold text-primary mb-1">Chat</h5>';
      html += '<div class="mb-4 flex flex-col gap-1">';
      for (const msg of s.chatMessages) {
        const label = msg.role === "user" ? "You" : "moanete";
        const color = msg.role === "user" ? "text-info" : "text-success";
        html += `<div class="text-xs"><span class="${color} font-semibold">${label}:</span> ${escapeHtml(msg.text)}</div>`;
      }
      html += "</div>";
    }

    if (s.screenCaptures && s.screenCaptures.length > 0) {
      html += '<h5 class="text-xs font-semibold text-primary mb-1">Screen Captures</h5>';
      html += '<div class="flex flex-col gap-2 mb-3">';
      for (const cap of s.screenCaptures) {
        const time = new Date(cap.timestamp).toLocaleTimeString();
        html += `<div class="bg-base-300 rounded px-2 py-1 text-xs border-l-2 border-primary">
          <span class="font-semibold">${time}</span> — ${escapeHtml(cap.description)}
        </div>`;
      }
      html += "</div>";
    }

    detail.innerHTML = html;
  }

  private _download(s: StoredSession): void {
    const md = exportSessionMarkdown(s);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `moanete-${new Date(s.startedAt).toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

customElements.define("mn-history", MnHistory);
