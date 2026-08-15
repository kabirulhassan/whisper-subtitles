import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
  glow?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "border border-indigo-400/40 bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 text-white font-medium shadow-glow-indigo hover:brightness-110 active:brightness-95",
  secondary:
    "border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 font-medium hover:bg-cyan-500/20 hover:border-cyan-400/50 active:bg-cyan-500/30",
  ghost:
    "border border-[#2c3347] bg-[#12151d]/80 text-[#e3e2e6] hover:border-cyan-500/50 hover:bg-[#1c202b] active:bg-[#0d0e11]",
  danger:
    "border border-red-500/30 bg-red-500/10 text-red-300 hover:border-red-500/60 hover:bg-red-500/20 active:bg-red-500/30",
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm ${variants[variant]} ${glow ? "shadow-glow-indigo" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
