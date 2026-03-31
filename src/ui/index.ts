// Register all moanete custom elements
import "./components/mn-status.ts";
import "./components/mn-audio-level.ts";
import "./components/mn-compat-hints.ts";
import "./components/mn-transcript.ts";
import "./components/mn-chat.ts";
import "./components/mn-summary.ts";
import "./components/mn-insights.ts";
import "./components/mn-settings.ts";
import "./components/mn-history.ts";
import "./components/mn-mcp.ts";
import "./components/mn-screen-captures.ts";
import "./components/mn-dashboard.ts";

// Re-export classes for programmatic use
export { MoaneteElement } from "./base.ts";
export { MnStatus } from "./components/mn-status.ts";
export { MnAudioLevel } from "./components/mn-audio-level.ts";
export { MnCompatHints } from "./components/mn-compat-hints.ts";
export { MnTranscript } from "./components/mn-transcript.ts";
export { MnChat } from "./components/mn-chat.ts";
export { MnSummary } from "./components/mn-summary.ts";
export { MnInsights } from "./components/mn-insights.ts";
export { MnSettings } from "./components/mn-settings.ts";
export { MnHistory } from "./components/mn-history.ts";
export { MnMcp } from "./components/mn-mcp.ts";
export { MnScreenCaptures } from "./components/mn-screen-captures.ts";
export { MnDashboard } from "./components/mn-dashboard.ts";

// Re-export utilities
export { escapeHtml, escapeAttr, formatDuration } from "./util.ts";
