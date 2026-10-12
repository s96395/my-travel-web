// 舊資料轉換（規格書第 6 章）：只算出要改什麼，不碰資料庫；實際寫入由 scripts/migrate.mjs 處理
// 1. 舊班機（trips.flight）、住宿（trips.hotel）有值才建第一筆到子集合，舊欄位保留不刪
// 2. 支出 personalShares 的帳號 uid 換成同行者 ID；找不到同行者就補建一位（名稱用帳號名稱），不用名稱合併
// 3. 付款方式統一為 payMethod、圖片網址統一為 url，舊欄位保留
import { legacyFlights, legacyStays } from './flights.js';
import { participantsOf } from './trips.js';

const strip = ({ id, legacy, ...rest }) => ({ ...rest, fromLegacy: legacy });
const sum = obj => Object.values(obj || {}).reduce((a, v) => a + (Number(v) || 0), 0);
const round2 = n => Math.round(n * 100) / 100;

// newId：產生新同行者 ID；nameOf(uid)：帳號名稱（讀不到回傳空字串）
export function planTrip({ trip, expenses = [], images = [], flights = [], stays = [] }, { newId, nameOf, newShareKey }) {
  const plan = { tripId: trip.id, title: trip.title || '', tripUpdate: {}, newFlights: [], newStays: [], newParticipants: [], expenseUpdates: [], imageUpdates: [], problems: [] };

  // 班機、住宿：已經轉過（子集合有 fromLegacy）的不重複建立
  const doneF = new Set(flights.map(f => f.fromLegacy).filter(Boolean));
  plan.newFlights = legacyFlights(trip.flight).filter(f => !doneF.has(f.legacy)).map(strip);
  const doneS = new Set(stays.map(s => s.fromLegacy).filter(Boolean));
  plan.newStays = legacyStays(trip.hotel, trip).filter(s => !doneS.has(s.legacy)).map(strip);

  // 同行者：以 ID 與綁定帳號對照
  const people = participantsOf(trip);
  const ids = new Set(people.map(p => p.id));
  const byUid = new Map(people.filter(p => p.uid).map(p => [p.uid, p.id]));
  let order = people.reduce((m, p) => Math.max(m, Number(p.order) || 0), 0);
  const pidOf = uid => {
    if (byUid.has(uid)) return byUid.get(uid);
    const id = newId();
    const name = (nameOf(uid) || '').trim() || '旅伴';
    plan.newParticipants.push({ id, name, uid, order: ++order, status: 'active' });
    byUid.set(uid, id); ids.add(id);
    return id;
  };

  for (const e of expenses) {
    const fields = {};
    const s = e.personalShares;
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      const out = {};
      let changed = false;
      for (const [k, v] of Object.entries(s)) {
        const id = ids.has(k) ? k : pidOf(k);
        if (id !== k) changed = true;
        out[id] = round2((out[id] || 0) + (Number(v) || 0));
      }
      if (changed) {
        if (Math.abs(sum(out) - sum(s)) > 0.01) plan.problems.push(`支出「${e.name || e.id}」分攤合計轉換前後不同`);
        fields.personalShares = out;
      }
    }
    if (!e.payMethod && e.paymentMethod) fields.payMethod = e.paymentMethod;
    if (Object.keys(fields).length) plan.expenseUpdates.push({ id: e.id, name: e.name || '', fields });
  }

  for (const img of images) {
    if (!img.url && img.imageUrl) plan.imageUpdates.push({ id: img.id, fields: { url: img.imageUrl } });
  }

  for (const p of plan.newParticipants) plan.tripUpdate[`participants.${p.id}`] = { name: p.name, uid: p.uid, order: p.order, status: p.status };
  // 新版邀請連結要用 shareKey；舊旅程沒有的補一組
  if (!trip.shareKey) plan.tripUpdate.shareKey = newShareKey();
  return plan;
}

export const hasChanges = p =>
  Object.keys(p.tripUpdate).length + p.newFlights.length + p.newStays.length + p.expenseUpdates.length + p.imageUpdates.length > 0;

// 核對用：筆數與總金額（金額欄位轉換時不會動，前後應該一樣）
export const totals = expenses => ({ count: expenses.length, amount: round2(expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0)) });
