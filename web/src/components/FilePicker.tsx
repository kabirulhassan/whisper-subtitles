import { useState, type DragEvent } from "react";
import { pickFile } from "../api";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";

interface FilePickerProps {
  path: string;
  onPathChange: (path: string) => void;
  disabled?: boolean;
  delay?: number;
  onStart?: () => void;
  onCancel?: () => void;
  canRun?: boolean;
  needsKey?: boolean;
  running?: boolean;
  showCancel?: boolean;
}

export function FilePicker({
  path,
  onPathChange,
  disabled,
  delay = 0,
  onStart,
  onCancel,
  canRun,
  needsKey,
  running,
  showCancel,
}: FilePickerProps) {
  const [picking, setPicking] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick() {
    setPicking(true);
    setError(null);
    try {
      const selected = await pickFile();
      if (selected) onPathChange(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to pick file");
    } finally {
      setPicking(false);
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      // In browser/electron environment file.path is available
      const droppedPath = (files[0] as unknown as { path?: string }).path || files[0].name;
      onPathChange(droppedPath);
    }
  }

  const fileName = path ? path.split("/").pop() ?? path : null;

  return (
    <Card title="Source & Media Hub" delay={delay} compact>
      <div className="flex flex-col gap-3">
        {/* Dropzone Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 transition-all duration-200 ${
            isDragOver
              ? "border-secondary bg-secondary/10 shadow-glow-cyan"
              : "border-[#2c3347] bg-[#0d0e11]/60 hover:border-secondary/60 hover:bg-[#12151d]"
          }`}
        >
          {/* Animated soundwave graphic */}
          <div className="mb-2 flex items-center justify-center gap-1 opacity-70">
            {[16, 28, 42, 24, 36, 48, 30, 18, 38, 22].map((height, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-gradient-to-t from-primary via-secondary to-cyan-300"
                style={{ height: `${height * 0.7}px` }}
              />
            ))}
          </div>

          <div className="text-center">
            <p className="font-sans text-xs font-medium text-[#e3e2e6]">
              Drag &amp; drop video or audio file here
            </p>
            <p className="mt-0.5 font-sans text-[11px] text-[#949db2]">
              Supports MP4, MKV, MOV, MP3, WAV, FLAC, M4A
            </p>
          </div>

          <div className="mt-3 flex w-full max-w-md gap-2">
            <input
              type="text"
              value={path}
              onChange={(e) => onPathChange(e.target.value)}
              placeholder="/Users/username/Movies/sample.mp4"
              disabled={disabled}
              className="min-w-0 flex-1 rounded-lg border border-[#2c3347] bg-[#090a0d] px-3 py-1.5 font-mono text-xs text-[#e3e2e6] placeholder:text-[#555d73] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <Button
              variant="ghost"
              onClick={handlePick}
              disabled={disabled || picking}
              className="shrink-0 font-mono text-xs"
            >
              {picking ? "…" : "Browse"}
            </Button>
          </div>
        </div>

        {/* Selected Media Metadata Card */}
        {fileName && (
          <div className="flex items-center justify-between rounded-lg border border-[#2c3347] bg-[#12151d] p-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2c3347] bg-[#1f1f23] text-secondary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs font-semibold text-[#e3e2e6]">{fileName}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[#949db2]">
                  <span className="rounded bg-secondary/15 px-1 py-0.2 text-secondary font-medium">Apple MLX Ready</span>
                  <span>•</span>
                  <span>Audio &amp; Video</span>
                </div>
              </div>
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={() => onPathChange("")}
                className="ml-2 rounded p-1 text-[#949db2] hover:bg-[#1f1f23] hover:text-red-400"
                aria-label="Clear source"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {error && (
          <p className="rounded bg-red-500/10 px-2.5 py-1 text-xs text-red-300 border border-red-500/20 font-mono">
            {error}
          </p>
        )}

        {/* Action Triggers */}
        {(onStart || showCancel) && (
          <div className="mt-1 flex gap-2">
            {onStart && (
              <Button
                variant="primary"
                glow={!!canRun && !needsKey}
                onClick={onStart}
                disabled={!canRun || !!needsKey}
                className="flex-1 py-2.5 text-sm font-semibold tracking-wide"
              >
                {running ? (
                  <>
                    <span className="h-2 w-2 animate-ping rounded-full bg-cyan-400" />
                    <span>Processing Pipeline…</span>
                  </>
                ) : (
                  <>
                    <span>Begin Transcription &amp; Translation</span>
                    <kbd className="hidden sm:inline-block rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-indigo-200 border border-white/10">
                      ⌘+Enter
                    </kbd>
                  </>
                )}
              </Button>
            )}
            {showCancel && onCancel && (
              <Button variant="danger" onClick={onCancel} className="font-mono text-xs">
                Cancel (Esc)
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
