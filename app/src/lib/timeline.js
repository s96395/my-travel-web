// 一天的時間軸：行程照原本順序，班機、其他交通、入住退房依時間插進去；
// 沒填時間的站，用前一站的時間加停留多久推算大約幾點到
import { distanceKm } from './places.js';

export const toMin = hm => { const m = /^(\d{1,2}):(\d{2})/.exec(hm || ''); return m ? +m[1] * 60 + +m[2] : null; };
export const hmOf = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const has = (text, s) => !!s && text.includes(String(s).toLowerCase());

// 交通住宿分頁的資料 → 這一天的事件；行程裡已經自己記過的（備註寫了班次、或已有住宿行程）就不重複
export function dayEvents(date, { flights = [], transits = [], stays = [] }, items = []) {
  if (!date) return [];
  const text = items.map(it => `${it.title} ${it.note}`).join(' ').toLowerCase();
  const ev = [];
  const move = (kind, r, title, no) => {
    const dep = r.dep?.slice(0, 10) === date, arr = r.arr?.slice(0, 10) === date;
    if ((!dep && !arr) || has(text, no)) return;
    const at = s => toMin(s.slice(11));
    ev.push({ kind, id: r.id, t: dep ? at(r.dep) : at(r.arr), end: arr ? at(r.arr) : null, title, sub: [no, dep ? `${r.dep.slice(11)} 出發` : '', arr ? `${r.arr.slice(11)} 抵達` : ''].filter(Boolean).join('・') });
  };
  flights.forEach(f => move('flight', f, `${f.from || '?'} → ${f.to || '?'}`, f.flightNo));
  transits.forEach(t => move('transit', t, `${t.from || '?'} → ${t.to || '?'}`, t.number || ''));
  const stayIn = items.some(it => it.type === 'stay');
  stays.forEach(s => {
    if (s.checkOutDate === date && !has(text, '退房')) ev.push({ kind: 'out', id: s.id, pos: 'start', title: `退房・${s.name}` });
    if (s.checkInDate === date && !stayIn && !has(text, s.name)) ev.push({ kind: 'in', id: s.id, pos: 'end', title: `入住・${s.name}` });
  });
  return ev;
}

// 站與站的交通：兩站都有座標才算；1 公里內走路，其他搭大眾運輸
const hasXY = p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng);
export function legOf(a, b) {
  if (!hasXY(a) || !hasXY(b)) return null;
  const mode = distanceKm(a, b) < 1 ? 'WALKING' : 'TRANSIT';
  return { mode, key: [a.lat, a.lng, b.lat, b.lng].map(v => v.toFixed(5)).join(',') + ',' + mode };
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
  rows.push(...events.filter(e => e.pos === 'end').map(e => ({ ...e, t: null })));
  let clock = null, prev = null;
  for (const r of rows) {
    if (r.kind === 'item') {
      const leg = prev && legOf(prev, r.it);
      if (leg) r.leg = { ...leg, min: legs.get(leg.key) ?? null, from: prev };
      if (clock !== null && r.leg?.min != null) clock += r.leg.min;
      prev = r.it;
      r.at = r.fixed ?? clock;
      r.est = r.fixed === null && r.at !== null;
      r.late = r.fixed !== null && clock !== null && clock > r.fixed;
      clock = r.at !== null && r.it.stay ? r.at + r.it.stay : null;
    } else {
      r.at = r.t ?? null;
      clock = r.end ?? null;
      prev = null;
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
