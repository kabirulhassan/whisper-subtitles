interface InfoTipProps {
  text: string;
  className?: string;
}

export function InfoTip({ text, className = "" }: InfoTipProps) {
  return (
    <span
      className={`group/tip relative inline-flex shrink-0 ${className}`}
    >
      <button
        type="button"
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.preventDefault()}
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-zinc-600 transition hover:text-zinc-400 focus:text-zinc-400 focus:outline-none"
        aria-label={text}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M12 11v5M12 8h.01"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-48 -translate-x-1/2 rounded-lg border border-white/[0.08] bg-stage-elevated px-2.5 py-1.5 text-[11px] leading-snug text-zinc-300 opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

interface LabelWithTipProps {
  label: string;
  tip: string;
}

export function LabelWithTip({ label, tip }: LabelWithTipProps) {
  return (
    <span className="mb-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
      {label}
      <InfoTip text={tip} />
    </span>
  );
}
