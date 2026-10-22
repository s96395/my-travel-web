// 每日行程：沿用舊版 itinerary 子集合欄位（day、order、title、area、type、priority、reservationTime、note）
import { coordsFromUrl } from './places.js';
export const ITEM_TYPES = ['attraction', 'restaurant', 'cafe', 'shopping', 'transport', 'stay', 'other'];
export const ITEM_LABEL = { attraction: '景點', restaurant: '餐廳', cafe: '咖啡', shopping: '購物', transport: '交通', stay: '住宿', other: '其他' };
export const ITEM_ICON = { attraction: '📍', restaurant: '🍽️', cafe: '☕', shopping: '🛍️', transport: '🚆', stay: '🏨', other: '📝' };
export const PRIORITIES = ['must', 'want', 'optional'];
export const PRIORITY_LABEL = { must: '必去', want: '想去', optional: '有空再去' };

const num = v => (v === '' || v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// 舊資料有 activity、location 等舊欄位名，這裡統一成畫面用的形狀；day 不是正整數時記為 0（還沒排天數）
export function normalizeItem(raw) {
  const day = num(raw.day);
  return {
    id: raw.id,
    day: day && day >= 1 && Number.isInteger(day) ? day : 0,
    order: num(raw.order),
    title: raw.title || raw.activity || '未命名行程',
    area: raw.area || raw.location || '',
    address: raw.address || '',
    type: ITEM_TYPES.includes(raw.type) ? raw.type : 'other',
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : '',
    time: raw.reservationTime || '',
    note: raw.note || '',
    legacyTime: raw.time || '',
    createdByUid: raw.createdByUid || '', // 建立者，判斷能不能刪除
    // 座標：查過 Google 的精確位置（exact）優先；其次由地點連結算出大約位置，再來用存下來的
    exact: !!raw.exact && Number.isFinite(raw.lat),
    ...((!raw.exact && coordsFromUrl(raw.address)) || { lat: Number.isFinite(raw.lat) ? raw.lat : null, lng: Number.isFinite(raw.lng) ? raw.lng : null }),
  };
}

// 同舊版：先比天數，再比順序（有順序的排前面），最後比時間與 ID
export function sortItems(items) {
  return [...items].sort((a, b) => {
    if (a.day !== b.day) return (a.day || Infinity) - (b.day || Infinity);
    const ao = a.order !== null, bo = b.order !== null;
    if (ao && bo && a.order !== b.order) return a.order - b.order;
    if (ao !== bo) return ao ? -1 : 1;
    return String(a.legacyTime).localeCompare(String(b.legacyTime)) || String(a.id).localeCompare(String(b.id));
  });
}

// 天數以旅程日期為準；有行程排在範圍外時，把天數延長到那一天
export function planDays(items, tripDayCount) {
  const maxDay = items.reduce((m, it) => Math.max(m, it.day), 0);
  return Math.max(tripDayCount || 0, maxDay, 1);
}

export function itemsOfDay(items, day) {
  return sortItems(items.filter(it => it.day === day));
}

// 這一天的區域（舊版當作天數標題用）
export function dayAreas(items, day) {
  return [...new Set(items.filter(it => it.day === day).map(it => it.area).filter(Boolean))];
}

export function nextOrder(items, day) {
  return items.filter(it => it.day === day && it.order !== null).reduce((m, it) => Math.max(m, it.order), 0) + 1;
}

// 計算移動後要寫回的欄位：target = { day, beforeId } 或 { day }（放到最後）
// 只回傳 day 或 order 有變的項目
export function planMove(items, id, target) {
  const moving = items.find(it => it.id === id);
  if (!moving) return [];
  const fromDay = moving.day, toDay = target.day;
  const lists = new Map();
  for (const d of new Set([fromDay, toDay])) lists.set(d, itemsOfDay(items, d).filter(it => it.id !== id));
  const dest = lists.get(toDay);
  const at = target.beforeId ? dest.findIndex(it => it.id === target.beforeId) : -1;
  dest.splice(at < 0 ? dest.length : at, 0, moving);
  const updates = [];
  for (const [d, list] of lists) {
    if (d === 0 && d !== toDay) continue; // 還沒排天數的項目不重新編號
    list.forEach((it, i) => {
      if (it.day !== d || it.order !== i + 1 || it.id === id && fromDay !== toDay) updates.push({ id: it.id, day: d, order: i + 1 });
    });
  }
  return updates;
}

/* ---------- 地圖（規格書 F23）：每個行程可開 Google 地圖，每天串成一條路線 ---------- */
// 地址欄也可以貼 Google 地圖的分享連結（含 maps.app.goo.gl 短網址）
const GOOGLE_HOST = /^((www|maps)\.)?google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;
export function isMapLink(s) {
  let u;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const h = u.hostname;
  if (h === 'maps.app.goo.gl') return true;
  if (h === 'goo.gl') return u.pathname.startsWith('/maps/');
  return GOOGLE_HOST.test(h) && (h.startsWith('maps.') || u.pathname.startsWith('/maps'));
}
// 有填地址用地址，沒有（或貼的是連結）就用名稱＋區域＋城市搜尋；連結不能放進路線網址
// 名稱裡的表情符號和「｜」會讓 Google 找不到地點，搜尋前先拿掉
const cleanName = s => String(s || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/[｜|]/g, ' ').replace(/\s+/g, ' ').trim();
export const placeQuery = (it, city = '') => (it.address && !isMapLink(it.address) ? it.address : [cleanName(it.title), it.area, city].filter(Boolean).join(' '));
// 交通、其他（例如「搭新幹線」「自由活動」）沒填地址就不放進路線
export const onMap = it => !!it.address || !['transport', 'other'].includes(it.type);
// 有座標（從想去清單加進來的）就用座標，位置最準
export const routeStops = (items, city) => items.filter(onMap).map(it => (Number.isFinite(it.lat) && Number.isFinite(it.lng) ? `${it.lat},${it.lng}` : placeQuery(it, city)));
export const placeUrl = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
// 單一行程的「地圖」：貼了連結就直接開那個地點，不然用搜尋
export const placeHref = (it, city = '') => (isMapLink(it.address) ? it.address : placeUrl(placeQuery(it, city)));
// 手機的「導航」：從目前位置導航到這個行程；貼了連結就開那個地點（連結沒辦法當目的地）
export const navHref = (it, city = '') => (isMapLink(it.address) ? it.address : `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: placeQuery(it, city) })}`);

// 開啟完整路線（Google 地圖網址，不需要金鑰）；中途點 Google 最多收 9 個，超過的只留前 9 個
export function routeUrl(stops) {
  if (stops.length < 2) return stops.length ? placeUrl(stops[0]) : '';
  const p = new URLSearchParams({ api: '1', origin: stops[0], destination: stops.at(-1) });
  if (stops.length > 2) p.set('waypoints', stops.slice(1, -1).slice(0, 9).join('|'));
  return `https://www.google.com/maps/dir/?${p}`;
}

// 嵌入的路線小視窗（Maps Embed API，要金鑰；中途點最多 20 個）
export function embedUrl(stops, key) {
  if (!key || !stops.length) return '';
  if (stops.length === 1) return `https://www.google.com/maps/embed/v1/place?${new URLSearchParams({ key, q: stops[0], language: 'zh-TW' })}`;
  const p = new URLSearchParams({ key, origin: stops[0], destination: stops.at(-1), language: 'zh-TW' });
  if (stops.length > 2) p.set('waypoints', stops.slice(1, -1).slice(0, 20).join('|'));
  return `https://www.google.com/maps/embed/v1/directions?${p}`;
}

/* ---------- 區域（母）與地點（子）：區域可以整塊排進某一天，底下的地點跟著過去 ---------- */
// 依區域分組，保留原本的先後（第一個出現的區域排前面），沒有區域的放最後
export function groupByArea(list) {
  const m = new Map();
  for (const p of list) {
    const a = (p.area || '').trim();
    if (!m.has(a)) m.set(a, []);
    m.get(a).push(p);
  }
  return [...m].sort(([a], [b]) => !a - !b).map(([area, places]) => ({ area, places }));
}

// 整個區域移到別天：這天同區域的行程照原本順序接到目標那天最後；回傳格式同 planMove
export function planAreaMove(items, fromDay, area, toDay) {
  if (!area || fromDay === toDay) return [];
  let list = items;
  for (const it of itemsOfDay(items, fromDay).filter(x => x.area === area)) {
    const byId = new Map(planMove(list, it.id, { day: toDay }).map(u => [u.id, u]));
    list = list.map(x => (byId.has(x.id) ? { ...x, ...byId.get(x.id) } : x));
  }
  const old = new Map(items.map(x => [x.id, x]));
  return list.filter(x => old.get(x.id).day !== x.day || old.get(x.id).order !== x.order).map(x => ({ id: x.id, day: x.day, order: x.order }));
}

// 地圖上每個區域一種顏色（照名稱排序後輪流用，換天也不會變色）；沒分區域的維持紅色。避開行程針的橘色
export const NO_AREA_COLOR = '#e03131';
const AREA_COLORS = ['#1c7ed6', '#2f9e44', '#7048e8', '#0c8599', '#d6336c', '#8d5524', '#5c940d', '#364fc7'];
export function areaColors(list) {
  const names = [...new Set(list.map(p => (p.area || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  return new Map(names.map((a, i) => [a, AREA_COLORS[i % AREA_COLORS.length]]));
}
