/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#090a0d",
        surface: {
          DEFAULT: "#121316",
          card: "#12151d",
          border: "#2c3347",
          dim: "#090a0d",
          bright: "#38393c",
          container: "#1f1f23",
          "container-low": "#1b1b1f",
          "container-high": "#292a2d",
          "container-highest": "#343538",
          "container-lowest": "#0d0e11",
        },
        primary: {
          DEFAULT: "#6366f1",
          container: "#4f46e5",
          light: "#c0c1ff",
          dark: "#3730a3",
          glow: "rgba(99, 102, 241, 0.35)",
        },
        secondary: {
          DEFAULT: "#06b6d4",
          light: "#4cd7f6",
          container: "#0891b2",
          glow: "rgba(6, 182, 212, 0.35)",
        },
        status: {
          success: "#10b981",
          warning: "#f59e0b",
          error: "#ef4444",
          peak: "#ec4899",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 15px rgba(99, 102, 241, 0.2)" },
          "50%": { boxShadow: "0 0 28px rgba(99, 102, 241, 0.45)" },
        },
        "bar-dance": {
          "0%, 100%": { transform: "scaleY(0.25)" },
          "50%": { transform: "scaleY(1)" },
        },
        "bar-dance-active": {
          "0%, 100%": { transform: "scaleY(0.35)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 240ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2.5s ease-in-out infinite",
        "bar-dance": "bar-dance 4s ease-in-out infinite",
        "bar-dance-active": "bar-dance-active 2s ease-in-out infinite",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
        "glow-indigo": "0 0 24px rgba(99, 102, 241, 0.35)",
        "glow-cyan": "0 0 20px rgba(6, 182, 212, 0.3)",
      },
    },
  },
  plugins: [],
};
