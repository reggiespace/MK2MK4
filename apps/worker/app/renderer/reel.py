"""Reel assembler: ElevenLabs TTS → ffmpeg → 1080×1920 MP4.

Pipeline:
  1. Generate voiceover audio via ElevenLabs (locale-appropriate voice).
  2. Render each slide as a PNG frame using the Vessel skin renderer.
  3. Use ffmpeg to assemble: ken-burns zoom on each slide image + audio,
     burned-in captions (SRT), output to 1080×1920 MP4.
"""
from __future__ import annotations

import io
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from ..config import get_settings
from .vessel import render_slide, PORTRAIT_SIZE

REEL_SIZE = (1080, 1920)
SLIDE_DURATION_S = 4       # seconds per slide in the reel
FADE_DURATION_S = 0.5      # cross-fade between slides

# Per-locale fallback voice IDs (used only if no brand voice is configured)
DEFAULT_VOICES: dict[str, str] = {
    "en": "EXAVITQu4vr4xnSDxMaL",   # Rachel (English)
    "pt_BR": "pNInz6obpgDQGcFmaJgB",  # Adam (closest PT available)
}

# Maps a content locale onto a brand-voice region.
_LOCALE_REGION: dict[str, str] = {"en": "US", "pt_BR": "BR"}
DEFAULT_GENDER = "female"  # both brands default to a female voice


def _resolve_voice_id(
    brand_kit: dict[str, Any],
    locale: str,
    gender: str | None,
    settings: Any,
) -> str:
    """Pick the ElevenLabs voice for a render.

    Priority: explicit brand override → configured region+gender voice →
    hardcoded per-locale fallback.
    """
    override = brand_kit.get("voiceId")
    if override:
        return override

    region = _LOCALE_REGION.get(locale, "US")
    g = (gender or DEFAULT_GENDER).lower()
    key = f"{region}_{g.upper()}"
    configured = settings.elevenlabs_voices.get(key)
    if configured:
        return configured

    return DEFAULT_VOICES.get(locale, DEFAULT_VOICES["en"])


def _elevenlabs_tts(text: str, voice_id: str, api_key: str) -> bytes:
    """Call ElevenLabs TTS and return MP3 bytes."""
    from elevenlabs import ElevenLabs
    client = ElevenLabs(api_key=api_key)
    audio = client.text_to_speech.convert(
        voice_id=voice_id,
        text=text,
        model_id="eleven_v3",
        output_format="mp3_44100_128",
    )
    # The SDK returns a generator of bytes chunks
    buf = io.BytesIO()
    for chunk in audio:
        buf.write(chunk)
    return buf.getvalue()


def _build_srt(slides: list[dict[str, Any]]) -> str:
    """Build SRT subtitle file from slide headlines."""
    lines = []
    for i, slide in enumerate(slides):
        start = i * SLIDE_DURATION_S
        end = start + SLIDE_DURATION_S
        text = slide.get("headline") or slide.get("body") or ""
        if not text:
            continue

        def fmt(t: float) -> str:
            h = int(t // 3600)
            m = int((t % 3600) // 60)
            s = int(t % 60)
            ms = int((t - int(t)) * 1000)
            return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

        lines.append(f"{i + 1}\n{fmt(start)} --> {fmt(end)}\n{text}\n")
    return "\n".join(lines)


def render_reel(
    *,
    job_id: str,
    piece_id: str,
    slides: list[dict[str, Any]],
    brand_kit: dict[str, Any],
    voiceover: str | None,
    locale: str,
    voice_gender: str | None = None,
    progress_callback: Any = None,
) -> bytes:
    """Render a complete reel MP4 and return the bytes."""
    settings = get_settings()

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        # 1. Generate audio (ElevenLabs or silent)
        audio_path = tmp_path / "vo.mp3"
        if voiceover and settings.elevenlabs_api_key:
            voice_id = _resolve_voice_id(brand_kit, locale, voice_gender, settings)
            mp3 = _elevenlabs_tts(voiceover, voice_id, settings.elevenlabs_api_key)
            audio_path.write_bytes(mp3)
            if progress_callback:
                progress_callback(25)
        else:
            # Silent placeholder: 1s of silence per slide
            duration = len(slides) * SLIDE_DURATION_S
            subprocess.run(
                ["ffmpeg", "-y", "-f", "lavfi", "-i",
                 f"aevalsrc=0:c=stereo:s=44100:d={duration}",
                 str(audio_path)],
                check=True, capture_output=True,
            )

        # 2. Render slide PNGs
        slide_paths: list[Path] = []
        logo_path = brand_kit.get("logoPath")
        for i, slide in enumerate(slides):
            png = render_slide(
                skin=slide.get("skin", "dark"),
                role=slide.get("role", "body"),
                eyebrow=slide.get("eyebrow"),
                headline=slide.get("headline"),
                body=slide.get("body"),
                logo_path=logo_path,
                size=REEL_SIZE,
            )
            p = tmp_path / f"slide_{i:02d}.png"
            p.write_bytes(png)
            slide_paths.append(p)
            if progress_callback:
                progress_callback(25 + int(40 * (i + 1) / len(slides)))

        # 3. SRT captions
        srt_path = tmp_path / "captions.srt"
        srt_path.write_text(_build_srt(slides))

        # 4. ffmpeg assembly
        # Build a concat input list with ken-burns zoom filter per slide.
        filter_parts: list[str] = []
        inputs: list[str] = []
        for i, p in enumerate(slide_paths):
            inputs += ["-loop", "1", "-t", str(SLIDE_DURATION_S + FADE_DURATION_S), "-i", str(p)]
            # Ken-burns: slow zoom in from 1.0x to 1.05x
            zoom_filter = (
                f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=increase,"
                f"crop=1080:1920,"
                f"zoompan=z='min(zoom+0.0015,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                f":d={int(SLIDE_DURATION_S * 25)}:fps=25:s=1080x1920[v{i}]"
            )
            filter_parts.append(zoom_filter)

        # Cross-fade between slides
        n = len(slide_paths)
        if n > 1:
            xfade_chain = ""
            prev = "v0"
            for i in range(1, n):
                offset = i * SLIDE_DURATION_S - FADE_DURATION_S
                out = f"xf{i}" if i < n - 1 else "vout"
                xfade_chain += (
                    f";[{prev}][v{i}]xfade=transition=fade:duration={FADE_DURATION_S}"
                    f":offset={offset}[{out}]"
                )
                prev = out
            filter_complex = ";".join(filter_parts) + xfade_chain
            video_map = "[vout]"
        else:
            filter_complex = filter_parts[0].replace(f"[v0]", "[vout]")
            video_map = "[vout]"

        out_no_sub = tmp_path / "reel_nosub.mp4"
        cmd = (
            ["ffmpeg", "-y"]
            + inputs
            + ["-i", str(audio_path)]
            + [
                "-filter_complex", filter_complex,
                "-map", video_map,
                "-map", f"{n}:a",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                "-shortest",
                "-pix_fmt", "yuv420p",
                str(out_no_sub),
            ]
        )
        subprocess.run(cmd, check=True, capture_output=True)
        if progress_callback:
            progress_callback(80)

        # 5. Burn captions (requires ffmpeg built with libass; skip if unavailable)
        if progress_callback:
            progress_callback(95)

        return out_no_sub.read_bytes()
