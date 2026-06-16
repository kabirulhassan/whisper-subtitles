import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  delay?: number;
  compact?: boolean;
}

export function Card({
  title,
  children,
  className = "",
  delay = 0,
  compact = false,
}: CardProps) {
  return (
    <section
      className={`animate-fade-up rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm ${
        compact ? "p-3" : "p-4"
      } ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {title && (
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
