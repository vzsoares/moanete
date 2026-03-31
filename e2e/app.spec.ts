import { expect, test } from "@playwright/test";

test.describe("App loads", () => {
  test("renders mn-dashboard with navbar and main sections", async ({ page }) => {
    await page.goto("/");

    // Navbar
    await expect(page.locator("mn-dashboard")).toBeVisible();
    await expect(page.locator("text=moanete")).toBeVisible();
    await expect(page.locator("mn-status")).toBeVisible();

    // Buttons
    await expect(page.locator(".btn-start")).toBeVisible();
    await expect(page.locator(".btn-stop")).toBeHidden();
    await expect(page.locator(".btn-pip")).toBeHidden();

    // Main content areas
    await expect(page.locator("mn-transcript")).toBeVisible();
    await expect(page.locator("mn-insights")).toBeVisible();
    await expect(page.locator("mn-chat")).toBeVisible();
    await expect(page.locator("mn-summary")).toBeVisible();
  });

  test("transcript shows placeholder text", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("mn-transcript")).toContainText("Start a session");
  });

  test("summary shows placeholder", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("mn-summary")).toContainText("No summary yet");
  });

  test("insight tabs render from default config", async ({ page }) => {
    await page.goto("/");
    const tabs = page.locator("mn-insights .insight-tabs button");
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toContainText("Suggestions");
    await expect(tabs.nth(1)).toContainText("Key Points");
    await expect(tabs.nth(2)).toContainText("Action Items");
    await expect(tabs.nth(3)).toContainText("Questions");
  });
});

test.describe("Settings modal", () => {
  test("opens and closes", async ({ page }) => {
    await page.goto("/");

    await page.locator(".btn-settings").click();
    const dialog = page.locator("mn-settings dialog");
    await expect(dialog).toBeVisible();

    // Close via Close button (the visible one, not the backdrop)
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test("shows STT and LLM provider dropdowns", async ({ page }) => {
    await page.goto("/");
    await page.locator(".btn-settings").click();

    await expect(page.locator('mn-settings [data-key="sttProvider"]')).toBeVisible();
    await expect(page.locator('mn-settings [data-key="llmProvider"]')).toBeVisible();
    await expect(page.locator('mn-settings [data-key="sttLanguage"]')).toBeVisible();
  });

  test("shows dynamic fields when provider changes", async ({ page }) => {
    await page.goto("/");
    await page.locator(".btn-settings").click();

    // Switch to whisper — should show whisperHost and whisperModel
    await page.locator('mn-settings [data-key="sttProvider"]').selectOption("whisper");
    await expect(page.locator('mn-settings [data-key="whisperHost"]')).toBeVisible();
    await expect(page.locator('mn-settings [data-key="whisperModel"]')).toBeVisible();

    // Switch to openai — should show apiKey and model
    await page.locator('mn-settings [data-key="llmProvider"]').selectOption("openai");
    await expect(page.locator('mn-settings [data-key="openaiApiKey"]')).toBeVisible();
    await expect(page.locator('mn-settings [data-key="openaiModel"]')).toBeVisible();
  });

  test("settings persist across reload", async ({ page }) => {
    await page.goto("/");
    await page.locator(".btn-settings").click();

    // Change insight tabs
    const input = page.locator('mn-settings [data-key="insightTabs"]');
    await input.fill("A,B,C");
    await page.locator("mn-settings .settings-save").click();

    // Verify insight tabs rebuilt
    const tabs = page.locator("mn-insights .insight-tabs button");
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(0)).toContainText("A");

    // Reload and verify persisted
    await page.reload();
    await page.locator(".btn-settings").click();
    await expect(page.locator('mn-settings [data-key="insightTabs"]')).toHaveValue("A,B,C");

    // Clean up — restore defaults
    await page
      .locator('mn-settings [data-key="insightTabs"]')
      .fill("Suggestions,Key Points,Action Items,Questions");
    await page.locator("mn-settings .settings-save").click();
  });

  test("preset buttons update insight tabs", async ({ page }) => {
    await page.goto("/");
    await page.locator(".btn-settings").click();

    await page.locator('mn-settings [data-preset="Bugs,Design Decisions,TODOs,Questions"]').click();
    await expect(page.locator('mn-settings [data-key="insightTabs"]')).toHaveValue(
      "Bugs,Design Decisions,TODOs,Questions",
    );
  });

  test("multi-agent checkbox toggles", async ({ page }) => {
    await page.goto("/");
    await page.locator(".btn-settings").click();

    const cb = page.locator('mn-settings [data-key="multiAgent"]');
    await expect(cb).toBeChecked();
    await cb.uncheck();
    await expect(cb).not.toBeChecked();
    await cb.check();
  });
});

test.describe("History modal", () => {
  test("opens and shows empty state", async ({ page }) => {
    await page.goto("/");
    await page.locator(".btn-history").click();

    const dialog = page.locator("mn-history dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("No sessions yet");
  });
});

test.describe("MCP modal", () => {
  test("opens and shows bridge status", async ({ page }) => {
    await page.goto("/");
    await page.locator(".btn-mcp").click();

    const dialog = page.locator("mn-mcp dialog");
    await expect(dialog).toBeVisible();
    // Bridge is not running, so should show error or loading
    await expect(dialog.locator(".mcp-servers-list")).toBeVisible();
  });

  test("shows preset buttons", async ({ page }) => {
    await page.goto("/");
    await page.locator(".btn-mcp").click();

    await expect(page.locator("mn-mcp .mcp-preset[data-preset='notion']")).toBeVisible();
    await expect(page.locator("mn-mcp .mcp-show-remote")).toBeVisible();
  });

  test("notion preset fills form", async ({ page }) => {
    await page.goto("/");
    await page.locator(".btn-mcp").click();
    await page.locator("mn-mcp .mcp-preset[data-preset='notion']").click();

    await expect(page.locator("mn-mcp .mcp-connect-form")).toBeVisible();
    await expect(page.locator("mn-mcp .mcp-name")).toHaveValue("notion");
    await expect(page.locator("mn-mcp .mcp-command")).toHaveValue("npx");
  });

  test("remote URL form shows on click", async ({ page }) => {
    await page.goto("/");
    await page.locator(".btn-mcp").click();
    await page.locator("mn-mcp .mcp-show-remote").click();

    await expect(page.locator("mn-mcp .mcp-remote-form")).toBeVisible();
    await expect(page.locator("mn-mcp .mcp-remote-url")).toBeVisible();
  });
});

test.describe("Chat", () => {
  test("input and send button exist", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("mn-chat .chat-input")).toBeVisible();
    await expect(page.locator("mn-chat .chat-send")).toBeVisible();
  });
});

test.describe("Insight tab switching", () => {
  test("clicking tab shows correct panel", async ({ page }) => {
    await page.goto("/");

    // Click Key Points tab
    const tabs = page.locator("mn-insights .insight-tabs button");
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveClass(/tab-active/);

    // First panel should be hidden, second visible
    await expect(page.locator("mn-insights #insight-suggestions")).toBeHidden();
    await expect(page.locator("mn-insights #insight-key_points")).toBeVisible();
  });
});
