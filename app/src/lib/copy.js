// 複製旅程（拿舊旅程當範本）：只產生要寫入的新資料，不動原本那趟
import { parseDate, toDateString, daysBetween } from './dates.js';
import { airportTz } from './flights.js';

// 可以選要不要帶過去的資料（子集合名稱 → 畫面上的名稱）；支出、公費、票券、潛水日誌不帶
export const COPY_PARTS = [
  ['itinerary', '每日行程'],
  ['wishlist', '想去清單'],
  ['flights', '班機'],
  ['stays', '住宿'],
  ['transits', '其他交通'],
  ['todos', '待辦'],
  ['packing', '我的行李清單'],
];
export const NOT_COPIED = '支出、公費、票券截圖、潛水日誌';

// 日期往後（或往前）挪 n 天；也處理「YYYY-MM-DD HH:MM」，時間不變
export function shiftDate(s, n) {
  const m = /^(\d{4}-\d{2}-\d{2})(.*)$/.exec(String(s || ''));
  if (!m || !n) return s;
  const d = parseDate(m[1]);
  d.setDate(d.getDate() + n);
  return toDateString(d) + m[2];
}

// 新的結束日：天數跟原本一樣
export const copyEnd = (trip, start) => (trip.startDate && trip.endDate ? shiftDate(trip.endDate, daysBetween(trip.startDate, start)) : start);

const META = ['id', 'createdByUid', 'createdByName', 'createdAt', 'updatedByUid', 'updatedByName', 'updatedAt'];
const clean = d => { const out = { ...d }; META.forEach(k => delete out[k]); return out; };

// 只挪有填的欄位，沒填的不要多出 undefined（Firestore 不收）
const shiftKeys = (d, keys, n) => { const out = { ...d }; keys.forEach(k => { if (out[k]) out[k] = shiftDate(out[k], n); }); return out; };
// 航段挪到別的季節，有夏令時間的機場時差要重算
function shiftFlight(d, n) {
  const out = shiftKeys(d, ['dep', 'arr'], n);
  [['from', 'dep', 'fromTz'], ['to', 'arr', 'toTz']].forEach(([ap, at, tz]) => { const z = out[ap] && out[at] ? airportTz(out[ap], out[at]) : ''; if (z) out[tz] = z; });
  return out;
}

// 每一種資料要怎麼改：日期跟著挪、勾選狀態清掉
const FIX = {
  itinerary: (d, n, ids) => ({ ...d, ...(d.book === 'done' ? { book: 'need' } : {}), ...(d.backupOf ? { backupOf: ids.get(d.backupOf) || '' } : {}) }),
  wishlist: d => ({ ...d, visited: false }),
  flights: (d, n) => shiftFlight(d, n),
  stays: (d, n) => shiftKeys(d, ['checkInDate', 'checkOutDate'], n),
  transits: (d, n) => shiftKeys(d, ['dep', 'arr'], n),
  todos: d => ({ ...d, done: false }),
  packing: d => ({ ...d, done: false }),
};

// trip：原本旅程的原始欄位；subs：{ 子集合名稱: [原始資料] }
// opt：{ title, startDate, parts: Set(要帶的子集合), people: 帶不帶同行者名單, uid, nickname, newId: () => 新的文件 id }
// 回傳 { trip: 新旅程欄位（不含時間戳記與邀請碼）, subs: { 名稱: [{ id, data }] } }
export function planCopy(trip, subs, opt) {
  const n = trip.startDate ? daysBetween(trip.startDate, opt.startDate) : 0;
  const people = Object.entries(trip.participants && typeof trip.participants === 'object' ? trip.participants : {})
    .sort((a, b) => (Number(a[1].order) || 0) - (Number(b[1].order) || 0));
  // 同行者沿用原本的 ID，公費保管人才對得上；只保留我自己的帳號綁定，其他人要再從常用旅伴綁定，不會自動變成共編成員
  const kept = opt.people ? people.filter(([, p]) => p.status !== 'inactive') : people.filter(([, p]) => p.uid === opt.uid);
  const participants = {};
  kept.forEach(([id, p], i) => { participants[id] = { name: p.name || '未命名', uid: p.uid === opt.uid ? opt.uid : '', order: i + 1, status: 'active' }; });
  if (!kept.some(([, p]) => p.uid === opt.uid)) participants[opt.newId()] = { name: opt.nickname, uid: opt.uid, order: kept.length + 1, status: 'active' };
  const keeper = trip.fund?.keeper;
  const out = {
    title: opt.title,
    country: trip.country || '',
    city: trip.city || '',
    tripType: trip.tripType || '自由行',
    startDate: opt.startDate,
    endDate: copyEnd(trip, opt.startDate),
    status: '規劃中',
    totalExpense: 0,
    totalTanks: 0,
    ownerId: opt.uid,
    ownerName: opt.nickname,
    memberIds: [opt.uid],
    participants,
    createdByName: opt.nickname,
    copiedFrom: trip.id || '',
    ...(trip.fund?.on ? { fund: { on: true, ...(keeper && participants[keeper] ? { keeper } : {}) } } : {}),
  };
  // 舊版單筆班機格式（只有少數舊旅程有）也一起挪日期
  if (opt.parts.has('flights') && trip.flight && typeof trip.flight === 'object') out.flight = shiftKeys(trip.flight, ['depDate', 'retDate'], n);
  if (opt.parts.has('stays') && trip.hotel && typeof trip.hotel === 'object') out.hotel = { ...trip.hotel };

  const result = {};
  for (const [name] of COPY_PARTS) {
    if (!opt.parts.has(name)) continue;
    let list = subs[name] || [];
    if (name === 'packing') list = list.filter(d => d.uid === opt.uid);
    // 先給每筆新 id，備案（backupOf）才能指到新的那一站
    const ids = new Map(list.map(d => [d.id, opt.newId()]));
    result[name] = list.map(d => ({ id: ids.get(d.id), data: FIX[name](clean(d), n, ids) }));
  }
  return { trip: out, subs: result };
}
