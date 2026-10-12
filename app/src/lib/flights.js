// 班機與住宿：子集合 flights、stays 的計算，以及舊版 trips.flight、trips.hotel 的讀取
import { parseDate, daysBetween } from './dates.js';

// 常用機場：代碼 → [城市, 時區]
export const AIRPORTS = {
  TPE: ['台北桃園', '+8'], TSA: ['台北松山', '+8'], RMQ: ['台中', '+8'], KHH: ['高雄', '+8'], TTT: ['台東', '+8'], GNI: ['綠島', '+8'], KNH: ['金門', '+8'], MZG: ['澎湖', '+8'],
  KIX: ['大阪關西', '+9'], NRT: ['東京成田', '+9'], HND: ['東京羽田', '+9'], NGO: ['名古屋', '+9'], CTS: ['札幌新千歲', '+9'], OKA: ['沖繩那霸', '+9'], FUK: ['福岡', '+9'],
  ICN: ['首爾仁川', '+9'], GMP: ['首爾金浦', '+9'], PUS: ['釜山金海', '+9'], CJU: ['濟州', '+9'],
  HKG: ['香港', '+8'], MFM: ['澳門', '+8'], BKK: ['曼谷', '+7'], DMK: ['曼谷廊曼', '+7'], CNX: ['清邁', '+7'], SGN: ['胡志明市', '+7'], HAN: ['河內', '+7'], DAD: ['峴港', '+7'],
  CEB: ['宿霧', '+8'], MNL: ['馬尼拉', '+8'], SIN: ['新加坡', '+8'], KUL: ['吉隆坡', '+8'], DPS: ['峇里島', '+8'],
  PRG: ['布拉格', '+1', 'Europe/Prague'], VIE: ['維也納', '+1', 'Europe/Vienna'], BUD: ['布達佩斯', '+1', 'Europe/Budapest'], CDG: ['巴黎', '+1', 'Europe/Paris'], FRA: ['法蘭克福', '+1', 'Europe/Berlin'], LHR: ['倫敦', '0', 'Europe/London'],
  LAX: ['洛杉磯', '-8', 'America/Los_Angeles'], SFO: ['舊金山', '-8', 'America/Los_Angeles'], JFK: ['紐約', '-5', 'America/New_York'],
};
export const TIMEZONES = ['-8', '-7', '-5', '-4', '0', '+1', '+2', '+7', '+8', '+9', '+10'];

// 機場在某個當地日期的時區；有夏令時間的機場依日期換算，其他用固定值
export function airportTz(code, local) {
  const a = AIRPORTS[code];
  if (!a) return '';
  const day = String(local || '').slice(0, 10);
  if (!a[2] || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return a[1];
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: a[2], timeZoneName: 'longOffset' })
      .formatToParts(new Date(`${day}T12:00:00Z`)).find(p => p.type === 'timeZoneName').value;
    const m = name.match(/([+-])(\d{2}):00/);
    return m ? m[1] + Number(m[2]) : '0';
  } catch { return a[1]; }
}
export const LEGS = ['去程', '回程', '轉機'];

const tzText = z => {
  const n = parseFloat(z) || 0, a = Math.abs(n);
  return (n < 0 ? '-' : '+') + String(Math.floor(a)).padStart(2, '0') + ':' + String(Math.round((a % 1) * 60)).padStart(2, '0');
};

// "2026-11-20 07:10" 加上時區 → 實際時間（毫秒）；格式不對時回傳 NaN
export function toInstant(local, tz) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(local || '')) return NaN;
  return Date.parse(local.replace(' ', 'T') + ':00' + tzText(tz));
}

// 飛行分鐘數；抵達不晚於起飛時回傳 null
export function flightMinutes(f) {
  const m = Math.round((toInstant(f.arr, f.toTz) - toInstant(f.dep, f.fromTz)) / 60000);
  return m > 0 ? m : null;
}
export const durationText = m => `${Math.floor(m / 60)} 小時 ${m % 60} 分`;

// 依實際起飛時間排序，沒有時間的放最後
export function sortFlights(list) {
  const key = f => { const t = toInstant(f.dep, f.fromTz); return Number.isNaN(t) ? Infinity : t; };
  return [...list].sort((a, b) => key(a) - key(b) || String(a.id).localeCompare(String(b.id)));
}

export const nights = s => (s.checkInDate && s.checkOutDate ? daysBetween(s.checkInDate, s.checkOutDate) : 0);
export const sortStays = list => [...list].sort((a, b) => String(a.checkInDate || '9').localeCompare(String(b.checkInDate || '9')) || String(a.id).localeCompare(String(b.id)));

/* ---------- 舊版單筆資料（規格書 F32）：畫面上當作第一筆，舊欄位不動 ---------- */
const time = t => String(t || '').trim().replace('.', ':').replace(/^(\d):/, '0$1:');

// 舊資料常只寫「釜山機場」「桃園機場」：去掉「機場」後，只對到一個常用機場時才採用它的代碼
function codeByName(text) {
  const name = String(text || '').replace(/(國際)?機場$/, '').trim();
  if (name.length < 2) return '';
  const hits = Object.keys(AIRPORTS).filter(c => AIRPORTS[c][0].includes(name));
  return hits.length === 1 ? hits[0] : '';
}

// 「臺中 RMQ（第 2 航廈）」→ 代碼 RMQ、城市 臺中、航廈 第 2 航廈
export function parseAirport(text, local) {
  const s = String(text || '').trim();
  const code = (s.match(/\b([A-Z]{3})\b/) || [])[1] || '';
  const term = (s.match(/[（(]([^）)]*)[）)]/) || [])[1] || '';
  const city = s.replace(/[（(][^）)]*[）)]/, '').replace(code, '').trim() || (AIRPORTS[code] || [''])[0];
  return { code: code || codeByName(city), city, term, tz: airportTz(code || codeByName(city), local) || '+8' };
}

// 早期的舊資料沒有航班日期：去程用旅程開始日、回程用結束日；抵達時間比起飛早就算隔天到
function legacyLeg(key, leg, f, p, fallbackDate) {
  const date = f[p.date] || fallbackDate || '';
  const from = parseAirport(f[p.from], date), to = parseAirport(f[p.to] || f[p.toFallback], date);
  const at = (d, t) => (d && time(t) ? `${d} ${time(t)}` : '');
  if (![f[p.no], f[p.date], f[p.from], f[p.depTime]].some(Boolean)) return null;
  const dep = at(date, f[p.depTime]);
  let arr = at(date, f[p.arrTime]);
  if (dep && arr && toInstant(arr, to.tz) <= toInstant(dep, from.tz)) {
    const next = parseDate(date); next.setDate(next.getDate() + 1);
    const day = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    arr = at(day, f[p.arrTime]);
    to.tz = airportTz(to.code, day) || to.tz; // 隔天剛好換夏令時間時，時區要用抵達日
  }
  return {
    id: `legacy-${key}`, legacy: key, leg, airline: f.airline || '', flightNo: f[p.no] || '',
    from: from.code, fromCity: from.city, fromTerminal: from.term, fromTz: from.tz, dep,
    to: to.code, toCity: to.city, toTerminal: to.term, toTz: to.tz, arr,
    pnr: f.flightCode || '', note: '',
  };
}

export function legacyFlights(flight, trip = {}) {
  if (!flight || typeof flight !== 'object') return [];
  return [
    legacyLeg('dep', '去程', flight, { no: 'depFlightNo', date: 'depDate', from: 'depAirport', depTime: 'depTime', to: 'depArrAirport', toFallback: 'retAirport', arrTime: 'arrTime' }, trip.startDate),
    legacyLeg('ret', '回程', flight, { no: 'retFlightNo', date: 'retDate', from: 'retAirport', depTime: 'retDepTime', to: 'retArrAirport', toFallback: 'depAirport', arrTime: 'retArrTime' }, trip.endDate),
  ].filter(Boolean);
}

export function legacyStays(hotel, trip) {
  if (!hotel || !hotel.hotelName) return [];
  const note = [hotel.checkIn && `入住 ${time(hotel.checkIn)}`, hotel.checkOut && `退房 ${time(hotel.checkOut)}`].filter(Boolean).join('、');
  return [{
    id: 'legacy-hotel', legacy: 'hotel', name: hotel.hotelName, address: hotel.hotelAddr || '',
    checkInDate: trip.startDate || '', checkOutDate: trip.endDate || '', confirmCode: hotel.hotelCode || '', pin: hotel.hotelPin || '', note,
  }];
}

// 新資料加上還沒轉過的舊資料（轉過的會在新資料記 fromLegacy）
export function withLegacy(docs, legacy) {
  const done = new Set(docs.map(d => d.fromLegacy).filter(Boolean));
  return [...docs, ...legacy.filter(l => !done.has(l.legacy))];
}

export const dayOf = local => (local ? parseDate(local.slice(0, 10)) : null);
