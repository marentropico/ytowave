/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Brand palette
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        accent: {
          DEFAULT: '#a78bfa',
          light:   '#c4b5fd',
          dark:    '#7c3aed',
        },
        surface: {
          DEFAULT: '#0f0f13',
          1:       '#16161d',
          2:       '#1d1d27',
          3:       '#252533',
          4:       '#2e2e40',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial':    'radial-gradient(var(--tw-gradient-stops))',
        'gradient-brand':     'linear-gradient(135deg, #6366f1 0%, #a78bfa 100%)',
        'gradient-dark-mesh': 'radial-gradient(at 40% 20%, hsla(249,91%,63%,0.12) 0px, transparent 50%), radial-gradient(at 80% 0%, hsla(270,80%,55%,0.10) 0px, transparent 50%)',
      },
      animation: {
        'fade-in':       'fadeIn 0.25s ease-out',
        'slide-up':      'slideUp 0.3s ease-out',
        'pulse-slow':    'pulse 3s ease-in-out infinite',
        'spin-slow':     'spin 3s linear infinite',
        'shimmer':       'shimmer 1.5s infinite',
        'glow':          'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        glow: {
          from: { boxShadow: '0 0 5px rgba(99,102,241,0.4), 0 0 20px rgba(99,102,241,0.2)' },
          to:   { boxShadow: '0 0 15px rgba(167,139,250,0.6), 0 0 40px rgba(99,102,241,0.3)' },
        },
      },
      boxShadow: {
        'brand-sm':  '0 0 10px rgba(99,102,241,0.3)',
        'brand-md':  '0 0 25px rgba(99,102,241,0.35)',
        'brand-lg':  '0 0 50px rgba(99,102,241,0.3)',
        'surface':   '0 4px 24px rgba(0,0,0,0.4)',
        'surface-lg':'0 8px 48px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
};
