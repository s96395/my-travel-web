// 每日行程：沿用舊版 itinerary 子集合欄位（day、order、title、area、type、priority、reservationTime、note），新版加 stay（停留幾分鐘）
import { coordsFromUrl, distanceKm } from './places.js';
export const ITEM_TYPES = ['attraction', 'restaurant', 'cafe', 'shopping', 'transport', 'stay', 'other'];
export const ITEM_LABEL = { attraction: '景點', restaurant: '餐廳', cafe: '咖啡', shopping: '購物', transport: '交通', stay: '住宿', other: '其他' };
export const ITEM_ICON = { attraction: '📍', restaurant: '🍽️', cafe: '☕', shopping: '🛍️', transport: '🚆', stay: '🏨', other: '📝' };
export const PRIORITIES = ['must', 'want', 'optional'];
export const PRIORITY_LABEL = { must: '必去', want: '想去', optional: '有空再去' };

const num = v => (v === '' || v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// 舊資料有 activity、location 等舊欄位名，這裡統一成畫面用的形狀；day 不是正整數時記為 0（還沒排天數）
export function normalizeItem(raw) {
  const day = num(raw.day);
  // 自動查到的座標記著當時用什麼查（geoq）；之後名稱或地址改了，舊座標就不算數，地圖載入時重查
  const stale = !!raw.geoq && raw.geoq !== geoKey({ title: raw.title || raw.activity, address: raw.address });
  return {
    id: raw.id,
    // kind 'area'：整個區域排進這天，只佔一張卡片，底下的地點留在想去清單，到當地再挑
    kind: raw.kind === 'area' ? 'area' : '',
    day: day && day >= 1 && Number.isInteger(day) ? day : 0,
    order: num(raw.order),
    title: raw.title || raw.activity || '未命名行程',
    area: raw.area || raw.location || '',
    address: raw.address || '',
    type: ITEM_TYPES.includes(raw.type) ? raw.type : 'other',
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : '',
    time: raw.reservationTime || '',
    stay: num(raw.stay) > 0 ? num(raw.stay) : 0,
    note: raw.note || '',
    tip: raw.tip || '', // 一句提示：常駐顯示在名稱下面，20 字內
    timeText: raw.reservationTime ? '' : raw.timeText || '', // 沒有幾點時可以寫「午餐」「看完夕陽後」
    backupOf: raw.backupOf || '', // 是哪一站的備案；備案不排進時間軸，掛在那一站下面
    backupWhen: raw.backupWhen || '', // 什麼時候改去，例如「排隊超過 30 分鐘」
    legacyTime: raw.time || '',
    createdByUid: raw.createdByUid || '', // 建立者，判斷能不能刪除
    // 座標：查過 Google 的精確位置（exact）優先；其次由地點連結算出大約位置，再來用存下來的
    exact: !stale && !!raw.exact && Number.isFinite(raw.lat),
    ...((!raw.exact && coordsFromUrl(raw.address)) || (stale ? { lat: null, lng: null } : { lat: Number.isFinite(raw.lat) ? raw.lat : null, lng: Number.isFinite(raw.lng) ? raw.lng : null })),
  };
}

// 停留時間：90 → 「1 小時 30 分」
export const STAY_MINS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300];
export const stayText = m => (!m ? '' : [Math.floor(m / 60) ? `${Math.floor(m / 60)} 小時` : '', m % 60 ? `${m % 60} 分` : ''].filter(Boolean).join(' '));

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

// 備案掛在主要那一站下面，不算時間軸上的一站；主要那站被刪掉時，備案回到時間軸
export function itemsOfDay(items, day) {
  const ids = new Set(items.map(it => it.id));
  return sortItems(items.filter(it => it.day === day && !(it.backupOf && ids.has(it.backupOf))));
}
export const backupsOf = (items, id) => sortItems(items.filter(it => it.backupOf === id));

// 這一天的區域（舊版當作天數標題用）
export function dayAreas(items, day) {
  return [...new Set(itemsOfDay(items, day).map(it => it.area).filter(Boolean))];
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
// 比對名稱是不是同一個地方：拿掉表情符號和空白，只比「｜」前面那段，例如「🐰 Miffy 海雲台商店｜買水手服」和「Miffy 海雲台商店」
const bareName = s => String(s || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]/gu, '').split(/[｜|]/)[0].toLowerCase();
export const sameName = (a, b) => !!bareName(a) && bareName(a) === bareName(b);
// 自己打的行程沒有座標時，用地址（沒有就用名稱）請 Google 查位置；區域名稱像「○○一帶」會讓 Google 找錯，不放進去
export const geoKey = it => (it.address && !isMapLink(it.address) ? String(it.address).trim() : cleanName(it.title));
export const placeQuery = (it, city = '') => (it.address && !isMapLink(it.address) ? it.address : [cleanName(it.title), it.area, city].filter(Boolean).join(' '));
// 交通、其他（例如「搭新幹線」「自由活動」）沒填地址就不放進路線
export const onMap = it => !!it.address || !['transport', 'other'].includes(it.type);
// 有座標（從想去清單加進來的）就用座標，位置最準
export const routeStops = (items, city) => items.filter(onMap).map(it => (Number.isFinite(it.lat) && Number.isFinite(it.lng) ? `${it.lat},${it.lng}` : placeQuery(it, city)));
// 韓國的地點改開 Naver 地圖（Google 地圖在韓國不能開車、步行導航）
// 有座標就看座標在不在南韓範圍（大致的多邊形，避開對馬、福岡）；沒有座標就看旅程國家
const KR = [[124, 38.7], [132, 38.7], [132, 36.5], [129.6, 35.2], [129.2, 34.9], [127.8, 33.9], [126.8, 33], [125.8, 33], [124, 34.5]];
const inPoly = (x, y, poly) => poly.reduce((inside, [x1, y1], i) => {
  const [x2, y2] = poly[(i + 1) % poly.length];
  return (y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1 ? !inside : inside;
}, false);
export const inKorea = (p, country = '') => (Number.isFinite(p?.lat) && Number.isFinite(p?.lng) ? inPoly(p.lng, p.lat, KR) : /韓國|南韓|大韓民國|濟州/.test(country || ''));
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
// 手機直接開 Naver 地圖 App（nav＝導航，'walk' 是步行導航，不然只標出地點）；電腦沒有 App，開 Naver 地圖網頁搜尋
export function naverHref(p, query, nav = false) {
  const name = p?.title || query || '', app = typeof location === 'object' ? location.origin : '';
  const xy = Number.isFinite(p?.lat) && Number.isFinite(p?.lng);
  if (coarse()) {
    if (xy) return nav ? `nmap://route/${nav === 'walk' ? 'walk' : 'public'}?${new URLSearchParams({ dlat: p.lat, dlng: p.lng, dname: name, appname: app })}` : `nmap://place?${new URLSearchParams({ lat: p.lat, lng: p.lng, name, appname: app })}`;
    return `nmap://search?${new URLSearchParams({ query: query || name, appname: app })}`;
  }
  return `https://map.naver.com/p/search/${encodeURIComponent(query || name)}`;
}
export const mapName = (p, country = '') => (inKorea(p, country) ? 'Naver' : 'Google');
export const placeUrl = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
// 單一行程的「地圖」：貼了連結就直接開那個地點，不然用搜尋
export const placeHref = (it, city = '', country = '') => (inKorea(it, country) ? naverHref(it, placeQuery(it, city)) : isMapLink(it.address) ? it.address : placeUrl(placeQuery(it, city)));
// 手機的「導航」：從目前位置導航到這個行程；貼了連結就開那個地點（連結沒辦法當目的地）
export const navHref = (it, city = '', country = '') => (inKorea(it, country) ? naverHref(it, placeQuery(it, city), true) : isMapLink(it.address) ? it.address : `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: placeQuery(it, city) })}`);

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

// 區域卡片後面接的那段（同區域、從卡片加入的地點）結束在哪：回傳下一個不同區域的行程 id，沒有就是空字串
export function afterArea(items, cardId) {
  const card = items.find(x => x.id === cardId);
  if (!card) return '';
  const list = itemsOfDay(items, card.day), i = list.findIndex(x => x.id === cardId);
  const next = list.slice(i + 1).find(x => x.area !== card.area);
  return next ? next.id : '';
}

// 地圖上每個區域一種顏色（照名稱排序後輪流用，換天也不會變色）；沒分區域的維持紅色。避開行程針的橘色
export const NO_AREA_COLOR = '#e03131';
const AREA_COLORS = ['#1c7ed6', '#2f9e44', '#7048e8', '#0c8599', '#d6336c', '#8d5524', '#5c940d', '#364fc7'];
export function areaColors(list) {
  const names = [...new Set(list.map(p => (p.area || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  return new Map(names.map((a, i) => [a, AREA_COLORS[i % AREA_COLORS.length]]));
}

// ---------- 先分天，再自動排 ----------
const hasXY = p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng);

// 地點 p 放進這一天時，插在讓走路距離增加最少的位置
// 回傳 { beforeId（放在哪一項前面，'' 是最後）, prevId（排在哪一項後面，'' 是最前面） }
// 只看有座標的站（區域卡片、沒位置的不算）；不會插到第一個有座標的站前面，免得排到出發的地方之前
export function bestSpot(list, p) {
  const tail = { beforeId: '', prevId: list.length ? list[list.length - 1].id : '' };
  if (!hasXY(p)) return tail;
  const pts = list.map((it, i) => ({ it, i })).filter(x => hasXY(x.it) && x.it.kind !== 'area');
  if (!pts.length) return tail;
  const d = (a, b) => distanceKm(a, b);
  const last = pts[pts.length - 1];
  let best = { cost: d(last.it, p), at: last.i };
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k].it, b = pts[k + 1].it;
    const cost = d(a, p) + d(p, b) - d(a, b);
    if (cost < best.cost - 1e-9) best = { cost, at: pts[k].i };
  }
  return { beforeId: list[best.at + 1]?.id || '', prevId: list[best.at].id };
}

// 「要加在哪一天」：每天離這個點最近的站有多遠、有沒有同區域的點、這天是不是已經有它
// 回傳照推薦順序排好的清單；best 是最順路的那天（都沒有位置可比時，選有同區域的那天）
export function rankDays(items, days, p) {
  const rows = days.map(day => {
    const its = itemsOfDay(items, day);
    const xs = its.filter(it => hasXY(it) && it.kind !== 'area');
    const km = hasXY(p) && xs.length ? Math.min(...xs.map(it => distanceKm(it, p))) : null;
    const same = !!p.area && its.some(it => it.area === p.area);
    const has = p.kind === 'area' ? its.some(it => it.kind === 'area' && it.area === p.area)
      : its.some(it => it.kind !== 'area' && ((p.url && it.address === p.url) || (p.title && sameName(it.title, p.title))));
    return { day, n: its.length, km, same, has, best: false };
  });
  const open = rows.filter(r => !r.has);
  const near = open.filter(r => r.km !== null).sort((a, b) => a.km - b.km)[0] || open.find(r => r.same);
  if (near) near.best = true;
  const rank = r => (r.best ? 0 : r.has ? 4 : r.same ? 1 : r.km !== null ? 2 : 3);
  return rows.sort((a, b) => rank(a) - rank(b) || (a.km ?? Infinity) - (b.km ?? Infinity) || a.day - b.day);
}

// 一群地點的中心（整區排進某天時拿來比距離）
export function centerOf(list) {
  const xs = list.filter(hasXY);
  if (!xs.length) return {};
  return { lat: xs.reduce((s, p) => s + p.lat, 0) / xs.length, lng: xs.reduce((s, p) => s + p.lng, 0) / xs.length };
}
