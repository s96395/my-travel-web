// 時間一律用 24 小時制「HH:MM」。瀏覽器內建的時間欄位會跟系統語系顯示「上午／下午」，所以改用文字欄位自己整理格式

// 打字時順手整理：只留數字，第一碼 3～9 自動補 0（9 → 09），打到第三碼插入冒號
export function maskTime(raw) {
  let d = String(raw || '').replace(/\D/g, '');
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
