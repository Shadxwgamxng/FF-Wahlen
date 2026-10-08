import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07090d",
          900: "#0b0e14",
          850: "#0f131b",
          800: "#141922",
          700: "#1b212d",
          600: "#252d3b",
          500: "#344054",
        },
        fire: {
          300: "#ff8a7a",
          400: "#ff5e4a",
          500: "#f03a2e",
          600: "#d42a20",
          700: "#a81f18",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      keyframes: {
        fadeUp: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
      },
      animation: { fadeUp: "fadeUp .35s ease both", pulseDot: "pulseDot 1.6s ease-in-out infinite" },
    },
  },
  plugins: [],
} satisfies Config;
