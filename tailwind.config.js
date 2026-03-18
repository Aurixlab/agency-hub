/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf8ef',
          100: '#f9edd4',
          200: '#f3d9a8',
          300: '#ecc072',
          400: '#e5a83e',
          500: '#d4952a',
          600: '#b87620',
          700: '#99591d',
          800: '#7d471e',
          900: '#673b1c',
          950: '#3a1d0b',
        },
        surface: {
          0: '#ffffff',
          50: '#f7f7f7',
          100: '#efefef',
          200: '#e0e0e0',
          300: '#c8c8c8',
          400: '#8a8a8a',
          500: '#5c5c5c',
          600: '#3d3d3d',
          700: '#2a2a2a',
          800: '#1a1a1a',
          900: '#111111',
          950: '#080808',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 8px 25px -5px rgb(0 0 0 / 0.08), 0 4px 10px -6px rgb(0 0 0 / 0.04)',
        'elevated': '0 12px 36px -8px rgb(0 0 0 / 0.12), 0 6px 12px -6px rgb(0 0 0 / 0.06)',
        'glow': '0 0 20px -4px rgb(184 118 32 / 0.25)',
        'drag': '0 20px 50px -10px rgb(0 0 0 / 0.18), 0 8px 16px -8px rgb(0 0 0 / 0.1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) both',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'slide-in-right': 'slideInRight 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'modal-in': 'modalIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'overlay-in': 'overlayIn 0.25s ease-out both',
        'count-up': 'countUp 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) both',
        'stagger-1': 'slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.04s both',
        'stagger-2': 'slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.08s both',
        'stagger-3': 'slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.12s both',
        'stagger-4': 'slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.16s both',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        modalIn: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        overlayIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        countUp: {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.8)' },
          '60%': { transform: 'translateY(-2px) scale(1.05)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
    },
  },
  plugins: [],
};
