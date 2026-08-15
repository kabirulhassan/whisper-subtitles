import { useEffect, useRef } from "react";
import type { ProgressEvent } from "../types";
import { Card } from "./ui/Card";

function formatEta(seconds: number | undefined): string {
  if (seconds === undefined) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface ProgressPanelProps {
  events: ProgressEvent[];
  status: string | null;
  error: string | null;
}

export function ProgressPanel({ events, status, error }: ProgressPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);

  const hasIsolate = events.some(
    (e) => e.stage === "isolate_vocals" || e.type === "isolate_progress",
  );

  const stages = hasIsolate
    ? (["isolate_vocals", "transcribe", "build_cues", "translate", "write"] as const)
    : (["transcribe", "build_cues", "translate", "write"] as const);

  function stageLabel(stage: string): string {
    switch (stage) {
      case "isolate_vocals":
        return "1. Demucs Vocals";
      case "transcribe":
        return hasIsolate ? "2. VAD & Whisper" : "1. VAD & Whisper";
      case "build_cues":
        return hasIsolate ? "3. Cue Alignment" : "2. Cue Alignment";
      case "translate":
        return hasIsolate ? "4. Gemini Translation" : "3. Gemini Translation";
      case "write":
        return hasIsolate ? "5. SRT Assembly" : "4. SRT Assembly";
      default:
        return stage;
    }
  }

  const completedStages = new Set(
    events.filter((e) => e.type === "stage_completed").map((e) => e.stage),
  );
  const activeStage = (() => {
    const started = events
      .filter((e) => e.type === "stage_started")
      .map((e) => e.stage)
      .filter((s) => s && !completedStages.has(s));
    return started.length > 0 ? started[started.length - 1] : undefined;
  })();

  const latestIsolate = [...events]
    .reverse()
    .find((e) => e.type === "isolate_progress" && e.current && e.total);
  const latestRegion = [...events]
    .reverse()
    .find((e) => e.type === "region_progress" && e.current && e.total);
  const latestBatch = [...events]
    .reverse()
    .find((e) => e.type === "batch_progress" && e.current && e.total);

  const logs = events
    .filter((e) => e.type === "log" && e.message)
    .map((e) => e.message as string);

  const quotaEvent = events.find((e) => e.type === "quota_paused");

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  return (
    <Card
      title="Live Execution Pipeline"
      badge={
        status === "running" ? (
          <span className="flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-secondary border border-secondary/30">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-secondary" />
            {activeStage === "isolate_vocals" ? "Demucs Vocal Isolation Active" : "Live Engine Active"}
          </span>
        ) : status === "completed" ? (
          <span className="rounded-full bg-status-success/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-status-success border border-status-success/30">
            ✓ Finished
          </span>
        ) : null
      }
      delay={150}
      compact
    >
      {/* Visual Timeline Stepper */}
      <div className="mb-4 flex items-center justify-between gap-1 rounded-xl border border-[#2c3347] bg-[#0d0e11] p-3">
        {stages.map((stage, i) => {
          const done = completedStages.has(stage);
          const active = activeStage === stage;
          return (
            <div key={stage} className="flex min-w-0 flex-1 items-center gap-2">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold transition-all ${
                  done
                    ? "bg-status-success/20 text-status-success border border-status-success/40"
                    : active
                      ? "animate-pulse bg-primary text-white shadow-glow-indigo"
                      : "bg-[#1f1f23] text-[#555d73] border border-[#2c3347]"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <div className="hidden min-w-0 flex-col sm:flex">
                <span
                  className={`truncate font-mono text-[11px] font-medium ${
                    active ? "text-primary-light font-semibold" : done ? "text-[#e3e2e6]" : "text-[#555d73]"
                  }`}
                >
                  {stageLabel(stage)}
                </span>
                <span className="text-[9px] font-mono text-[#949db2]">
                  {done ? "Completed" : active ? "Processing" : "Pending"}
                </span>
              </div>
              {i < stages.length - 1 && (
                <div
                  className={`mx-1.5 h-0.5 flex-1 transition-colors ${
                    done ? "bg-status-success/50" : active ? "bg-primary/50" : "bg-[#1f1f23]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Granular Telemetry Progress Meters */}
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        {latestIsolate && (
          <div className="rounded-lg border border-[#2c3347] bg-[#12151d] p-2.5">
            <ProgressBar
              label={`Vocal Isolation: Chunk ${latestIsolate.current}/${latestIsolate.total}`}
              eta={latestIsolate.eta_seconds}
              percent={((latestIsolate.current ?? 0) / (latestIsolate.total ?? 1)) * 100}
              gradient="from-teal-500 via-cyan-500 to-secondary-light"
            />
          </div>
        )}
        {latestRegion && (
          <div className="rounded-lg border border-[#2c3347] bg-[#12151d] p-2.5">
            <ProgressBar
              label={`Region ${latestRegion.current}/${latestRegion.total}`}
              eta={latestRegion.eta_seconds}
              percent={((latestRegion.current ?? 0) / (latestRegion.total ?? 1)) * 100}
              gradient="from-cyan-500 to-secondary-light"
            />
          </div>
        )}
        {latestBatch && (
          <div className="rounded-lg border border-[#2c3347] bg-[#12151d] p-2.5">
            <ProgressBar
              label={`Translation Batch ${latestBatch.current}/${latestBatch.total}`}
              eta={latestBatch.eta_seconds}
              percent={((latestBatch.current ?? 0) / (latestBatch.total ?? 1)) * 100}
              gradient="from-indigo-600 to-primary-light"
            />
          </div>
        )}
      </div>

      {/* Quota or Error notices */}
      {(quotaEvent || error || (status && !error && status !== "running" && status !== "completed")) && (
        <div className="mb-3 space-y-1 rounded-lg border border-[#2c3347] bg-[#12151d] p-2.5">
          {quotaEvent && (
            <p className="font-mono text-xs text-status-warning flex items-center gap-1.5">
              <span>⚠</span>
              <span>Rate limit reached — progress safely checkpointed to disk.</span>
            </p>
          )}
          {error && (
            <p className="font-mono text-xs text-status-error flex items-center gap-1.5">
              <span>✕</span>
              <span>{error}</span>
            </p>
          )}
          {status && !error && !quotaEvent && (
            <p className="font-mono text-xs text-[#949db2]">{status}</p>
          )}
        </div>
      )}

      {/* Dark Terminal Log Drawer */}
      <div className="flex flex-col rounded-lg border border-[#2c3347] bg-[#050608]">
        <div className="flex items-center justify-between border-b border-[#2c3347] px-3 py-1.5 bg-[#0d0e11]">
          <div className="flex items-center gap-2 font-mono text-[10px] text-[#949db2]">
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span>TERMINAL LOG STREAM</span>
          </div>
          <span className="font-mono text-[10px] text-secondary">Apple MLX Metal</span>
        </div>
        <div
          ref={logRef}
          className="max-h-36 overflow-y-auto p-2.5 font-mono text-[11px] leading-relaxed text-[#949db2]"
        >
          {logs.length === 0 ? (
            <p className="text-[#555d73] italic">Waiting for pipeline events…</p>
          ) : (
            logs.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-words text-[#e3e2e6]">
                <span className="text-secondary select-none mr-1.5">›</span>
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

function ProgressBar({
  label,
  eta,
  percent,
  gradient = "from-indigo-600 to-cyan-400",
}: {
  label: string;
  eta?: number;
  percent: number;
  gradient?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between font-mono text-xs">
        <span className="text-[#e3e2e6] font-medium">{label}</span>
        <span className="text-secondary">{eta !== undefined ? `ETA ${formatEta(eta)}` : `${Math.round(percent)}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#1f1f23] border border-[#2c3347]/80">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-[width] duration-500 ease-out shadow-sm`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
