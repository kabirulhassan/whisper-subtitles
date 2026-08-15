interface StageBackdropProps {
  active?: boolean;
}

const BAR_COUNT = 15;

export function StageBackdrop({ active = false }: StageBackdropProps) {
  return (
    <div className="grain pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {/* Top Ambient Glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 40% at 50% -5%, rgba(99, 102, 241, 0.12) 0%, transparent 60%)",
        }}
      />

      {/* Cyan Secondary Accent Glow on Right */}
      <div
        className="absolute right-0 top-0 h-96 w-96 opacity-20"
        style={{
          background:
            "radial-gradient(circle, rgba(6, 182, 212, 0.15) 0%, transparent 70%)",
        }}
      />

      {/* Deep Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 45%, rgba(9, 10, 13, 0.8) 100%)",
        }}
      />

      {/* Ambient Soundwave Bars */}
      <div
        className={`absolute left-1/2 top-4 flex h-8 -translate-x-1/2 items-end justify-center gap-1.5 transition-opacity duration-700 ${
          active ? "opacity-45" : "opacity-15"
        }`}
      >
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <span
            key={i}
            className={`w-1 origin-bottom rounded-full bg-gradient-to-t from-indigo-500 to-cyan-400 ${
              active ? "animate-bar-dance-active" : "animate-bar-dance"
            }`}
            style={{
              height: `${30 + (i % 5) * 14}%`,
              animationDelay: `${i * 0.09}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
