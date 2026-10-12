// 產生 App 圖示：NODE_PATH=$(npm root -g) node scripts/make-icons.mjs（需要 Playwright 與 Chromium）
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';

// 用 require 才能讀到全域安裝的 Playwright（NODE_PATH）
const { chromium } = createRequire(import.meta.url)('playwright');

const plane = '<path d="M2.5 13.5l7 1.5 4 6h2l-1.5-6.5 5-1c1.2-.3 1.7-1.6 1-2.5-.4-.5-1-.7-1.6-.6l-5 1L9 3.5H7l2 7.5-5 .5-1.5-2H1z" fill="#fff"/>';
// pad：圖案離邊緣的比例；maskable 圖示要留更多空間
const svg = (size, pad, round) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${round ? 22 : 0}" fill="#1e3a5f"/>
  <circle cx="72" cy="30" r="${10 * (1 - pad)}" fill="#f2a65a"/>
  <path d="M0 78 Q25 68 50 76 T100 74 V100 H0z" fill="#2c5a8a"/>
  <g transform="translate(${50 - 32 * (1 - pad)} ${50 - 32 * (1 - pad)}) scale(${(64 / 24) * (1 - pad)})">${plane}</g>
</svg>`;

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('icon.svg', out), svg(512, 0.1, true));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
for (const [name, size, pad, round] of [['icon-192.png', 192, 0.1, false], ['icon-512.png', 512, 0.1, false], ['icon-maskable-512.png', 512, 0.3, false], ['apple-touch-icon.png', 180, 0.15, false]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}</style>${svg(size, pad, round)}`);
  writeFileSync(new URL(name, out), await page.screenshot({ omitBackground: false }));
}
await browser.close();
