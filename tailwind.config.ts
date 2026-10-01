import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Geist", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Arial", "sans-serif"] },
      colors: {
        navy: { DEFAULT: "#1F3864", light: "#2c4d86", 50: "#e8edf6" },
        brand: { DEFAULT: "#C8102E", dark: "#9C0C24" },
        ink: "#101d35",
        mute: "#606a7b",
        line: "#dfe4ec",
        page: "#f4f6fa",
        ok: { DEFAULT: "#1e7e46", bg: "#e6f4ec", ink: "#17663a" },
        warn: { DEFAULT: "#b7791f", bg: "#fbf1df", ink: "#7a4f0f" },
        bad: { DEFAULT: "#c0392b", bg: "#fbe9e7", ink: "#a8301f" },
      },
      borderRadius: { xl: "12px" },
    },
  },
  plugins: [],
} satisfies Config;
