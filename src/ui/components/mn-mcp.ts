import {
  isBridgeConnected,
  mcpCallTool,
  mcpConnect,
  mcpConnectRemote,
  mcpDisconnect,
  mcpListServers,
  mcpListTools,
} from "../../core/mcp-bridge.ts";
import { MoaneteElement } from "../base.ts";
import { escapeHtml } from "../util.ts";

interface McpPreset {
  name: string;
  command: string;
  args: string;
  tokenLabel: string;
  buildEnv: (token: string) => Record<string, string>;
}

const MCP_PRESETS: Record<string, McpPreset> = {
  notion: {
    name: "notion",
    command: "npx",
    args: "-y @notionhq/notion-mcp-server",
    tokenLabel: "Notion Integration Token",
    buildEnv: (token) => ({
      OPENAPI_MCP_HEADERS: JSON.stringify({
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
      }),
    }),
  },
};

export class MnMcp extends MoaneteElement {
  open(): void {
    this.$<HTMLDialogElement>("dialog").showModal();
    this._renderServers();
  }

  close(): void {
    this.$<HTMLDialogElement>("dialog").close();
  }

  render(): void {
    this.innerHTML = `
    <dialog class="modal">
      <div class="modal-box max-w-2xl max-h-[80vh] flex flex-col">
        <h3 class="text-lg font-bold mb-2">MCP Servers</h3>
        <p class="text-xs text-base-content/50 mb-3">
          Connect to external MCP servers for extended context.
          Requires the MCP bridge (<code class="badge badge-sm badge-ghost">just mcp</code>).
        </p>
        <div class="mb-4">
          <h4 class="text-xs font-semibold text-base-content/60 mb-2">Quick Connect</h4>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-sm btn-outline mcp-preset" data-preset="notion">Notion</button>
            <button class="btn btn-sm btn-outline mcp-preset" data-preset="custom">Custom (local)...</button>
            <button class="btn btn-sm btn-outline mcp-show-remote">Remote URL...</button>
          </div>
        </div>

        <!-- Local stdio connect form -->
        <div class="mcp-connect-form hidden mb-4 bg-base-200 rounded-lg p-4">
          <h4 class="mcp-form-title text-sm font-semibold mb-3">Connect Server</h4>
          <div class="flex flex-col gap-2">
            <label class="form-control w-full"><div class="label"><span class="label-text text-xs">Name</span></div><input type="text" class="mcp-name input input-bordered input-sm w-full" placeholder="notion" /></label>
            <label class="form-control w-full"><div class="label"><span class="label-text text-xs">Command</span></div><input type="text" class="mcp-command input input-bordered input-sm w-full" placeholder="npx" /></label>
            <label class="form-control w-full"><div class="label"><span class="label-text text-xs">Args (space-separated)</span></div><input type="text" class="mcp-args input input-bordered input-sm w-full" placeholder="-y @notionhq/notion-mcp-server" /></label>
            <label class="form-control w-full mcp-token-field"><div class="label"><span class="mcp-token-label label-text text-xs">API Token</span></div><input type="password" class="mcp-token input input-bordered input-sm w-full" placeholder="secret_..." /></label>
            <div class="flex gap-2 mt-2">
              <button class="mcp-do-connect btn btn-primary btn-sm">Connect</button>
              <button class="mcp-cancel btn btn-ghost btn-sm">Cancel</button>
            </div>
            <div class="mcp-status text-xs mt-1 hidden"></div>
          </div>
        </div>

        <!-- Remote URL connect form -->
        <div class="mcp-remote-form hidden mb-4 bg-base-200 rounded-lg p-4">
          <h4 class="text-sm font-semibold mb-3">Add Custom Connector</h4>
          <div class="flex flex-col gap-2">
            <label class="form-control w-full"><div class="label"><span class="label-text text-xs">Name</span></div><input type="text" class="mcp-remote-name input input-bordered input-sm w-full" placeholder="my-connector" /></label>
            <label class="form-control w-full"><div class="label"><span class="label-text text-xs">Remote MCP server URL</span></div><input type="url" class="mcp-remote-url input input-bordered input-sm w-full" placeholder="https://mcp.example.com/sse" /></label>
            <details class="mt-1">
              <summary class="text-xs cursor-pointer text-base-content/50">Advanced settings</summary>
              <div class="flex flex-col gap-2 mt-2">
                <label class="form-control w-full"><div class="label"><span class="label-text text-xs">OAuth Client ID (optional)</span></div><input type="text" class="mcp-remote-client-id input input-bordered input-sm w-full" /></label>
                <label class="form-control w-full"><div class="label"><span class="label-text text-xs">OAuth Client Secret (optional)</span></div><input type="password" class="mcp-remote-client-secret input input-bordered input-sm w-full" /></label>
              </div>
            </details>
            <div class="flex gap-2 mt-2">
              <button class="mcp-do-remote btn btn-primary btn-sm">Connect</button>
              <button class="mcp-cancel-remote btn btn-ghost btn-sm">Cancel</button>
            </div>
            <div class="mcp-remote-status text-xs mt-1 hidden"></div>
          </div>
        </div>
        <div class="mcp-servers-list flex flex-col gap-2 mb-4"></div>
        <div class="mcp-tools-section hidden flex-1 overflow-y-auto">
          <h4 class="text-sm font-semibold mb-2">Available Tools</h4>
          <div class="mcp-tools-list flex flex-col gap-2"></div>
        </div>
        <div class="mcp-tool-result hidden mt-3">
          <h4 class="text-sm font-semibold mb-1">Result</h4>
          <pre class="bg-base-200 rounded-lg p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap"></pre>
        </div>
        <div class="modal-action">
          <button class="mcp-refresh btn btn-ghost btn-sm">Refresh</button>
          <form method="dialog"><button class="btn btn-ghost btn-sm">Close</button></form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>
    `;

    // Preset buttons
    for (const btn of this.$$<HTMLButtonElement>(".mcp-preset")) {
      btn.addEventListener("click", () => {
        const preset = MCP_PRESETS[btn.dataset.preset!];
        this._showForm(preset);
      });
    }

    this.$<HTMLButtonElement>(".mcp-do-connect").addEventListener("click", () =>
      this._handleConnect(),
    );
    this.$<HTMLButtonElement>(".mcp-cancel").addEventListener("click", () => this._hideForm());

    // Remote form
    this.$<HTMLButtonElement>(".mcp-show-remote").addEventListener("click", () =>
      this._showRemoteForm(),
    );
    this.$<HTMLButtonElement>(".mcp-do-remote").addEventListener("click", () =>
      this._handleRemoteConnect(),
    );
    this.$<HTMLButtonElement>(".mcp-cancel-remote").addEventListener("click", () =>
      this._hideRemoteForm(),
    );

    this.$<HTMLButtonElement>(".mcp-refresh").addEventListener("click", () =>
      this._renderServers(),
    );
  }

  private _showForm(preset?: McpPreset): void {
    this.$<HTMLDivElement>(".mcp-remote-form").classList.add("hidden");
    const form = this.$<HTMLDivElement>(".mcp-connect-form");
    form.classList.remove("hidden");
    this.$<HTMLDivElement>(".mcp-status").classList.add("hidden");

    if (preset) {
      this.$<HTMLElement>(".mcp-form-title").textContent = `Connect to ${preset.name}`;
      this.$<HTMLInputElement>(".mcp-name").value = preset.name;
      this.$<HTMLInputElement>(".mcp-command").value = preset.command;
      this.$<HTMLInputElement>(".mcp-args").value = preset.args;
      this.$<HTMLElement>(".mcp-token-field").classList.remove("hidden");
      this.$<HTMLElement>(".mcp-token-label").textContent = preset.tokenLabel;
      this.$<HTMLInputElement>(".mcp-token").value = "";
      form.dataset.preset = preset.name;
    } else {
      this.$<HTMLElement>(".mcp-form-title").textContent = "Connect Custom Server";
      this.$<HTMLInputElement>(".mcp-name").value = "";
      this.$<HTMLInputElement>(".mcp-command").value = "";
      this.$<HTMLInputElement>(".mcp-args").value = "";
      this.$<HTMLElement>(".mcp-token-field").classList.add("hidden");
      delete form.dataset.preset;
    }
  }

  private _hideForm(): void {
    this.$<HTMLDivElement>(".mcp-connect-form").classList.add("hidden");
  }

  private _showRemoteForm(): void {
    this.$<HTMLDivElement>(".mcp-connect-form").classList.add("hidden");
    this.$<HTMLDivElement>(".mcp-remote-form").classList.remove("hidden");
    this.$<HTMLDivElement>(".mcp-remote-status").classList.add("hidden");
    this.$<HTMLInputElement>(".mcp-remote-name").value = "";
    this.$<HTMLInputElement>(".mcp-remote-url").value = "";
    this.$<HTMLInputElement>(".mcp-remote-client-id").value = "";
    this.$<HTMLInputElement>(".mcp-remote-client-secret").value = "";
  }

  private _hideRemoteForm(): void {
    this.$<HTMLDivElement>(".mcp-remote-form").classList.add("hidden");
  }

  private async _handleRemoteConnect(): Promise<void> {
    const status = this.$<HTMLDivElement>(".mcp-remote-status");
    const name = this.$<HTMLInputElement>(".mcp-remote-name").value.trim();
    const url = this.$<HTMLInputElement>(".mcp-remote-url").value.trim();
    const oauthClientId =
      this.$<HTMLInputElement>(".mcp-remote-client-id").value.trim() || undefined;
    const oauthClientSecret =
      this.$<HTMLInputElement>(".mcp-remote-client-secret").value.trim() || undefined;

    if (!name || !url) {
      status.textContent = "Name and URL are required.";
      status.className = "mcp-remote-status text-xs mt-1 text-error";
      status.classList.remove("hidden");
      return;
    }

    status.textContent = "Connecting...";
    status.className = "mcp-remote-status text-xs mt-1 text-base-content/60";
    status.classList.remove("hidden");

    try {
      await mcpConnectRemote({ name, url, oauthClientId, oauthClientSecret });
      status.textContent = `Connected to "${name}"!`;
      status.className = "mcp-remote-status text-xs mt-1 text-success";
      this._hideRemoteForm();
      this._renderServers();
    } catch (err) {
      status.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
      status.className = "mcp-remote-status text-xs mt-1 text-error";
    }
  }

  private async _handleConnect(): Promise<void> {
    const form = this.$<HTMLDivElement>(".mcp-connect-form");
    const status = this.$<HTMLDivElement>(".mcp-status");
    const name = this.$<HTMLInputElement>(".mcp-name").value.trim();
    const command = this.$<HTMLInputElement>(".mcp-command").value.trim();
    const argsStr = this.$<HTMLInputElement>(".mcp-args").value.trim();
    const token = this.$<HTMLInputElement>(".mcp-token").value.trim();

    if (!name || !command) {
      status.textContent = "Name and command are required.";
      status.className = "mcp-status text-xs mt-1 text-error";
      status.classList.remove("hidden");
      return;
    }

    const args = argsStr ? argsStr.split(/\s+/) : undefined;
    let env: Record<string, string> | undefined;
    const presetKey = form.dataset.preset;
    if (presetKey && MCP_PRESETS[presetKey] && token) {
      env = MCP_PRESETS[presetKey].buildEnv(token);
    }

    status.textContent = "Connecting...";
    status.className = "mcp-status text-xs mt-1 text-base-content/60";
    status.classList.remove("hidden");

    try {
      await mcpConnect({ name, command, args, env });
      status.textContent = `Connected to "${name}"!`;
      status.className = "mcp-status text-xs mt-1 text-success";
      this._hideForm();
      this._renderServers();
    } catch (err) {
      status.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
      status.className = "mcp-status text-xs mt-1 text-error";
    }
  }

  private async _renderServers(): Promise<void> {
    const list = this.$<HTMLDivElement>(".mcp-servers-list");
    this.$<HTMLDivElement>(".mcp-tools-section").classList.add("hidden");
    this.$<HTMLDivElement>(".mcp-tool-result").classList.add("hidden");

    if (!isBridgeConnected()) {
      list.innerHTML =
        '<p class="text-sm text-error">MCP bridge not connected. Start it with <code class="badge badge-sm badge-ghost">just mcp</code></p>';
      return;
    }

    list.innerHTML = '<p class="text-sm text-base-content/40">Loading...</p>';

    try {
      const servers = await mcpListServers();
      if (servers.length === 0) {
        list.innerHTML =
          '<p class="text-sm text-base-content/40 italic">No servers connected. Use Quick Connect above.</p>';
        return;
      }

      list.innerHTML = "";
      for (const name of servers) {
        const card = document.createElement("div");
        card.className =
          "bg-base-200 rounded-lg p-3 flex items-center justify-between border border-base-content/5";
        card.innerHTML = `
          <div class="flex items-center gap-2"><span class="dot on"></span><span class="text-sm font-semibold">${escapeHtml(name)}</span></div>
          <div class="flex gap-1">
            <button class="btn btn-xs btn-primary show-tools" data-server="${escapeHtml(name)}">Tools</button>
            <button class="btn btn-xs btn-ghost text-error disconnect" data-server="${escapeHtml(name)}">Disconnect</button>
          </div>
        `;
        list.appendChild(card);
      }

      for (const btn of list.querySelectorAll<HTMLButtonElement>(".show-tools")) {
        btn.addEventListener("click", () => this._renderTools(btn.dataset.server!));
      }
      for (const btn of list.querySelectorAll<HTMLButtonElement>(".disconnect")) {
        btn.addEventListener("click", async () => {
          await mcpDisconnect(btn.dataset.server!);
          this._renderServers();
        });
      }
    } catch (err) {
      list.innerHTML = `<p class="text-sm text-error">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
    }
  }

  private async _renderTools(serverName: string): Promise<void> {
    const section = this.$<HTMLDivElement>(".mcp-tools-section");
    const toolsList = this.$<HTMLDivElement>(".mcp-tools-list");
    this.$<HTMLDivElement>(".mcp-tool-result").classList.add("hidden");
    section.classList.remove("hidden");
    toolsList.innerHTML = '<p class="text-sm text-base-content/40">Loading tools...</p>';

    try {
      const allTools = await mcpListTools(serverName);
      const tools = allTools[serverName] ?? [];

      if (tools.length === 0) {
        toolsList.innerHTML =
          '<p class="text-sm text-base-content/40 italic">No tools available.</p>';
        return;
      }

      toolsList.innerHTML = "";
      for (const tool of tools) {
        const card = document.createElement("div");
        card.className = "bg-base-200 rounded-lg p-3 border border-base-content/5";
        card.innerHTML = `
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-semibold text-primary">${escapeHtml(tool.name)}</span>
            <button class="btn btn-xs btn-ghost call-tool" data-server="${escapeHtml(serverName)}" data-tool="${escapeHtml(tool.name)}">Run</button>
          </div>
          <p class="text-xs text-base-content/60">${escapeHtml(tool.description ?? "No description")}</p>
          ${tool.inputSchema ? `<details class="mt-1"><summary class="text-xs cursor-pointer text-base-content/40">Schema</summary><pre class="text-xs mt-1 bg-base-300 rounded p-2 overflow-auto max-h-32">${escapeHtml(JSON.stringify(tool.inputSchema, null, 2))}</pre></details>` : ""}
        `;
        toolsList.appendChild(card);
      }

      for (const btn of toolsList.querySelectorAll<HTMLButtonElement>(".call-tool")) {
        btn.addEventListener("click", () => {
          const argsStr = prompt("Arguments (JSON):", "{}");
          if (argsStr === null) return;
          this._callTool(btn.dataset.server!, btn.dataset.tool!, argsStr);
        });
      }
    } catch (err) {
      toolsList.innerHTML = `<p class="text-sm text-error">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
    }
  }

  private async _callTool(serverName: string, toolName: string, argsJson: string): Promise<void> {
    const resultDiv = this.$<HTMLDivElement>(".mcp-tool-result");
    const pre = resultDiv.querySelector("pre")!;
    resultDiv.classList.remove("hidden");
    pre.textContent = "Calling...";

    try {
      const args = JSON.parse(argsJson) as Record<string, unknown>;
      const result = await mcpCallTool(serverName, toolName, args);
      pre.textContent = result.content || "(empty response)";
      pre.classList.toggle("text-error", result.isError === true);
    } catch (err) {
      pre.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
      pre.classList.add("text-error");
    }
  }
}

customElements.define("mn-mcp", MnMcp);
