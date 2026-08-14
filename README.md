# whisper-subtitles

Generate English `.srt` subtitles from videos whose audio is a **mix of Bengali, Hindi, and English**.

It uses a **two-stage pipeline** instead of Whisper's weak built-in translate task:

1. **Transcribe** natively with [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper) (`large-v3`), running on the Apple Silicon **GPU** via MLX. A voice-activity detector ([silero-vad](https://github.com/snakers4/silero-vad)) splits the audio into speech regions, each region's language is **auto-detected**, and **word-level timestamps** are produced.
2. **Translate** the native cues to English with the **Gemini API**, which handles code-switching well and is strong (and cheap) on Indic languages.

### Why two stages?

The old approach (`openai-whisper` with `task="translate"`, `language="bn"`) had two problems on real mixed audio:

- **Wrong-language output** (Spanish/French) — Whisper's translate task only does single-language → English and breaks on code-switching. Forcing `language="bn"` on English/Hindi segments made it hallucinate.
- **Drifting timestamps** — Whisper's segment timestamps are a decoding byproduct and degrade around silence/music.

Splitting transcription from translation, adding VAD, and using word-level timestamps fixes both.

### Restricting language detection

Whisper auto-detects from all ~99 languages and can misfire on acoustically/script-adjacent ones (e.g. Turkish or Nepali on Bengali/Hindi audio). Each speech region's language is therefore detected **restricted to an allowlist** — `bn,hi,en` by default — so an out-of-set language can't win. Change it with `--languages` (e.g. `--languages bn,en`) or pass `--languages auto` to disable the restriction.

## Requirements

- **Apple Silicon Mac** (M1–M4) — mlx-whisper runs on the Metal GPU and is Apple-Silicon only.
- Python 3.9+
- [ffmpeg](https://ffmpeg.org/) (`brew install ffmpeg`)
- A **Gemini API key** for the translation stage — get one from [Google AI Studio](https://aistudio.google.com/apikey).

> **Gemini API key vs. Vertex AI:** for a personal tool, use the **Developer API key** (what this project uses) — no GCP project, service account, or IAM setup. Vertex AI only matters if you need GCP billing/quotas/IAM or data-residency controls. The same `google-genai` SDK can target Vertex later by setting `vertexai=True`, so there's no lock-in.

## Setup

```bash
cd whisper-subtitles

python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt
brew install ffmpeg          # if not already installed

cp .env.example .env         # then put your key in .env
```

Set your key in `.env`:

```
GEMINI_API_KEY=...
```

## GUI (local web UI)

A browser-based UI is included for selecting videos, configuring all CLI options, watching live progress, and downloading subtitles.

**Requirements:** Node.js 18+ (for the frontend dev server), plus the same Python setup as above.

```bash
# One-time: install web deps
cd web && npm install && cd ..

# Start API + UI (opens http://127.0.0.1:5173)
chmod +x scripts/dev.sh
./scripts/dev.sh
```

Or run the two servers manually:

```bash
source venv/bin/activate
uvicorn api.server:app --host 127.0.0.1 --port 8765 --reload

# separate terminal
cd web && npm run dev
```

The UI uses a **native macOS file picker** (via the API) so large videos are referenced by path — nothing is uploaded through the browser. Progress streams over WebSocket; checkpoints and resume behavior match the CLI.

## Usage

```bash
python generate.py path/to/video.mp4
# -> output/video.srt
```

Options:


| Flag                 | Effect                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model MODEL`      | Gemini model for translation (default `gemini-2.5-flash`; e.g. `--model gemini-3.5-flash` or `gemini-2.5-pro` for the hardest audio)                                  |
| `--bilingual`        | Write the original line **and** the English translation in each cue                                                                                                   |
| `--no-translate`     | Transcribe only — output the native (mixed-language) transcript                                                                                                       |
| `--no-vad`           | Disable voice-activity segmentation (transcribe the whole file in one pass)                                                                                           |
| `--isolate-vocals`   | Strip background music/score with [Demucs](https://github.com/adefossez/demucs) before transcribing — best for music-heavy audio (slower; needs `pip install demucs`) |
| `--start TIME`       | Process only from this time — for smoke testing (`SS`, `MM:SS`, or `HH:MM:SS`)                                                                                        |
| `--end TIME`         | Process only up to this time (same formats)                                                                                                                           |
| `--languages LIST`   | Allowlist for language auto-detection (default `bn,hi,en`). Pass `auto` for unrestricted.                                                                             |
| `--context N`        | Neighboring cues of context sent with each translation batch (default `12`; `0` disables)                                                                             |
| `--max-wait SECONDS` | Max time to auto-pause on a rate limit before checkpointing and exiting to resume later (default `120`)                                                               |
| `--fresh`            | Ignore any existing checkpoint and start over                                                                                                                         |


### Smoke testing a clip

To validate the pipeline cheaply, process just a slice:

```bash
python generate.py video.mp4 --start 5:00 --end 6:00
# -> output/video.clip-300-360.srt
```

Subtitle timestamps stay **absolute** (a cue at 5:10 of the source shows `00:05:10`), so the clip's `.srt` lines up against the original video. Clip runs use their own checkpoint and output filename, so they never overwrite a full run.

### Music-heavy audio (`--isolate-vocals`)

If the dialogue sits under loud music or a score, Whisper can hallucinate words from the musical texture. `--isolate-vocals` runs [Demucs](https://github.com/adefossez/demucs) first to separate the **vocal stem** (decoded at 44.1 kHz stereo, then downsampled to 16 kHz for the ASR), so only speech reaches Whisper:

```bash
pip install demucs
python generate.py video.mp4 --isolate-vocals --start 15:00 --end 16:00 --no-translate
# compare output/video.clip-900-960.raw.srt with and without the flag
```

It runs on the Apple Silicon **GPU** (falls back to CPU if needed) and is **slow**, so the separated vocals are cached (`output/.cache/<name>.vocals.npy`) and the flag is folded into the checkpoint identity — toggling it forces a clean re-transcription. First run downloads the Demucs model (~few hundred MB). Smoke-test a music-heavy minute first to confirm it actually helps before committing to a full run.

### Free-tier friendly (auto-pause & resume)

The free Gemini tier has per-minute and per-day limits. This script handles both:

- **Transient limits** (per-minute rate / 5xx) are retried automatically with backoff, honoring the server's suggested wait. You'll see a `pausing Ns...` line.
- **Daily limit** — if a required wait exceeds `--max-wait`, the script saves a checkpoint to `output/.cache/<name>.json` and exits (code 2). **Just re-run the exact same command later** — it reuses the cached transcription (no re-ASR) and only translates the cues that are still missing. The checkpoint is deleted automatically once the `.srt` is written.

The same resume works if you Ctrl-C or the machine sleeps mid-run.

### Example

```bash
python generate.py ~/Videos/interview.mp4 --bilingual
# -> output/interview.srt  (original + English in each cue)
```

## Notes

- **First run** downloads the `large-v3` MLX weights (~~3 GB) from Hugging Face to `~~/.cache/huggingface`; later runs reuse them.
- The audio never leaves your machine — only the **transcribed text** is sent to the Gemini API for translation. Use `--no-translate` to keep everything fully local.
- Translation is batched to keep cost low. Each batch is sent with a **context radius** of neighboring cues (`--context`, default 12) included as read-only context — and the already-finalized English of done neighbors — so Gemini can use contiguous surrounding text to resolve pronouns, names, and sentences that span cues, and to fix likely transcription errors. Gemini input is cheap, so this costs little. If a batch fails, those cues keep their original text so the timeline is never broken.
- The `output/` directory is created automatically and is git-ignored.

