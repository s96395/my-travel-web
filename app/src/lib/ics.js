// 匯出到手機行事曆（.ics）：整趟旅程、每天的行程、班機、住宿
// 訂位代號、確認碼、PIN 不放進去，因為行事曆常會同步到雲端或分享給別人
import { toInstant } from './flights.js';
import { parseDate, toDateString, daysBetween } from './dates.js';

const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ymd = s => s.replaceAll('-', '');
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateString(d); };
const utc = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// 每行最多 75 個位元組，超過要折行（中文一個字 3 個位元組）
function fold(line) {
  const out = [];
  let cur = '', size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function event(uid, stamp, fields) {
  return ['BEGIN:VEVENT', `UID:${uid}@addicted-travel`, `DTSTAMP:${stamp}`, ...fields.filter(Boolean), 'END:VEVENT'];
}
const allDay = (from, toExclusive) => [`DTSTART;VALUE=DATE:${ymd(from)}`, `DTEND;VALUE=DATE:${ymd(toExclusive)}`];

// trip：畫面用的旅程（name、start、end、place）；items：normalizeItem 後的行程
export function buildIcs(trip, { items = [], flights = [], stays = [] } = {}, now = Date.now()) {
  const stamp = utc(now), lines = [];
  if (trip.start && trip.end) {
    lines.push(...event(`trip-${trip.id}`, stamp, [...allDay(trip.start, addDays(trip.end, 1)), `SUMMARY:${esc(`🧳 ${trip.name}`)}`, trip.place && `LOCATION:${esc(trip.place)}`]));
    const days = daysBetween(trip.start, trip.end) + 1;
    for (let day = 1; day <= days; day++) {
      const list = items.filter(it => it.day === day);
      if (!list.length) continue;
      const date = addDays(trip.start, day - 1);
      const areas = [...new Set(list.map(it => it.area).filter(Boolean))];
      lines.push(...event(`day-${trip.id}-${day}`, stamp, [...allDay(date, addDays(date, 1)),
        `SUMMARY:${esc(`第 ${day} 天${areas.length ? `｜${areas.join('、')}` : ''}`)}`,
        `DESCRIPTION:${esc(list.map(it => `${it.time ? `${it.time} ` : ''}${it.title}`).join('\n'))}`]));
      // 有預約時間的行程另外排一小時，用當地時間（不帶時區）
      list.filter(it => /^\d{2}:\d{2}$/.test(it.time)).forEach(it => {
        lines.push(...event(`item-${trip.id}-${it.id}`, stamp, [`DTSTART:${ymd(date)}T${it.time.replace(':', '')}00`, 'DURATION:PT1H', `SUMMARY:${esc(it.title)}`, it.area && `LOCATION:${esc(it.area)}`, it.note && `DESCRIPTION:${esc(it.note)}`]));
      });
    }
  }
  flights.forEach(f => {
    const dep = toInstant(f.dep, f.fromTz), arr = toInstant(f.arr, f.toTz);
    if (Number.isNaN(dep) || Number.isNaN(arr) || arr <= dep) return;
    const route = [f.from, f.to].filter(Boolean).join(' → ');
    lines.push(...event(`flight-${trip.id}-${f.id}`, stamp, [`DTSTART:${utc(dep)}`, `DTEND:${utc(arr)}`,
      `SUMMARY:${esc(`✈️ ${[f.flightNo, route].filter(Boolean).join(' ')}`)}`,
      `LOCATION:${esc([f.fromCity || f.from, f.fromTerminal].filter(Boolean).join(' '))}`,
      f.airline && `DESCRIPTION:${esc(f.airline)}`]));
  });
  stays.forEach(s => {
    if (!s.checkInDate || !s.checkOutDate || s.checkOutDate <= s.checkInDate) return;
    lines.push(...event(`stay-${trip.id}-${s.id}`, stamp, [...allDay(s.checkInDate, s.checkOutDate), `SUMMARY:${esc(`🏨 ${s.name || '住宿'}`)}`, s.address && `LOCATION:${esc(s.address)}`]));
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Addicted to YSHEN Travel//ZH-TW', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(trip.name)}`, ...lines, 'END:VCALENDAR']
    .map(fold).join('\r\n') + '\r\n';
}
