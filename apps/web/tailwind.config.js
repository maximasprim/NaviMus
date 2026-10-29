/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)", // primary text on light surfaces (default #231F1C; see globals.css)
          horizon: "rgb(var(--c-ink-horizon) / <alpha-value>)", // deep tropical teal - hero/dark surfaces (#0B322D)
        },
        gold: {
          DEFAULT: "rgb(var(--c-gold) / <alpha-value>)", // sunlit amber (#F2A93B)
          soft: "rgb(var(--c-gold-soft) / <alpha-value>)",
          deep: "rgb(var(--c-gold-deep) / <alpha-value>)",
        },
        acacia: {
          DEFAULT: "rgb(var(--c-acacia) / <alpha-value>)", // lagoon green (#0E9B7C)
          soft: "rgb(var(--c-acacia-soft) / <alpha-value>)",
        },
        sand: {
          DEFAULT: "rgb(var(--c-sand) / <alpha-value>)", // warm light background (#FBF4E7)
          light: "rgb(var(--c-sand-light) / <alpha-value>)",
          dark: "rgb(var(--c-sand-dark) / <alpha-value>)",
        },
        plum: {
          DEFAULT: "rgb(var(--c-plum) / <alpha-value>)", // tertiary (#7A3B63)
          soft: "rgb(var(--c-plum-soft) / <alpha-value>)",
        },
        sunset: {
          DEFAULT: "rgb(var(--c-sunset) / <alpha-value>)", // coral (#F2543D)
          soft: "rgb(var(--c-sunset-soft) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ["var(--ff-display)"],
        body: ["var(--ff-body)"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "horizon-fade": "linear-gradient(160deg, rgb(var(--c-ink-horizon-deep)) 0%, rgb(var(--c-ink-horizon)) 45%, rgb(var(--c-ink-horizon-mid)) 78%, rgb(var(--c-ink-horizon-end)) 100%)",
        "dawn-fade": "linear-gradient(120deg, rgb(var(--c-ink-horizon)) 0%, rgb(var(--c-acacia)) 55%, rgb(var(--c-gold)) 120%)",
      },
      boxShadow: {
        card: "0 1px 2px rgb(var(--c-ink-horizon) / 0.06), 0 12px 24px -12px rgb(var(--c-ink-horizon) / 0.18)",
        "card-hover": "0 4px 8px rgb(var(--c-ink-horizon) / 0.08), 0 24px 40px -16px rgb(var(--c-ink-horizon) / 0.28)",
      },
      keyframes: {
        drift: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "50%": { transform: "translate(0, -10px)" },
        },
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        drift: "drift 6s ease-in-out infinite",
        "rise-in": "rise-in 0.7s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};
