import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Official AnalytixLabs palette (from the masterclass brand assets)
        navy: {
          DEFAULT: "#003368",
          50: "#E6EEF6",
          100: "#CCDDED",
          700: "#002854",
          800: "#002244",
          900: "#09263F",
        },
        brand: {
          // bright AnalytixLabs green — fills / CTAs (pair with navy text)
          DEFAULT: "#00DF83",
          400: "#26E795",
          500: "#00C975",
          600: "#1DA851",
          700: "#00875A", // accessible green for text on white
        },
        gold: "#F5B400",
        wa: "#25D366",
        ink: "#003368",
        muted: "#4A6275",
        soft: "#F0FAF8",
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "system-ui", "Segoe UI", "Arial", "sans-serif"],
      },
      boxShadow: {
        card: "0 10px 30px -12px rgba(0, 51, 104, 0.18)",
        cta: "0 12px 24px -8px rgba(0, 223, 131, 0.45)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out both",
        marquee: "marquee 28s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
