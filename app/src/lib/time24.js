// 時間一律用 24 小時制「HH:MM」。瀏覽器內建的時間欄位會跟系統語系顯示「上午／下午」，所以改用文字欄位自己整理格式

// 打字時順手整理：只留數字，第一碼 3～9 自動補 0（9 → 09），打到第三碼插入冒號
export function maskTime(raw) {
  const s = String(raw || '');
  // 自己打了冒號（0:15、1:30），照冒號切開，小時補 0，不要把數字黏在一起重排
  const sep = s.match(/^\D*(\d{1,2})\s*[:：.]\s*(\d*)/);
  if (sep) return `${sep[1].padStart(2, '0')}:${sep[2].slice(0, 2)}`;
  let d = s.replace(/\D/g, '');
  if (/^[3-9]/.test(d)) d = '0' + d;
  d = d.slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}

// 離開欄位時補齊：9 → 09:00、930 → 09:30、14:5 → 14:05。空白回傳 ''，看不懂或超出範圍回傳 null
export function normTime(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  let h, m;
  const parts = s.split(/[:：.]/);
  if (parts.length === 2) [h, m] = parts;
  else {
    const d = s.replace(/\D/g, '');
    if (!d || d.length > 4 || d.length !== s.length) return null;
    if (d.length <= 2) [h, m] = [d, '0'];
    else if (d.length === 3) [h, m] = [d.slice(0, 1), d.slice(1)];
    else [h, m] = [d.slice(0, 2), d.slice(2)];
  }
  if (!/^\d{1,2}$/.test(h) || !/^\d{0,2}$/.test(m)) return null;
  const hh = +h, mm = +(m || 0);
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// 日期＋時間合成存放格式「YYYY-MM-DDTHH:MM」，缺一個或時間不對就是空字串
export function joinDateTime(date, time) {
  const t = normTime(time);
  return date && t ? `${date}T${t}` : '';
}

// 行程的「什麼時候」：14:30、1430、下午2點、晚上7點半、2pm 都換成 HH:MM。
// 回傳 HH:MM；沒有數字的時段文字（午餐、看完夕陽後）回傳 ''；有數字卻看不懂（10點前到）回傳 null
const CN = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const cnNum = s => {
  if (/^\d+$/.test(s)) return +s;
  if (!s || [...s].some(c => !(c in CN))) return NaN;
  if (s === '十') return 10;
  if (s.startsWith('十')) return 10 + CN[s[1]];
  if (s.endsWith('十')) return CN[s[0]] * 10;
  return s.length === 3 && s[1] === '十' ? CN[s[0]] * 10 + CN[s[2]] : s.length === 1 ? CN[s] : NaN;
};
export function clockOf(raw) {
  const s = String(raw || '').trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\s+/g, '');
  if (!s) return '';
  if (/^[\d:：.]+$/.test(s)) return normTime(s);
  if (!/\d|[〇零一二兩三四五六七八九十][點点時]/.test(s)) return ''; // 中文數字後面接「點」才當成時間，「看完一場表演」照樣是時段文字
  const en = /^(\d{1,2})(?::(\d{2}))?(am|pm|a\.m\.|p\.m\.)$/i.exec(s);
  if (en) {
    let h = +en[1];
    if (h < 1 || h > 12) return null;
    if (/^p/i.test(en[3])) h = h % 12 + 12; else h %= 12;
    return normTime(`${h}:${en[2] || '00'}`);
  }
  const m = /^(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上)?([\d〇零一二兩三四五六七八九十]{1,3})[點点時:：](半|([\d〇零一二兩三四五六七八九十]{1,3})分?)?$/.exec(s);
  if (!m) return null;
  let h = cnNum(m[2]);
  const mm = m[3] === '半' ? 30 : m[4] ? cnNum(m[4]) : 0;
  if (!Number.isInteger(h) || !Number.isInteger(mm) || h > 23 || mm > 59) return null;
  const w = m[1] || '';
  if (!w && h >= 1 && h <= 6) return null; // 只寫「3點」分不出是凌晨還是下午，請對方寫清楚
  if (h <= 12) {
    if (w === '晚上' && h === 12) h = 0; // 晚上12點是半夜
    else if (['下午', '傍晚', '晚上'].includes(w) && h < 12) h += 12;
    else if (w === '中午' && h <= 2) h = h === 12 ? 12 : h + 12;
    else if (['凌晨', '清晨', '早上', '上午'].includes(w) && h === 12) h = 0;
  } else if (w && !['下午', '傍晚', '晚上'].includes(w)) return null;
  return normTime(`${h}:${mm}`);
}
