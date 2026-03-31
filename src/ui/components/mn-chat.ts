import { MoaneteElement } from "../base.ts";

export class MnChat extends MoaneteElement {
  render(): void {
    this.className = "flex-1 flex flex-col bg-base-300 rounded-lg overflow-hidden";
    this.innerHTML = `
      <div class="px-4 py-2 border-b border-base-content/10 shrink-0">
        <h2 class="text-sm font-semibold">Chat</h2>
      </div>
      <div class="chat-messages flex-1 overflow-y-auto p-3 flex flex-col gap-1.5"></div>
      <div class="flex gap-2 p-3 border-t border-base-content/10 shrink-0">
        <input type="text" class="chat-input input input-bordered input-sm flex-1" placeholder="Ask about the meeting..." />
        <button class="chat-send btn btn-primary btn-sm">Send</button>
      </div>
    `;

    const input = this.$<HTMLInputElement>(".chat-input");
    const btn = this.$<HTMLButtonElement>(".chat-send");

    const send = () => {
      const q = input.value.trim();
      if (!q) return;
      input.value = "";
      this.appendMessage("user", q);
      this.emit("mn-chat-send", { question: q });
    };

    btn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") send();
    });
  }

  appendMessage(role: string, text: string): void {
    const el = document.createElement("div");
    el.className = `text-sm leading-snug ${role === "user" ? "text-info" : "text-success"}`;
    el.textContent = `${role === "user" ? "You" : "moanete"}: ${text}`;
    this.$<HTMLDivElement>(".chat-messages").appendChild(el);
    el.scrollIntoView({ behavior: "smooth" });
  }
}

customElements.define("mn-chat", MnChat);
