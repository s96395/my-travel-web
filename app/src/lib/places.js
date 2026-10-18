// Google 地圖「已儲存」清單匯入：解析 Google 匯出（Takeout）的清單 CSV；座標從連結算出，算不出來（例如短網址）才到 /api/place 查

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

// Google 地圖地點連結裡的 !1s0x…:0x… 是地點代碼，前半段是 S2 格子編號，可以直接換算成經緯度，不用連到 Google
const POS_TO_IJ = [[0, 1, 3, 2], [0, 2, 3, 1], [3, 2, 0, 1], [3, 1, 0, 2]];
const POS_TO_ORI = [1, 0, 0, 3];
export function s2ToLatLng(hex) {
  const id = BigInt(hex);
  const face = Number(id >> 61n);
  let ori = face & 1, i = 0, j = 0;
  for (let k = 0; k < 30; k++) {
    const pos = Number((id >> BigInt(59 - 2 * k)) & 3n);
    const ij = POS_TO_IJ[ori][pos];
    i = i * 2 + (ij >> 1); j = j * 2 + (ij & 1);
    ori ^= POS_TO_ORI[pos];
  }
  const uv = s => (s >= 0.5 ? (4 * s * s - 1) / 3 : (1 - 4 * (1 - s) * (1 - s)) / 3);
  const u = uv((i + 0.5) / 2 ** 30), v = uv((j + 0.5) / 2 ** 30);
  const [x, y, z] = [[1, u, v], [-u, 1, v], [-u, -v, 1], [-1, -v, -u], [v, -1, -u], [v, u, -1]][face];
  const r = n => Math.round(n * 1e6) / 1e6;
  return { lat: r(Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI), lng: r(Math.atan2(y, x) * 180 / Math.PI) };
}

// 從 Google 地圖連結取座標：先看地點標記 !3d!4d，再看地點代碼；網址上的 @緯度,經度 是畫面中心，不一定是地點，不採用
export function coordsFromUrl(url) {
  const s = decodeURIComponent(String(url || ''));
  const m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2] };
  const f = s.match(/(?:!1s|ftid=)(0x[0-9a-f]{6,16}):0x[0-9a-f]+/i);
  return f ? s2ToLatLng(f[1]) : null;
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
        const c = d?.url ? coordsFromUrl(d.url) : null; // 短網址展開後的完整網址
        if (c) out[i] = c;
        else if (d && Number.isFinite(d.lat) && Number.isFinite(d.lng)) out[i] = { lat: d.lat, lng: d.lng };
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
