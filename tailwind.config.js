/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      fontFamily: {
        display: ['Orbitron', 'Rajdhani', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Rajdhani', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
