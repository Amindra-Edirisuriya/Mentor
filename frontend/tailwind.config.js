/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Sampled from public/logo.png: deep navy background, violet → blue → cyan "V".
      colors: {
        brand: {
          night: "#070726",
          navy: "#0f1240",
          violet: "#7c3aed",
          indigo: "#4f46e5",
          blue: "#3b82f6",
          cyan: "#22d3ee",
          pink: "#d946ef",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
