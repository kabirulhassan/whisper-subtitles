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
  const needsKey = !options.no_translate && health && !health.gemini_api_key;

  return (
    <div className="relative min-h-screen bg-stage text-zinc-100">
      <StageBackdrop active={running} />

      <div className="relative z-10">
        <header className="border-b border-white/[0.04]">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2.5 sm:px-5">
            <div className="flex min-w-0 items-baseline gap-2.5 animate-fade-up">
              <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
                Whisperer
              </h1>
              <p className="hidden truncate text-xs text-stage-muted sm:block">
                Mixed-language → English subtitles
              </p>
            </div>
            <StatusPill health={health} running={running} />
          </div>
        </header>

        <main className="mx-auto max-w-5xl space-y-2.5 px-4 py-3 sm:px-5 sm:py-4">
          {needsKey && (
            <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2 text-xs text-amber-200/90">
              GEMINI_API_KEY missing — add to <code className="text-amber-100/80">.env</code> or
              use transcribe-only.
            </div>
          )}

          <div className="grid gap-2.5 lg:grid-cols-2">
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

            <OptionsForm
              options={options}
              onChange={setOptions}
              disabled={running}
              delay={100}
            />
          </div>

          {(running || events.length > 0 || error) && (
            <ProgressPanel events={events} status={status} error={error} />
          )}

          <SrtPreview cues={cues} rawPath={rawPath} srtPath={srtPath} />
        </main>
      </div>
    </div>
  );
}

function StatusPill({
  health,
  running,
}: {
  health: HealthStatus | null;
  running: boolean;
}) {
  if (running) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-spotlight/20 bg-spotlight/5 px-2 py-0.5 text-[11px] font-medium text-spotlight">
        <span className="h-1 w-1 animate-pulse-soft rounded-full bg-spotlight" />
        Processing
      </span>
    );
  }

  if (!health) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.06] px-2 py-0.5 text-[11px] text-stage-muted">
        <span className="h-1 w-1 rounded-full bg-zinc-600" />
        …
      </span>
    );
  }

  const ok = health.ready;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        ok
          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400/90"
          : "border-amber-500/20 bg-amber-500/5 text-amber-400/90"
      }`}
    >
      <span className={`h-1 w-1 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} />
      {ok ? "Ready" : "Setup needed"}
    </span>
  );
}
