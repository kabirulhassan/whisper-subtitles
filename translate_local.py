"""Stage 2 (offline variant) — translate native-language cues to English with a
local LLM running on-device via MLX (mlx-lm), instead of the Gemini API.

This is a drop-in replacement for ``translate.translate_cues`` with the same
call signature, so ``pipeline.py`` can switch between the two backends. It
exists so the whole pipeline (transcription is already local via mlx-whisper)
can run fully offline with no API key and no network access.

Model choice: any MLX-converted instruction-tuned chat model works. The
default, ``mlx-community/Qwen2.5-14B-Instruct-4bit``, was picked because it
follows structured-JSON instructions reliably and has decent Bengali/Hindi
comprehension for a general-purpose model. Swap it for a smaller
(``Qwen2.5-7B-Instruct-4bit``) or larger model with ``--local-model``
depending on available RAM and desired quality; smaller/faster generally
means weaker code-switch disambiguation.

Trade-offs vs. the Gemini backend:
* No network calls, no API key, no per-request cost, no rate limits.
* Runs entirely on the Apple Silicon GPU via MLX (same stack as mlx-whisper).
* Quality on Bengali/Hindi/English code-switching is generally a step below
  Gemini's flash/pro tiers, especially on ambiguous or idiomatic lines.
* Slower per batch than a cloud API call, and the first run pays a one-time
  model download (several GB, cached under ~/.cache/huggingface).
"""

from __future__ import annotations

import json
import re
import unicodedata

DEFAULT_LOCAL_MODEL = "mlx-community/Qwen2.5-14B-Instruct-4bit"
BATCH_SIZE = 20
CONTEXT_RADIUS = 8
MAX_ATTEMPTS = 3

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
    "- Preserve names and untranslatable terms as-is.\n"
    "- Respond with ONLY a JSON array like "
    '[{"id": 1, "translation": "..."}, ...] — no markdown fences, no commentary, '
    "no extra text before or after the JSON."
)

_JSON_ARRAY_RE = re.compile(r"\[.*\]", re.DOTALL)

_model = None
_tokenizer = None
_loaded_model_id: str | None = None


def _safe(text: str) -> str:
    """NFC-normalize and wrap in LTR marks so complex-script terminals render better."""
    return f"‎{unicodedata.normalize('NFC', text)}‎"


def _chunks(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


class LocalModelUnavailable(Exception):
    """Raised when mlx-lm or the requested model can't be loaded."""


def _load(model_id: str, progress):
    """Load (and cache) the MLX model + tokenizer. Downloads on first use."""
    global _model, _tokenizer, _loaded_model_id
    if _model is not None and _loaded_model_id == model_id:
        return _model, _tokenizer
    try:
        from mlx_lm import load
    except ImportError as e:
        raise LocalModelUnavailable(
            "mlx-lm is not installed. Install it with: pip install mlx-lm"
        ) from e
    progress(f"Loading local model {model_id} (first run downloads it; "
             "cached afterwards under ~/.cache/huggingface)...")
    try:
        _model, _tokenizer = load(model_id)
    except Exception as e:  # noqa: BLE001
        raise LocalModelUnavailable(f"could not load model '{model_id}': {e}") from e
    _loaded_model_id = model_id
    progress(f"Model {model_id} loaded.")
    return _model, _tokenizer


def _extract_json_array(text: str):
    text = text.strip()
    # Strip markdown code fences some models add despite instructions.
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = _JSON_ARRAY_RE.search(text)
    if m:
        return json.loads(m.group(0))
    raise ValueError("no JSON array found in model output")


def _translate_batch(model, tokenizer, window, target_ids, progress):
    from mlx_lm import generate

    payload = []
    for c in window:
        is_target = c["id"] in target_ids
        item = {
            "id": c["id"],
            "lang": c.get("language") or "unknown",
            "text": c["text"],
            "translate": is_target,
        }
        if not is_target and c.get("translation"):
            item["english"] = c["translation"]
        payload.append(item)

    user = (
        "Translate the cues where `translate` is true. Use the `translate`:false "
        "items only as surrounding context. Return a JSON array of "
        "{id, translation} for exactly the translate=true ids.\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]
    prompt = tokenizer.apply_chat_template(
        messages, add_generation_prompt=True, tokenize=False
    )

    last_err = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        temp = 0.0 if attempt == 1 else 0.3
        text = generate(
            model, tokenizer, prompt=prompt,
            max_tokens=max(512, 60 * len(target_ids)),
            verbose=False,
            **({"temp": temp} if temp else {}),
        )
        try:
            data = _extract_json_array(text)
            return {int(item["id"]): item["translation"]
                    for item in data if int(item["id"]) in target_ids}
        except (ValueError, KeyError, TypeError) as e:
            last_err = e
            progress(f"  warning: could not parse model output on attempt "
                     f"{attempt}/{MAX_ATTEMPTS} ({e}); retrying")
    raise ValueError(f"model did not return valid JSON after {MAX_ATTEMPTS} attempts: {last_err}")


def translate_cues(cues, model: str | None = None, models=None, done=None, save=None,
                   max_wait: float = 120.0, context_radius: int = CONTEXT_RADIUS,
                   progress=print):
    """Attach an English ``translation`` to each cue in place and return them.

    Same interface as ``translate.translate_cues`` (so ``pipeline.py`` can swap
    backends transparently), running entirely on-device via mlx-lm instead of
    calling the Gemini API. ``max_wait`` and ``models`` (fallback chain) are
    accepted for signature compatibility but unused — there's no rate limit or
    ranked-model fallback with a single local model.
    """
    model_id = model or (models[0] if models else DEFAULT_LOCAL_MODEL)
    progress(f"Translating locally with {model_id} (on-device, no network)...")

    llm, tokenizer = _load(model_id, progress)

    done = {} if done is None else done
    for cue in cues:
        if cue["id"] in done:
            cue["translation"] = done[cue["id"]]
    todo_idx = [i for i, c in enumerate(cues) if c["id"] not in done]

    if not todo_idx:
        progress("All cues already translated (resumed from checkpoint).")
        return cues

    batches = list(_chunks(todo_idx, BATCH_SIZE))
    n = len(cues)
    for i, batch_idx in enumerate(batches, start=1):
        target_cues = [cues[j] for j in batch_idx]
        target_ids = {c["id"] for c in target_cues}
        lo = max(0, batch_idx[0] - context_radius)
        hi = min(n, batch_idx[-1] + 1 + context_radius)
        window = cues[lo:hi]
        progress(f"Translating batch {i}/{len(batches)} "
                 f"({len(target_cues)} cues, +{len(window) - len(target_cues)} context)")
        try:
            mapping = _translate_batch(llm, tokenizer, window, target_ids, progress)
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
                cue["translation"] = cue["text"]
                progress(f"  [{cue['id']}] (untranslated — will retry on resume)")
        if len(batches) - i > 0:
            progress(f"  batch {i}/{len(batches)} done")
        if save is not None:
            save(done)
    return cues
