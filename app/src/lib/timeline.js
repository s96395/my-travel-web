// 一天的時間軸：行程照原本順序，班機、其他交通、入住退房依時間插進去；
// 沒填時間的站，用前一站的時間加停留多久推算大約幾點到
import { distanceKm } from './places.js';

export const toMin = hm => { const m = /^(\d{1,2}):(\d{2})/.exec(hm || ''); return m ? +m[1] * 60 + +m[2] : null; };
export const hmOf = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const has = (text, s) => !!s && text.includes(String(s).toLowerCase());

// 沒填停留多久時，依類型抓一個時間來推算下一站幾點到（交通、住宿不停留）
export const DEFAULT_STAY = { attraction: 90, restaurant: 60, cafe: 60, shopping: 60, other: 60, transport: 0, stay: 0 };
// 班機落地後抓多久出關、拿行李、到市區
export const LAND_MIN = 90;
// 退房日搭機：建議起飛前多久到機場、從飯店到機場路上抓多久
export const AIRPORT_BEFORE = 150;
export const AIRPORT_TRAVEL = 60;

// 住宿的位置：行程裡排過的同名住宿（自己加的、或從 Google 加的）；只有一間住宿時，行程裡唯一的住宿就是它
const bare = s => String(s || '').toLowerCase().replace(/[\s・·\-–—()（）]/g, '');
function stayPlace(s, spots, one) {
  const n = bare(s.name);
  const hit = n && spots.find(p => { const t = bare(p.title); return t && (t.includes(n) || n.includes(t)); });
  return hit || (one && spots.length === 1 ? spots[0] : null);
}

// 交通住宿分頁的資料 → 這一天的事件；行程裡已經自己記過的（備註寫了班次、或已有住宿行程）就不重複
// 住在同一間的日子，頭尾自動加「從飯店出發」「回到飯店」；那天第一站或最後一站已經是住宿就不加
// spots：整趟行程裡有位置的住宿站，用來推算幾點回到飯店
export function dayEvents(date, { flights = [], transits = [], stays = [] }, items = [], spots = []) {
  if (!date) return [];
  const text = items.map(it => `${it.title} ${it.note}`).join(' ').toLowerCase();
  const ev = [];
  const move = (kind, r, title, no) => {
    const dep = r.dep?.slice(0, 10) === date, arr = r.arr?.slice(0, 10) === date;
    if ((!dep && !arr) || has(text, no)) return;
    const at = s => toMin(s.slice(11));
    // 班機落地當天，下一站從出關後開始算
    const land = kind === 'flight' && arr && at(r.arr) !== null;
    ev.push({ kind, id: r.id, t: dep ? at(r.dep) : at(r.arr), end: arr ? at(r.arr) : null, departs: dep, ...(land ? { ready: at(r.arr) + LAND_MIN } : {}), title, sub: [no, dep ? `${r.dep.slice(11)} 出發` : '', arr ? `${r.arr.slice(11)} 抵達` : '', land ? '落地後抓 1 小時 30 分出關' : ''].filter(Boolean).join('・') });
  };
  flights.forEach(f => move('flight', f, `${f.from || '?'} → ${f.to || '?'}`, f.flightNo));
  transits.forEach(t => move('transit', t, `${t.from || '?'} → ${t.to || '?'}`, t.number || ''));
  const stayIn = items.some(it => it.type === 'stay');
  const real = items.filter(it => it.kind !== 'area' && !it.backupOf);
  const firstStay = real[0]?.type === 'stay', lastStay = real.length > 0 && real[real.length - 1].type === 'stay';
  // 退房日當天起飛的班機：退房、出發去機場、班機都排在最後，出發時間＝起飛前 2 小時 30 分再往前抓路上 1 小時
  const fly = ev.find(e => e.kind === 'flight' && e.departs && e.t !== null);
  const leave = stays.some(s => s.checkOutDate === date) && fly && fly.t - AIRPORT_BEFORE - AIRPORT_TRAVEL >= 0 ? fly.t - AIRPORT_BEFORE - AIRPORT_TRAVEL : null;
  if (leave !== null) fly.pos = 'end';
  stays.forEach(s => {
    const place = stayPlace(s, spots, stays.length === 1);
    if (s.checkOutDate === date) {
      // 退房日：前一晚住這裡，第一站前面加「從飯店出發」；退房排在最後
      if (real.length && !firstStay && s.checkInDate < date) ev.push({ kind: 'home', id: s.id, pos: 'start', title: `從 ${s.name} 出發`, place });
      if (!has(text, '退房')) ev.push({ kind: 'out', id: s.id, pos: 'end', ...(leave !== null ? { t: leave } : {}), title: `退房・${s.name}`, place });
    }
    // 抵達日：還沒入住就加「入住」；行程裡已經有這間住宿（例如先去寄放行李）就加「回到飯店」
    if (s.checkInDate === date && !lastStay) {
      if (!stayIn && !has(text, s.name)) ev.push({ kind: 'in', id: s.id, pos: 'end', title: `入住・${s.name}`, place });
      else if (real.length) ev.push({ kind: 'home', id: s.id, pos: 'end', title: `回到 ${s.name}`, place });
    }
    if (real.length && s.checkInDate < date && date < s.checkOutDate) { // 還沒排行程的日子不加
      if (!firstStay) ev.push({ kind: 'home', id: s.id, pos: 'start', title: `從 ${s.name} 出發`, place });
      if (!lastStay) ev.push({ kind: 'home', id: s.id, pos: 'end', title: `回到 ${s.name}`, place });
    }
  });
  if (leave !== null) ev.push({ kind: 'airport', id: 'airport:' + fly.id, pos: 'end', t: leave, title: '出發去機場', sub: `起飛前 2 小時 30 分到機場，路上抓 ${AIRPORT_TRAVEL / 60} 小時` });
  return ev;
}

// 站與站的交通：兩站都有座標才算；1 公里內走路，其他搭大眾運輸
const hasXY = p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng);
export function legOf(a, b) {
  if (!hasXY(a) || !hasXY(b)) return null;
  const mode = distanceKm(a, b) < 1 ? 'WALKING' : 'TRANSIT';
  return { mode, key: [a.lat, a.lng, b.lat, b.lng].map(v => v.toFixed(5)).join(',') + ',' + mode };
}

// 沒查到交通時間時的粗估：1 公里內走路（每公里 15 分），其他搭車（等車 15 分＋每公里 3 分），以 5 分為單位
export function roughMin(a, b) {
  const km = distanceKm(a, b);
  const m = km < 1 ? km * 15 : 15 + km * 3;
  return Math.max(5, Math.ceil(m / 5) * 5);
}

// 合併行程與事件，算出每一列的時間 at（est＝推算的）、late＝前面排太滿趕不上這站填的時間
// legs：交通時間（分鐘）的快取，key 見 legOf；有的話推算時間會加上路上的時間，r.leg 是這站和上一站之間的交通
export function buildDay(items, events, legs = new Map()) {
  const rows = items.map(it => ({ kind: 'item', it, fixed: toMin(it.time) }));
  const anyTime = rows.some(r => r.fixed !== null);
  const timeOf = r => (r.kind === 'item' ? r.fixed : r.t);
  events.filter(e => !e.pos && e.t !== null).sort((a, b) => a.t - b.t).forEach(e => {
    // 放在最後一個時間比它早的列後面；行程都沒填時間時，中午前出發的放最前面、之後的放最後
    let i = 0;
    rows.forEach((r, k) => { if (timeOf(r) !== null && timeOf(r) <= e.t) i = k + 1; });
    if (!anyTime && e.t >= 720) i = rows.length;
    rows.splice(i, 0, { ...e });
  });
  rows.unshift(...events.filter(e => e.pos === 'start').map(e => ({ ...e, t: null })));
  // 排在最後的：有時間的（退房、出發去機場、班機）照時間排，沒時間的照原本順序
  const last = events.filter(e => e.pos === 'end').map(e => ({ ...e, t: e.t ?? null }));
  rows.push(...last.map((e, i) => [e, i]).sort((a, b) => (a[0].t ?? Infinity) - (b[0].t ?? Infinity) || a[1] - b[1]).map(x => x[0]));
  let clock = null, prev = null;
  for (const r of rows) {
    if (r.kind === 'item' && r.it.kind === 'area') {
      // 區域卡片不是實際的一站：顯示到這裡的推算時間，但不打斷前後兩站的交通與推算
      r.at = r.fixed ?? clock;
      r.est = r.fixed === null && r.at !== null;
    } else if (r.kind === 'item') {
      const leg = prev && legOf(prev, r.it);
      if (leg) r.leg = { ...leg, min: legs.get(leg.key) ?? null, from: prev };
      // 「有空再去」又沒填時間：顯示大約幾點到，但不算進後面的推算（去不去還不一定）
      if (r.it.priority === 'optional' && r.fixed === null) {
        r.at = clock !== null ? clock + (r.leg?.min ?? 0) : null;
        r.est = r.at !== null;
        r.skip = true;
        continue;
      }
      if (clock !== null && r.leg?.min != null) clock += r.leg.min;
      prev = r.it;
      r.at = r.fixed ?? clock;
      r.est = r.fixed === null && r.at !== null;
      r.late = r.fixed !== null && clock !== null && clock > r.fixed;
      // 沒填停留多久就依類型抓時間；住宿、交通不停留，時間接著往下算
      const st = r.it.stay || DEFAULT_STAY[r.it.type] || 0;
      clock = r.at !== null ? r.at + st : null;
    } else if (r.pos === 'end' && (r.kind === 'home' || r.kind === 'in') && hasXY(r.place)) {
      // 回到飯店：最後一站的推算時間加上路上的時間
      const leg = prev && legOf(prev, r.place);
      const min = leg ? legs.get(leg.key) ?? roughMin(prev, r.place) : null;
      r.at = clock !== null && min !== null ? clock + min : null;
      r.est = r.at !== null;
      if (r.est) r.sub = [r.sub, `${leg.mode === 'WALKING' ? '步行' : '搭車'}約 ${min} 分`].filter(Boolean).join('・');
    } else {
      r.at = r.t ?? null;
      clock = r.ready ?? r.end ?? null;
      // 從飯店出發：第一站的交通從飯店算起
      prev = r.pos === 'start' && hasXY(r.place) ? r.place : null;
    }
  }
  return rows;
}

// 「現在」要畫在第幾列之前：最後一個時間已過的列的下一列；這天沒有任何時間時回傳 -1
export function nowIndex(rows, now) {
  if (!rows.some(r => r.at !== null)) return -1;
  let i = 0;
  rows.forEach((r, k) => { if (r.at !== null && r.at <= now) i = k + 1; });
  return i;
}
