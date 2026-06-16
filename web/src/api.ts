import type { CuePreview, HealthStatus, JobStatus, PipelineOptions } from "./types";

const API = "/api";

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API}/health`);
  if (!res.ok) throw new Error("Failed to fetch health");
  return res.json();
}

export async function pickFile(): Promise<string | null> {
  const res = await fetch(`${API}/pick-file`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to open file picker");
  const data = await res.json();
  if (data.cancelled || !data.path) return null;
  return data.path as string;
}

export async function createJob(options: PipelineOptions): Promise<string> {
  const res = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to start job");
  }
  const data = await res.json();
  return data.job_id as string;
}

export async function getJob(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API}/jobs/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch job status");
  return res.json();
}

export async function cancelJob(jobId: string): Promise<void> {
  const res = await fetch(`${API}/jobs/${jobId}/cancel`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to cancel job");
}

export async function fetchPreview(jobId: string): Promise<{
  cues: CuePreview[];
  raw_path: string | null;
  srt_path: string | null;
}> {
  const res = await fetch(`${API}/jobs/${jobId}/preview`);
  if (!res.ok) throw new Error("Failed to fetch preview");
  return res.json();
}

export function downloadUrl(path: string): string {
  return `${API}/files/download?path=${encodeURIComponent(path)}`;
}

export function connectJobEvents(
  jobId: string,
  onEvent: (event: Record<string, unknown>) => void,
  onClose: () => void,
): () => void {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}${API}/jobs/${jobId}/events`);

  ws.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch {
      // ignore malformed messages
    }
  };

  ws.onclose = onClose;
  ws.onerror = onClose;

  return () => ws.close();
}
