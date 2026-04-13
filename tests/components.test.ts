/**
 * Web component contract tests — verify custom elements render,
 * emit correct events, and accept properties.
 * Runs in happy-dom environment (DOM available).
 */
import { describe, expect, test, vi } from "vitest";

// Register all components
import "../src/ui/components/mn-status.ts";
import "../src/ui/components/mn-audio-level.ts";
import "../src/ui/components/mn-transcript.ts";
import "../src/ui/components/mn-chat.ts";
import "../src/ui/components/mn-summary.ts";
import "../src/ui/components/mn-insights.ts";

import type { MnAudioLevel } from "../src/ui/components/mn-audio-level.ts";
import type { MnChat } from "../src/ui/components/mn-chat.ts";
import type { MnInsights } from "../src/ui/components/mn-insights.ts";
import type { MnStatus } from "../src/ui/components/mn-status.ts";
import type { MnSummary } from "../src/ui/components/mn-summary.ts";
import type { MnTranscript } from "../src/ui/components/mn-transcript.ts";

function mount<T extends HTMLElement>(tag: string): T {
  const el = document.createElement(tag) as T;
  document.body.appendChild(el);
  return el;
}

function cleanup(): void {
  document.body.innerHTML = "";
}

describe("<mn-status>", () => {
  test("renders with default state", () => {
    const el = mount<MnStatus>("mn-status");
    expect(el.querySelector(".dot")).toBeTruthy();
    expect(el.textContent).toContain("Stopped");
    cleanup();
  });

  test("setState updates dot and text", () => {
    const el = mount<MnStatus>("mn-status");
    el.setState("on", "Listening...");
    expect(el.querySelector(".dot")!.className).toContain("on");
    expect(el.textContent).toContain("Listening...");

    el.setState("error", "Failed");
    expect(el.querySelector(".dot")!.className).toContain("error");
    expect(el.textContent).toContain("Failed");
    cleanup();
  });
});

describe("<mn-audio-level>", () => {
  test("renders with label", () => {
    const el = mount<MnAudioLevel>("mn-audio-level");
    el.label = "Mic";
    expect(el.textContent).toContain("Mic");
    cleanup();
  });

  test("setLevel updates dot class", () => {
    const el = mount<MnAudioLevel>("mn-audio-level");
    el.setLevel(0.5);
    expect(el.querySelector(".level-dot")!.className).toContain("animate-pulse");

    el.setLevel(0);
    expect(el.querySelector(".level-dot")!.className).not.toContain("animate-pulse");
    cleanup();
  });
});

describe("<mn-transcript>", () => {
  test("renders placeholder", () => {
    const el = mount<MnTranscript>("mn-transcript");
    expect(el.textContent).toContain("Start a session");
    cleanup();
  });

  test("appendEntry adds transcript line", () => {
    const el = mount<MnTranscript>("mn-transcript");
    el.appendEntry({ source: "mic", text: "hello" });
    expect(el.textContent).toContain("You");
    expect(el.textContent).toContain("hello");
    cleanup();
  });

  test("appendEntry replaces placeholder on first entry", () => {
    const el = mount<MnTranscript>("mn-transcript");
    el.appendEntry({ source: "tab", text: "world" });
    expect(el.textContent).not.toContain("Start a session");
    expect(el.textContent).toContain("Them");
    cleanup();
  });

  test("seedEntries populates multiple lines", () => {
    const el = mount<MnTranscript>("mn-transcript");
    el.seedEntries([
      { source: "mic", text: "first" },
      { source: "tab", text: "second" },
    ]);
    expect(el.textContent).toContain("first");
    expect(el.textContent).toContain("second");
    cleanup();
  });

  test("reset clears content", () => {
    const el = mount<MnTranscript>("mn-transcript");
    el.appendEntry({ source: "mic", text: "test" });
    el.reset();
    expect(el.textContent).toContain("Listening...");
    cleanup();
  });
});

describe("<mn-chat>", () => {
  test("renders input and send button", () => {
    const el = mount<MnChat>("mn-chat");
    expect(el.querySelector(".chat-input")).toBeTruthy();
    expect(el.querySelector(".chat-send")).toBeTruthy();
    cleanup();
  });

  test("emits mn-chat-send on button click", () => {
    const el = mount<MnChat>("mn-chat");
    const handler = vi.fn();
    el.addEventListener("mn-chat-send", handler);

    const input = el.querySelector<HTMLInputElement>(".chat-input")!;
    input.value = "test question";
    el.querySelector<HTMLButtonElement>(".chat-send")!.click();

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toEqual({ question: "test question" });
    cleanup();
  });

  test("does not emit on empty input", () => {
    const el = mount<MnChat>("mn-chat");
    const handler = vi.fn();
    el.addEventListener("mn-chat-send", handler);

    el.querySelector<HTMLButtonElement>(".chat-send")!.click();
    expect(handler).not.toHaveBeenCalled();
    cleanup();
  });

  test("appendMessage adds message to list", () => {
    const el = mount<MnChat>("mn-chat");
    el.appendMessage("user", "hi");
    el.appendMessage("assistant", "hello back");
    const msgs = el.querySelector(".chat-messages")!;
    expect(msgs.children.length).toBe(2);
    expect(msgs.textContent).toContain("hi");
    expect(msgs.textContent).toContain("hello back");
    cleanup();
  });
});

describe("<mn-summary>", () => {
  test("renders generate button", () => {
    const el = mount<MnSummary>("mn-summary");
    expect(el.querySelector(".summary-btn")).toBeTruthy();
    expect(el.textContent).toContain("No summary yet");
    cleanup();
  });

  test("emits mn-summarize on click", () => {
    const el = mount<MnSummary>("mn-summary");
    const handler = vi.fn();
    el.addEventListener("mn-summarize", handler);

    el.querySelector<HTMLButtonElement>(".summary-btn")!.click();
    expect(handler).toHaveBeenCalledOnce();
    cleanup();
  });

  test("setSummary updates content", () => {
    const el = mount<MnSummary>("mn-summary");
    el.setSummary("Meeting was about X");
    expect(el.textContent).toContain("Meeting was about X");
    cleanup();
  });

  test("setLoading shows generating text", () => {
    const el = mount<MnSummary>("mn-summary");
    el.setLoading();
    expect(el.textContent).toContain("Generating...");
    cleanup();
  });
});

describe("<mn-insights>", () => {
  test("renders tabs from categories", () => {
    const el = mount<MnInsights>("mn-insights");
    el.categories = ["Bugs", "TODOs"];

    const tabs = el.querySelectorAll(".insight-tabs button");
    expect(tabs.length).toBe(2);
    expect(tabs[0]!.textContent).toBe("Bugs");
    expect(tabs[1]!.textContent).toBe("TODOs");
    cleanup();
  });

  test("updateInsights renders cards", () => {
    const el = mount<MnInsights>("mn-insights");
    el.categories = ["Bugs"];
    el.updateInsights({ bugs: ["null pointer", "memory leak"] });

    const panel = el.querySelector("#insight-bugs")!;
    expect(panel.textContent).toContain("null pointer");
    expect(panel.textContent).toContain("memory leak");
    cleanup();
  });

  test("empty category shows placeholder", () => {
    const el = mount<MnInsights>("mn-insights");
    el.categories = ["Bugs"];
    el.updateInsights({ bugs: [] });

    const panel = el.querySelector("#insight-bugs")!;
    expect(panel.textContent).toContain("Nothing yet");
    cleanup();
  });
});
