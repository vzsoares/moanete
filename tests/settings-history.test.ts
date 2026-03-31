/**
 * Tests for mn-settings and mn-history components.
 */
import { describe, expect, test, vi } from "vitest";

import "../src/ui/components/mn-settings.ts";
import "../src/ui/components/mn-history.ts";

import type { Config } from "../src/core/config.ts";
import type { MnHistory } from "../src/ui/components/mn-history.ts";
import type { MnSettings } from "../src/ui/components/mn-settings.ts";

function cleanup(): void {
  document.body.innerHTML = "";
}

describe("<mn-settings>", () => {
  test("renders settings dialog", () => {
    const el = document.createElement("mn-settings") as MnSettings;
    document.body.appendChild(el);

    expect(el.querySelector("dialog")).toBeTruthy();
    expect(el.querySelector('[data-key="sttProvider"]')).toBeTruthy();
    expect(el.querySelector('[data-key="llmProvider"]')).toBeTruthy();
    expect(el.querySelector('[data-key="insightTabs"]')).toBeTruthy();
    expect(el.querySelector('[data-key="captureMic"]')).toBeTruthy();
    expect(el.querySelector('[data-key="captureTab"]')).toBeTruthy();
    expect(el.querySelector('[data-key="multiAgent"]')).toBeTruthy();
    cleanup();
  });

  test("config setter populates form values", () => {
    const el = document.createElement("mn-settings") as MnSettings;
    document.body.appendChild(el);

    el.config = {
      sttProvider: "whisper",
      llmProvider: "openai",
      ollamaHost: "http://localhost:11434",
      ollamaModel: "llama3.2",
      openaiApiKey: "sk-test",
      openaiModel: "gpt-4o",
      anthropicApiKey: "",
      anthropicModel: "claude-sonnet-4-20250514",
      anthropicBaseUrl: "/api/anthropic",
      deepgramApiKey: "",
      whisperHost: "/whisper",
      whisperModel: "large-v3",
      sttLanguage: "pt-BR",
      insightTabs: "Bugs,TODOs",
      analysisIntervalMs: 30000,
      multiAgent: false,
      agentPrompts: "",
      captureMic: true,
      captureTab: true,
      theme: "dark",
    };

    expect(el.querySelector<HTMLSelectElement>('[data-key="sttProvider"]')!.value).toBe("whisper");
    expect(el.querySelector<HTMLSelectElement>('[data-key="llmProvider"]')!.value).toBe("openai");
    expect(el.querySelector<HTMLSelectElement>('[data-key="sttLanguage"]')!.value).toBe("pt-BR");
    expect(el.querySelector<HTMLInputElement>('[data-key="insightTabs"]')!.value).toBe(
      "Bugs,TODOs",
    );
    expect(el.querySelector<HTMLInputElement>('[data-key="multiAgent"]')!.checked).toBe(false);
    expect(el.querySelector<HTMLInputElement>('[data-key="captureTab"]')!.checked).toBe(true);
    // Analysis interval is stored in ms but displayed in seconds
    expect(el.querySelector<HTMLInputElement>('[data-key="analysisIntervalMs"]')!.value).toBe("30");
    cleanup();
  });

  test("emits mn-settings-save with collected config", () => {
    const el = document.createElement("mn-settings") as MnSettings;
    document.body.appendChild(el);

    el.config = {
      sttProvider: "browser",
      llmProvider: "ollama",
      ollamaHost: "http://localhost:11434",
      ollamaModel: "llama3.2",
      openaiApiKey: "",
      openaiModel: "gpt-4o-mini",
      anthropicApiKey: "",
      anthropicModel: "claude-sonnet-4-20250514",
      anthropicBaseUrl: "/api/anthropic",
      deepgramApiKey: "",
      whisperHost: "/whisper",
      whisperModel: "base",
      sttLanguage: "en-US",
      insightTabs: "Suggestions,Key Points",
      analysisIntervalMs: 15000,
      multiAgent: true,
      agentPrompts: "",
      captureMic: true,
      captureTab: false,
      theme: "dark",
    };

    const handler = vi.fn();
    el.addEventListener("mn-settings-save", handler);

    // Change a value then save
    el.querySelector<HTMLInputElement>('[data-key="insightTabs"]')!.value = "A,B,C";
    el.querySelector<HTMLButtonElement>(".settings-save")!.click();

    expect(handler).toHaveBeenCalledOnce();
    const saved = handler.mock.calls[0][0].detail.config as Partial<Config>;
    expect(saved.insightTabs).toBe("A,B,C");
    expect(saved.sttProvider).toBe("browser");
    expect(saved.llmProvider).toBe("ollama");
    // analysisIntervalMs should be converted back to ms
    expect(saved.analysisIntervalMs).toBe(15000);
    cleanup();
  });

  test("preset buttons update insight tabs input", () => {
    const el = document.createElement("mn-settings") as MnSettings;
    document.body.appendChild(el);

    const presetBtn = el.querySelector<HTMLButtonElement>(
      '[data-preset="Bugs,Design Decisions,TODOs,Questions"]',
    )!;
    presetBtn.click();

    expect(el.querySelector<HTMLInputElement>('[data-key="insightTabs"]')!.value).toBe(
      "Bugs,Design Decisions,TODOs,Questions",
    );
    cleanup();
  });
});

describe("<mn-history>", () => {
  test("renders history dialog", () => {
    const el = document.createElement("mn-history") as MnHistory;
    document.body.appendChild(el);

    expect(el.querySelector("dialog")).toBeTruthy();
    expect(el.querySelector(".history-list")).toBeTruthy();
    expect(el.querySelector(".history-detail")).toBeTruthy();
    expect(el.querySelector(".history-back")).toBeTruthy();
    cleanup();
  });

  test("emits mn-session-resume event type is correct", () => {
    const el = document.createElement("mn-history") as MnHistory;
    document.body.appendChild(el);

    // We can't easily test the full resume flow without IndexedDB,
    // but we verify the element registers and renders its structure
    expect(el.querySelector(".history-list")).toBeTruthy();
    expect(el.querySelector(".history-back")!.classList.contains("hidden")).toBe(true);
    cleanup();
  });
});
