import { loadConfig } from "../../core/config.ts";
import { MoaneteElement } from "../base.ts";
import { escapeHtml, renderMarkdown } from "../util.ts";

export interface ChatPreset {
  name: string;
  prompt: string;
}

export const CHAT_PRESETS: ChatPreset[] = [
  {
    name: "Meeting",
    prompt: `You are a meeting assistant. Given the full session context, produce a structured briefing:

1. **Meeting Overview** — one paragraph summary
2. **Key Decisions** — bullet list of decisions made
3. **Action Items** — who needs to do what, with deadlines if mentioned
4. **Open Questions** — unresolved topics needing follow-up
5. **Next Steps** — what should happen after this meeting

Be concise and actionable. Use the same language as the transcript.`,
  },
  {
    name: "Code Interview",
    prompt: `You are a coding interview process coach. You help the candidate navigate the \
interview structure, communication, and strategy — NOT solve the problem for them.

Given the full context (transcript, screen, insights), produce:

1. **Stage** — where the candidate is (clarifying, designing, coding, testing, optimizing)
2. **Communication** — are they thinking aloud? explaining trade-offs? asking good questions?
3. **Process Tips** — what they should do next procedurally (e.g. "walk through an example before coding", "state your assumptions", "discuss time complexity before optimizing")
4. **Red Flags** — silence, jumping to code without a plan, not handling edge cases, ignoring interviewer hints
5. **Talking Points** — suggest things to say out loud to demonstrate thought process

NEVER give code solutions or algorithm hints. Focus purely on interview technique and communication.`,
  },
  {
    name: "LeetCode Coach",
    prompt: `You are a subtle algorithm coach for a live coding challenge. The candidate is solving \
a problem and you help them think — but you NEVER give the answer directly.

STRICT RULES:
- NEVER write solution code. NEVER reveal the optimal algorithm name directly.
- Give nudges, not answers. Ask leading questions.
- If they're stuck, hint at the DATA STRUCTURE or PATTERN without naming the specific algorithm.
- If they have a working brute-force, hint that a better approach exists and what property they could exploit.

Given the full context, produce:

1. **Problem** — one-line restatement of what they're solving
2. **Current Approach** — what they're trying and its complexity
3. **Nudge** — a leading question or observation that points toward a better approach without revealing it (e.g. "What if you didn't need to check every pair?" or "Is there a property of sorted arrays you could use here?")
4. **Edge Cases** — cases they might be missing, framed as questions ("What happens when the input is empty?")
5. **Complexity Check** — if they haven't discussed it, prompt them to ("What's the time complexity of your current approach?")

Be Socratic. Guide, don't solve.`,
  },
  {
    name: "LeetCode Solve",
    prompt: `You are a direct algorithm tutor for a live coding challenge. The candidate needs \
concrete help solving the problem — give them the answer.

Given the full context (transcript, screen, insights), produce:

1. **Problem** — one-line restatement
2. **Optimal Approach** — name the algorithm/pattern and explain why it works here
3. **Solution Outline** — step-by-step pseudocode or bullet list of the approach
4. **Code** — working solution in the language they're using (or Python if unclear), with brief inline comments
5. **Complexity** — time and space complexity with one-line justification
6. **Edge Cases** — list cases to handle and how the solution covers them

Be direct and complete. This is a learning tool, not an exam.`,
  },
  {
    name: "Lecture",
    prompt: `You are a study assistant for a live lecture. Given the full context, produce:

1. **Topic Summary** — what is being taught
2. **Key Concepts** — main ideas and definitions introduced
3. **Important Details** — formulas, examples, or code shown on screen
4. **Questions to Review** — things unclear or worth studying further
5. **Study Notes** — concise notes for revision

Capture technical details accurately. Use the same language as the lecture.`,
  },
];

export class MnChat extends MoaneteElement {
  render(): void {
    this.className = "flex-1 flex flex-col bg-base-300 rounded-lg overflow-hidden";

    const presetOptions = CHAT_PRESETS.map(
      (p) => `<option value="${p.name}">${p.name}</option>`,
    ).join("");

    this.innerHTML = `
      <div class="px-4 py-2 border-b border-base-content/10 shrink-0 flex items-center gap-2">
        <h2 class="text-sm font-semibold shrink-0">Chat</h2>
        <div class="flex-1"></div>
        <select class="chat-preset select select-bordered select-xs">
          <option value="">Q&A</option>
          ${presetOptions}
          <option value="custom">Custom</option>
        </select>
        <button class="chat-auto btn btn-ghost btn-xs" title="Auto-assist: monitor session and speak when relevant">Auto</button>
      </div>
      <div class="chat-messages flex-1 overflow-y-auto p-3 flex flex-col gap-1.5"></div>
      <div class="flex gap-2 p-3 border-t border-base-content/10 shrink-0">
        <input type="text" class="chat-input input input-bordered input-sm flex-1" placeholder="Ask about the session..." />
        <button class="chat-send btn btn-primary btn-sm">Send</button>
      </div>
    `;

    const input = this.$<HTMLInputElement>(".chat-input");
    const btn = this.$<HTMLButtonElement>(".chat-send");
    const preset = this.$<HTMLSelectElement>(".chat-preset");

    const send = () => {
      const presetPrompt = this.getPresetPrompt();
      const q = input.value.trim();

      if (presetPrompt) {
        // Preset mode: generate from preset (input text is optional extra instruction)
        input.value = "";
        const label = preset.value === "custom" ? "Custom" : preset.value;
        this.appendMessage("user", q ? `[${label}] ${q}` : `[${label}]`);
        this.emit("mn-chat-generate", {
          prompt: q ? `${presetPrompt}\n\nAdditional instruction: ${q}` : presetPrompt,
        });
      } else {
        // Q&A mode: regular question
        if (!q) return;
        input.value = "";
        this.appendMessage("user", q);
        this.emit("mn-chat-send", { question: q });
      }
    };

    btn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") send();
    });

    // Update placeholder based on mode
    preset.addEventListener("change", () => {
      input.placeholder = preset.value
        ? "Extra instructions (optional)..."
        : "Ask about the session...";
    });

    this.$<HTMLButtonElement>(".chat-auto").addEventListener("click", () => {
      this._toggleAuto();
    });
  }

  private _autoActive = false;

  private _toggleAuto(): void {
    this._autoActive = !this._autoActive;
    const btn = this.$<HTMLButtonElement>(".chat-auto");
    if (this._autoActive) {
      btn.classList.add("btn-accent");
      btn.classList.remove("btn-ghost");
      this.emit("mn-chat-auto", { active: true, prompt: this.getPresetPrompt() });
    } else {
      btn.classList.remove("btn-accent");
      btn.classList.add("btn-ghost");
      this.emit("mn-chat-auto", { active: false, prompt: "" });
    }
  }

  get autoActive(): boolean {
    return this._autoActive;
  }

  stopAuto(): void {
    if (!this._autoActive) return;
    this._autoActive = false;
    const btn = this.$<HTMLButtonElement>(".chat-auto");
    btn.classList.remove("btn-accent");
    btn.classList.add("btn-ghost");
  }

  getPresetPrompt(): string {
    const select = this.$<HTMLSelectElement>(".chat-preset");
    if (!select.value) return "";
    if (select.value === "custom") {
      return loadConfig().customChatPrompt;
    }
    const preset = CHAT_PRESETS.find((p) => p.name === select.value);
    return preset?.prompt ?? "";
  }

  appendMessage(role: string, text: string, suggestions: string[] = []): void {
    // Remove previous suggestion chips
    for (const old of this.$$<HTMLDivElement>(".chat-suggestions")) old.remove();

    const el = document.createElement("div");
    const isUser = role === "user";
    el.className = `text-sm leading-snug ${isUser ? "text-info" : ""}`;

    if (isUser) {
      el.innerHTML = `<span class="font-semibold">You:</span> ${escapeHtml(text)}`;
    } else {
      el.innerHTML = `<span class="font-semibold text-success">moanete:</span><div class="mt-1">${renderMarkdown(text)}</div>`;
    }

    const container = this.$<HTMLDivElement>(".chat-messages");
    container.appendChild(el);

    if (suggestions.length > 0) {
      const chips = document.createElement("div");
      chips.className = "chat-suggestions flex flex-wrap gap-1 mt-1";
      for (const s of suggestions) {
        const chip = document.createElement("button");
        chip.className = "btn btn-ghost btn-xs text-xs border border-base-content/20 rounded-full";
        chip.textContent = s;
        chip.addEventListener("click", () => {
          this.$<HTMLInputElement>(".chat-input").value = s;
          chips.remove();
          this.appendMessage("user", s);
          this.emit("mn-chat-send", { question: s });
        });
        chips.appendChild(chip);
      }
      container.appendChild(chips);
    }

    el.scrollIntoView({ behavior: "smooth" });
  }
}

customElements.define("mn-chat", MnChat);
