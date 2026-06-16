interface StageBackdropProps {
  active?: boolean;
}

const BAR_COUNT = 9;

export function StageBackdrop({ active = false }: StageBackdropProps) {
  return (
    <div className="grain pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {/* Spotlight from above */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(212, 165, 116, 0.07) 0%, transparent 70%)",
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.55) 100%)",
        }}
      />

      {/* Ambient EQ bars */}
      <div
        className={`absolute left-1/2 top-10 flex h-10 -translate-x-1/2 items-end justify-center gap-1 transition-opacity duration-500 ${
          active ? "opacity-35" : "opacity-[0.08]"
        }`}
      >
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <span
            key={i}
            className={`w-1 origin-bottom rounded-full bg-spotlight/60 ${
              active ? "animate-bar-dance-active" : "animate-bar-dance"
            }`}
            style={{
              height: "100%",
              animationDelay: `${i * 0.12}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
