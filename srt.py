"""SRT cue construction and writing.

Cues are built from word-level timestamps (not Whisper's raw segment
boundaries), which is what keeps subtitle timing aligned with the audio.
"""

from pathlib import Path

# Readability limits for a subtitle cue.
MAX_CHARS = 84        # ~42 chars/line x 2 lines
MAX_DURATION = 7.0    # seconds
MAX_GAP = 0.8         # split a cue when the pause between words exceeds this
SENTENCE_ENDINGS = ".!?।॥…"  # includes Bengali/Devanagari danda


def format_timestamp(seconds: float) -> str:
    """Convert seconds to SRT timestamp format (HH:MM:SS,mmm)."""
    if seconds < 0:
        seconds = 0.0
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    secs, milliseconds = divmod(milliseconds, 1_000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"


def _flush(words, language):
    """Build a cue dict from a list of word dicts."""
    text = "".join(w["word"] for w in words).strip()
    return {
        "start": words[0]["start"],
        "end": words[-1]["end"],
        "text": text,
        "language": language,
    }


def build_cues(segments):
    """Turn transcription segments into timed subtitle cues.

    Each segment is ``{start, end, text, language, words}``. Words are
    regrouped so that no cue exceeds the readability limits, breaking on
    sentence punctuation and long pauses. Segments without word timing fall
    back to a single cue spanning the segment.
    """
    cues = []

    for seg in segments:
        words = seg.get("words") or []
        language = seg.get("language")

        if not words:
            text = (seg.get("text") or "").strip()
            if text:
                cues.append({
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": text,
                    "language": language,
                })
            continue

        current = []
        for w in words:
            if current:
                gap = w["start"] - current[-1]["end"]
                pending = "".join(x["word"] for x in current).strip()
                duration = current[-1]["end"] - current[0]["start"]
                too_long = len(pending) + len(w["word"]) > MAX_CHARS
                too_far = gap > MAX_GAP
                too_slow = duration > MAX_DURATION
                ends_sentence = pending[-1:] in SENTENCE_ENDINGS
                if too_long or too_far or too_slow or (ends_sentence and len(pending) > 20):
                    cues.append(_flush(current, language))
                    current = []
            current.append(w)
        if current:
            cues.append(_flush(current, language))

    # Assign stable ids after all cues are known.
    for i, cue in enumerate(cues, start=1):
        cue["id"] = i
    return cues


def write_srt(cues, srt_path: Path, bilingual: bool = False) -> None:
    """Write cues to an .srt file.

    When ``bilingual`` is set and a cue has a ``translation``, both the original
    text and the English translation are written (translation first).
    """
    with srt_path.open("w", encoding="utf-8") as f:
        for i, cue in enumerate(cues, start=1):
            start = format_timestamp(cue["start"])
            end = format_timestamp(cue["end"])
            english = cue.get("translation")
            if bilingual and english:
                body = f"{english}\n{cue['text']}"
            else:
                body = english if english else cue["text"]
            f.write(f"{i}\n{start} --> {end}\n{body}\n\n")
