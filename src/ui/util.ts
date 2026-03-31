/** Escape HTML entities for safe innerHTML insertion. */
export function escapeHtml(text: string): string {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

/** Escape for HTML attribute values. */
export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Minimal markdown → HTML for chat messages.
 * Handles: fenced code blocks, inline code, bold, italic, unordered lists.
 */
export function renderMarkdown(text: string): string {
  // Fenced code blocks: ```lang\n...\n```
  let html = escapeHtml(text).replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang: string, code: string) =>
      `<pre class="bg-base-200 rounded-lg p-3 my-2 overflow-x-auto text-xs"><code${lang ? ` data-lang="${lang}"` : ""}>${code.replace(/^\n|\n$/g, "")}</code></pre>`,
  );

  // Inline code: `...`
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="bg-base-200 px-1 py-0.5 rounded text-xs">$1</code>',
  );

  // Bold: **...**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic: *...*
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

  // Unordered list items: lines starting with - or *
  html = html.replace(/^([*-]) (.+)$/gm, '<li class="ml-4 list-disc">$2</li>');
  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="my-1">$1</ul>');

  // Line breaks (but not inside <pre>)
  html = html.replace(/\n/g, "<br>");
  // Clean up <br> inside <pre>
  html = html.replace(
    /<pre([^>]*)>([\s\S]*?)<\/pre>/g,
    (_, attrs: string, inner: string) => `<pre${attrs}>${inner.replace(/<br>/g, "\n")}</pre>`,
  );

  return html;
}

/** Format millisecond duration to human-readable string. */
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
