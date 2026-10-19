import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    screens: {
      // Add xs breakpoint (480px) for narrow-phone→small-phone transitions
      xs: '480px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        // 60% — warm ivory/beige canvas
        ivory: {
          DEFAULT: '#F5F0E6',
          50: '#FDFBF7',
          100: '#F9F5ED',
          200: '#F5F0E6',
          300: '#EDE4D0',
          400: '#E0D3B8',
        },
        // 30% — forest green (navigation, headings, key surfaces)
        forest: {
          DEFAULT: '#244B3C',
          50: '#E8F0ED',
          100: '#C5D9D2',
          200: '#8CB4A6',
          300: '#4E8272',
          400: '#2E6052',
          500: '#244B3C',
          600: '#1A3B2E',
          700: '#112B20',
          800: '#091B13',
          900: '#040D09',
        },
        // 10% — muted terracotta (primary actions, highlights)
        terra: {
          DEFAULT: '#C77D55',
          50: '#FAF0E9',
          100: '#F2D9C8',
          200: '#E5B396',
          300: '#D89068',
          400: '#C77D55',
          500: '#B56840',
          600: '#8F5231',
          700: '#693C23',
          800: '#432715',
          900: '#1E1108',
        },
        // Semantic
        success: '#2D7A4F',
        warning: '#B97D1A',
        danger: '#C0392B',
        muted: '#8A8A8A',
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        sans: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(36,75,60,0.06), 0 4px 16px 0 rgba(36,75,60,0.04)',
        'card-hover': '0 4px 12px 0 rgba(36,75,60,0.10), 0 8px 32px 0 rgba(36,75,60,0.08)',
        float: '0 8px 32px 0 rgba(36,75,60,0.14)',
      },
      backgroundImage: {
        'ivory-grain':
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")",
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.02em',
        wide: '0.06em',
        wider: '0.1em',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-gentle': 'pulseGentle 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGentle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
}

export default config
