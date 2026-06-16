export interface HealthStatus {
  mlx_whisper: boolean;
  silero_vad: boolean;
  demucs: boolean;
  google_genai: boolean;
  ffmpeg: boolean;
  gemini_api_key: boolean;
  ready: boolean;
}

export interface PipelineOptions {
  video_path: string;
  model: string | null;
  models: string[];
  bilingual: boolean;
  no_translate: boolean;
  no_vad: boolean;
  isolate_vocals: boolean;
  context: number;
  max_wait: number;
  fresh: boolean;
  redo_translate: boolean;
  start: number;
  end: number | null;
  languages: string;
}

export interface JobStatus {
  job_id: string;
  status: string;
  exit_code: number | null;
  error: string | null;
  raw_path: string | null;
  srt_path: string | null;
  video_path: string | null;
}

export interface ProgressEvent {
  type: string;
  message?: string;
  stage?: "transcribe" | "build_cues" | "translate" | "write";
  current?: number;
  total?: number;
  eta_seconds?: number;
  cue_id?: number;
  original?: string;
  translation?: string;
  raw_path?: string;
  srt_path?: string;
  exit_code?: number;
}

export interface CuePreview {
  id: number;
  start: number;
  end: number;
  text: string;
  language: string | null;
  translation: string | null;
}

export interface GeminiModelOption {
  id: string;
  label: string;
  description: string;
}

export const GEMINI_MODEL_OPTIONS: GeminiModelOption[] = [
  {
    id: "gemini-2.5-flash",
    label: "gemini-2.5-flash",
    description: "Fast and cheap — best default",
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "gemini-3.1-flash-lite",
    description: "Cheapest — high-volume translation",
  },
  {
    id: "gemini-3.5-flash",
    label: "gemini-3.5-flash",
    description: "Newer flash tier",
  },
  {
    id: "gemini-2.5-pro",
    label: "gemini-2.5-pro",
    description: "Strongest — hardest audio",
  },
];

/** Default ranked fallback chain (primary first). */
export const DEFAULT_MODEL_FALLBACKS = GEMINI_MODEL_OPTIONS.map((m) => m.id);

export const DEFAULT_OPTIONS: Omit<PipelineOptions, "video_path"> = {
  model: null,
  models: [...DEFAULT_MODEL_FALLBACKS],
  bilingual: false,
  no_translate: false,
  no_vad: false,
  isolate_vocals: false,
  context: 12,
  max_wait: 120,
  fresh: false,
  redo_translate: false,
  start: 0,
  end: null,
  languages: "bn,hi,en",
};
