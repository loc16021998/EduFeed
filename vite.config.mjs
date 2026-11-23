// Web build: React Native code rendered with react-native-web, bundled by Vite.
//   npm run dev        → dev server with hot reload
//   npm run build:web  → static site in dist/
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, transformWithEsbuild } from 'vite';

const require = createRequire(import.meta.url);
const { PUBLIC_ENV_KEYS, loadEnv } = require('./scripts/env.js');
loadEnv();

// Windows: VS Code terminals often start in "c:\…" while Node reports "C:\…". Vite then fails to
// match index.html's inline <style> ("No matching HTML proxy module"), so pin one drive-letter case.
const root = path.dirname(fileURLToPath(import.meta.url)).replace(/^[a-z]:/, (d) => d.toUpperCase());

/**
 * Web OTA: every build writes /version.json with its build id. Open apps compare it with the id they were
 * built with (src/services/updateService.ts) and offer "Cập nhật ngay" (reload) when a new deploy is live.
 *   UPDATE_CRITICAL=1  → the running app asks to reload right away (hotfix)
 *   UPDATE_NOTES_VI=…  → one line shown in the banner
 * Served with Cache-Control: no-store (vercel.json).
 */
const versionManifest = {
  name: 'thedu-version-manifest',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({
        buildId: process.env.PUBLIC_BUILD_ID,
        version: process.env.PUBLIC_APP_VERSION,
        critical: process.env.UPDATE_CRITICAL === '1' || process.env.UPDATE_CRITICAL === 'true',
        notes: (process.env.UPDATE_NOTES_VI || '').slice(0, 200),
        builtAt: new Date().toISOString(),
      }),
    });
  },
};

/**
 * Some RN libraries publish JSX in plain .js files (e.g. react-native-qrcode-svg, and NativeWind's
 * doctor.js, which uses a hyphenated tag). Compile it for the production build.
 */
const jsxInNodeModules = {
  name: 'rn-jsx-in-node-modules',
  enforce: 'pre',
  async transform(code, id) {
    const file = id.split('?')[0];
    if (!/node_modules[\\/].+\.js$/.test(file) || !/<\/?[A-Za-z][\w.-]*[\s/>]/.test(code)) return null;
    return transformWithEsbuild(code, file, { loader: 'jsx', jsx: 'automatic' });
  },
};

// Prefer `.web.*` files, like Metro does for platform-specific files.
const extensions = ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'];

export default defineConfig(({ mode }) => {
  const dev = mode !== 'production';
  return {
    root,
    plugins: [
      jsxInNodeModules,
      versionManifest,
      react({
        jsxImportSource: 'react-native-css-interop',
        babel: {
          // Same NativeWind preset as native (className + Reanimated plugin), plus public env inlining.
          presets: ['nativewind/babel'],
          plugins: [['transform-inline-environment-variables', { include: PUBLIC_ENV_KEYS }]],
        },
      }),
    ],
    define: {
      __DEV__: JSON.stringify(dev),
      'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
    },
    resolve: {
      extensions,
      alias: [
        { find: /^react-native$/, replacement: 'react-native-web' },
        { find: /^@\//, replacement: `${path.join(root, 'src')}/` },
      ],
    },
    optimizeDeps: {
      esbuildOptions: {
        // Many React Native libraries ship JSX inside .js files.
        loader: { '.js': 'jsx' },
        resolveExtensions: extensions,
        define: { global: 'globalThis', __DEV__: JSON.stringify(dev) },
      },
    },
    build: {
      outDir: 'dist',
      commonjsOptions: { transformMixedEsModules: true },
    },
    server: { port: 5173, open: false },
  };
});
