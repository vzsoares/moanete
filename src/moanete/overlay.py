"""Terminal overlay UI with tabbed insights, transcript, and Q&A chat."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, ClassVar

from textual import on, work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.color import Color
from textual.widgets import Footer, Input, RichLog, Static, TabbedContent, TabPane

from moanete import config, llm
from moanete.llm import LLMError

if TYPE_CHECKING:
    from moanete.analyzer import Analyzer

log = logging.getLogger(__name__)

_COMPACT_HEIGHT = 20


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


class MoaneteApp(App):
    """Main TUI application."""

    TITLE = "moanete"
    CSS = """
    Screen {
        padding: 0;
    }

    #live-transcript {
        height: auto;
        max-height: 3;
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
        Binding("tab", "focus_next", "Next panel", show=False),
    ]

    def __init__(self, analyzer: Analyzer, **kwargs) -> None:
        super().__init__(**kwargs)
        self._analyzer = analyzer
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
            with TabPane("Suggestions", id="suggestions-tab"):
                yield RichLog(id="suggestions-log", wrap=True, markup=True)
            with TabPane("Key Points", id="key-points-tab"):
                yield RichLog(id="key-points-log", wrap=True, markup=True)
            with TabPane("Actions", id="actions-tab"):
                yield RichLog(id="actions-log", wrap=True, markup=True)
            with TabPane("Questions", id="questions-tab"):
                yield RichLog(id="questions-log", wrap=True, markup=True)
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

    def _refresh_insights(self) -> None:
        insights = self._analyzer.insights
        self._write_insight_list("#suggestions-log", insights.suggestions)
        self._write_insight_list("#key-points-log", insights.key_points)
        self._write_insight_list("#actions-log", insights.action_items)
        self._write_insight_list("#questions-log", insights.questions)

        if err := self._analyzer.last_error:
            self.query_one("#log-output", RichLog).write(f"[red]LLM: {err}[/]")

    def _write_insight_list(self, widget_id: str, items: list[str]) -> None:
        widget = self.query_one(widget_id, RichLog)
        widget.clear()
        if not items:
            widget.write("[dim]Nothing yet...[/]")
        else:
            for item in items[-10:]:
                widget.write(f"  \u2022 {item}")

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
        parts = [
            f"Transcript (last 2000 chars): {transcript[-2000:]}",
            f"Key points: {', '.join(insights.key_points[-5:])}",
            f"Action items: {', '.join(insights.action_items[-5:])}",
            f"Open questions: {', '.join(insights.questions[-5:])}",
        ]
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
