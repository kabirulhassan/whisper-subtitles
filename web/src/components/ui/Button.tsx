import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
  glow?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "border border-spotlight/30 bg-spotlight/90 text-stage font-medium hover:bg-spotlight hover:border-spotlight/50",
  ghost:
    "border border-white/[0.08] bg-transparent text-zinc-300 hover:border-white/[0.14] hover:bg-white/[0.03]",
  danger:
    "border border-red-500/20 bg-transparent text-red-300/90 hover:border-red-500/40 hover:bg-red-500/5",
};

export function Button({
  variant = "primary",
  children,
  className = "",
  glow = false,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm sm:py-2 ${variants[variant]} ${glow ? "shadow-glow-sm hover:shadow-glow" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
