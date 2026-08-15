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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[11px] font-medium tracking-wider uppercase text-[#949db2]">
          <span>Source Languages</span>
          <InfoTip text="Restricts Whisper detection to target languages to avoid misclassifications in mixed audio." />
        </div>

        {/* Auto-detect toggle switch */}
        <label className="flex cursor-pointer items-center gap-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40">
          <span className="font-mono text-[10px] text-[#949db2]">Auto-detect</span>
          <div className="relative inline-flex items-center">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              disabled={disabled}
              className="peer sr-only"
            />
            <div className="h-4 w-7 rounded-full bg-[#1f1f23] border border-[#2c3347] transition-colors peer-checked:bg-primary peer-checked:border-primary peer-focus:outline-none" />
            <div className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-[#e3e2e6] transition-transform peer-checked:translate-x-3 peer-checked:bg-white" />
          </div>
        </label>
      </div>

      {/* Language Chips */}
      <div className={`flex flex-wrap gap-1.5 ${auto ? "pointer-events-none opacity-40" : ""}`}>
        {LANGUAGE_OPTIONS.map(({ code, name }) => {
          const isSelected = selected.has(code);
          return (
            <button
              type="button"
              key={code}
              onClick={() => toggle(code)}
              disabled={disabled || auto}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-mono text-xs transition-all duration-150 active:scale-95 ${
                isSelected
                  ? "border border-primary/50 bg-primary/15 text-primary-light shadow-sm"
                  : "border border-[#2c3347] bg-[#0d0e11]/80 text-[#949db2] hover:border-[#464554] hover:text-[#e3e2e6]"
              }`}
            >
              <span>{name}</span>
              <span className="text-[10px] opacity-60 font-mono">({code})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
