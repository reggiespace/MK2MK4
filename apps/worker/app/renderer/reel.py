"""Reel assembler: rendered frames + narration → 1080×1920 MP4.

Frames come from the browser renderer, so the video carries the same art the
studio previewed. This module only handles motion, transitions and the audio
mux — it draws nothing itself.
"""
from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path

log = logging.getLogger("worker.reel")

REEL_SIZE = (1080, 1920)
FADE_DURATION_S = 0.5  # cross-fade between frames

# Per-position scene duration. The hook must land near-instantly — most
# drop-off happens in the first three seconds — while an end card needs an
# extra beat to read the ask.
HOOK_DURATION_S = 2.5
BODY_DURATION_S = 4.0
CTA_DURATION_S = 5.5


def default_durations(frame_count: int) -> list[float]:
    """Hook, body frames, then the end card."""
    if frame_count <= 0:
        return []
    if frame_count == 1:
        return [BODY_DURATION_S]
    durations = [HOOK_DURATION_S]
    durations += [BODY_DURATION_S] * max(0, frame_count - 2)
    durations.append(CTA_DURATION_S)
    return durations


def _silent_audio(path: Path, seconds: float) -> None:
    """A silent track so the mux path is identical with or without narration."""
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-t", str(seconds),
            "-c:a", "aac", "-b:a", "128k",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


def assemble(
    *,
    frames: list[bytes],
    audio: bytes | None,
    durations: list[float] | None = None,
) -> bytes:
    """Ken-burns each frame, cross-fade between them, mux the narration."""
    if not frames:
        raise ValueError("no frames to assemble")

    durations = durations or default_durations(len(frames))
    if len(durations) != len(frames):
        raise ValueError("durations must match frame count")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        n = len(frames)

        frame_paths: list[Path] = []
        for i, data in enumerate(frames):
            p = tmp_path / f"frame{i:02d}.png"
            p.write_bytes(data)
            frame_paths.append(p)

        audio_path = tmp_path / "audio.m4a"
        if audio:
            audio_path.write_bytes(audio)
        else:
            _silent_audio(audio_path, sum(durations))

        # Still frames with a slow zoom, so the reel doesn't read as a slideshow.
        filter_parts: list[str] = []
        inputs: list[str] = []
        for i, p in enumerate(frame_paths):
            inputs += ["-loop", "1", "-t", str(durations[i] + FADE_DURATION_S), "-i", str(p)]
            filter_parts.append(
                f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=increase,"
                f"crop=1080:1920,"
                f"zoompan=z='min(zoom+0.0015,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                f":d={int(durations[i] * 25)}:fps=25:s=1080x1920[v{i}]"
            )

        if n > 1:
            # Each chained xfade merges into a stream already shortened by every
            # prior fade, so the offset subtracts i*FADE rather than one FADE —
            # otherwise later transitions start past the end of the merged
            # stream and ffmpeg truncates the output far short of its length.
            xfade_chain = ""
            prev = "v0"
            cumulative = durations[0]
            for i in range(1, n):
                offset = cumulative - i * FADE_DURATION_S
                out_label = f"xf{i}" if i < n - 1 else "vout"
                xfade_chain += (
                    f";[{prev}][v{i}]xfade=transition=fade:duration={FADE_DURATION_S}"
                    f":offset={offset}[{out_label}]"
                )
                prev = out_label
                cumulative += durations[i]
            filter_complex = ";".join(filter_parts) + xfade_chain
        else:
            filter_complex = filter_parts[0].replace("[v0]", "[vout]")

        out_path = tmp_path / "reel.mp4"
        cmd = (
            ["ffmpeg", "-y"]
            + inputs
            + ["-i", str(audio_path)]
            + [
                "-filter_complex", filter_complex,
                "-map", "[vout]",
                "-map", f"{n}:a",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                "-shortest",
                "-pix_fmt", "yuv420p",
                str(out_path),
            ]
        )
        subprocess.run(cmd, check=True, capture_output=True)
        return out_path.read_bytes()
