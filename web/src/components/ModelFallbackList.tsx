import { GEMINI_MODEL_OPTIONS } from "../types";
import { InfoTip } from "./ui/InfoTip";

interface ModelFallbackListProps {
  models: string[];
  onChange: (models: string[]) => void;
  disabled?: boolean;
}

export function ModelFallbackList({ models, onChange, disabled }: ModelFallbackListProps) {
  const enabled = new Set(models);

  function toggle(id: string) {
    if (enabled.has(id)) {
      if (models.length <= 1) return;
      onChange(models.filter((m) => m !== id));
    } else {
      onChange([...models, id]);
    }
  }

  function move(id: string, direction: -1 | 1) {
    const idx = models.indexOf(id);
    if (idx < 0) return;
    const next = idx + direction;
    if (next < 0 || next >= models.length) return;
    const updated = [...models];
    [updated[idx], updated[next]] = [updated[next], updated[idx]];
    onChange(updated);
  }

  return (
    <ol className="space-y-1.5">
      {GEMINI_MODEL_OPTIONS.map((option) => {
        const rank = models.indexOf(option.id);
        const isOn = rank >= 0;
        const canMoveUp = isOn && rank > 0;
        const canMoveDown = isOn && rank < models.length - 1;

        return (
          <li
            key={option.id}
            className={`flex items-center gap-2 rounded-lg border p-2 transition-all duration-150 ${
              isOn
                ? "border-[#2c3347] bg-[#12151d] shadow-sm hover:border-primary/40"
                : "border-transparent bg-[#0d0e11]/40 opacity-40"
            }`}
          >
            <input
              type="checkbox"
              checked={isOn}
              onChange={() => toggle(option.id)}
              disabled={disabled || (isOn && models.length <= 1)}
              className="h-3.5 w-3.5 shrink-0 rounded accent-indigo-500 bg-[#090a0d] border-[#2c3347] cursor-pointer"
              aria-label={`Include ${option.label}`}
            />

            {/* Rank badge */}
            {isOn && (
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                  rank === 0
                    ? "bg-primary/20 text-primary-light border border-primary/30"
                    : "bg-[#1f1f23] text-[#949db2] border border-[#2c3347]"
                }`}
              >
                {rank === 0 ? "Primary" : `#${rank + 1}`}
              </span>
            )}

            <span className="min-w-0 flex-1 truncate font-mono text-xs text-[#e3e2e6]">
              {option.label}
            </span>

            <InfoTip text={option.description} />

            {isOn && (
              <span className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(option.id, -1)}
                  disabled={disabled || !canMoveUp}
                  className="rounded p-1 font-mono text-[11px] text-[#949db2] hover:bg-[#1f1f23] hover:text-cyan-300 disabled:opacity-20"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(option.id, 1)}
                  disabled={disabled || !canMoveDown}
                  className="rounded p-1 font-mono text-[11px] text-[#949db2] hover:bg-[#1f1f23] hover:text-cyan-300 disabled:opacity-20"
                  aria-label="Move down"
                >
                  ↓
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
