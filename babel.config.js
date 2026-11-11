// Babel config for the native apps (Metro). The web build (Vite) configures Babel in vite.config.mjs.
const { PUBLIC_ENV_KEYS, loadEnv } = require('./scripts/env');

loadEnv();

module.exports = function (api) {
  // Re-run when public env values change (Metro also needs `npm start -- --reset-cache`).
  api.cache.using(() => PUBLIC_ENV_KEYS.map((k) => process.env[k] ?? '').join('|'));

  return {
    // nativewind/babel = className support + JSX runtime + Reanimated plugin.
    presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
    plugins: [
      ['module-resolver', { root: ['.'], alias: { '@': './src' }, extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'] }],
      ['transform-inline-environment-variables', { include: PUBLIC_ENV_KEYS }],
    ],
  };
};
