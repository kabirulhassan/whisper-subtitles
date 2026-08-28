import { useCallback, useEffect, useState } from "react";
import {
  cancelJob,
  connectJobEvents,
  createJob,
  fetchHealth,
  fetchPreview,
} from "./api";
import { FilePicker } from "./components/FilePicker";
import { OptionsForm } from "./components/OptionsForm";
import { ProgressPanel } from "./components/ProgressPanel";
import { SrtPreview } from "./components/SrtPreview";
import { StageBackdrop } from "./components/StageBackdrop";
import type {
  CuePreview,
  HealthStatus,
  PipelineOptions,
  ProgressEvent,
} from "./types";
import { DEFAULT_OPTIONS } from "./types";

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [videoPath, setVideoPath] = useState("");
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [cues, setCues] = useState<CuePreview[]>([]);
  const [rawPath, setRawPath] = useState<string | null>(null);
  const [srtPath, setSrtPath] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const loadPreview = useCallback(async (id: string) => {
    try {
      const preview = await fetchPreview(id);
      setCues(preview.cues);
      setRawPath(preview.raw_path);
      setSrtPath(preview.srt_path);
    } catch {
      // preview may not be ready yet
    }
  }, []);

  async function handleStart() {
    if (!videoPath.trim()) {
      setError("Select a video file first");
      return;
    }

    setError(null);
    setEvents([]);
    setCues([]);
    setRawPath(null);
    setSrtPath(null);
    setRunning(true);
    setStatus("running");

    const payload: PipelineOptions = {
      video_path: videoPath.trim(),
      ...options,
      model: null,
    };

    try {
      const id = await createJob(payload);
      setJobId(id);

      connectJobEvents(
        id,
        (event) => {
          const typed = event as unknown as ProgressEvent;
          setEvents((prev) => [...prev, typed]);

          if (typed.type === "job_completed") {
            setStatus("completed");
            setRunning(false);
            if (typed.raw_path) setRawPath(typed.raw_path);
            if (typed.srt_path) setSrtPath(typed.srt_path);
            loadPreview(id);
          } else if (typed.type === "quota_paused") {
            setStatus("quota_paused");
            setRunning(false);
            setError(typed.message ?? "Rate limit reached");
            loadPreview(id);
          } else if (typed.type === "job_failed") {
            setStatus("failed");
            setRunning(false);
            setError(typed.message ?? "Job failed");
          }
        },
        () => {
          setRunning(false);
        },
      );
    } catch (e) {
      setRunning(false);
      setStatus(null);
      setError(e instanceof Error ? e.message : "Failed to start job");
    }
  }

  async function handleCancel() {
    if (!jobId) return;
    try {
      await cancelJob(jobId);
      setStatus("cancelled");
      setRunning(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel");
    }
  }

  const canRun = health?.ready && !running && videoPath.trim().length > 0;
  const needsKey =
    !options.no_translate &&
    options.backend === "gemini" &&
    health &&
    !health.gemini_api_key;
  const needsLocalModel =
    !options.no_translate && options.backend === "local" && health && !health.mlx_lm;

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

  return (
    <div className="relative min-h-screen bg-[#090a0d] text-[#e3e2e6]">
      <StageBackdrop active={running} />

      <div className="relative z-10">
        {/* Studio Top Navigation */}
        <header className="sticky top-0 z-50 border-b border-[#2c3347] bg-[#121316]/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            {/* Brand Logo & Subtitle */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 border border-primary/40 text-primary-light shadow-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 2v20M17 5v14M7 5v14M22 10v4M2 10v4" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-sans text-base sm:text-lg font-bold tracking-tight text-white">
                    Whisperer Studio
                  </h1>
                  <span className="rounded bg-[#1f1f23] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#949db2] border border-[#2c3347]">
                    v2.0 MLX
                  </span>
                </div>
                <p className="hidden sm:block font-mono text-[11px] text-[#949db2]">
                  Mixed-Language → English Subtitle Engine
                </p>
              </div>
            </div>

            {/* Health & Engine Status Badges */}
            <div className="flex items-center gap-2.5 sm:gap-3.5">
              <StatusPill health={health} running={running} activeStage={activeStage} />
              <div className="hidden md:flex items-center gap-1.5 rounded-md border border-[#2c3347] bg-[#12151d] px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                <span className="font-mono text-[10px] font-medium text-secondary">
                  Apple Silicon Metal
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6">
          {needsKey && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 font-mono text-xs text-amber-200">
              <span className="font-bold">⚠ GEMINI_API_KEY Missing:</span> Please add your Gemini key to{" "}
              <code className="rounded bg-black/40 px-1.5 py-0.5 text-amber-100 border border-amber-500/30">.env</code>{" "}
              or switch to <span className="font-semibold text-white">Local</span> backend or{" "}
              <span className="font-semibold text-white">Transcribe Only</span> mode.
            </div>
          )}
          {needsLocalModel && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 font-mono text-xs text-amber-200">
              <span className="font-bold">⚠ mlx-lm Missing:</span> Install it with{" "}
              <code className="rounded bg-black/40 px-1.5 py-0.5 text-amber-100 border border-amber-500/30">
                pip install mlx-lm
              </code>{" "}
              to use the Local translation backend.
            </div>
          )}

          {/* 2-Column Grid (Source Hub on Left, Pipeline Config on Right) */}
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-6 flex flex-col gap-4">
              <FilePicker
                path={videoPath}
                onPathChange={setVideoPath}
                disabled={running}
                delay={50}
                onStart={handleStart}
                onCancel={handleCancel}
                canRun={canRun}
                needsKey={!!needsKey}
                running={running}
                showCancel={running && !!jobId}
              />
            </div>

            <div className="lg:col-span-6 flex flex-col gap-4">
              <OptionsForm
                options={options}
                onChange={setOptions}
                disabled={running}
                delay={100}
              />
            </div>
          </div>

          {/* Active / Progress Pipeline */}
          {(running || events.length > 0 || error) && (
            <ProgressPanel events={events} status={status} error={error} />
          )}

          {/* Subtitle Inspector & Export Hub */}
          <SrtPreview cues={cues} rawPath={rawPath} srtPath={srtPath} />
        </main>
      </div>
    </div>
  );
}

function StatusPill({
  health,
  running,
  activeStage,
}: {
  health: HealthStatus | null;
  running: boolean;
  activeStage?: string;
}) {
  if (running) {
    const label =
      activeStage === "isolate_vocals"
        ? "Isolating Vocals (Demucs)…"
        : activeStage === "transcribe"
          ? "Transcribing (Whisper)…"
          : activeStage === "translate"
            ? "Translating (Gemini)…"
            : "Processing…";
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/20 px-3 py-1 font-mono text-xs font-semibold text-primary-light shadow-glow-indigo">
        <span className="h-2 w-2 animate-ping rounded-full bg-primary-light" />
        {label}
      </span>
    );
  }

  if (!health) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#2c3347] bg-[#12151d] px-2.5 py-1 font-mono text-[11px] text-[#949db2]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#555d73]" /> Connecting…
      </span>
    );
  }

  const ok = health.ready;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-semibold ${
        ok
          ? "border-status-success/30 bg-status-success/15 text-status-success"
          : "border-status-warning/30 bg-status-warning/15 text-status-warning"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${ok ? "bg-status-success animate-pulse" : "bg-status-warning"}`}
      />
      {ok ? "MLX & Gemini Ready" : "Setup Needed"}
    </span>
  );
}
