/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['Rajdhani', 'sans-serif'],
      },
      colors: {
        nano: {
          yellow: '#FACC15', // Nano Yellow
          gold: '#CA8A04',
          dark: '#020617', // Deep Onyx (Slate 950)
          panel: '#0F172A', // Slate 900
          border: '#1E293B', // Slate 800
          text: '#94A3B8' // Slate 400
        }
      },
      backgroundImage: {
        'grid-pattern': "linear-gradient(to right, #1E293B 1px, transparent 1px), linear-gradient(to bottom, #1E293B 1px, transparent 1px)",
        'radial-fade': "radial-gradient(circle at center, rgba(250, 204, 21, 0.1) 0%, transparent 70%)"
      }
    }
  },
  plugins: [],
}
