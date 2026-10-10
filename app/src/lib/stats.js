// 首頁統計（規格書 F03）
// - 去過的國家：只算已完成、已封存的旅程（照舊版）
// - 我的支出：分攤給「登入者對應同行者」的金額；舊資料以帳號 UID 為鍵時也認得
// - 未確認：只算還沒分攤的支出
// - 依類型、年度旅程總支出：各趟整趟支出加總
import { myParticipantId } from './trips.js';

export const isSplit = e => !!e.personalShares && typeof e.personalShares === 'object' && !Array.isArray(e.personalShares);

export function myShare(expense, pid, uid) {
  if (!isSplit(expense)) return 0;
  const s = expense.personalShares;
  const v = (pid && Object.hasOwn(s, pid)) ? s[pid] : Object.hasOwn(s, uid) ? s[uid] : 0;
  return Number(v) || 0;
}

export function tripTotal(trip, expenses) {
  if (!expenses) return Number(trip.raw?.totalExpense) || 0;
  return expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0);
}

export function computeStats(trips, expensesByTrip, uid) {
  const done = trips.filter(t => t.status === '已完成' || t.status === '已封存');
  const countryMap = {};
  done.forEach(t => { if (t.country) countryMap[t.country] = (countryMap[t.country] || 0) + 1; });
  const countries = Object.entries(countryMap).sort((a, b) => b[1] - a[1]);

  const years = {};
  const typeTotals = { '自由行': 0, '潛旅': 0, '跟團': 0 };
  const yearTotals = {};
  trips.forEach(t => {
    const y = t.start ? t.start.slice(0, 4) : '未知';
    const ex = expensesByTrip.get(t.id);
    const pid = myParticipantId(t.raw || {}, uid);
    const total = tripTotal(t, ex);
    yearTotals[y] = (yearTotals[y] || 0) + total;
    typeTotals[t.type] = (typeTotals[t.type] || 0) + total;
    const row = years[y] || (years[y] = { year: y, mine: 0, unconfirmed: 0 });
    (ex || []).forEach(e => {
      if (!isSplit(e)) row.unconfirmed += 1;
      else row.mine += myShare(e, pid, uid);
    });
  });
  const yearly = Object.values(years).sort((a, b) => b.year.localeCompare(a.year));
  const typeTotal = Object.values(typeTotals).reduce((a, b) => a + b, 0);

  const tankMap = {};
  trips.filter(t => t.type === '潛旅' && t.tanks).forEach(t => {
    const loc = t.city || t.country || '未知';
    tankMap[loc] = (tankMap[loc] || 0) + t.tanks;
  });
  const tanks = Object.entries(tankMap).sort((a, b) => b[1] - a[1]);

  return {
    countries,
    yearly,
    mineTotal: yearly.reduce((a, y) => a + y.mine, 0),
    types: Object.entries(typeTotals),
    typeTotal,
    yearTotals,
    tanks,
    tankTotal: tanks.reduce((a, t) => a + t[1], 0),
  };
}
