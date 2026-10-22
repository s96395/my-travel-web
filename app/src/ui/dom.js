export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => Math.round(Number(n) || 0).toLocaleString('zh-TW');

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 私密瀏覽等情況可忽略 */ } },
};

// 內文用的線條小圖示：跟著文字大小與顏色，取代表情符號
const ic = d => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICON = {
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4M8 14h3M8 17h6"/></svg>',
  todo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 12l3 3 5-6"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.8"/><path d="M2.5 10h2M19.5 15h2"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  dive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/><path d="M2 14c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/><circle cx="8" cy="19.5" r="1.3"/><circle cx="13" cy="20.5" r="0.9"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  plane: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 13.5l7 1.5 4 6h2l-1.5-6.5 5-1c1.2-.3 1.7-1.6 1-2.5-.4-.5-1-.7-1.6-.6l-5 1L9 3.5H7l2 7.5-5 .5-1.5-2H1z"/></svg>',
  pin: ic('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  bag: ic('<path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7"/><rect x="4.5" y="7" width="15" height="14" rx="3"/><path d="M4.5 13h15M10 13v2h4v-2"/>'),
  bus: ic('<rect x="4.5" y="3.5" width="15" height="14" rx="3"/><path d="M4.5 11h15M8 20.5v-3M16 20.5v-3"/><circle cx="8.5" cy="14.3" r=".6"/><circle cx="15.5" cy="14.3" r=".6"/>'),
  train: ic('<rect x="5.5" y="3.5" width="13" height="14" rx="3"/><path d="M5.5 11h13M9 21l1.5-3.5M15 21l-1.5-3.5"/><circle cx="9" cy="14.3" r=".6"/><circle cx="15" cy="14.3" r=".6"/>'),
  bed: ic('<path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11.5" r="1.8"/>'),
  food: ic('<path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10"/><path d="M17 21V3c-2 1.5-3 4-3 7v3h3"/>'),
  cafe: ic('<path d="M4.5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V9z"/><path d="M16.5 10.5h1.5a2.5 2.5 0 0 1 0 5h-2M8 3.5v2.5M12 3.5v2.5"/>'),
  shop: ic('<path d="M5 8h14l-1 12.5H6L5 8z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>'),
  ticket: ic('<path d="M3.5 8a2 2 0 0 0 0 4 2 2 0 0 1 0 4v2.5h17V16a2 2 0 0 1 0-4 2 2 0 0 0 0-4V5.5h-17V8z"/><path d="M14.5 8v1.5M14.5 11.25v1.5M14.5 14.5V16"/>'),
  passport: ic('<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10.5" r="3"/><path d="M9 17h6"/>'),
  signal: ic('<path d="M5 20v-3M9.7 20v-6M14.3 20v-9M19 20V5"/>'),
  note: ic('<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8.5h5M9 13h7M9 16.5h5"/>'),
  box: ic('<path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5L12 11.5l8.5-4M12 11.5v9"/>'),
  camera: ic('<path d="M4 8.5h3.2L9 6h6l1.8 2.5H20v11H4z"/><circle cx="12" cy="13.5" r="3.3"/>'),
  phone: ic('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'),
  sliders: ic('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  map: ic('<path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>'),
  google: '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
};

// 標題列的淺色／深色切換：兩個圖示都放，由 CSS 依目前外觀決定顯示哪個（淺色時顯示月亮，按了變深色）
export const themeBtn = () => `<button type="button" class="iconbtn thm" data-act="toggleTheme" aria-label="切換淺色或深色" title="切換淺色或深色">${ic('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>').replace('class="ic"', 'class="ic moon"')}${ic('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>').replace('class="ic"', 'class="ic sun"')}</button>`;

// 旅程類型的小圖示（自由行、跟團、潛旅）
export const TYPE_ICO = {
  '自由行': ICON.bag,
  '跟團': ICON.bus,
  '潛旅': ic('<path d="M2.5 9c2.4-1.8 4.3-1.8 6.7 0s4.3 1.8 6.6 0 4.3-1.8 5.7 0"/><path d="M2.5 14.5c2.4-1.8 4.3-1.8 6.7 0s4.3 1.8 6.6 0 4.3-1.8 5.7 0"/><circle cx="9" cy="19.5" r="1.2"/><circle cx="13.5" cy="20.5" r=".8"/>'),
};

let toastTimer;
export function toast(msg, action) {
  const el = $('#toastSlot');
  el.innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${action ? `<button type="button" data-act="${esc(action[1])}">${esc(action[0])}</button>` : ''}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.innerHTML = ''; }, action ? 8000 : 2600);
}

export function openSheet(html) {
  $('#layer').innerHTML = `<div class="sheet-layer" data-act="bg"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
  $('#layer .sheet input, #layer .sheet button')?.focus({ preventScroll: true });
}

export function closeSheet() {
  $('#layer').innerHTML = '';
}

export const sheetOpen = () => !!$('#layer .sheet');
