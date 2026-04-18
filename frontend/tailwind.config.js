/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        food: {
          primary: '#FF6B35',    // Orange
          secondary: '#FFD166',  // Yellow
          accent: '#EF476F',     // Pink/Red
          bg: '#FFF8F2',         // Warm White
          dark: '#2D3748',       // Dark text
          muted: '#718096',      // Muted text
        },
        glass: {
          DEFAULT: 'rgba(255,255,255,0.7)',
          border: 'rgba(255,255,255,0.8)',
          hover: 'rgba(255,255,255,0.9)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      backdropBlur: {
        md: '12px',
        lg: '16px',
        xl: '24px',
      },
      boxShadow: {
        soft: '0 10px 40px -10px rgba(0,0,0,0.08)',
        glow: '0 0 20px rgba(255,107,53,0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      }
    },
  },
  plugins: [],
}
