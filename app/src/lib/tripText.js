// 匯出行程文字：整趟旅程整理成純文字，方便貼給 ChatGPT 之類的工具討論
// 訂位代號、確認碼、PIN 不放進去（和行事曆檔一樣），因為文字會貼到別的服務
import { itemsOfDay, backupsOf, sameName, planDays, BOOK_LABEL } from './itinerary.js';
import { parseDate, toDateString, daysBetween, WEEKDAYS } from './dates.js';

const md = s => { const d = parseDate(s); return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`; };
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateString(d); };
const hm = s => String(s || '').slice(11, 16);
const oneLine = s => String(s || '').replace(/\s*\n+\s*/g, '；').trim();

// 一站：「1. 10:30 名稱（已預約）」，下面縮排放地址、備註、備案
function stop(it, n, items) {
  const when = it.time || it.timeText;
  const tags = [it.priority === 'must' ? '重點' : '', it.book ? BOOK_LABEL[it.book] : ''].filter(Boolean);
  const lines = [`${n}. ${when ? `${when} ` : ''}${it.kind === 'area' ? `［區域］${it.title}` : it.title}${tags.length ? `（${tags.join('，')}）` : ''}`];
  // 地址欄有時存的是 Google 地圖連結，連結對討論沒幫助，不放
  if (it.address && !/^https?:/i.test(it.address)) lines.push(`   地址：${oneLine(it.address)}`);
  if (it.note) lines.push(`   備註：${oneLine(it.note)}`);
  backupsOf(items, it.id).forEach(b => lines.push(`   備案：${b.title}${b.backupWhen ? `（${oneLine(b.backupWhen)}）` : ''}`));
  return lines.join('\n');
}

// trip：畫面用的旅程（name、start、end、place）；items：normalizeItem 後的行程；wishes：收藏（還沒排進哪天的地點）
export function buildTripText(trip, { items = [], flights = [], stays = [], transits = [], wishes = [] } = {}) {
  const out = [];
  // 和行程頁一樣：排到旅程日期之後的天數也要列出來
  const span = trip.start && trip.end ? daysBetween(trip.start, trip.end) + 1 : 0;
  const days = planDays(items, span);
  out.push(`【${trip.name}】`);
  out.push([span ? `${trip.start.replaceAll('-', '/')}－${trip.end.replaceAll('-', '/')}，共 ${span} 天` : '', trip.place].filter(Boolean).join('，'));

  const fl = flights.filter(f => f.dep).sort((a, b) => (a.dep > b.dep ? 1 : -1));
  if (fl.length) {
    out.push('', '■ 班機');
    fl.forEach(f => out.push(`- ${md(f.dep.slice(0, 10))} ${[f.flightNo, `${f.fromCity || f.from || ''} → ${f.toCity || f.to || ''}`].filter(Boolean).join(' ')} ${hm(f.dep)} 起飛${f.arr ? `，${f.arr.slice(0, 10) !== f.dep.slice(0, 10) ? `${md(f.arr.slice(0, 10))} ` : ''}${hm(f.arr)} 抵達` : ''}`));
  }
  const st = stays.filter(s => s.checkInDate).sort((a, b) => (a.checkInDate > b.checkInDate ? 1 : -1));
  if (st.length) {
    out.push('', '■ 住宿');
    st.forEach(s => out.push(`- ${md(s.checkInDate)}${s.checkOutDate ? `－${md(s.checkOutDate)}` : ''} ${s.name || '住宿'}${s.address ? `（${oneLine(s.address)}）` : ''}`));
  }
  const tr = transits.filter(t => t.dep).sort((a, b) => (a.dep > b.dep ? 1 : -1));
  if (tr.length) {
    out.push('', '■ 其他交通');
    tr.forEach(t => out.push(`- ${md(t.dep.slice(0, 10))} ${hm(t.dep)} ${t.mode || ''} ${[t.operator, t.number].filter(Boolean).join(' ')} ${t.from} → ${t.to}`.replace(/\s+/g, ' ')));
  }

  for (let day = 1; day <= days; day++) {
    const list = itemsOfDay(items, day);
    out.push('', `■ 第 ${day} 天${trip.start ? ` ${md(addDays(trip.start, day - 1))}` : ''}`);
    if (!list.length) { out.push('（還沒有行程）'); continue; }
    list.forEach((it, i) => out.push(stop(it, i + 1, items)));
  }

  const left = wishes.filter(w => w.title && !items.some(it => it.day && it.kind !== 'area' && sameName(it.title, w.title)));
  if (left.length) {
    out.push('', '■ 收藏（還沒排進行程）');
    left.forEach(w => out.push(`- ${w.title}${w.area ? `（${w.area}）` : ''}${w.note ? `：${oneLine(w.note)}` : ''}`));
  }
  return out.join('\n') + '\n';
}
