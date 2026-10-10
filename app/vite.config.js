import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 依環境挑 Firebase 設定：本機開發用模擬器，Vercel 預覽用測試環境，正式網址用正式環境
function pickFirebaseEnv(command) {
  if (process.env.FIREBASE_ENV) return process.env.FIREBASE_ENV;
  if (command === 'serve') return 'emulator';
  return process.env.VERCEL_ENV === 'production' ? 'production' : 'test';
}

// 把設定輸出成 /firebase-config.json，網頁啟動時才從網路讀取（不進離線快取）
function firebaseConfigPlugin() {
  let file;
  const read = () => (existsSync(file) ? readFileSync(file, 'utf8') : null);
  return {
    name: 'firebase-config',
    configResolved(config) {
      file = resolve(config.root, `env/firebase.${pickFirebaseEnv(config.command)}.json`);
    },
    configureServer(server) {
      server.middlewares.use('/firebase-config.json', (req, res) => {
        const json = read();
        res.statusCode = json ? 200 : 404;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(json || '{}');
      });
    },
    generateBundle() {
      const json = read();
      if (json) this.emitFile({ type: 'asset', fileName: 'firebase-config.json', source: json });
      else this.warn(`找不到 ${file}，網頁會停在「無法讀取設定」畫面`);
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    firebaseConfigPlugin(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: '沈迷旅行',
        short_name: '沈迷旅行',
        description: '把嚮往的地方，都變成走過的路',
        lang: 'zh-Hant-TW',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f2f5f9',
        theme_color: '#1e3a5f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__\//, /^\/firebase-config\.json$/],
      },
    }),
  ],
  // Firebase 套件單獨一包，改版時只要重新下載自己的程式
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: { output: { manualChunks: id => (id.includes('node_modules/@firebase') || id.includes('node_modules/firebase') ? 'firebase' : undefined) } },
  },
  server: { port: 5173 },
}));
