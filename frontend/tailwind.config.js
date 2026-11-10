/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          // Light, violet-led palette. `night`/`navy` kept for dark surfaces (slides, code blocks).
          night: "#10131d",
          navy: "#1b1f2e",
          ink: "#0f1020",
          muted: "#7e7893",
          bg: "#f8f8fd",
          mist: "#f1ecff",
          line: "#e8e1ff",
          deep: "#35138f",
          violet: "#582be8",
          bright: "#744bef",
          light: "#a996ff",
          indigo: "#4c35d9",
          blue: "#3b82f6",
          cyan: "#22d3ee",
          pink: "#d946ef",
        },
      },
      fontFamily: {
        sans: ["Geist", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["Geist Mono", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 18px 42px rgba(80, 70, 120, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.86)",
        soft: "0 30px 80px rgba(88, 43, 232, 0.12), 0 10px 30px rgba(15, 16, 32, 0.08)",
        glow: "0 12px 28px rgba(88, 43, 232, 0.24)",
        "glow-lg": "0 16px 36px rgba(88, 43, 232, 0.34)",
      },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(24px)" }, "100%": { opacity: "1", transform: "none" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
      },
      animation: {
        rise: "rise .8s ease-out both",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
