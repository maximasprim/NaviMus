/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#1B1B16", horizon: "#14231F" },
        gold: { DEFAULT: "#C7A233", soft: "#E4C766", deep: "#96791F" },
        acacia: { DEFAULT: "#3C6E5E", soft: "#6B9686" },
        sand: { DEFAULT: "#E4DCC5", light: "#F0EBDC", dark: "#D3C8A6" },
        plum: { DEFAULT: "#5B4363", soft: "#7A5F84" },
        // Additive tokens for the redesigned dashboard shell (nothing above was changed).
        canvas: "#F3F5F3",
        hairline: "#E2E8E4",
        fog: "#66736D",
      },
      fontFamily: {
        display: ["var(--font-zilla)", "Georgia", "serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
