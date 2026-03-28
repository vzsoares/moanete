"""Audio capture from microphone and/or system monitor using sounddevice."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable

import numpy as np
import sounddevice as sd

log = logging.getLogger(__name__)

# 16 kHz mono — what faster-whisper expects
TARGET_RATE = 16_000
CHANNELS = 1
BLOCK_DURATION_S = 2  # seconds per chunk

# Sample rates to try, in preference order (16k first, then common hardware rates)
_RATES_TO_TRY = [16_000, 44_100, 48_000, 22_050, 32_000, 96_000]


def _resample(audio: np.ndarray, orig_rate: int, target_rate: int) -> np.ndarray:
    """Resample mono audio from orig_rate to target_rate using linear interpolation."""
    if orig_rate == target_rate:
        return audio
    ratio = target_rate / orig_rate
    n_out = int(len(audio) * ratio)
    indices = np.arange(n_out) / ratio
    return np.interp(indices, np.arange(len(audio)), audio).astype(np.float32)


def _probe_device(device: int | str | None) -> tuple[int, int]:
    """Find a working (channels, sample_rate) pair for a device.

    Returns the first combination that can actually be opened.
    """
    if device is None:
        return CHANNELS, TARGET_RATE

    info = sd.query_devices(device)
    reported_ch = max(int(info["max_input_channels"]), 1)
    default_rate = int(info["default_samplerate"])

    # Channels to try: reported, 2, 1
    channels_to_try = list(dict.fromkeys([reported_ch, 2, 1]))
    # Rates to try: device default first, then our list
    rates_to_try = list(dict.fromkeys([default_rate, *_RATES_TO_TRY]))

    for ch in channels_to_try:
        for rate in rates_to_try:
            try:
                s = sd.InputStream(device=device, channels=ch, samplerate=rate)
                s.close()
                return ch, rate
            except sd.PortAudioError:
                continue

    # Last resort
    return 1, 44_100


class AudioCapture:
    """Captures audio from one or two devices and delivers mixed chunks to a callback.

    When both `device` (mic) and `monitor` (system audio) are set, the two
    streams are mixed together so the transcriber hears both sides of a call.
    Automatically handles sample rate conversion to 16 kHz for whisper.
    """

    def __init__(
        self,
        on_chunk: Callable[[np.ndarray], None],
        device: int | str | None = None,
        monitor: int | str | None = None,
    ) -> None:
        self._on_chunk = on_chunk
        self._device = device
        self._monitor = monitor
        self._running = False
        self._streams: list[sd.InputStream] = []
        # Per-stream native rates (for resampling in callbacks)
        self._mic_rate = TARGET_RATE
        self._mon_rate = TARGET_RATE
        # When mixing two sources, buffer the monitor chunks
        self._monitor_buf: np.ndarray | None = None
        self._monitor_lock = threading.Lock()

    @staticmethod
    def _to_mono(data: np.ndarray) -> np.ndarray:
        """Downmix multi-channel audio to mono."""
        if data.ndim == 1:
            return data
        return data.mean(axis=1)

    def _open_stream(
        self,
        device: int | str | None,
        callback: Callable,
    ) -> tuple[sd.InputStream, int, int]:
        """Open an InputStream with auto-detected channels and sample rate."""
        ch, rate = _probe_device(device)
        block_size = int(rate * BLOCK_DURATION_S)
        stream = sd.InputStream(
            samplerate=rate,
            channels=ch,
            dtype="float32",
            blocksize=block_size,
            device=device,
            callback=callback,
        )
        return stream, ch, rate

    def start(self) -> None:
        self._running = True

        if self._monitor is not None and self._device is not None:
            mic_stream, mic_ch, self._mic_rate = self._open_stream(self._device, self._mic_callback)
            mon_stream, mon_ch, self._mon_rate = self._open_stream(
                self._monitor, self._monitor_callback
            )
            self._streams = [mic_stream, mon_stream]
            for s in self._streams:
                s.start()
            log.info(
                "Audio capture started (mic=%s[%dch@%dHz], monitor=%s[%dch@%dHz])",
                self._device,
                mic_ch,
                self._mic_rate,
                self._monitor,
                mon_ch,
                self._mon_rate,
            )
        else:
            dev = self._device if self._device is not None else self._monitor
            stream, ch, rate = self._open_stream(dev, self._single_callback)
            self._mic_rate = rate
            self._streams = [stream]
            stream.start()
            log.info(
                "Audio capture started (device=%s[%dch@%dHz])",
                dev,
                ch,
                rate,
            )

    def stop(self) -> None:
        self._running = False
        for s in self._streams:
            s.stop()
            s.close()
        self._streams.clear()
        log.info("Audio capture stopped")

    # -- Single device mode --------------------------------------------------

    def _single_callback(
        self,
        indata: np.ndarray,
        frames: int,
        time_info: object,
        status: sd.CallbackFlags,
    ) -> None:
        if status:
            log.warning("Audio status: %s", status)
        if self._running:
            mono = self._to_mono(indata).copy()
            self._on_chunk(_resample(mono, self._mic_rate, TARGET_RATE))

    # -- Dual device mode (mic + monitor) ------------------------------------

    def _monitor_callback(
        self,
        indata: np.ndarray,
        frames: int,
        time_info: object,
        status: sd.CallbackFlags,
    ) -> None:
        if status:
            log.warning("Monitor audio status: %s", status)
        if self._running:
            mono = self._to_mono(indata).copy()
            with self._monitor_lock:
                self._monitor_buf = _resample(mono, self._mon_rate, TARGET_RATE)

    def _mic_callback(
        self,
        indata: np.ndarray,
        frames: int,
        time_info: object,
        status: sd.CallbackFlags,
    ) -> None:
        if status:
            log.warning("Mic audio status: %s", status)
        if not self._running:
            return

        mic = _resample(self._to_mono(indata).copy(), self._mic_rate, TARGET_RATE)

        with self._monitor_lock:
            mon = self._monitor_buf
            self._monitor_buf = None

        if mon is not None:
            # Match lengths and mix at equal volume
            length = min(len(mic), len(mon))
            mixed = (mic[:length] + mon[:length]) * 0.5
            if len(mic) > length:
                mixed = np.concatenate([mixed, mic[length:] * 0.5])
            elif len(mon) > length:
                mixed = np.concatenate([mixed, mon[length:] * 0.5])
            self._on_chunk(mixed)
        else:
            self._on_chunk(mic)


def list_devices() -> list[dict]:
    """Return available audio input devices."""
    devices = sd.query_devices()
    inputs = []
    for i, d in enumerate(devices):
        if d["max_input_channels"] > 0:
            inputs.append(
                {
                    "index": i,
                    "name": d["name"],
                    "channels": d["max_input_channels"],
                    "rate": int(d["default_samplerate"]),
                }
            )
    return inputs


# ---------------------------------------------------------------------------
# PulseAudio / PipeWire monitor helpers
# ---------------------------------------------------------------------------


def list_monitor_sources() -> list[dict]:
    """Return PulseAudio/PipeWire monitor sources (system audio loopbacks)."""
    import subprocess

    try:
        result = subprocess.run(
            ["pactl", "list", "short", "sources"],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []

    monitors = []
    for line in result.stdout.strip().splitlines():
        parts = line.split("\t")
        if len(parts) >= 2 and ".monitor" in parts[1]:
            monitors.append({"id": parts[0], "name": parts[1]})
    return monitors


def setup_monitor_source(source_name: str | None = None) -> str | None:
    """Ensure a PulseAudio monitor is exposed as a default source.

    If source_name is None, auto-detects the first available monitor.
    Loads a remap module and sets it as the default PulseAudio source so
    that sounddevice can capture system audio via the 'pulse' device.

    Returns the monitor source name if successful, None otherwise.
    """
    import subprocess

    monitors = list_monitor_sources()
    if not monitors:
        return None

    if source_name is None:
        source_name = monitors[0]["name"]
    elif not any(m["name"] == source_name for m in monitors):
        return None

    # Load remap module (idempotent — PulseAudio deduplicates)
    try:
        subprocess.run(
            [
                "pactl",
                "load-module",
                "module-remap-source",
                "source_name=moanete_monitor",
                f"master={source_name}",
                'source_properties=device.description="Moanete_Monitor"',
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        # Set as default so 'pulse' device picks it up for monitor
        subprocess.run(
            ["pactl", "set-default-source", "moanete_monitor"],
            capture_output=True,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None

    return source_name
