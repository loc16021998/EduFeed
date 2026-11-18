/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand palette = TH EDU logo blue (#1278BE) — keep in sync with src/utils/constants.ts (COLORS)
        brand: {
          50: '#EEF6FC',
          100: '#D6EAF7',
          200: '#ADD4EF',
          500: '#1278BE',
          600: '#0F66A3',
          700: '#0C5285',
        },
        // Logo green (the H and pages)
        leaf: {
          50: '#F3F9EC',
          100: '#E3F1D2',
          500: '#8CC43F',
          600: '#74A831',
          700: '#5A8526',
        },
        accent: {
          100: '#FFEDD5',
          500: '#F97316',
          600: '#EA580C',
        },
        // Per-category colours used by Badge / chips
        cat: {
          tth: '#8B5CF6', // Tiền tiểu học
          lcd: '#EC4899', // Luyện chữ đẹp
          ttd: '#10B981', // Toán tư duy
          bd: '#F59E0B', // Bồi dưỡng Toán – TV
        },
        ink: {
          DEFAULT: '#0F172A',
          muted: '#64748B',
          subtle: '#94A3B8',
        },
        surface: '#F3F8F5', // soft mint-white from the logo's blue + green
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
