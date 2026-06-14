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
import json
import os
import sys
import tempfile
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "output"
CACHE_DIR = OUTPUT_DIR / ".cache"
CACHE_VERSION = 1
EXIT_QUOTA = 2  # distinct code so callers/cron can tell "resume later" apart


def parse_timestamp(value: str) -> float:
    """Parse 'SS', 'MM:SS', 'HH:MM:SS', or plain seconds into seconds."""
    value = value.strip()
    try:
        parts = value.split(":")
        if len(parts) == 1:
            return float(parts[0])
        if len(parts) == 2:
            m, s = parts
            return int(m) * 60 + float(s)
        if len(parts) == 3:
            h, m, s = parts
            return int(h) * 3600 + int(m) * 60 + float(s)
    except ValueError:
        pass
    raise argparse.ArgumentTypeError(
        f"invalid time '{value}'; use seconds, MM:SS, or HH:MM:SS"
    )


def _clip_suffix(start: float, end) -> str:
    """A filesystem-safe tag identifying a clip, e.g. '.clip-300-360'."""
    if start == 0.0 and end is None:
        return ""
    a = int(round(start))
    b = "end" if end is None else int(round(end))
    return f".clip-{a}-{b}"


def _cache_path(video_path: Path, clip_suffix: str = "") -> Path:
    return CACHE_DIR / f"{video_path.stem}{clip_suffix}.json"


def _load_cache(cache_file: Path, source: Path, langs: str, isolate: bool = False):
    if not cache_file.is_file():
        return None
    try:
        data = json.loads(cache_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if (data.get("version") != CACHE_VERSION
            or data.get("source") != str(source)
            or data.get("languages") != langs
            or data.get("isolate_vocals", False) != isolate):
        return None
    return data


def _save_cache(cache_file: Path, source: Path, langs: str, segments, translations,
                transcription_complete: bool = True, isolate: bool = False):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": CACHE_VERSION,
        "source": str(source),
        "languages": langs,
        "isolate_vocals": isolate,
        "transcription_complete": transcription_complete,
        "segments": segments,
        "translations": {str(k): v for k, v in translations.items()},
    }
    # Atomic write so an interrupt never leaves a half-written checkpoint.
    fd, tmp = tempfile.mkstemp(dir=str(CACHE_DIR), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        os.replace(tmp, cache_file)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Transcribe mixed Bengali/Hindi/English speech and translate "
                    "it to English subtitles (.srt)."
    )
    parser.add_argument("video", help="Path to the input .mp4 file")
    parser.add_argument("--model", default=None,
                        help="Gemini model id for translation "
                             "(default: gemini-2.5-flash; e.g. gemini-3.5-flash "
                             "or gemini-2.5-pro for harder audio)")
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

    video_path = Path(args.video)
    if not video_path.is_file():
        print(f"Error: file not found: {video_path}", file=sys.stderr)
        return 1

    if args.end is not None and args.end <= args.start:
        print(f"Error: --end ({args.end:g}s) must be greater than "
              f"--start ({args.start:g}s).", file=sys.stderr)
        return 1

    clip_suffix = _clip_suffix(args.start, args.end)

    # Load .env (for GEMINI_API_KEY) if python-dotenv is available.
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    # --- dependency checks -------------------------------------------------
    try:
        import mlx_whisper  # noqa: F401
        import silero_vad   # noqa: F401
    except ImportError as e:
        print(f"Error: missing dependency ({e.name}).\n"
              "Install dependencies with: pip install -r requirements.txt",
              file=sys.stderr)
        return 1

    if args.isolate_vocals:
        try:
            import demucs  # noqa: F401
        except ImportError:
            print("Error: --isolate-vocals needs the 'demucs' package.\n"
                  "Install it with: pip install demucs",
                  file=sys.stderr)
            return 1

    if not args.no_translate:
        try:
            import google.genai  # noqa: F401
        except ImportError:
            print("Error: missing dependency (google-genai).\n"
                  "Install dependencies with: pip install -r requirements.txt",
                  file=sys.stderr)
            return 1
        if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
            print("Error: GEMINI_API_KEY is not set.\n"
                  "Add it to a .env file (see .env.example) or export it.\n"
                  "Or run with --no-translate to skip the translation stage.",
                  file=sys.stderr)
            return 1

    import srt as srt_mod
    import transcribe as transcribe_mod

    # Parse the language allowlist ('auto' -> unrestricted detection).
    if args.languages.strip().lower() == "auto":
        languages = []
    else:
        languages = [c.strip().lower() for c in args.languages.split(",") if c.strip()]
    langs_key = ",".join(languages) if languages else "auto"

    cache_file = _cache_path(video_path, clip_suffix)
    vocals_cache = (CACHE_DIR / f"{video_path.stem}{clip_suffix}.vocals.npy"
                    if args.isolate_vocals else None)
    if args.fresh:
        if cache_file.exists():
            cache_file.unlink()
        if vocals_cache and vocals_cache.exists():
            vocals_cache.unlink()
    cache = (None if args.fresh
             else _load_cache(cache_file, video_path, langs_key, args.isolate_vocals))
    if args.redo_translate and cache and cache.get("transcription_complete"):
        cache["translations"] = {}
        _save_cache(cache_file, video_path, langs_key,
                    cache.get("segments", []), {},
                    transcription_complete=True, isolate=args.isolate_vocals)
        print("Cleared saved translations — will redo translation stage.")

    # --- stage 1: transcribe (or reuse checkpoint) ------------------------
    # Three possible states from the cache:
    #   a) full segments + translations -> resume translation only
    #   b) full segments, no translations -> run translation from scratch
    #   c) partial segments (interrupted mid-ASR) -> continue transcription
    #   d) no cache -> transcribe from scratch
    segments = []
    translations = {}
    transcription_complete = False

    if cache:
        segments = cache.get("segments") or []
        translations = {int(k): v for k, v in cache.get("translations", {}).items()}
        transcription_complete = cache.get("transcription_complete", False)

        if transcription_complete and translations:
            print(f"Resuming from checkpoint: {cache_file} "
                  f"({len(translations)} cues already translated).")
        elif transcription_complete:
            print(f"Reusing transcription from checkpoint: {cache_file} "
                  f"({len(segments)} segments).")
        elif segments:
            print(f"Found partial transcription checkpoint ({len(segments)} segments); "
                  f"ASR will restart from the beginning (region-level resume not supported).")

    if not transcription_complete:
        if clip_suffix and not segments:
            end_label = "end" if args.end is None else f"{args.end:g}s"
            print(f"Smoke test: processing {args.start:g}s - {end_label} only.")
        if not segments:
            print(f"Language detection: "
                  f"{'unrestricted' if not languages else ', '.join(languages)}")

        def _save_partial(segs):
            _save_cache(cache_file, video_path, langs_key, segs, {},
                        transcription_complete=False, isolate=args.isolate_vocals)

        try:
            segments = transcribe_mod.transcribe(
                str(video_path), use_vad=not args.no_vad,
                start=args.start, end=args.end, languages=languages,
                on_region_done=_save_partial,
                isolate_vocals=args.isolate_vocals, vocals_cache=vocals_cache,
            )
        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            return 1
        except Exception as e:  # noqa: BLE001
            print(f"Error: transcription failed: {e}", file=sys.stderr)
            print("Hint: make sure ffmpeg is installed (brew install ffmpeg).",
                  file=sys.stderr)
            return 1
        transcription_complete = True
        # Save the complete transcript so any later crash skips ASR on resume.
        _save_cache(cache_file, video_path, langs_key, segments, translations,
                    transcription_complete=True, isolate=args.isolate_vocals)

    cues = srt_mod.build_cues(segments)
    if not cues:
        print("Error: no speech was transcribed from the file.", file=sys.stderr)
        return 1
    print(f"Transcribed {len(cues)} cues.")

    # --- stage 2: translate ------------------------------------------------
    if not args.no_translate:
        import translate as translate_mod
        model = args.model or translate_mod.DEFAULT_MODEL
        print(f"Translating with {model}...")

        def save(done):
            _save_cache(cache_file, video_path, langs_key, segments, done,
                        transcription_complete=True, isolate=args.isolate_vocals)
        try:
            translate_mod.translate_cues(
                cues, model=model, done=translations, save=save,
                max_wait=args.max_wait, context_radius=max(0, args.context),
            )
        except translate_mod.QuotaExhausted as e:
            save(translations)
            print(f"\nDaily/rate limit reached: {e}", file=sys.stderr)
            print("Progress saved. Re-run the same command later to resume "
                  "(transcription and finished cues are cached).", file=sys.stderr)
            return EXIT_QUOTA
        except Exception as e:  # noqa: BLE001
            print(f"Error: translation failed: {e}", file=sys.stderr)
            return 1

    # --- write -------------------------------------------------------------
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Raw native-language transcript — always written.
    raw_path = OUTPUT_DIR / f"{video_path.stem}{clip_suffix}.raw.srt"
    srt_mod.write_srt(cues, raw_path, bilingual=False)
    print(f"Raw transcript written to: {raw_path}")

    # Translated / bilingual SRT — only when translation ran.
    if not args.no_translate:
        srt_path = OUTPUT_DIR / f"{video_path.stem}{clip_suffix}.srt"
        srt_mod.write_srt(cues, srt_path, bilingual=args.bilingual)
        print(f"Done. Subtitles written to: {srt_path}")

    # Keep the transcription checkpoint (translations cleared) so --redo-translate
    # works after a completed run without re-running ASR.
    _save_cache(cache_file, video_path, langs_key, segments, {},
                transcription_complete=True, isolate=args.isolate_vocals)
    return 0


if __name__ == "__main__":
    sys.exit(main())
