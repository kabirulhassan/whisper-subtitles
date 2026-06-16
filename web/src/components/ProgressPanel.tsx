import { useEffect, useRef } from "react";
import type { ProgressEvent } from "../types";
import { Card } from "./ui/Card";

const STAGES = ["transcribe", "build_cues", "translate", "write"] as const;

function formatEta(seconds: number | undefined): string {
  if (seconds === undefined) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function stageLabel(stage: string): string {
  switch (stage) {
    case "transcribe":
      return "Transcribe";
    case "build_cues":
      return "Cues";
    case "translate":
      return "Translate";
    case "write":
      return "Write";
    default:
      return stage;
  }
}

interface ProgressPanelProps {
  events: ProgressEvent[];
  status: string | null;
  error: string | null;
}

export function ProgressPanel({ events, status, error }: ProgressPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);

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
    <Card title="Stage" className="animate-fade-up" delay={150} compact>
      <div className="mb-2 flex items-center gap-1">
        {STAGES.map((stage, i) => {
          const done = completedStages.has(stage);
          const active = activeStage === stage;
          return (
            <div key={stage} className="flex min-w-0 flex-1 items-center gap-1">
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-medium ${
                  done
                    ? "bg-spotlight/20 text-spotlight"
                    : active
                      ? "animate-pulse-soft bg-spotlight/30 text-spotlight"
                      : "bg-white/[0.04] text-zinc-600"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={`hidden truncate text-[10px] sm:inline ${
                  active ? "text-spotlight" : done ? "text-zinc-400" : "text-zinc-600"
                }`}
              >
                {stageLabel(stage)}
              </span>
              {i < STAGES.length - 1 && (
                <div
                  className={`mx-0.5 h-px flex-1 ${
                    done ? "bg-spotlight/25" : "bg-white/[0.06]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        {latestRegion && (
          <ProgressBar
            label={`Region ${latestRegion.current}/${latestRegion.total}`}
            eta={latestRegion.eta_seconds}
            percent={((latestRegion.current ?? 0) / (latestRegion.total ?? 1)) * 100}
          />
        )}
        {latestBatch && (
          <ProgressBar
            label={`Batch ${latestBatch.current}/${latestBatch.total}`}
            eta={latestBatch.eta_seconds}
            percent={((latestBatch.current ?? 0) / (latestBatch.total ?? 1)) * 100}
          />
        )}
      </div>

      {(quotaEvent || error || (status && !error)) && (
        <div className="mb-2 space-y-1">
          {quotaEvent && (
            <p className="text-[11px] text-amber-200/80">
              Rate limit — progress saved, resume later.
            </p>
          )}
          {error && <p className="text-[11px] text-red-300/90">{error}</p>}
          {status && !error && !quotaEvent && (
            <p className="text-[11px] text-zinc-500">{status}</p>
          )}
        </div>
      )}

      <div
        ref={logRef}
        className="max-h-28 overflow-y-auto rounded-lg bg-black/30 px-2 py-1.5 font-mono text-[10px] leading-snug text-zinc-500"
      >
        {logs.length === 0 ? (
          <p className="text-zinc-600">Waiting…</p>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">
              {line}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function ProgressBar({
  label,
  eta,
  percent,
}: {
  label: string;
  eta?: number;
  percent: number;
}) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[10px] text-zinc-500">
        <span>{label}</span>
        {eta !== undefined && <span>{formatEta(eta)}</span>}
      </div>
      <div className="h-[2px] overflow-hidden rounded-full bg-white/[0.04]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-spotlight-dim to-spotlight transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
