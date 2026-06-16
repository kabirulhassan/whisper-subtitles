/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        stage: {
          DEFAULT: "#0c0c0f",
          elevated: "#141418",
          muted: "#71717a",
        },
        spotlight: {
          DEFAULT: "#d4a574",
          dim: "#a8845a",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
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
        "fade-up": "fade-up 280ms ease-out both",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "bar-dance": "bar-dance 4s ease-in-out infinite",
        "bar-dance-active": "bar-dance-active 2.5s ease-in-out infinite",
      },
      boxShadow: {
        glow: "0 0 24px rgba(212, 165, 116, 0.18)",
        "glow-sm": "0 0 12px rgba(212, 165, 116, 0.12)",
      },
    },
  },
  plugins: [],
};
