"""CLI entry point."""

from __future__ import annotations

import argparse
import contextlib
import logging

from moanete import __version__


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="moanete",
        description="Offline-first meeting assistant — real-time transcription, insights, and Q&A",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("--setup", action="store_true", help="Run the setup wizard")
    parser.add_argument("--list-devices", action="store_true", help="List audio input devices")
    parser.add_argument("--no-overlay", action="store_true", help="Run without the TUI overlay")
    parser.add_argument("--device", type=str, default=None, help="Mic device index or name")
    parser.add_argument(
        "--monitor",
        type=str,
        default=None,
        help="System audio device: index, 'auto' (detect), or 'pulse'",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose logging")

    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s: %(message)s",
    )

    if args.setup:
        from moanete.config import run_setup_wizard

        run_setup_wizard()
        return

    if args.list_devices:
        from moanete.audio_capture import list_devices, list_monitor_sources

        devices = list_devices()
        if not devices:
            print("No audio input devices found.")
        else:
            print("Input devices:")
            for d in devices:
                print(f"  [{d['index']}] {d['name']} ({d['channels']}ch)")

        monitors = list_monitor_sources()
        if monitors:
            print("\nSystem audio monitors (use with --monitor auto):")
            for m in monitors:
                print(f"  {m['name']}")
        else:
            print("\nNo PulseAudio/PipeWire monitor sources found.")
        return

    # Ensure config exists
    from moanete.config import CONFIG_FILE, load_config

    if not CONFIG_FILE.exists():
        print("No config found. Running setup wizard...\n")
        from moanete.config import run_setup_wizard

        run_setup_wizard()

    cfg = load_config()

    # Resolve audio devices
    device = args.device
    if device is None and cfg.get("AUDIO_DEVICE"):
        device = cfg["AUDIO_DEVICE"]
    if device is not None:
        with contextlib.suppress(ValueError):
            device = int(device)

    monitor = args.monitor
    if monitor is None and cfg.get("MONITOR_DEVICE"):
        monitor = cfg["MONITOR_DEVICE"]
    if monitor is not None:
        if monitor == "auto":
            from moanete.audio_capture import setup_monitor_source

            source = setup_monitor_source()
            if source:
                print(f"System audio monitor: {source}")
                monitor = "pulse"
            else:
                print("No monitor sources found. Running without system audio.")
                monitor = None
        elif monitor != "pulse":
            with contextlib.suppress(ValueError):
                monitor = int(monitor)

    # When running with the TUI, redirect logs to a file so they don't clip above the screen
    if not args.no_overlay:
        from moanete.config import CONFIG_DIR

        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        log_file = CONFIG_DIR / "moanete.log"
        root = logging.getLogger()
        root.handlers.clear()
        root.addHandler(logging.FileHandler(log_file))

    _run(device=device, monitor=monitor, no_overlay=args.no_overlay, cfg=cfg)


def _run(
    *,
    device: int | str | None,
    monitor: int | str | None,
    no_overlay: bool,
    cfg: dict[str, str],
) -> None:
    from moanete.analyzer import Analyzer
    from moanete.audio_capture import AudioCapture
    from moanete.transcribe import Transcriber

    analyzer = Analyzer()

    def on_transcript(text: str) -> None:
        analyzer.feed(text)
        if not no_overlay and app is not None:
            with contextlib.suppress(Exception):
                app.call_from_thread(app.append_transcript, text)
        else:
            print(f"[transcript] {text}")

    transcriber = Transcriber(
        model_size=cfg.get("WHISPER_MODEL", "base"),
        on_transcript=on_transcript,
    )
    capture = AudioCapture(on_chunk=transcriber.feed, device=device, monitor=monitor)

    app = None

    try:
        transcriber.start()
        capture.start()
        analyzer.start()

        if no_overlay:
            print("moanete running (no overlay). Press Ctrl+C to stop.\n")
            import time

            while True:
                time.sleep(1)
        else:
            from moanete.overlay import MoaneteApp

            app = MoaneteApp(analyzer=analyzer)
            app.run()
    except KeyboardInterrupt:
        pass
    finally:
        capture.stop()
        transcriber.stop()
        analyzer.stop()


if __name__ == "__main__":
    main()
