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
    <ol className="space-y-0.5">
      {GEMINI_MODEL_OPTIONS.map((option) => {
        const rank = models.indexOf(option.id);
        const isOn = rank >= 0;
        const canMoveUp = isOn && rank > 0;
        const canMoveDown = isOn && rank < models.length - 1;

        return (
          <li
            key={option.id}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors ${
              isOn ? "bg-spotlight/[0.06]" : "opacity-40"
            }`}
          >
            <input
              type="checkbox"
              checked={isOn}
              onChange={() => toggle(option.id)}
              disabled={disabled || (isOn && models.length <= 1)}
              className="h-3 w-3 shrink-0 rounded accent-spotlight"
              aria-label={`Include ${option.label}`}
            />
            {isOn && (
              <span className="w-4 shrink-0 text-center text-[10px] font-medium text-spotlight">
                {rank + 1}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
              {option.label}
            </span>
            <InfoTip text={option.description} />
            {isOn && (
              <span className="flex shrink-0">
                <button
                  type="button"
                  onClick={() => move(option.id, -1)}
                  disabled={disabled || !canMoveUp}
                  className="px-1 text-[10px] text-zinc-600 hover:text-spotlight disabled:opacity-20"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(option.id, 1)}
                  disabled={disabled || !canMoveDown}
                  className="px-1 text-[10px] text-zinc-600 hover:text-spotlight disabled:opacity-20"
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
