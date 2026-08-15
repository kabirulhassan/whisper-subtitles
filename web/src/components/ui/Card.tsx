import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
  compact?: boolean;
}

export function Card({
  title,
  badge,
  children,
  className = "",
  delay = 0,
  compact = false,
}: CardProps) {
  return (
    <section
      className={`animate-fade-up glass-panel rounded-xl shadow-glass transition-all ${
        compact ? "p-3.5 sm:p-4" : "p-4 sm:p-5"
      } ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {title && (
        <div className="circuit-border mb-3 pb-2 flex items-center justify-between">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#949db2]">
            {title}
          </h2>
          {badge}
        </div>
      )}
      {children}
    </section>
  );
}
