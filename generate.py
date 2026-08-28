#!/usr/bin/env python3
"""Generate English .srt subtitles from a Bengali/Hindi/English mp4.

Two-stage pipeline:
  1. Transcribe natively with mlx-whisper (Apple Silicon GPU) + VAD, with
     per-region language auto-detection and word-level timestamps.
  2. Translate the native cues to English with the Gemini API.

Progress is checkpointed to output/.cache/<name>.json, so a run interrupted by a
crash or a free-tier daily quota can be resumed by re-running the same command:
the transcription is reused and only the remaining cues are translated.

Usage:
    python generate.py path/to/video.mp4 [--model MODEL] [--bilingual]
                                         [--no-translate] [--no-vad]
                                         [--max-wait SECONDS] [--fresh]
"""

import argparse
import sys

import argparse as _argparse

from pipeline import (
    PipelineConfig,
    PipelineError,
    cli_progress_printer,
    parse_timestamp as _parse_timestamp,
    run_pipeline,
)


def parse_timestamp(value: str) -> float:
    try:
        return _parse_timestamp(value)
    except ValueError as e:
        raise _argparse.ArgumentTypeError(str(e)) from e


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Transcribe mixed Bengali/Hindi/English speech and translate "
                    "it to English subtitles (.srt)."
    )
    parser.add_argument("video", help="Path to the input .mp4 file")
    parser.add_argument("--backend", choices=["gemini", "local"], default="gemini",
                        help="Translation backend: 'gemini' (cloud API, default) "
                             "or 'local' (fully offline, runs an on-device LLM "
                             "via mlx-lm — no API key, no network needed)")
    parser.add_argument("--model", default=None,
                        help="Gemini model id for translation "
                             "(default: gemini-2.5-flash; e.g. gemini-3.5-flash "
                             "or gemini-2.5-pro for harder audio)")
    parser.add_argument("--local-model", default=None,
                        help="MLX model id/path for --backend local "
                             "(default: mlx-community/Qwen2.5-14B-Instruct-4bit; "
                             "e.g. mlx-community/Qwen2.5-7B-Instruct-4bit for a "
                             "smaller/faster model on lower-RAM Macs)")
    parser.add_argument("--bilingual", action="store_true",
                        help="Write original text and English in each cue")
    parser.add_argument("--no-translate", action="store_true",
                        help="Only transcribe; write the native transcript")
    parser.add_argument("--no-vad", action="store_true",
                        help="Disable voice-activity segmentation")
    parser.add_argument("--isolate-vocals", action="store_true",
                        help="Strip background music/score with Demucs before "
                             "transcribing (slower; needs the 'demucs' package). "
                             "Best for music-heavy audio.")
    parser.add_argument("--context", type=int, default=12,
                        help="Neighboring cues of context included on each side "
                             "of a translation batch to improve accuracy "
                             "(default: 12; 0 disables)")
    parser.add_argument("--max-wait", type=float, default=120.0,
                        help="Max seconds to auto-pause on a rate limit before "
                             "checkpointing and exiting to resume later "
                             "(default: 120)")
    parser.add_argument("--fresh", action="store_true",
                        help="Ignore any existing checkpoint and start over")
    parser.add_argument("--redo-translate", action="store_true",
                        help="Clear saved translations and redo the translation stage "
                             "(keeps the cached transcription, skips ASR)")
    parser.add_argument("--start", type=parse_timestamp, default=0.0,
                        help="Only process from this time (seconds, MM:SS, or "
                             "HH:MM:SS) — for smoke testing")
    parser.add_argument("--end", type=parse_timestamp, default=None,
                        help="Only process up to this time (same formats)")
    parser.add_argument("--languages", default="bn,hi,en",
                        help="Comma-separated allowlist for language "
                             "auto-detection (default: bn,hi,en). Restricts "
                             "detection so it can't pick spurious languages. "
                             "Pass 'auto' for unrestricted detection.")
    args = parser.parse_args()

    config = PipelineConfig(
        video_path=args.video,
        backend=args.backend,
        model=args.model,
        local_model=args.local_model,
        bilingual=args.bilingual,
        no_translate=args.no_translate,
        no_vad=args.no_vad,
        isolate_vocals=args.isolate_vocals,
        context=args.context,
        max_wait=args.max_wait,
        fresh=args.fresh,
        redo_translate=args.redo_translate,
        start=args.start,
        end=args.end,
        languages=args.languages,
    )

    try:
        result = run_pipeline(config, on_event=cli_progress_printer)
        return result.exit_code
    except PipelineError as e:
        print(f"Error: {e}", file=sys.stderr)
        return e.exit_code


if __name__ == "__main__":
    sys.exit(main())
