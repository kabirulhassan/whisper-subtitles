import {
  LANGUAGE_OPTIONS,
  formatLanguagesParam,
  parseLanguagesParam,
} from "../languages";
import { InfoTip } from "./ui/InfoTip";

interface LanguagePickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function LanguagePicker({ value, onChange, disabled }: LanguagePickerProps) {
  const { auto, codes } = parseLanguagesParam(value);
  const selected = new Set(codes);

  function setAuto(checked: boolean) {
    if (checked) {
      onChange("auto");
    } else {
      onChange(formatLanguagesParam(false, ["bn", "hi", "en"]));
    }
  }

  function toggle(code: string) {
    const next = new Set(selected);
    if (next.has(code)) {
      if (next.size <= 1) return;
      next.delete(code);
    } else {
      next.add(code);
    }
    onChange(formatLanguagesParam(false, [...next]));
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1">
        <span className="text-[10px] text-zinc-500">Spoken languages</span>
        <InfoTip text="Which languages may appear in the audio. Whisper uses this to avoid mis-detecting the wrong language. Choose Auto only if the mix is unpredictable." />
      </div>

      <label className="mb-2 flex cursor-pointer items-center gap-1.5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => setAuto(e.target.checked)}
          disabled={disabled}
          className="h-3 w-3 shrink-0 rounded accent-spotlight"
        />
        <span className="text-xs text-zinc-300">Auto-detect any language</span>
        <InfoTip text="No restriction — Whisper may choose from all ~99 languages. Can misfire on mixed South Asian audio." />
      </label>

      <div
        className={`grid grid-cols-3 gap-x-2 gap-y-1 ${auto ? "pointer-events-none opacity-40" : ""}`}
      >
        {LANGUAGE_OPTIONS.map(({ code, name }) => (
          <label
            key={code}
            className="flex cursor-pointer items-center gap-1.5 py-0.5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40"
          >
            <input
              type="checkbox"
              checked={selected.has(code)}
              onChange={() => toggle(code)}
              disabled={disabled || auto}
              className="h-3 w-3 shrink-0 rounded accent-spotlight"
            />
            <span className="text-xs text-zinc-300">{name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
