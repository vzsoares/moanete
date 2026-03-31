/**
 * Test that moanete/ui barrel exports all components and utilities,
 * and that extending MoaneteElement works correctly.
 */
import { describe, expect, test } from "vitest";
import {
  MnAudioLevel,
  MnChat,
  MnCompatHints,
  MnInsights,
  MnStatus,
  MnSummary,
  MnTranscript,
  MoaneteElement,
  escapeAttr,
  escapeHtml,
  formatDuration,
} from "../src/ui/index.ts";

describe("moanete/ui barrel exports", () => {
  test("all component classes are exported", () => {
    expect(MnStatus).toBeDefined();
    expect(MnAudioLevel).toBeDefined();
    expect(MnCompatHints).toBeDefined();
    expect(MnTranscript).toBeDefined();
    expect(MnChat).toBeDefined();
    expect(MnSummary).toBeDefined();
    expect(MnInsights).toBeDefined();
  });

  test("MoaneteElement base class is exported", () => {
    expect(MoaneteElement).toBeDefined();
    expect(typeof MoaneteElement).toBe("function");
  });

  test("utility functions are exported", () => {
    expect(typeof escapeHtml).toBe("function");
    expect(typeof escapeAttr).toBe("function");
    expect(typeof formatDuration).toBe("function");
  });
});

describe("MoaneteElement base class", () => {
  test("can be extended and renders on connect", () => {
    class TestElement extends MoaneteElement {
      render(): void {
        this.innerHTML = '<div class="test-child">rendered</div>';
      }
    }

    if (!customElements.get("mn-test-base")) {
      customElements.define("mn-test-base", TestElement);
    }

    const el = document.createElement("mn-test-base") as TestElement;
    document.body.appendChild(el);

    expect(el.querySelector(".test-child")).toBeTruthy();
    expect(el.textContent).toContain("rendered");

    document.body.innerHTML = "";
  });

  test("emit() dispatches CustomEvent with detail", () => {
    class EmitElement extends MoaneteElement {
      render(): void {
        this.innerHTML = "";
      }

      fireTest(): void {
        this.emit("test-event", { foo: "bar" });
      }
    }

    if (!customElements.get("mn-test-emit")) {
      customElements.define("mn-test-emit", EmitElement);
    }

    const el = document.createElement("mn-test-emit") as EmitElement;
    document.body.appendChild(el);

    let received: { foo: string } | null = null;
    el.addEventListener("test-event", ((e: CustomEvent) => {
      received = e.detail;
    }) as EventListener);

    el.fireTest();
    expect(received).toEqual({ foo: "bar" });

    document.body.innerHTML = "";
  });

  test("$() scoped querySelector works", () => {
    class QueryElement extends MoaneteElement {
      render(): void {
        this.innerHTML = '<span class="inner">hello</span>';
      }

      getInner(): string {
        return this.$<HTMLSpanElement>(".inner").textContent || "";
      }
    }

    if (!customElements.get("mn-test-query")) {
      customElements.define("mn-test-query", QueryElement);
    }

    const el = document.createElement("mn-test-query") as QueryElement;
    document.body.appendChild(el);

    expect(el.getInner()).toBe("hello");

    document.body.innerHTML = "";
  });
});

describe("utility functions", () => {
  test("escapeHtml escapes HTML entities", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).not.toContain("<script>");
    expect(escapeHtml("a & b")).toContain("&amp;");
  });

  test("escapeAttr escapes attribute values", () => {
    expect(escapeAttr('hello "world"')).toBe("hello &quot;world&quot;");
    expect(escapeAttr("a & b")).toBe("a &amp; b");
  });

  test("formatDuration formats correctly", () => {
    expect(formatDuration(5000)).toBe("5s");
    expect(formatDuration(65000)).toBe("1m 5s");
    expect(formatDuration(3665000)).toBe("1h 1m");
  });
});
