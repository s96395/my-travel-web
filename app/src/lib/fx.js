// 外幣支出與匯率（點子清單第 8 項）
// - 金額 amount 一律存新台幣，分攤、結算、首頁統計照舊；外幣原始金額與當時匯率另外存在 fx
// - fx = { cur, amount, rate, date, shares, payers }：rate 是 1 單位外幣換多少新台幣，shares、payers 是外幣金額（自訂分攤、多人付款時才有）
// - 匯率來源 Frankfurter v2（各國央行每日參考匯率），只送出幣別代碼
import { matchPlaces } from './world.js';

export const TWD = 'TWD';
// 常用幣別：代碼、名稱、符號
export const CURRENCIES = [
  ['TWD', '新台幣', 'NT$'], ['JPY', '日圓', '¥'], ['KRW', '韓元', '₩'], ['HKD', '港幣', 'HK$'], ['MOP', '澳門幣', 'MOP$'],
  ['CNY', '人民幣', 'CN¥'], ['THB', '泰銖', '฿'], ['SGD', '新加坡幣', 'S$'], ['MYR', '馬來西亞令吉', 'RM'], ['VND', '越南盾', '₫'],
  ['PHP', '菲律賓披索', '₱'], ['IDR', '印尼盾', 'Rp'], ['USD', '美元', 'US$'], ['EUR', '歐元', '€'], ['GBP', '英鎊', '£'],
  ['AUD', '澳幣', 'A$'], ['NZD', '紐西蘭幣', 'NZ$'], ['CAD', '加拿大幣', 'C$'], ['CHF', '瑞士法郎', 'CHF '], ['CZK', '捷克克朗', 'Kč '],
  ['TRY', '土耳其里拉', '₺'], ['AED', '阿聯酋迪拉姆', 'AED '], ['INR', '印度盧比', '₹'],
];
const INFO = new Map(CURRENCIES.map(c => [c[0], { code: c[0], name: c[1], sym: c[2] }]));
export const curInfo = code => INFO.get(code) || { code, name: code, sym: `${code} ` };

// 國家（world.js 的國碼）對應的幣別；歐元區各國都是歐元
const EURO = '040 056 191 196 233 246 250 276 300 372 380 428 440 442 470 528 620 703 705 724'.split(' ');
const BY_COUNTRY = {
  158: 'TWD', 392: 'JPY', 410: 'KRW', 344: 'HKD', 446: 'MOP', 156: 'CNY', 764: 'THB', 702: 'SGD', 458: 'MYR', 704: 'VND',
  608: 'PHP', 360: 'IDR', 840: 'USD', 826: 'GBP', '036': 'AUD', 554: 'NZD', 124: 'CAD', 756: 'CHF', 203: 'CZK', 792: 'TRY',
  784: 'AED', 356: 'INR', ...Object.fromEntries(EURO.map(id => [id, 'EUR'])),
};
// 這趟旅程國家用的幣別（照國家欄位的順序，不含新台幣，不重複）
export function tripCurrencies(country) {
  return [...new Set(matchPlaces(country).ids.map(id => BY_COUNTRY[id]).filter(c => c && c !== TWD))];
}

// 顯示外幣金額：最多兩位小數，前面加符號
export const fxMoney = (n, code) => curInfo(code).sym + (Number(n) || 0).toLocaleString('zh-TW', { maximumFractionDigits: 2 });

// 外幣換成新台幣（四捨五入到元）
export const toTwd = (amount, rate) => Math.round((Number(amount) || 0) * (Number(rate) || 0));

// 把新台幣總額照外幣金額的比例分給每個人，四捨五入到元，加總剛好等於總額（餘數給小數部分最大的人）
export function allocate(total, parts) {
  const keys = Object.keys(parts), sum = keys.reduce((a, k) => a + (Number(parts[k]) || 0), 0);
  const out = {};
  if (!keys.length || !sum) return out;
  const raw = keys.map(k => ({ k, v: total * (Number(parts[k]) || 0) / sum }));
  raw.forEach(r => { out[r.k] = Math.floor(r.v); });
  let rem = total - raw.reduce((a, r) => a + out[r.k], 0);
  [...raw].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v))).forEach(r => { if (rem > 0) { out[r.k]++; rem--; } });
  return out;
}

/* ---------- 查匯率 ---------- */
// 同一種幣別 6 小時內查過就用記下來的；離線或查不到時也用最後一次查到的
const KEEP = 6 * 3600 * 1000;
const keyOf = code => `fxRate:${code}`;
function cached(code) {
  try { return JSON.parse(localStorage.getItem(keyOf(code)) || 'null'); } catch { return null; }
}
export async function getRate(code) {
  const old = cached(code);
  if (old && Date.now() - old.at < KEEP) return old;
  try {
    const res = await fetch(`https://api.frankfurter.dev/v2/rate/${encodeURIComponent(code)}/${TWD}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (!(j.rate > 0)) throw new Error('沒有匯率');
    const got = { rate: j.rate, date: j.date || '', at: Date.now() };
    try { localStorage.setItem(keyOf(code), JSON.stringify(got)); } catch { /* 無痕模式存不了也沒關係 */ }
    return got;
  } catch (err) {
    if (old) return { ...old, stale: true };
    throw err;
  }
}
