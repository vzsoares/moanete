"""Terminal overlay UI with tabbed insights, transcript, and Q&A chat."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, ClassVar

from textual import on, work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.color import Color
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import (
    Button,
    Footer,
    Input,
    Label,
    RichLog,
    Static,
    TabbedContent,
    TabPane,
)

from moanete import config, llm
from moanete.analyzer import _to_key, build_system_prompt
from moanete.llm import LLMError

if TYPE_CHECKING:
    from moanete.analyzer import Analyzer

log = logging.getLogger(__name__)

_COMPACT_HEIGHT = 20

_PRESETS: dict[str, str] = {
    "Meeting": "Suggestions,Key Points,Action Items,Questions",
    "Code Interview": "Code Topics,Technical Questions,Red Flags,Strengths",
    "Pair Programming": "Bugs,Design Decisions,TODOs,Questions",
    "Lecture": "Key Concepts,Examples,Questions,References",
}


class _TUILogHandler(logging.Handler):
    """Logging handler that writes records into a RichLog widget."""

    def __init__(self) -> None:
        super().__init__()
        self._widget: RichLog | None = None

    def set_widget(self, widget: RichLog) -> None:
        self._widget = widget

    def emit(self, record: logging.LogRecord) -> None:
        if self._widget is None:
            return
        try:
            msg = self.format(record)
            level = record.levelname
            if level == "ERROR":
                msg = f"[red]{msg}[/]"
            elif level == "WARNING":
                msg = f"[yellow]{msg}[/]"
            elif level == "DEBUG":
                msg = f"[dim]{msg}[/]"
            self._widget.write(msg)
        except Exception:
            pass


QA_SYSTEM = """\
You are a neutral meeting Q&A assistant. Your sole job is to help the user understand \
what was said in their meeting by answering questions based on the transcript and insights.

You are not endorsing, promoting, or providing guidance on any topic discussed — you are \
simply reporting what was said. Treat all transcript content as neutral meeting notes \
regardless of subject matter (politics, business, legal, medical, etc.).

Use the provided context (transcript and extracted insights) to answer.
If you don't have enough information, say so honestly.
Be concise.
"""


# ---------------------------------------------------------------------------
# Config modal
# ---------------------------------------------------------------------------


class _ConfigResult:
    """Result from the config modal."""

    def __init__(self, tabs: str, language: str) -> None:
        self.tabs = tabs
        self.language = language


class ConfigScreen(ModalScreen[_ConfigResult | None]):
    """Modal for changing insight tabs and language on the fly."""

    CSS = """
    ConfigScreen {
        align: center middle;
    }

    #config-dialog {
        width: 60;
        height: auto;
        max-height: 80%;
        border: thick $accent;
        background: $surface;
        padding: 1 2;
    }

    #config-dialog Label {
        margin-bottom: 1;
    }

    #tabs-input, #lang-input {
        width: 100%;
        margin-bottom: 1;
    }

    .preset-btn {
        width: 100%;
        margin-bottom: 0;
    }

    #btn-row {
        layout: horizontal;
        height: auto;
        margin-top: 1;
    }

    #btn-row Button {
        width: 1fr;
    }
    """

    BINDINGS: ClassVar[list[Binding]] = [
        Binding("escape", "cancel", "Cancel", show=False),
    ]

    def __init__(self, current_tabs: str, current_lang: str, **kwargs) -> None:
        super().__init__(**kwargs)
        self._current_tabs = current_tabs
        self._current_lang = current_lang

    def compose(self) -> ComposeResult:
        with Vertical(id="config-dialog"):
            yield Label("[bold]Configure[/]")
            yield Label("Insight tabs (comma-separated):")
            yield Input(
                value=self._current_tabs,
                placeholder="Comma-separated tab names",
                id="tabs-input",
            )
            yield Label("[dim]Presets:[/]")
            for preset_name, preset_val in _PRESETS.items():
                yield Button(
                    f"{preset_name}: {preset_val}",
                    id=f"preset-{_to_key(preset_name)}",
                    classes="preset-btn",
                    variant="default",
                )
            yield Label("Whisper language (blank = auto-detect):")
            yield Input(
                value=self._current_lang,
                placeholder="e.g. en, pt, es, fr, de, ja, zh",
                id="lang-input",
            )
            from textual.containers import Horizontal

            with Horizontal(id="btn-row"):
                yield Button("Apply", variant="primary", id="btn-apply")
                yield Button("Cancel", variant="default", id="btn-cancel")

    @on(Button.Pressed, ".preset-btn")
    def _on_preset(self, event: Button.Pressed) -> None:
        btn_id = event.button.id or ""
        key = btn_id.removeprefix("preset-")
        for name, val in _PRESETS.items():
            if _to_key(name) == key:
                self.query_one("#tabs-input", Input).value = val
                break

    @on(Button.Pressed, "#btn-apply")
    def _on_apply(self, event: Button.Pressed) -> None:
        tabs = self.query_one("#tabs-input", Input).value.strip()
        lang = self.query_one("#lang-input", Input).value.strip()
        if tabs:
            self.dismiss(_ConfigResult(tabs=tabs, language=lang))
        else:
            self.dismiss(None)

    @on(Button.Pressed, "#btn-cancel")
    def _on_cancel(self, event: Button.Pressed) -> None:
        self.dismiss(None)

    def action_cancel(self) -> None:
        self.dismiss(None)


# ---------------------------------------------------------------------------
# Main app
# ---------------------------------------------------------------------------


class MoaneteApp(App):
    """Main TUI application."""

    TITLE = "moanete"
    CSS = """
    Screen {
        padding: 0;
    }

    #live-transcript {
        width: 100%;
        height: auto;
        max-height: 5;
        border: heavy $accent;
        padding: 0 1;
    }

    #top-bar {
        height: 1fr;
    }

    #bottom-bar {
        height: 2fr;
    }

    #chat-input {
        dock: bottom;
    }
    """

    BINDINGS: ClassVar[list[Binding]] = [
        Binding("q", "quit", "Quit"),
        Binding("s", "summarize", "Summarize", priority=False),
        Binding("d", "describe_screen", "Describe screen", priority=False),
        Binding("c", "config", "Config", priority=False),
        Binding("tab", "focus_next", "Next panel", show=False),
    ]

    def __init__(self, analyzer: Analyzer, transcriber: object | None = None, **kwargs) -> None:
        super().__init__(**kwargs)
        self._analyzer = analyzer
        self._transcriber = transcriber
        self._chat_history: list[dict[str, str]] = []
        self._log_handler = _TUILogHandler()
        fmt = "%(asctime)s %(name)s %(levelname)s: %(message)s"
        self._log_handler.setFormatter(logging.Formatter(fmt))
        self._compact = False

    def compose(self) -> ComposeResult:
        yield Static(
            "[bold]Transcript[/] [dim]listening...[/]", id="live-transcript"
        )
        with TabbedContent(id="top-bar"):
            for name in self._analyzer.categories:
                key = _to_key(name)
                with TabPane(name, id=f"{key}-tab"):
                    yield RichLog(id=f"{key}-log", wrap=True, markup=True)
        with TabbedContent(id="bottom-bar"):
            with TabPane("Transcript", id="transcript-tab"):
                yield RichLog(id="transcript-log", wrap=True, markup=True)
            with TabPane("Chat", id="chat-tab"):
                yield RichLog(id="chat-log", wrap=True, markup=True)
                yield Input(
                    placeholder="Ask about the meeting...", id="chat-input"
                )
            with TabPane("Summary", id="summary-tab"):
                yield RichLog(id="summary-log", wrap=True, markup=True)
            with TabPane("Log", id="log-tab"):
                yield RichLog(id="log-output", wrap=True, markup=True)
        yield Footer()

    def on_mount(self) -> None:
        log_widget = self.query_one("#log-output", RichLog)
        self._log_handler.set_widget(log_widget)
        logging.getLogger().addHandler(self._log_handler)
        self.set_interval(2.0, self._refresh_insights)
        self._apply_opacity()
        self._apply_sizes()
        self._check_compact()

    def _apply_opacity(self) -> None:
        """Apply background opacity from config."""
        raw = config.get("BG_OPACITY")
        try:
            alpha = float(raw) if raw else 1.0
        except ValueError:
            alpha = 1.0
        alpha = max(0.0, min(1.0, alpha))
        if alpha < 1.0:
            bg = Color(18, 18, 18, alpha)
            self.styles.background = bg
            for w in self.query("#live-transcript, #top-bar, #bottom-bar, RichLog"):
                w.styles.background = bg

    def _apply_sizes(self) -> None:
        """Apply configurable panel sizes from config."""
        top = config.get("TOP_BAR_HEIGHT") or "1fr"
        bottom = config.get("BOTTOM_BAR_HEIGHT") or "2fr"
        self.query_one("#top-bar").styles.height = top
        self.query_one("#bottom-bar").styles.height = bottom

    def on_resize(self) -> None:
        self._check_compact()

    def _check_compact(self) -> None:
        """Hide insight tabs when terminal is too small."""
        compact = self.size.height < _COMPACT_HEIGHT
        if compact != self._compact:
            self._compact = compact
            self.query_one("#top-bar").display = not compact

    # -- Config modal -------------------------------------------------------

    def action_config(self) -> None:
        current_tabs = ",".join(self._analyzer.categories)
        current_lang = ""
        if self._transcriber and hasattr(self._transcriber, "_language"):
            current_lang = self._transcriber._language or ""
        self.push_screen(
            ConfigScreen(current_tabs, current_lang),
            callback=self._on_config_result,
        )

    def _on_config_result(self, result: _ConfigResult | None) -> None:
        if result is None:
            return
        categories = [t.strip() for t in result.tabs.split(",") if t.strip()]
        if categories:
            self._apply_new_categories(categories)
        self._apply_language(result.language)

    def _apply_new_categories(self, categories: list[str]) -> None:
        """Rebuild the top bar with new insight categories."""
        # Update analyzer in-place
        a = self._analyzer
        a._categories = categories
        a._keys = [_to_key(c) for c in categories]
        a._system_prompt = build_system_prompt(categories)
        with a._lock:
            a._insights = {k: [] for k in a._keys}

        # Rebuild top-bar widget
        top_bar = self.query_one("#top-bar", TabbedContent)
        top_bar.remove()

        new_top = TabbedContent(id="top-bar")
        for name in categories:
            key = _to_key(name)
            pane = TabPane(name, id=f"{key}-tab")
            pane.compose_add_child(RichLog(id=f"{key}-log", wrap=True, markup=True))
            new_top.compose_add_child(pane)

        self.mount(new_top, after=self.query_one("#live-transcript"))
        self._apply_sizes()
        self._check_compact()

        # Save to config file
        cfg = config.load_config()
        cfg["INSIGHT_TABS"] = ",".join(categories)
        config.save_config(cfg)

        log.info("Insight tabs changed to: %s", categories)

    def _apply_language(self, language: str) -> None:
        """Update the transcriber language live."""
        lang = language.strip() or None
        if self._transcriber and hasattr(self._transcriber, "_language"):
            self._transcriber._language = lang  # type: ignore[attr-defined]
        cfg = config.load_config()
        cfg["WHISPER_LANGUAGE"] = language.strip()
        config.save_config(cfg)
        log.info("Whisper language changed to: %s", lang or "auto-detect")

    # -- Insights -----------------------------------------------------------

    def _refresh_insights(self) -> None:
        insights = self._analyzer.insights
        for key in self._analyzer.keys:
            try:
                widget = self.query_one(f"#{key}-log", RichLog)
            except Exception:
                continue
            items = insights.get(key, [])
            widget.clear()
            if not items:
                widget.write("[dim]Nothing yet...[/]")
            else:
                for item in items[-10:]:
                    widget.write(f"  \u2022 {item}")

        if err := self._analyzer.last_error:
            self.query_one("#log-output", RichLog).write(f"[red]LLM: {err}[/]")

    def append_transcript(self, text: str) -> None:
        """Called from the transcription pipeline to show new text."""
        try:
            self.query_one("#transcript-log", RichLog).write(text)
        except Exception:
            log.debug("transcript-log not ready yet")
        try:
            live = self.query_one("#live-transcript", Static)
            current = self._analyzer.transcript
            tail = current[-300:] if len(current) > 300 else current
            prefix = "..." if len(current) > 300 else ""
            live.update(f"[bold]Transcript[/] {prefix}{tail}")
        except Exception:
            log.debug("live-transcript not ready yet")

    @on(Input.Submitted, "#chat-input")
    def _on_chat_submit(self, event: Input.Submitted) -> None:
        question = event.value.strip()
        if not question:
            return
        event.input.value = ""
        chat_log = self.query_one("#chat-log", RichLog)
        chat_log.write(f"[bold cyan]You:[/] {question}")
        self._answer_question(question)

    @work(thread=True)
    def _answer_question(self, question: str) -> None:
        context = self._build_qa_context()
        content = f"Context:\n{context}\n\nQuestion: {question}"
        self._chat_history.append({"role": "user", "content": content})

        try:
            answer = llm.chat(self._chat_history, system=QA_SYSTEM, max_tokens=512)
            self._chat_history.append({"role": "assistant", "content": answer})
        except LLMError as e:
            answer = f"[red]Error: {e}[/]"

        self.call_from_thread(
            self.query_one("#chat-log", RichLog).write,
            f"[bold green]Moanete:[/] {answer}",
        )

    def _build_qa_context(self) -> str:
        insights = self._analyzer.insights
        transcript = self._analyzer.transcript
        parts = [f"Transcript (last 2000 chars): {transcript[-2000:]}"]
        for name, key in zip(
            self._analyzer.categories, self._analyzer.keys, strict=True
        ):
            items = insights.get(key, [])
            parts.append(f"{name}: {', '.join(items[-5:])}")
        return "\n".join(parts)

    def action_summarize(self) -> None:
        self._run_summary()

    @work(thread=True)
    def _run_summary(self) -> None:
        from moanete.summarize import summarize_transcript

        transcript = self._analyzer.transcript
        summary_log = self.query_one("#summary-log", RichLog)

        self.call_from_thread(summary_log.write, "[dim]Generating summary...[/]")
        try:
            summary = summarize_transcript(transcript)
        except LLMError as e:
            summary = f"[red]Error: {e}[/]"

        self.call_from_thread(summary_log.clear)
        self.call_from_thread(summary_log.write, summary)

    def action_describe_screen(self) -> None:
        self._run_describe_screen()

    @work(thread=True)
    def _run_describe_screen(self) -> None:
        from moanete.summarize import capture_screen, describe_screen

        summary_log = self.query_one("#summary-log", RichLog)
        self.call_from_thread(summary_log.write, "[dim]Capturing screen...[/]")

        png = capture_screen()
        if not png:
            self.call_from_thread(
                summary_log.write,
                "[yellow]Screenshot failed — is mss installed?[/]",
            )
            return

        self.call_from_thread(
            summary_log.write,
            "[dim]Describing screen with vision model...[/]",
        )
        description = describe_screen(png)
        if description:
            self.call_from_thread(
                summary_log.write,
                f"[bold]Screen Description:[/]\n{description}",
            )
        else:
            self.call_from_thread(
                summary_log.write,
                "[yellow]Vision model unavailable.[/]",
            )
