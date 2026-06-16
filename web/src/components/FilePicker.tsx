import { useState } from "react";
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

  return (
    <Card title="Source" delay={delay} compact>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={handlePick}
          disabled={disabled || picking}
          className="shrink-0"
        >
          {picking ? "…" : "Browse"}
        </Button>
        <input
          type="text"
          value={path}
          onChange={(e) => onPathChange(e.target.value)}
          placeholder="Video path"
          disabled={disabled}
          className="min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-spotlight/30 focus:outline-none disabled:opacity-50 sm:text-sm"
        />
      </div>
      {error && <p className="mt-1.5 text-[11px] text-red-400/90">{error}</p>}

      {(onStart || showCancel) && (
        <div className="mt-2.5 flex gap-2">
          {onStart && (
            <Button
              variant="primary"
              glow={!!canRun && !needsKey}
              onClick={onStart}
              disabled={!canRun || !!needsKey}
              className="flex-1"
            >
              {running ? "Processing…" : "Begin transcription"}
            </Button>
          )}
          {showCancel && onCancel && (
            <Button variant="danger" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
