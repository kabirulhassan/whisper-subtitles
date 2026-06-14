"""Stage 1 — speech-to-text with mlx-whisper (Apple Silicon GPU) + silero VAD.

The audio is split into speech regions with a voice-activity detector first,
then each region is transcribed independently with language auto-detection.
This does two things the old single-pass approach could not:

* timestamps line up with real speech (silence/music is never transcribed,
  so there are no hallucinated cues drifting the timeline), and
* each region's language is detected on its own, so code-switched
  Bengali / Hindi / English audio is transcribed natively instead of being
  forced through a single ``language="bn"`` decode.
"""

import time
import unicodedata
from pathlib import Path

import numpy as np

MODEL_REPO = "mlx-community/whisper-large-v3-mlx"

# Demucs model used for optional vocal isolation (removes background music).
DEMUCS_MODEL = "htdemucs"

# Restrict language auto-detection to this set by default. Without it, Whisper
# chooses from all ~99 languages and tends to misfire on acoustically/script-
# adjacent ones (e.g. Turkish, Nepali) for Bengali/Hindi/English audio.
DEFAULT_LANGUAGES = ["bn", "hi", "en"]

# Merge speech regions separated by less than this (seconds) and pad each
# region a little so word onsets/offsets aren't clipped.
VAD_MERGE_GAP = 0.4
VAD_PAD = 0.2

# Extra real audio decoded on each side of a region so a word straddling the
# boundary isn't acoustically clipped. Words are then assigned to exactly one
# region by splitting each inter-region gap at its midpoint (see transcribe()).
DECODE_MARGIN = 0.5

# How many trailing words of a region's transcript to feed the next region as
# `initial_prompt`, so sentences/names continue across boundaries.
PROMPT_WORDS = 30


def _safe(text: str) -> str:
    """NFC-normalize and wrap in LTR marks so complex-script terminals render better."""
    normalized = unicodedata.normalize("NFC", text)
    return f"‎{normalized}‎"


def _log(msg):
    """Default progress sink that flushes so logs appear live (and when piped)."""
    print(msg, flush=True)


def _fmt(seconds: float) -> str:
    """Compact HH:MM:SS for progress logging."""
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _fmt_dur(seconds: float) -> str:
    """Human-readable duration: '45s', '2m 30s', '1h 15m'."""
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h {m}m"
    if m:
        return f"{m}m {s}s"
    return f"{s}s"


def _load_audio(path: str):
    """Decode the media file to a 16 kHz mono float32 numpy array via ffmpeg."""
    from mlx_whisper.audio import load_audio, SAMPLE_RATE
    audio = np.asarray(load_audio(path), dtype=np.float32)
    return audio, SAMPLE_RATE


def _best_device() -> str:
    """Prefer Apple Metal (mps), then CUDA, else CPU — for Demucs."""
    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:  # noqa: BLE001
        pass
    return "cpu"


def _decode_stereo(path: str, sr: int, start: float = 0.0, end=None):
    """Decode ``path`` to a contiguous [2, N] float32 array at ``sr`` Hz via ffmpeg.

    Honors ``start``/``end`` (seconds) so only the requested clip is decoded —
    important because Demucs is slow and smoke tests use short clips.
    """
    import subprocess
    cmd = ["ffmpeg", "-nostdin", "-threads", "0"]
    if start and start > 0:
        cmd += ["-ss", str(float(start))]
    cmd += ["-i", str(path)]
    if end is not None:
        cmd += ["-t", str(max(0.0, float(end) - float(start)))]
    cmd += ["-f", "f32le", "-ac", "2", "-ar", str(sr), "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.float32)
    return np.ascontiguousarray(a.reshape(-1, 2).T)  # [2, N]


def _isolate_to_audio16k(path, start, end, progress, cache_path=None):
    """Isolate the vocal stem with Demucs; return (16 kHz mono float32, 16000).

    The clip ``[start, end]`` is decoded at Demucs' native 44.1 kHz stereo,
    separated, and the vocals downsampled to 16 kHz mono for the ASR pipeline.
    The result is cached to ``cache_path`` (.npy) so a re-run skips the slow
    separation. Falls back from GPU to CPU if the accelerated path fails.
    """
    if cache_path is not None and Path(cache_path).is_file():
        progress(f"Reusing cached isolated vocals: {cache_path}")
        return np.load(cache_path), 16000

    import torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from demucs.audio import convert_audio

    model = get_model(DEMUCS_MODEL)
    model.eval()
    vocals_idx = model.sources.index("vocals")

    stereo = _decode_stereo(path, model.samplerate, start, end)
    if stereo.shape[1] == 0:  # clip starts at/after end of audio
        return np.zeros(0, dtype=np.float32), 16000
    wav = torch.from_numpy(stereo)
    # Demucs' standard input normalization (see demucs/separate.py).
    ref = wav.mean(0)
    wav = (wav - ref.mean()) / (ref.std() + 1e-8)

    last_err = None
    for device in (_best_device(), "cpu"):
        try:
            progress(f"Isolating vocals with Demucs ({DEMUCS_MODEL}, {device}) — "
                     f"this can take a while...")
            sources = apply_model(model, wav[None], device=device, progress=True)[0]
            vocals = sources[vocals_idx] * ref.std() + ref.mean()  # denormalize
            vocals = convert_audio(vocals, model.samplerate, 16000, 1)
            out = vocals.squeeze(0).detach().cpu().numpy().astype(np.float32)
            if cache_path is not None:
                try:
                    Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
                    np.save(cache_path, out)
                except Exception:  # noqa: BLE001 - caching is best-effort
                    pass
            return out, 16000
        except Exception as e:  # noqa: BLE001
            last_err = e
            if device == "cpu":
                raise
            progress(f"  warning: Demucs on {device} failed ({e}); retrying on CPU...")
    raise last_err  # pragma: no cover


def _speech_regions(audio, sample_rate):
    """Return [(start_sec, end_sec), ...] speech spans using silero-vad."""
    import torch
    from silero_vad import load_silero_vad, get_speech_timestamps

    model = load_silero_vad()
    wav = torch.from_numpy(audio)
    raw = get_speech_timestamps(
        wav,
        model,
        sampling_rate=sample_rate,
        return_seconds=True,
    )
    if not raw:
        return []

    # Pad and merge nearby regions.
    duration = len(audio) / sample_rate
    regions = []
    for ts in raw:
        start = max(0.0, ts["start"] - VAD_PAD)
        end = min(duration, ts["end"] + VAD_PAD)
        if regions and start - regions[-1][1] <= VAD_MERGE_GAP:
            regions[-1] = (regions[-1][0], end)
        else:
            regions.append((start, end))
    return regions


def _load_detect_model():
    """Load the model for language detection (shares mlx-whisper's lru cache)."""
    from mlx_whisper.load_models import load_model
    return load_model(MODEL_REPO)


def _detect_language(model, chunk, allowed, progress):
    """Return the most probable language in ``allowed`` for ``chunk``.

    Restricts Whisper's full-language softmax to the allowlist so spurious
    out-of-set guesses (Turkish, Nepali, ...) can't win. Returns ``None`` on any
    failure so the caller can fall back to unrestricted detection.
    """
    try:
        from mlx_whisper.audio import (
            log_mel_spectrogram, pad_or_trim, N_SAMPLES, N_FRAMES,
        )
        from mlx_whisper import decoding

        # log_mel_spectrogram accepts a numpy array and does the padding itself
        # (padding the raw chunk with pad_or_trim would hand numpy to mx.pad and
        # fail). The mel layout varies by version — (n_mels, n_frames) or
        # (n_frames, n_mels) — so trim along whichever axis is NOT n_mels.
        n_mels = model.dims.n_mels
        mel = log_mel_spectrogram(chunk, n_mels, padding=N_SAMPLES)
        frames_axis = 1 if mel.shape[0] == n_mels else 0
        mel = pad_or_trim(mel, N_FRAMES, axis=frames_axis)
        _, probs = decoding.detect_language(model, mel)
        if isinstance(probs, (list, tuple)):
            probs = probs[0]
        best = max(allowed, key=lambda lang: probs.get(lang, 0.0))
        return best
    except Exception as e:  # noqa: BLE001 - never let detection break the run
        progress(f"  warning: restricted language detection unavailable "
                 f"({e}); falling back to auto-detect")
        return None


def transcribe(path: str, use_vad: bool = True, start: float = 0.0,
               end: float | None = None, languages=None, progress=_log,
               on_region_done=None, isolate_vocals: bool = False,
               vocals_cache=None):
    """Transcribe ``path`` and return a list of segment dicts.

    Each segment: ``{start, end, text, language, words:[{word,start,end}]}``
    with absolute timestamps (seconds).

    ``start``/``end`` (seconds) restrict transcription to a slice of the audio —
    useful for smoke-testing. Returned timestamps remain **absolute** (offset by
    ``start``), so they line up with the original video.

    ``languages`` is an allowlist of language codes (e.g. ``["bn", "hi", "en"]``)
    that restricts per-region auto-detection. Pass an empty list/``None`` for
    unrestricted detection.

    ``isolate_vocals`` runs Demucs first to strip background music/score (cached
    to ``vocals_cache`` if given) — best for music-heavy audio.
    """
    import mlx_whisper

    if languages is None:
        languages = list(DEFAULT_LANGUAGES)

    if start < 0:
        start = 0.0

    if isolate_vocals:
        # Demucs decodes the clip itself (at 44.1 kHz) and returns 16 kHz vocals;
        # `audio` is already sliced, so `start` stays only as the absolute offset.
        audio, sr = _isolate_to_audio16k(path, start, end, progress, vocals_cache)
        if audio.size == 0:
            raise ValueError(
                f"--start {start:.1f}s is at/after the end of the audio."
            )
    else:
        progress("Decoding audio (ffmpeg)...")
        audio, sr = _load_audio(path)
        # Restrict to the requested clip; keep `start` to make times absolute.
        duration = len(audio) / sr
        if start >= duration:
            raise ValueError(
                f"--start {start:.1f}s is at/after the end of the audio "
                f"({duration:.1f}s)."
            )
        s = int(start * sr)
        e = len(audio) if end is None else min(len(audio), int(end * sr))
        audio = audio[s:e]

    regions = _speech_regions(audio, sr) if use_vad else []
    if not regions:
        # No VAD result (or disabled): transcribe the whole file in one pass.
        regions = [(0.0, len(audio) / sr)]

    decode_opts = dict(
        path_or_hf_repo=MODEL_REPO,
        task="transcribe",
        word_timestamps=True,
        condition_on_previous_text=False,  # curb repetition-loop hallucinations
        no_speech_threshold=0.6,
        verbose=False,
    )

    # If exactly one language is allowed, force it directly (no detection).
    forced = languages[0] if languages and len(languages) == 1 else None
    # Load the model once for restricted detection (shared lru cache).
    detect_model = None
    if languages and len(languages) > 1:
        try:
            detect_model = _load_detect_model()
        except Exception as e:  # noqa: BLE001
            progress(f"  warning: could not load model for language detection "
                     f"({e}); using unrestricted auto-detect")

    dur = len(audio) / sr
    segments = []
    total = len(regions)
    prev_text = ""
    prev_lang = None
    stage_start = time.monotonic()
    for i, (r_start, r_end) in enumerate(regions, start=1):
        progress(f"Transcribing region {i}/{total} "
                 f"({start + r_start:6.1f}s - {start + r_end:6.1f}s)")

        # Decode extra real audio on each side so edge words aren't clipped.
        c_start = max(0.0, r_start - DECODE_MARGIN)
        c_end = min(dur, r_end + DECODE_MARGIN)
        chunk = audio[int(c_start * sr):int(c_end * sr)]
        if chunk.size == 0:
            continue

        # Assign each decoded word to exactly one region by splitting the gap to
        # each neighbour at its midpoint (capped by the decode margin). This keeps
        # an edge-clipped word that extends past r_end while avoiding duplicates
        # where two regions' margins overlap.
        prev_end = regions[i - 2][1] if i >= 2 else float("-inf")
        next_start = regions[i][0] if i < total else float("inf")
        lo = r_start - min(DECODE_MARGIN, (r_start - prev_end) / 2)
        hi = r_end + min(DECODE_MARGIN, (next_start - r_end) / 2)

        # Decide the language for this region.
        region_lang = forced
        if region_lang is None and detect_model is not None:
            region_lang = _detect_language(detect_model, chunk, languages, progress)
        # region_lang None -> Whisper auto-detects unrestricted (fallback).

        # Seed with the previous region's transcript tail for cross-boundary
        # context, unless we know the languages differ (avoids a cross-script
        # prompt confusing the decode).
        opts = dict(decode_opts)
        if prev_text and not (region_lang and prev_lang and region_lang != prev_lang):
            opts["initial_prompt"] = prev_text

        result = mlx_whisper.transcribe(chunk, language=region_lang, **opts)
        language = result.get("language")
        progress(f"  language: {language}")

        # Word times are relative to the (margined) chunk; offset to absolute.
        offset = start + c_start
        region_words = []  # all kept words this region, for the next prompt
        for seg in result.get("segments", []):
            kept = []
            for w in seg.get("words", []):
                center = (w["start"] + w["end"]) / 2 + c_start
                if lo <= center <= hi:
                    kept.append({
                        "word": w["word"],
                        "start": w["start"] + offset,
                        "end": w["end"] + offset,
                    })
            if not kept:
                continue
            text = "".join(x["word"] for x in kept).strip()
            if not text:
                continue
            seg_start = kept[0]["start"]
            seg_end = kept[-1]["end"]
            # Log each line as it's transcribed so progress is visible live.
            progress(f"  [{_fmt(seg_start)} -> {_fmt(seg_end)}] {_safe(text)}")
            segments.append({
                "start": seg_start,
                "end": seg_end,
                "text": text,
                "language": language,
                "words": kept,
            })
            region_words.extend(kept)

        # Carry context to the next region (keep older context if nothing kept).
        if region_words:
            tail = "".join(w["word"] for w in region_words).split()
            prev_text = " ".join(tail[-PROMPT_WORDS:])
            prev_lang = language

        elapsed = time.monotonic() - stage_start
        avg = elapsed / i
        remaining = avg * (total - i)
        if total - i > 0:
            progress(f"  region {i}/{total} done — ETA {_fmt_dur(remaining)}")

        if on_region_done is not None:
            on_region_done(segments)

    progress(f"Transcription complete: {len(segments)} segments.")
    return segments
