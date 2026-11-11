/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand palette — keep in sync with src/utils/constants.ts (COLORS)
        brand: {
          50: '#EEF4FF',
          100: '#DCE7FF',
          200: '#B3CBFF',
          500: '#2F6BFF',
          600: '#1E54E0',
          700: '#1A44B3',
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
        surface: '#F8FAFC',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
