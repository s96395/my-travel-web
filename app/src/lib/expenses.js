// 支出、分攤、結算與公費的計算（規格書 F50–F56、S06、S07）
// 分攤金額 personalShares：新版以同行者 ID 為鍵；舊資料以帳號 UID 為鍵，讀取時換成對應的同行者

// 分類、付款方式沿用舊版
export const CATS = ['交通', '住宿', '餐飲', '景點', '購物', '保險/簽證', '潛水費用', '電信費', '其他'];
export const PAYS = ['刷卡', '現金', '行動支付', '其他'];
export const FUND = 'fund'; // 付款人是公費時的代號
export const MULTI = 'multi'; // 多人一起付，每人付的金額記在 payers

export const amountOf = e => Number(e.amount) || 0;
// 這筆每人實際付了多少；公費支付或沒填付款人時是空的
export function paidOf(e) {
  if (e.payerId === MULTI) return Object.fromEntries(Object.entries(e.payers || {}).map(([k, v]) => [k, Number(v) || 0]));
  return e.payerId && e.payerId !== FUND ? { [e.payerId]: amountOf(e) } : {};
}
export const payMethodOf = e => e.payMethod || e.paymentMethod || '';

// 平均分攤：照舊版規則，除不盡的部分從名單前面的人開始各多分 1（有小數時以最小位數為單位）
export function equalSplit(amount, ids) {
  const out = {};
  if (!ids.length || !Number.isFinite(amount)) return out;
  const factor = 10 ** (String(amount).split('.')[1] || '').length;
  const units = Math.round(amount * factor), base = Math.floor(units / ids.length);
  let rem = units - base * ids.length;
  ids.forEach(id => { out[id] = (base + (rem > 0 ? 1 : 0)) / factor; if (rem > 0) rem--; });
  return out;
}

// 這筆支出每位同行者的分攤金額；沒有分攤時回傳 null
export function sharesOf(e, people) {
  const s = e.personalShares;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const ids = new Set(people.map(p => p.id));
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    const id = ids.has(k) ? k : people.find(p => p.uid && p.uid === k)?.id || k;
    out[id] = (out[id] || 0) + (Number(v) || 0);
  }
  return out;
}
export const isSplit = (e, people) => { const s = sharesOf(e, people); return !!s && Object.keys(s).length > 0; };

// 分攤方式：有記錄就用記錄的；舊資料沒有記錄時，金額剛好是平均分的就當作平均
export function modeOf(e, people) {
  const s = sharesOf(e, people);
  if (!s || !Object.keys(s).length) return 'none';
  if (e.splitMode === 'equal' || e.splitMode === 'custom') return e.splitMode;
  const sorted = o => Object.values(o).sort((a, b) => a - b).join();
  return sorted(s) === sorted(equalSplit(amountOf(e), Object.keys(s))) ? 'equal' : 'custom';
}

// 每人負擔合計（只算已分攤的）
export function perPerson(expenses, people) {
  const t = {};
  people.forEach(p => { t[p.id] = 0; });
  expenses.forEach(e => { const s = sharesOf(e, people) || {}; for (const k in s) t[k] = (t[k] || 0) + s[k]; });
  return t;
}

// 依分類加總，金額大的在前
export function byCategory(expenses) {
  const m = {};
  expenses.forEach(e => { const c = e.category || '其他'; m[c] = (m[c] || 0) + amountOf(e); });
  return Object.entries(m).filter(c => c[1]).sort((a, b) => b[1] - a[1]);
}

/* ---------- 公費 ---------- */
export const fundOf = trip => ({ on: !!trip.fund?.on, keeper: trip.fund?.keeper || '' });
export const fundIn = deposits => deposits.reduce((a, d) => a + (Number(d.amount) || 0), 0);
export const fundOut = expenses => expenses.filter(e => e.payerId === FUND).reduce((a, e) => a + amountOf(e), 0);

/* ---------- 結算 ---------- */
// 每人差額＝已付−應負擔。放進公費的錢算已付；公費支付的支出只算進分攤對象的應負擔；
// 公費餘額在保管人手上，從保管人的差額扣掉（餘額是負的就代表保管人先墊）。
// 沒填付款人或沒分攤的支出不算，關閉公費時公費支付的支出也不算。
export function settlement(expenses, people, fund, deposits) {
  const rows = {};
  const row = id => rows[id] || (rows[id] = { paid: 0, owe: 0 });
  people.forEach(p => row(p.id));
  const counted = expenses.filter(e => e.payerId && isSplit(e, people) && (e.payerId !== FUND || fund.on));
  counted.forEach(e => {
    const pd = paidOf(e);
    for (const k in pd) row(k).paid += pd[k];
    const s = sharesOf(e, people);
    for (const k in s) row(k).owe += s[k];
  });
  let balance = 0;
  if (fund.on) {
    deposits.forEach(d => { row(d.pid).paid += Number(d.amount) || 0; });
    balance = fundIn(deposits) - fundOut(expenses);
  }
  const diff = {};
  for (const k in rows) diff[k] = rows[k].paid - rows[k].owe;
  if (fund.on && fund.keeper) diff[fund.keeper] = (diff[fund.keeper] || 0) - balance;
  // 欠最多的人先給該收最多的人，讓轉帳次數最少
  const round = v => Math.round(v * 100) / 100;
  const cred = [], debt = [];
  for (const k in diff) { const v = round(diff[k]); if (v > 0) cred.push({ id: k, v }); else if (v < 0) debt.push({ id: k, v: -v }); }
  const order = (a, b) => b.v - a.v || a.id.localeCompare(b.id);
  cred.sort(order); debt.sort(order);
  const tx = [];
  for (let i = 0, j = 0; i < debt.length && j < cred.length;) {
    const v = round(Math.min(debt[i].v, cred[j].v));
    if (v > 0) tx.push({ from: debt[i].id, to: cred[j].id, v });
    debt[i].v = round(debt[i].v - v); cred[j].v = round(cred[j].v - v);
    if (debt[i].v <= 0) i++;
    if (cred[j].v <= 0) j++;
  }
  return {
    rows, diff, tx, balance,
    noPayer: expenses.filter(e => !e.payerId && isSplit(e, people)).length,
    notSplit: expenses.filter(e => !isSplit(e, people)).length,
    fundOff: fund.on ? 0 : expenses.filter(e => e.payerId === FUND && isSplit(e, people)).length,
  };
}

// 標記已還款用的代號；金額變了就要重新標記
export const repaidKey = x => `${x.from}_${x.to}_${String(x.v).replace('.', 'p')}`;
