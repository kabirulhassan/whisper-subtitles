"""Shared subtitle generation pipeline for CLI and GUI."""

from __future__ import annotations

import json
import os
import re
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Literal

OUTPUT_DIR = Path(__file__).parent / "output"
CACHE_DIR = OUTPUT_DIR / ".cache"
CACHE_VERSION = 1
EXIT_SUCCESS = 0
EXIT_ERROR = 1
EXIT_QUOTA = 2

StageName = Literal["transcribe", "build_cues", "translate", "write"]
JobStatus = Literal["pending", "running", "completed", "failed", "quota_paused", "cancelled"]


@dataclass
class PipelineConfig:
    video_path: str
    model: str | None = None
    models: list[str] | None = None
    bilingual: bool = False
    no_translate: bool = False
    no_vad: bool = False
    isolate_vocals: bool = False
    context: int = 12
    max_wait: float = 120.0
    fresh: bool = False
    redo_translate: bool = False
    start: float = 0.0
    end: float | None = None
    languages: str = "bn,hi,en"


@dataclass
class PipelineResult:
    exit_code: int
    raw_path: Path | None = None
    srt_path: Path | None = None
    cues: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None


@dataclass
class ProgressEvent:
    type: str
    message: str | None = None
    stage: StageName | None = None
    current: int | None = None
    total: int | None = None
    eta_seconds: float | None = None
    cue_id: int | None = None
    original: str | None = None
    translation: str | None = None
    raw_path: str | None = None
    srt_path: str | None = None
    exit_code: int | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"type": self.type}
        for key in (
            "message", "stage", "current", "total", "eta_seconds",
            "cue_id", "original", "translation", "raw_path", "srt_path", "exit_code",
        ):
            val = getattr(self, key)
            if val is not None:
                d[key] = val
        return d


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
    raise ValueError(f"invalid time '{value}'; use seconds, MM:SS, or HH:MM:SS")


def clip_suffix(start: float, end: float | None) -> str:
    if start == 0.0 and end is None:
        return ""
    a = int(round(start))
    b = "end" if end is None else int(round(end))
    return f".clip-{a}-{b}"


def cache_path(video_path: Path, suffix: str = "") -> Path:
    return CACHE_DIR / f"{video_path.stem}{suffix}.json"


def load_cache(cache_file: Path, source: Path, langs: str, isolate: bool = False):
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


def save_cache(cache_file: Path, source: Path, langs: str, segments, translations,
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
    fd, tmp = tempfile.mkstemp(dir=str(CACHE_DIR), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        os.replace(tmp, cache_file)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def load_dotenv_if_available():
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass


# Full names (and aliases) accepted from the GUI → Whisper ISO codes.
LANGUAGE_ALIASES = {
    "bengali": "bn",
    "bangla": "bn",
    "hindi": "hi",
    "english": "en",
    "en-us": "en",
    "en-gb": "en",
}


def _normalize_language_token(token: str) -> str | None:
    key = token.strip().lower()
    if not key:
        return None
    if key in LANGUAGE_ALIASES:
        return LANGUAGE_ALIASES[key]
    return key


def parse_languages(languages_str: str) -> tuple[list[str], str]:
    if languages_str.strip().lower() == "auto":
        return [], "auto"
    languages = []
    for part in languages_str.split(","):
        code = _normalize_language_token(part)
        if code:
            languages.append(code)
    return languages, ",".join(languages) if languages else "auto"


def resolve_models(config: PipelineConfig) -> list[str]:
    """Return the ranked Gemini model fallback list for translation."""
    if config.models:
        models = [m.strip() for m in config.models if m and str(m).strip()]
        if models:
            return models
    if config.model:
        return [config.model]
    import translate as translate_mod
    return list(translate_mod.DEFAULT_MODEL_FALLBACKS)


def validate_dependencies(config: PipelineConfig) -> str | None:
    try:
        import mlx_whisper  # noqa: F401
        import silero_vad   # noqa: F401
    except ImportError as e:
        return (f"Missing dependency ({e.name}). "
                "Install dependencies with: pip install -r requirements.txt")
    except RuntimeError as e:
        if "Metal" in str(e):
            return str(e)
        raise

    if config.isolate_vocals:
        try:
            import demucs  # noqa: F401
        except ImportError:
            return ("--isolate-vocals needs the 'demucs' package. "
                    "Install it with: pip install demucs")

    if not config.no_translate:
        try:
            import google.genai  # noqa: F401
        except ImportError:
            return ("Missing dependency (google-genai). "
                    "Install dependencies with: pip install -r requirements.txt")
        if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
            return ("GEMINI_API_KEY is not set. "
                    "Add it to a .env file (see .env.example) or export it. "
                    "Or run with no_translate to skip the translation stage.")
    return None


def check_health() -> dict[str, Any]:
    """Return dependency and environment status for the GUI."""
    load_dotenv_if_available()
    status: dict[str, Any] = {
        "mlx_whisper": False,
        "silero_vad": False,
        "demucs": False,
        "google_genai": False,
        "ffmpeg": False,
        "gemini_api_key": False,
    }
    try:
        import mlx_whisper  # noqa: F401
        status["mlx_whisper"] = True
    except Exception:
        pass
    try:
        import silero_vad  # noqa: F401
        status["silero_vad"] = True
    except Exception:
        pass
    try:
        import demucs  # noqa: F401
        status["demucs"] = True
    except Exception:
        pass
    try:
        import google.genai  # noqa: F401
        status["google_genai"] = True
    except Exception:
        pass
    import shutil
    status["ffmpeg"] = shutil.which("ffmpeg") is not None
    status["gemini_api_key"] = bool(
        os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    )
    status["ready"] = (
        status["mlx_whisper"]
        and status["silero_vad"]
        and status["ffmpeg"]
    )
    return status


def _parse_eta_seconds(msg: str) -> float | None:
    m = re.search(r"ETA\s+(.+)$", msg)
    if not m:
        return None
    label = m.group(1).strip()
    total = 0
    hm = re.search(r"(\d+)h\s+(\d+)m", label)
    if hm:
        return int(hm.group(1)) * 3600 + int(hm.group(2)) * 60
    mm = re.search(r"(\d+)m\s+(\d+)s", label)
    if mm:
        return int(mm.group(1)) * 60 + int(mm.group(2))
    sm = re.search(r"(\d+)s", label)
    if sm:
        return int(sm.group(1))
    return None


def _make_progress_adapter(on_event: Callable[[ProgressEvent], None],
                           cancel_event: threading.Event | None = None):
    """Wrap string progress messages into structured ProgressEvents."""
    region_re = re.compile(
        r"Transcribing region (\d+)/(\d+)"
    )
    region_done_re = re.compile(r"region (\d+)/(\d+) done")
    batch_re = re.compile(r"Translating batch (\d+)/(\d+)")
    batch_done_re = re.compile(r"batch (\d+)/(\d+) done")
    segment_re = re.compile(r"\[(\d+:\d+:\d+) -> (\d+:\d+:\d+)\] (.+)")
    translate_re = re.compile(r"\[(\d+)\] (.+) → (.+)")
    untranslated_re = re.compile(r"\[(\d+)\] \(untranslated")

    def emit(event: ProgressEvent):
        on_event(event)
        if cancel_event and cancel_event.is_set():
            raise PipelineCancelled("Job cancelled")

    def progress(msg: str):
        emit(ProgressEvent(type="log", message=msg))

        m = region_re.search(msg)
        if m:
            emit(ProgressEvent(
                type="region_progress",
                stage="transcribe",
                current=int(m.group(1)),
                total=int(m.group(2)),
                message=msg,
            ))
            return

        m = region_done_re.search(msg)
        if m:
            emit(ProgressEvent(
                type="region_progress",
                stage="transcribe",
                current=int(m.group(1)),
                total=int(m.group(2)),
                eta_seconds=_parse_eta_seconds(msg),
                message=msg,
            ))
            return

        m = batch_re.search(msg)
        if m:
            emit(ProgressEvent(
                type="batch_progress",
                stage="translate",
                current=int(m.group(1)),
                total=int(m.group(2)),
                message=msg,
            ))
            return

        m = batch_done_re.search(msg)
        if m:
            emit(ProgressEvent(
                type="batch_progress",
                stage="translate",
                current=int(m.group(1)),
                total=int(m.group(2)),
                eta_seconds=_parse_eta_seconds(msg),
                message=msg,
            ))
            return

        m = segment_re.search(msg)
        if m:
            emit(ProgressEvent(
                type="segment",
                stage="transcribe",
                message=msg,
                original=m.group(3),
            ))
            return

        m = translate_re.search(msg)
        if m:
            emit(ProgressEvent(
                type="translation",
                stage="translate",
                cue_id=int(m.group(1)),
                original=m.group(2),
                translation=m.group(3),
                message=msg,
            ))
            return

        m = untranslated_re.search(msg)
        if m:
            emit(ProgressEvent(
                type="translation",
                stage="translate",
                cue_id=int(m.group(1)),
                message=msg,
            ))

    return progress


class PipelineCancelled(Exception):
    """Raised when a cooperative cancel is requested."""


class PipelineError(Exception):
    """Raised for validation or runtime pipeline failures."""

    def __init__(self, message: str, exit_code: int = EXIT_ERROR):
        super().__init__(message)
        self.exit_code = exit_code


def run_pipeline(
    config: PipelineConfig,
    on_event: Callable[[ProgressEvent], None] | None = None,
    cancel_event: threading.Event | None = None,
) -> PipelineResult:
    """Run the full subtitle pipeline and emit structured progress events."""
    def _emit(event: ProgressEvent):
        if on_event is not None:
            on_event(event)

    progress = _make_progress_adapter(_emit, cancel_event)

    load_dotenv_if_available()

    video_path = Path(config.video_path)
    if not video_path.is_file():
        raise PipelineError(f"file not found: {video_path}")

    if config.end is not None and config.end <= config.start:
        raise PipelineError(
            f"end ({config.end:g}s) must be greater than start ({config.start:g}s)"
        )

    dep_err = validate_dependencies(config)
    if dep_err:
        raise PipelineError(dep_err)

    import srt as srt_mod
    import transcribe as transcribe_mod

    suffix = clip_suffix(config.start, config.end)
    languages, langs_key = parse_languages(config.languages)

    cache_file = cache_path(video_path, suffix)
    vocals_cache = (
        CACHE_DIR / f"{video_path.stem}{suffix}.vocals.npy"
        if config.isolate_vocals else None
    )

    if config.fresh:
        if cache_file.exists():
            cache_file.unlink()
        if vocals_cache and vocals_cache.exists():
            vocals_cache.unlink()

    cache = (None if config.fresh
             else load_cache(cache_file, video_path, langs_key, config.isolate_vocals))

    if config.redo_translate and cache and cache.get("transcription_complete"):
        cache["translations"] = {}
        save_cache(cache_file, video_path, langs_key,
                   cache.get("segments", []), {},
                   transcription_complete=True, isolate=config.isolate_vocals)
        progress("Cleared saved translations — will redo translation stage.")

    segments: list = []
    translations: dict[int, str] = {}
    transcription_complete = False

    if cache:
        segments = cache.get("segments") or []
        translations = {int(k): v for k, v in cache.get("translations", {}).items()}
        transcription_complete = cache.get("transcription_complete", False)

        if transcription_complete and translations:
            progress(f"Resuming from checkpoint: {cache_file} "
                     f"({len(translations)} cues already translated).")
        elif transcription_complete:
            progress(f"Reusing transcription from checkpoint: {cache_file} "
                     f"({len(segments)} segments).")
        elif segments:
            progress(f"Found partial transcription checkpoint ({len(segments)} segments); "
                     f"ASR will restart from the beginning (region-level resume not supported).")

    # --- stage 1: transcribe ---
    if not transcription_complete:
        _emit(ProgressEvent(type="stage_started", stage="transcribe"))
        if suffix and not segments:
            end_label = "end" if config.end is None else f"{config.end:g}s"
            progress(f"Smoke test: processing {config.start:g}s - {end_label} only.")
        if not segments:
            progress(f"Language detection: "
                     f"{'unrestricted' if not languages else ', '.join(languages)}")

        def _save_partial(segs):
            save_cache(cache_file, video_path, langs_key, segs, {},
                       transcription_complete=False, isolate=config.isolate_vocals)

        try:
            segments = transcribe_mod.transcribe(
                str(video_path), use_vad=not config.no_vad,
                start=config.start, end=config.end, languages=languages,
                progress=progress,
                on_region_done=_save_partial,
                isolate_vocals=config.isolate_vocals, vocals_cache=vocals_cache,
            )
        except PipelineCancelled:
            raise
        except ValueError as e:
            raise PipelineError(str(e)) from e
        except Exception as e:
            raise PipelineError(
                f"transcription failed: {e}. "
                "Hint: make sure ffmpeg is installed (brew install ffmpeg)."
            ) from e

        transcription_complete = True
        save_cache(cache_file, video_path, langs_key, segments, translations,
                   transcription_complete=True, isolate=config.isolate_vocals)
        _emit(ProgressEvent(type="stage_completed", stage="transcribe",
                            message=f"Transcription complete: {len(segments)} segments."))

    # --- build cues ---
    _emit(ProgressEvent(type="stage_started", stage="build_cues"))
    cues = srt_mod.build_cues(segments)
    if not cues:
        raise PipelineError("no speech was transcribed from the file.")
    progress(f"Transcribed {len(cues)} cues.")
    _emit(ProgressEvent(type="stage_completed", stage="build_cues",
                        message=f"Built {len(cues)} cues."))

    # --- stage 2: translate ---
    if not config.no_translate:
        import translate as translate_mod
        models = resolve_models(config)
        _emit(ProgressEvent(type="stage_started", stage="translate",
                            message=f"Translating…"))

        def save(done):
            save_cache(cache_file, video_path, langs_key, segments, done,
                       transcription_complete=True, isolate=config.isolate_vocals)

        try:
            translate_mod.translate_cues(
                cues, models=models, done=translations, save=save,
                max_wait=config.max_wait, context_radius=max(0, config.context),
                progress=progress,
            )
        except PipelineCancelled:
            raise
        except translate_mod.QuotaExhausted as e:
            save(translations)
            _emit(ProgressEvent(
                type="quota_paused",
                stage="translate",
                message=str(e),
            ))
            return PipelineResult(
                exit_code=EXIT_QUOTA,
                cues=cues,
                error=str(e),
            )
        except Exception as e:
            raise PipelineError(f"translation failed: {e}") from e

        _emit(ProgressEvent(type="stage_completed", stage="translate",
                            message="Translation complete."))

    # --- write ---
    _emit(ProgressEvent(type="stage_started", stage="write"))
    OUTPUT_DIR.mkdir(exist_ok=True)

    raw_path = OUTPUT_DIR / f"{video_path.stem}{suffix}.raw.srt"
    srt_mod.write_srt(cues, raw_path, bilingual=False)
    progress(f"Raw transcript written to: {raw_path}")

    srt_path = None
    if not config.no_translate:
        srt_path = OUTPUT_DIR / f"{video_path.stem}{suffix}.srt"
        srt_mod.write_srt(cues, srt_path, bilingual=config.bilingual)
        progress(f"Done. Subtitles written to: {srt_path}")

    save_cache(cache_file, video_path, langs_key, segments, {},
               transcription_complete=True, isolate=config.isolate_vocals)

    _emit(ProgressEvent(
        type="job_completed",
        stage="write",
        raw_path=str(raw_path),
        srt_path=str(srt_path) if srt_path else None,
        exit_code=EXIT_SUCCESS,
        message="Pipeline completed successfully.",
    ))

    return PipelineResult(
        exit_code=EXIT_SUCCESS,
        raw_path=raw_path,
        srt_path=srt_path,
        cues=cues,
    )


def cli_progress_printer(event: ProgressEvent):
    """Print progress events in CLI-friendly format."""
    if event.type == "log" and event.message:
        print(event.message, flush=True)
    elif event.type == "quota_paused":
        print(f"\nDaily/rate limit reached: {event.message}", flush=True)
        print("Progress saved. Re-run the same command later to resume "
              "(transcription and finished cues are cached).", flush=True)
    elif event.type == "job_completed" and event.message:
        print(event.message, flush=True)
