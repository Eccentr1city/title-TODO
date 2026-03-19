/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          primary: "#0a0908",
          secondary: "#1c1816",
          tertiary: "#231f1c",
        },
        border: {
          DEFAULT: "#352c25",
          hover: "#4a3f35",
        },
        text: {
          normal: "#f3cfaa",
          muted: "#c6a17e",
          faint: "#a38978",
        },
        accent: {
          DEFAULT: "#ffaa55",
          hover: "#ffc285",
          glow: "rgba(255, 170, 85, 0.18)",
        },
        heat: {
          1: "#ffd699",
          2: "#ffc285",
          3: "#ffb06c",
          4: "#ffaa55",
          5: "#ff9d45",
          6: "#f59440",
        },
        success: "#5a9e6f",
        error: "#c14953",
      },
      fontFamily: {
        mono: ['"Share Tech Mono"', '"Fira Code"', '"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        glow: "0 0 12px rgba(255, 170, 85, 0.25)",
        "glow-sm": "0 0 6px rgba(255, 170, 85, 0.18)",
        "glow-lg": "0 0 20px rgba(255, 170, 85, 0.35)",
      },
    },
  },
  plugins: [],
};


