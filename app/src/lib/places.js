// Google 地圖「已儲存」清單匯入：解析 Google 匯出（Takeout）的清單 CSV，再到 /api/place 查座標

// 簡易 CSV 解析（支援雙引號裡的逗號、換行與 "" 跳脫）
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// 欄位名稱依匯出時的語言不同：中文「標題、筆記、網址」，英文「Title、Note、URL」
const COLS = { title: ['標題', 'title'], note: ['筆記', 'note'], url: ['網址', 'url'] };

// 回傳 [{ title, note, url }]；不是清單格式時回傳 null
export function parseSavedList(text) {
  const [head, ...rows] = parseCsv(text);
  if (!head) return null;
  const idx = {};
  for (const [k, names] of Object.entries(COLS)) idx[k] = head.findIndex(h => names.includes(h.trim().toLowerCase()));
  if (idx.title < 0 || idx.url < 0) return null;
  return rows
    .map(r => ({ title: (r[idx.title] || '').trim(), note: idx.note < 0 ? '' : (r[idx.note] || '').trim(), url: (r[idx.url] || '').trim() }))
    .filter(p => p.title && /^https:\/\//.test(p.url));
}

// 同時最多查 3 個，避免一次打太多次
export async function findCoords(places, fetcher = fetch, onEach = () => {}) {
  let next = 0;
  const out = new Array(places.length).fill(null);
  async function worker() {
    while (next < places.length) {
      const i = next++;
      try {
        const res = await fetcher(`/api/place?url=${encodeURIComponent(places[i].url)}`);
        const d = res.ok ? await res.json() : null;
        if (d && Number.isFinite(d.lat) && Number.isFinite(d.lng)) out[i] = { lat: d.lat, lng: d.lng };
      } catch { /* 查不到就留空 */ }
      onEach(i, out[i]);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return out;
}

// 兩點直線距離（公里）
export function distanceKm(a, b) {
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const hasXY = p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng);

// 想去清單依「離這天行程多近」排序：每個地點算到這天最近一個行程的距離；這天沒有座標就維持原順序
export function nearDay(places, dayItems) {
  const anchors = dayItems.filter(hasXY);
  const list = places.map((p, i) => ({ ...p, km: anchors.length && hasXY(p) ? Math.min(...anchors.map(a => distanceKm(a, p))) : null, i }));
  if (!anchors.length) return list;
  return list.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.i - b.i);
}

// 距離顯示：1 公里內用公尺
export const kmText = km => (km < 1 ? `${Math.max(50, Math.round(km * 20) * 50)} 公尺` : `${km < 10 ? km.toFixed(1) : Math.round(km)} 公里`);
