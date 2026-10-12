// 同行者、共編成員、加入旅程與旅程設定的讀寫
import { collection, doc, getDoc, getDocs, updateDoc, deleteDoc, runTransaction, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import { bindProblem, nextOrder, cleanName } from '../lib/people.js';

const tripRef = id => doc(db, 'trips', id);

// 新增同行者；建立者自己還沒有同行者時，帶入自己的帳號
export const addParticipant = (trip, name, uid = '') => updateDoc(tripRef(trip.id), {
  [`participants.${doc(collection(db, 'trips')).id}`]: { name: cleanName(name), uid, order: nextOrder(trip), status: 'active' },
  updatedAt: serverTimestamp(),
});
// 只改指定欄位，例如 { 'b.status': 'inactive', 'a.order': 2 }
export function patchParticipants(tripId, fields) {
  const out = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(fields)) out[`participants.${k}`] = v;
  return updateDoc(tripRef(tripId), out);
}

export const removeMember = (tripId, uid) => updateDoc(tripRef(tripId), { memberIds: arrayRemove(uid) });
export const updateTripInfo = (tripId, form) => updateDoc(tripRef(tripId), { ...form, updatedAt: serverTimestamp() });

// 帳號暱稱（共編成員名單用；讀不到時回傳空字串）
export async function userName(uid) {
  try { const s = await getDoc(doc(db, 'users', uid)); return s.exists() ? s.data().nickname || s.data().displayName || '' : ''; } catch { return ''; }
}

/* ---------- 加入旅程（規格書 F15） ---------- */
export async function readJoinTrip(tripId) {
  const s = await getDoc(tripRef(tripId));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
// 先成為共編成員（安全規則只允許這一步改 memberIds），之後才讀得到支出、才能綁定同行者
export const joinAsMember = (tripId, uid) => updateDoc(tripRef(tripId), { memberIds: arrayUnion(uid) });

export async function sharesNow(tripId) {
  const s = await getDocs(collection(db, `trips/${tripId}/expenses`));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 綁定同行者：用交易重新讀一次旅程，避免兩個人同時選到同一位；pid 為 'new' 時新增一位
export function bindParticipant(tripId, uid, pid, newName) {
  return runTransaction(db, async tx => {
    const s = await tx.get(tripRef(tripId));
    if (!s.exists()) throw new Error('找不到這趟旅程');
    const trip = { id: s.id, ...s.data() };
    const problem = bindProblem(trip, uid, pid);
    if (problem) throw Object.assign(new Error(problem), { friendly: true });
    const id = pid === 'new' ? doc(collection(db, 'trips')).id : pid;
    const field = pid === 'new'
      ? { [`participants.${id}`]: { name: cleanName(newName), uid, order: nextOrder(trip), status: 'active' } }
      : { [`participants.${id}.uid`]: uid };
    tx.update(tripRef(tripId), { ...field, updatedAt: serverTimestamp() });
    return id;
  });
}

/* ---------- 刪除旅程（規格書 F05）：子資料一筆一筆刪，全部刪完才刪旅程本身 ---------- */
const SUBS = { itinerary: '行程', flights: '班機', stays: '住宿', todos: '待辦', expenses: '支出', fundDeposits: '公費放入紀錄', diveLogs: '潛水日誌', images: '圖片', accommodations: '舊版住宿' };
export async function deleteTripAll(tripId) {
  const failed = [];
  for (const [name, label] of Object.entries(SUBS)) {
    try {
      const s = await getDocs(collection(db, `trips/${tripId}/${name}`));
      const results = await Promise.allSettled(s.docs.map(d => deleteDoc(d.ref)));
      const bad = results.filter(r => r.status === 'rejected').length;
      if (bad) failed.push(`${label} ${bad} 筆`);
    } catch (err) { console.error(err); failed.push(`${label}（讀不到）`); }
  }
  if (!failed.length) await deleteDoc(tripRef(tripId));
  return failed;
}
