// Web only: Vite compiles global.css with Tailwind. Native uses NativeWind's Metro transformer.
module.exports = {
  plugins: { tailwindcss: {} },
};
