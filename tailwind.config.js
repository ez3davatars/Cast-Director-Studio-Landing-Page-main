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
        display: ['Outfit', 'Inter', 'sans-serif'],
        mono: ['Rajdhani', 'sans-serif'],
      },
      colors: {
        nano: {
          yellow: '#FACC15',
          gold: '#CA8A04',
          amber: '#F59E0B',
          dark: '#020617',
          abyss: '#010409',
          void: '#020617',
          surface1: '#0a1628',
          surface2: '#0d1f3c',
          surface3: '#111827',
          panel: '#0F172A',
          border: '#1E293B',
          text: '#94A3B8'
        }
      },
      backgroundImage: {
        'grid-pattern': "linear-gradient(to right, #1E293B 1px, transparent 1px), linear-gradient(to bottom, #1E293B 1px, transparent 1px)",
        'radial-fade': "radial-gradient(circle at center, rgba(250, 204, 21, 0.1) 0%, transparent 70%)"
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'float-delayed': 'float 6s ease-in-out 2s infinite',
        'glow-pulse': 'glowPulse 4s ease-in-out infinite',
        'scanline': 'scanline 8s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.6', boxShadow: '0 0 20px rgba(250, 204, 21, 0.2)' },
          '50%': { opacity: '1', boxShadow: '0 0 40px rgba(250, 204, 21, 0.4)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    }
  },
  plugins: [],
}
