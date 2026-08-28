import { useState } from "react";
import type { PipelineOptions } from "../types";
import { LOCAL_MODEL_OPTIONS, DEFAULT_LOCAL_MODEL } from "../types";
import { ModelFallbackList } from "./ModelFallbackList";
import { LanguagePicker } from "./LanguagePicker";
import { Card } from "./ui/Card";
import { InfoTip } from "./ui/InfoTip";

interface OptionsFormProps {
  options: Omit<PipelineOptions, "video_path">;
  onChange: (options: Omit<PipelineOptions, "video_path">) => void;
  disabled?: boolean;
  delay?: number;
}

const inputClass =
  "w-full rounded-lg border border-[#2c3347] bg-[#090a0d] px-3 py-1.5 font-mono text-xs text-[#e3e2e6] placeholder:text-[#555d73] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50";

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
    <Card title="Pipeline Configuration" delay={delay} compact>
      <div className="flex flex-col gap-4">
        {/* Pipeline Target Mode */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[11px] font-medium tracking-wider uppercase text-[#949db2]">
              Translation Target
            </label>
            <span className="font-mono text-[10px] text-[#949db2]">
              {options.no_translate
                ? "Native audio only"
                : options.backend === "local"
                  ? "On-device English translation"
                  : "Gemini English translation"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-[#2c3347] bg-[#0d0e11] p-1">
            <button
              type="button"
              onClick={() => patch({ no_translate: false })}
              disabled={disabled}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-center transition-all ${
                !options.no_translate
                  ? "border border-primary/40 bg-primary/20 text-primary-light shadow-sm"
                  : "text-[#949db2] hover:bg-[#1f1f23] hover:text-[#e3e2e6]"
              }`}
            >
              <span className="font-mono text-xs font-semibold">Translate to English</span>
              <span className="rounded bg-primary/20 px-1.5 py-0.2 font-mono text-[10px] text-primary-light">
                {options.backend === "local" ? "Local" : "Gemini"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => patch({ no_translate: true })}
              disabled={disabled}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-center transition-all ${
                options.no_translate
                  ? "border border-primary/40 bg-primary/20 text-primary-light shadow-sm"
                  : "text-[#949db2] hover:bg-[#1f1f23] hover:text-[#e3e2e6]"
              }`}
            >
              <span className="font-mono text-xs font-semibold">Transcribe Only</span>
              <span className="rounded bg-[#1f1f23] px-1.5 py-0.2 font-mono text-[10px] text-[#949db2]">
                Fast
              </span>
            </button>
          </div>
        </div>

        {/* Translation Backend: Gemini (cloud) vs Local (offline) */}
        <div className={`flex flex-col gap-1.5 ${options.no_translate ? "pointer-events-none opacity-40" : ""}`}>
          <div className="flex items-center gap-1.5">
            <label className="font-mono text-[11px] font-medium tracking-wider uppercase text-[#949db2]">
              Translation Backend
            </label>
            <InfoTip text="Gemini calls Google's cloud API (needs an API key + network). Local runs an on-device LLM via MLX — fully offline, no API key, no data leaves the machine." />
          </div>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-[#2c3347] bg-[#0d0e11] p-1">
            <button
              type="button"
              onClick={() => patch({ backend: "gemini" })}
              disabled={disabled || options.no_translate}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-center transition-all ${
                options.backend === "gemini"
                  ? "border border-primary/40 bg-primary/20 text-primary-light shadow-sm"
                  : "text-[#949db2] hover:bg-[#1f1f23] hover:text-[#e3e2e6]"
              }`}
            >
              <span className="font-mono text-xs font-semibold">Gemini</span>
              <span className="rounded bg-[#1f1f23] px-1.5 py-0.2 font-mono text-[10px] text-[#949db2]">
                Cloud
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                patch({ backend: "local", local_model: options.local_model ?? DEFAULT_LOCAL_MODEL })
              }
              disabled={disabled || options.no_translate}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-center transition-all ${
                options.backend === "local"
                  ? "border border-secondary/50 bg-secondary/10 text-secondary shadow-sm"
                  : "text-[#949db2] hover:bg-[#1f1f23] hover:text-[#e3e2e6]"
              }`}
            >
              <span className="font-mono text-xs font-semibold">Local</span>
              <span className="rounded bg-[#1f1f23] px-1.5 py-0.2 font-mono text-[10px] text-[#949db2]">
                Offline
              </span>
            </button>
          </div>
        </div>

        {/* Feature Switches: Bilingual & Demucs Vocal Isolation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Bilingual Toggle Card */}
          <button
            type="button"
            onClick={() => patch({ bilingual: !options.bilingual })}
            disabled={disabled || options.no_translate}
            className={`flex items-center justify-between rounded-lg border p-2.5 transition-all text-left ${
              options.no_translate
                ? "opacity-30 border-[#2c3347] bg-[#0d0e11]"
                : options.bilingual
                  ? "border-primary/50 bg-primary/10 shadow-sm"
                  : "border-[#2c3347] bg-[#0d0e11]/80 hover:border-[#464554]"
            }`}
          >
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-semibold text-[#e3e2e6]">Bilingual Subtitles</span>
                <InfoTip text="Writes both the original spoken line and English translation into each subtitle cue." />
              </div>
              <p className="font-sans text-[11px] text-[#949db2]">Dual native + English cues</p>
            </div>
            <div className="relative inline-flex items-center ml-2 shrink-0">
              <div
                className={`h-4 w-7 rounded-full transition-colors ${
                  options.bilingual && !options.no_translate ? "bg-primary" : "bg-[#1f1f23] border border-[#2c3347]"
                }`}
              />
              <div
                className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                  options.bilingual && !options.no_translate ? "translate-x-3" : ""
                }`}
              />
            </div>
          </button>

          {/* Demucs Vocal Isolation Toggle Card */}
          <button
            type="button"
            onClick={() => patch({ isolate_vocals: !options.isolate_vocals })}
            disabled={disabled}
            className={`flex items-center justify-between rounded-lg border p-2.5 transition-all text-left ${
              options.isolate_vocals
                ? "border-secondary/50 bg-secondary/10 shadow-sm"
                : "border-[#2c3347] bg-[#0d0e11]/80 hover:border-[#464554]"
            }`}
          >
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-semibold text-[#e3e2e6]">Isolate Vocals</span>
                <span className="rounded bg-secondary/20 px-1 py-0.2 font-mono text-[9px] text-secondary font-semibold">
                  Demucs
                </span>
                <InfoTip text="Strips background music and sound effects with Demucs AI before transcribing. Ideal for songs and movies." />
              </div>
              <p className="font-sans text-[11px] text-[#949db2]">AI background noise stripping</p>
            </div>
            <div className="relative inline-flex items-center ml-2 shrink-0">
              <div
                className={`h-4 w-7 rounded-full transition-colors ${
                  options.isolate_vocals ? "bg-secondary" : "bg-[#1f1f23] border border-[#2c3347]"
                }`}
              />
              <div
                className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                  options.isolate_vocals ? "translate-x-3" : ""
                }`}
              />
            </div>
          </button>
        </div>

        {/* Source Languages */}
        <LanguagePicker
          value={options.languages}
          onChange={(languages) => patch({ languages })}
          disabled={disabled}
        />

        {/* Advanced System Toggles */}
        <div className="grid grid-cols-3 gap-2 border-t border-[#2c3347] pt-2.5">
          <label className="flex cursor-pointer items-center gap-1.5 py-0.5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40">
            <input
              type="checkbox"
              checked={options.no_vad}
              onChange={(e) => patch({ no_vad: e.target.checked })}
              disabled={disabled}
              className="h-3.5 w-3.5 shrink-0 rounded accent-indigo-500 bg-[#090a0d] border-[#2c3347]"
            />
            <span className="font-sans text-xs text-[#e3e2e6]">No VAD</span>
            <InfoTip text="Disable voice-activity segmentation and transcribe whole file in one pass." />
          </label>

          <label className="flex cursor-pointer items-center gap-1.5 py-0.5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40">
            <input
              type="checkbox"
              checked={options.fresh}
              onChange={(e) => patch({ fresh: e.target.checked })}
              disabled={disabled}
              className="h-3.5 w-3.5 shrink-0 rounded accent-indigo-500 bg-[#090a0d] border-[#2c3347]"
            />
            <span className="font-sans text-xs text-[#e3e2e6]">Fresh start</span>
            <InfoTip text="Ignore any existing checkpoint and start over from scratch." />
          </label>

          <label className="flex cursor-pointer items-center gap-1.5 py-0.5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40">
            <input
              type="checkbox"
              checked={options.redo_translate}
              onChange={(e) => patch({ redo_translate: e.target.checked })}
              disabled={disabled || options.no_translate}
              className="h-3.5 w-3.5 shrink-0 rounded accent-indigo-500 bg-[#090a0d] border-[#2c3347]"
            />
            <span className="font-sans text-xs text-[#e3e2e6]">Redo translate</span>
            <InfoTip text="Clear saved translations and redo translation stage (keeps cached transcription)." />
          </label>
        </div>

        {/* Translation Models & Advanced Accordion */}
        <details className="group rounded-lg border border-[#2c3347] bg-[#0d0e11]/70 overflow-hidden" open>
          <summary className="cursor-pointer list-none p-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[#949db2] hover:bg-[#12151d] hover:text-[#e3e2e6] transition-colors flex items-center justify-between [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <span className="transition-transform group-open:rotate-90 text-secondary">›</span>
              Models &amp; Advanced Tuning
            </span>
            <span className="font-mono text-[10px] text-primary-light lowercase">
              {options.no_translate
                ? "translation off"
                : options.backend === "local"
                  ? "local model"
                  : `${options.models.length} ranked`}
            </span>
          </summary>

          <div className="p-3 space-y-3.5 border-t border-[#2c3347] bg-[#12151d]/40">
            {options.backend === "local" ? (
              /* Local Model Picker */
              <div className={options.no_translate ? "pointer-events-none opacity-40" : ""}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="font-mono text-[11px] font-medium tracking-wider uppercase text-[#949db2]">
                    On-Device Model
                  </span>
                  <InfoTip text="Runs locally via MLX. First use downloads the model (several GB); cached afterwards. No API key or network needed." />
                </div>
                <select
                  value={options.local_model ?? DEFAULT_LOCAL_MODEL}
                  onChange={(e) => patch({ local_model: e.target.value })}
                  disabled={disabled || options.no_translate}
                  className={inputClass}
                >
                  {LOCAL_MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.description}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              /* Translation Models Ranked Chain */
              <div className={options.no_translate ? "pointer-events-none opacity-40" : ""}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="font-mono text-[11px] font-medium tracking-wider uppercase text-[#949db2]">
                    Translation Model Chain
                  </span>
                  <InfoTip text="Ranked fallbacks tried in order. If a batch fails or hits quota on #1, #2 is automatically used." />
                </div>
                <ModelFallbackList
                  models={options.models}
                  onChange={(models) => patch({ models, model: null })}
                  disabled={disabled || options.no_translate}
                />
              </div>
            )}

            {/* Pro Faders: Context & Max Wait */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1 border-t border-[#2c3347]/60">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center font-mono text-xs">
                  <span className="text-[#949db2]">Context Window</span>
                  <span className="text-secondary font-semibold">{options.context} cues</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  value={options.context}
                  onChange={(e) => patch({ context: Number(e.target.value) })}
                  disabled={disabled || options.no_translate}
                  className="pro-fader h-1.5 w-full"
                />
              </div>

              <div className={`flex flex-col gap-1.5 ${options.backend === "local" ? "opacity-40" : ""}`}>
                <div className="flex justify-between items-center font-mono text-xs">
                  <span className="text-[#949db2]">Max Wait on Quota</span>
                  <span className="text-[#e3e2e6] font-semibold">{options.max_wait}s</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={300}
                  step={10}
                  value={options.max_wait}
                  onChange={(e) => patch({ max_wait: Number(e.target.value) })}
                  disabled={disabled || options.no_translate || options.backend === "local"}
                  className="pro-fader h-1.5 w-full"
                />
              </div>
            </div>

            {/* Time Clipping */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-[#2c3347]/60">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] font-medium tracking-wider uppercase text-[#949db2]">
                  Time Clipping (Smoke Test)
                </span>
                <InfoTip text="Restrict processing to a time window (seconds, MM:SS, or HH:MM:SS)." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="font-mono text-[10px] text-[#949db2]">Clip Start</span>
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
                  <span className="font-mono text-[10px] text-[#949db2]">Clip End</span>
                  <input
                    type="text"
                    value={endInput}
                    onChange={(e) => {
                      setEndInput(e.target.value);
                      patch({ end: parseTimeInput(e.target.value) });
                    }}
                    placeholder="Full Video"
                    disabled={disabled}
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          </div>
        </details>
      </div>
    </Card>
  );
}
