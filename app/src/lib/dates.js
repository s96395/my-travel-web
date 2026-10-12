// 日期一律用 YYYY-MM-DD 字串存放，計算時以當地午夜為準
export const WEEKDAYS = '日一二三四五六';

export function todayString(now = new Date()) {
  return toDateString(now);
}

export function toDateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function daysBetween(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / 86400000);
}

// 11/20（五）
export function monthDay(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

export const slashDate = s => String(s || '').replaceAll('-', '/');
