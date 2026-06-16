import { useState } from "react";
import type { PipelineOptions } from "../types";
import { ModelFallbackList } from "./ModelFallbackList";
import { LanguagePicker } from "./LanguagePicker";
import { Card } from "./ui/Card";
import { InfoTip, LabelWithTip } from "./ui/InfoTip";

interface OptionsFormProps {
  options: Omit<PipelineOptions, "video_path">;
  onChange: (options: Omit<PipelineOptions, "video_path">) => void;
  disabled?: boolean;
  delay?: number;
}

const inputClass =
  "w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-spotlight/30 focus:outline-none disabled:opacity-50 sm:text-sm";

const TOGGLES: {
  key: "bilingual" | "no_translate" | "no_vad" | "isolate_vocals" | "fresh" | "redo_translate";
  label: string;
  description: string;
  whenNoTranslate?: boolean;
}[] = [
  {
    key: "bilingual",
    label: "Bilingual",
    description: "Write the original line and the English translation in each cue.",
    whenNoTranslate: true,
  },
  {
    key: "no_translate",
    label: "Transcribe only",
    description: "Skip Gemini — output the native (mixed-language) transcript only.",
  },
  {
    key: "no_vad",
    label: "No VAD",
    description: "Disable voice-activity segmentation and transcribe the whole file in one pass.",
  },
  {
    key: "isolate_vocals",
    label: "Isolate vocals",
    description: "Strip background music with Demucs before transcribing. Slower; best for music-heavy audio.",
  },
  {
    key: "fresh",
    label: "Fresh start",
    description: "Ignore any existing checkpoint and start over from scratch.",
  },
  {
    key: "redo_translate",
    label: "Redo translate",
    description: "Clear saved translations and redo the translation stage (keeps cached transcription).",
    whenNoTranslate: true,
  },
];

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function OptionsForm({ options, onChange, disabled, delay = 0 }: OptionsFormProps) {
  const [endInput, setEndInput] = useState(
    options.end !== null ? formatTime(options.end) : "",
  );

  function patch(partial: Partial<Omit<PipelineOptions, "video_path">>) {
    onChange({ ...options, ...partial });
  }

  return (
    <Card title="Settings" delay={delay} compact>
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
          {TOGGLES.map(({ key, label, description, whenNoTranslate }) => {
            const off = whenNoTranslate && options.no_translate;
            return (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-1 py-0.5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40"
              >
                <input
                  type="checkbox"
                  checked={!!options[key]}
                  onChange={(e) => patch({ [key]: e.target.checked })}
                  disabled={disabled || off}
                  className="h-3 w-3 shrink-0 rounded accent-spotlight"
                />
                <span className="truncate text-xs text-zinc-300">{label}</span>
                <InfoTip text={description} />
              </label>
            );
          })}
        </div>

        <LanguagePicker
          value={options.languages}
          onChange={(languages) => patch({ languages })}
          disabled={disabled}
        />

        <details className="group">
          <summary className="cursor-pointer list-none text-[11px] text-zinc-500 hover:text-zinc-400 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1">
              <span className="transition group-open:rotate-90">›</span>
              Models &amp; advanced
            </span>
          </summary>
          <div className="mt-2 space-y-2 border-t border-white/[0.04] pt-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-zinc-500">Translation models</span>
              <InfoTip text="Ranked fallbacks — tried in order. If a batch fails on #1, #2 is used, and so on." />
            </div>
            <div className={options.no_translate ? "pointer-events-none opacity-40" : ""}>
              <ModelFallbackList
                models={options.models}
                onChange={(models) => patch({ models, model: null })}
                disabled={disabled || options.no_translate}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="block">
                <LabelWithTip
                  label="Context"
                  tip="Neighboring cues included on each side of a translation batch to improve accuracy (0 disables)."
                />
                <input
                  type="number"
                  min={0}
                  value={options.context}
                  onChange={(e) => patch({ context: Number(e.target.value) })}
                  disabled={disabled || options.no_translate}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <LabelWithTip
                  label="Max wait"
                  tip="Max seconds to auto-pause on a rate limit before checkpointing and exiting to resume later."
                />
                <input
                  type="number"
                  min={1}
                  value={options.max_wait}
                  onChange={(e) => patch({ max_wait: Number(e.target.value) })}
                  disabled={disabled || options.no_translate}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <LabelWithTip
                  label="Clip start"
                  tip="Only process from this time — for smoke testing (seconds, MM:SS, or HH:MM:SS)."
                />
                <input
                  type="text"
                  value={options.start > 0 ? formatTime(options.start) : ""}
                  onChange={(e) => patch({ start: parseTimeInput(e.target.value) ?? 0 })}
                  placeholder="0:00"
                  disabled={disabled}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <LabelWithTip
                  label="Clip end"
                  tip="Only process up to this time. Leave empty for the full video. Timestamps stay absolute."
                />
                <input
                  type="text"
                  value={endInput}
                  onChange={(e) => {
                    setEndInput(e.target.value);
                    patch({ end: parseTimeInput(e.target.value) });
                  }}
                  placeholder="full"
                  disabled={disabled}
                  className={inputClass}
                />
              </label>
            </div>
          </div>
        </details>
      </div>
    </Card>
  );
}
