"""Stage 2 — translate native-language cues to English with the Gemini API.

Whisper's built-in ``translate`` task only does single-language -> English and
falls apart on code-switching. Here the cues are already transcribed natively;
Gemini translates them in context, which handles mixed Bengali / Hindi / English
well and is strong (and cheap) on Indic languages.

Translation is decoupled from timing: cue boundaries and timestamps are fixed
upstream, and each cue keeps a stable integer id. Gemini returns one English
string per id, so the timeline is never affected by translation length.

Free-tier resilience:
* transient rate limits (HTTP 429) and 5xx errors are retried with backoff,
  honoring any server-provided retry delay, and
* progress is reported to the caller after every batch via ``save`` so a run can
  be resumed; if a required wait exceeds ``max_wait`` (the daily-quota signature)
  a ``QuotaExhausted`` is raised so the caller can checkpoint and exit cleanly.
"""

import json
import os
import random
import re
import time
import unicodedata

DEFAULT_MODEL = "gemini-2.5-flash"
BATCH_SIZE = 40
# Cues of surrounding context included on each side of a batch (not translated,
# just for disambiguation). Gemini input is cheap, so a wide radius is worth it.
CONTEXT_RADIUS = 12
BACKOFF_START = 2.0
BACKOFF_CAP = 60.0

SYSTEM_PROMPT = (
    "You translate subtitle cues spoken in a mix of Bengali, Hindi, and English "
    "into natural, fluent English. The cues come from one continuous video, in "
    "order. Each input item has a `translate` flag:\n"
    "- Translate ONLY items where `translate` is true. Output one entry per such id.\n"
    "- Items where `translate` is false are surrounding context — do NOT include "
    "them in your output, but USE them to resolve ambiguity, pronouns, names, and "
    "sentences that span multiple cues, and to fix likely transcription errors.\n"
    "- A context item may carry an `english` field (its finalized translation); "
    "keep your wording consistent with it.\n"
    "Rules:\n"
    "- Do NOT merge, split, reorder, drop, or renumber cues.\n"
    "- If a cue is already English, lightly clean it up but keep the meaning.\n"
    "- Keep translations concise and subtitle-appropriate; no notes or commentary.\n"
    "- Preserve names and untranslatable terms as-is."
)


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


def _safe(text: str) -> str:
    """NFC-normalize and wrap in LTR marks so complex-script terminals render better."""
    return f"‎{unicodedata.normalize('NFC', text)}‎"


class QuotaExhausted(Exception):
    """Raised when a rate-limit wait would exceed ``max_wait`` (daily quota)."""


def _response_schema():
    from google.genai import types

    return types.Schema(
        type=types.Type.ARRAY,
        items=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "id": types.Schema(type=types.Type.INTEGER),
                "translation": types.Schema(type=types.Type.STRING),
            },
            required=["id", "translation"],
        ),
    )


def _retry_delay_seconds(err) -> float | None:
    """Extract a server-suggested retry delay (seconds) from a Gemini error."""
    text = str(getattr(err, "message", "") or err)
    # google api errors embed RetryInfo like: 'retryDelay': '37s'
    m = re.search(r"retry[\s_-]*delay['\"]?\s*[:=]\s*['\"]?(\d+(?:\.\d+)?)s", text, re.I)
    if m:
        return float(m.group(1))
    m = re.search(r"retry-after['\"]?\s*[:=]\s*['\"]?(\d+)", text, re.I)
    if m:
        return float(m.group(1))
    return None


def _chunks(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _generate_with_retry(client, model, contents, config, max_wait, progress):
    from google.genai import errors

    attempt = 0
    while True:
        try:
            return client.models.generate_content(
                model=model, contents=contents, config=config
            )
        except errors.APIError as e:  # base class for ClientError/ServerError
            code = getattr(e, "code", None)
            retryable = code == 429 or (isinstance(code, int) and code >= 500)
            if not retryable:
                raise
            wait = _retry_delay_seconds(e)
            if wait is None:
                wait = min(BACKOFF_START * (2 ** attempt), BACKOFF_CAP)
            wait += random.uniform(0, 1)
            if wait > max_wait:
                raise QuotaExhausted(
                    f"rate limited; server asked to wait {wait:.0f}s "
                    f"(> --max-wait {max_wait}s)"
                ) from e
            label = "quota/rate limit" if code == 429 else f"server error {code}"
            progress(f"  {label}; pausing {wait:.0f}s then retrying...")
            time.sleep(wait)
            attempt += 1


def _translate_batch(client, model, window, target_ids, max_wait, progress):
    """Translate the ``target_ids`` cues using ``window`` (targets + context)."""
    from google.genai import types

    payload = []
    for c in window:
        is_target = c["id"] in target_ids
        item = {
            "id": c["id"],
            "lang": c.get("language") or "unknown",
            "text": c["text"],
            "translate": is_target,
        }
        # Give the model already-finalized translations of context neighbors so
        # wording stays consistent across batches.
        if not is_target and c.get("translation"):
            item["english"] = c["translation"]
        payload.append(item)

    user = (
        "Translate the cues where `translate` is true. Use the `translate`:false "
        "items only as surrounding context. Return a JSON array of "
        "{id, translation} for exactly the translate=true ids.\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=_response_schema(),
        temperature=0,
    )
    resp = _generate_with_retry(client, model, user, config, max_wait, progress)
    data = json.loads(resp.text)
    # Keep only requested ids; ignore any stray context items the model returned.
    return {int(item["id"]): item["translation"]
            for item in data if int(item["id"]) in target_ids}


def translate_cues(cues, model: str = DEFAULT_MODEL, done=None, save=None,
                   max_wait: float = 120.0, context_radius: int = CONTEXT_RADIUS,
                   progress=print):
    """Attach an English ``translation`` to each cue in place and return them.

    Each batch of ``BATCH_SIZE`` cues is sent together with ``context_radius``
    neighboring cues on each side as read-only context, so Gemini can use
    contiguous surrounding text to disambiguate and fix transcription errors.

    ``done`` is a ``{cue_id: english}`` map of already-translated cues (resume);
    cues present there are skipped (but still used as context, with their English
    included). After each batch, ``save(done)`` is called so progress can be
    checkpointed. A non-quota batch failure keeps the original text. A wait
    exceeding ``max_wait`` raises ``QuotaExhausted``.
    """
    from google import genai

    done = {} if done is None else done
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    client = genai.Client(api_key=api_key)

    # Apply anything already translated; context windows are taken from the full
    # ordered cue list so neighbors are available even when some are done.
    for cue in cues:
        if cue["id"] in done:
            cue["translation"] = done[cue["id"]]
    todo_idx = [i for i, c in enumerate(cues) if c["id"] not in done]

    if not todo_idx:
        progress("All cues already translated (resumed from checkpoint).")
        return cues

    batches = list(_chunks(todo_idx, BATCH_SIZE))
    n = len(cues)
    stage_start = time.monotonic()
    for i, batch_idx in enumerate(batches, start=1):
        target_cues = [cues[j] for j in batch_idx]
        target_ids = {c["id"] for c in target_cues}
        lo = max(0, batch_idx[0] - context_radius)
        hi = min(n, batch_idx[-1] + 1 + context_radius)
        window = cues[lo:hi]
        progress(f"Translating batch {i}/{len(batches)} "
                 f"({len(target_cues)} cues, +{len(window) - len(target_cues)} context)")
        try:
            mapping = _translate_batch(client, model, window, target_ids,
                                       max_wait, progress)
        except QuotaExhausted:
            raise
        except Exception as e:  # noqa: BLE001 - degrade gracefully per batch
            progress(f"  warning: batch {i} failed ({e}); keeping original text")
            mapping = {}
        for cue in target_cues:
            if cue["id"] in mapping:
                english = mapping[cue["id"]]
                cue["translation"] = english
                done[cue["id"]] = english
                progress(f"  [{cue['id']}] {_safe(cue['text'])} → {_safe(english)}")
            else:
                # Batch failed — use original text in the SRT but do NOT mark as
                # done so re-running will retry this cue.
                cue["translation"] = cue["text"]
                progress(f"  [{cue['id']}] (untranslated — will retry on resume)")
        elapsed = time.monotonic() - stage_start
        avg = elapsed / i
        remaining = avg * (len(batches) - i)
        if len(batches) - i > 0:
            progress(f"  batch {i}/{len(batches)} done — ETA {_fmt_dur(remaining)}")
        if save is not None:
            save(done)
    return cues
