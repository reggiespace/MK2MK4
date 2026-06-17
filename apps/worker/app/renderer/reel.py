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
from .imagery import generate_background, animate_background, piece_seed

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


def _assemble(
    clips: list[Path],
    overlays: list[Path],
    audio_path: Path,
    motion: bool,
) -> bytes:
    """Assemble slide clips/frames + audio into MP4 and return bytes."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        n = len(clips)

        if motion:
            # Motion path: overlay transparent text PNGs on MP4 clips, then xfade.
            # For each clip: scale/trim → overlay text → label as [v{i}].
            filter_parts: list[str] = []
            inputs: list[str] = []
            for i, (clip_p, overlay_p) in enumerate(zip(clips, overlays)):
                inputs += ["-t", str(SLIDE_DURATION_S), "-i", str(clip_p)]
                inputs += ["-i", str(overlay_p)]
                filter_parts.append(
                    f"[{i * 2}:v]scale=1080:1920:force_original_aspect_ratio=increase,"
                    f"crop=1080:1920,setpts=PTS-STARTPTS[bg{i}];"
                    f"[bg{i}][{i * 2 + 1}:v]overlay=0:0[v{i}]"
                )
        else:
            # Ken Burns path: still frames with slow zoom.
            filter_parts = []
            inputs = []
            for i, clip_p in enumerate(clips):
                inputs += ["-loop", "1", "-t", str(SLIDE_DURATION_S + FADE_DURATION_S), "-i", str(clip_p)]
                filter_parts.append(
                    f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=increase,"
                    f"crop=1080:1920,"
                    f"zoompan=z='min(zoom+0.0015,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                    f":d={int(SLIDE_DURATION_S * 25)}:fps=25:s=1080x1920[v{i}]"
                )

        # Cross-fade between slides
        if n > 1:
            xfade_chain = ""
            prev = "v0"
            for i in range(1, n):
                offset = i * SLIDE_DURATION_S - FADE_DURATION_S
                out_label = f"xf{i}" if i < n - 1 else "vout"
                xfade_chain += (
                    f";[{prev}][v{i}]xfade=transition=fade:duration={FADE_DURATION_S}"
                    f":offset={offset}[{out_label}]"
                )
                prev = out_label
            filter_complex = ";".join(filter_parts) + xfade_chain
            video_map = "[vout]"
        else:
            filter_complex = filter_parts[0].replace("[v0]", "[vout]")
            video_map = "[vout]"

        audio_idx = n * 2 if motion else n
        out_path = tmp_path / "reel.mp4"
        cmd = (
            ["ffmpeg", "-y"]
            + inputs
            + ["-i", str(audio_path)]
            + [
                "-filter_complex", filter_complex,
                "-map", video_map,
                "-map", f"{audio_idx}:a",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                "-shortest",
                "-pix_fmt", "yuv420p",
                str(out_path),
            ]
        )
        subprocess.run(cmd, check=True, capture_output=True)
        return out_path.read_bytes()


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
    motion: bool = False,
) -> bytes:
    """Render a complete reel MP4 and return the bytes."""
    settings = get_settings()
    art_direction = brand_kit.get("artDirection", "warm_lifestyle")
    seed = piece_seed(piece_id)
    logo_path = brand_kit.get("logoPath")

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

        # 2. Pre-generate still backgrounds
        bgs: list[bytes | None] = []
        for slide in slides:
            bg = None
            if slide.get("imagePrompt"):
                bg = generate_background(
                    slide["imagePrompt"], art_direction, REEL_SIZE, settings.fal_key,
                    seed=seed,
                )
            bgs.append(bg)

        # 3. Attempt motion animations; degrade if any fails
        clip_data: list[bytes] = []
        if motion:
            for bg in bgs:
                if bg is None:
                    motion = False
                    clip_data.clear()
                    break
                c = animate_background(bg, art_direction, REEL_SIZE, settings.fal_key)
                if c is None:
                    motion = False
                    clip_data.clear()
                    break
                clip_data.append(c)

        # 4. Write slide files based on final motion state
        slide_clips: list[Path] = []
        slide_overlays: list[Path] = []

        for i, (slide, bg) in enumerate(zip(slides, bgs)):
            if motion:
                clip_p = tmp_path / f"clip_{i:02d}.mp4"
                clip_p.write_bytes(clip_data[i])
                slide_clips.append(clip_p)

                overlay_png = render_slide(
                    skin=slide.get("skin", "dark"),
                    role=slide.get("role", "body"),
                    eyebrow=slide.get("eyebrow"),
                    headline=slide.get("headline"),
                    body=slide.get("body"),
                    logo_path=logo_path,
                    transparent=True,
                    size=REEL_SIZE,
                )
                overlay_p = tmp_path / f"overlay_{i:02d}.png"
                overlay_p.write_bytes(overlay_png)
                slide_overlays.append(overlay_p)
            else:
                png = render_slide(
                    skin=slide.get("skin", "dark"),
                    role=slide.get("role", "body"),
                    eyebrow=slide.get("eyebrow"),
                    headline=slide.get("headline"),
                    body=slide.get("body"),
                    logo_path=logo_path,
                    background_image=bg,
                    size=REEL_SIZE,
                )
                p = tmp_path / f"slide_{i:02d}.png"
                p.write_bytes(png)
                slide_clips.append(p)

            if progress_callback:
                progress_callback(25 + int(55 * (i + 1) / len(slides)))

        # 5. Assemble
        result = _assemble(slide_clips, slide_overlays, audio_path, motion)
        if progress_callback:
            progress_callback(100)
        return result
