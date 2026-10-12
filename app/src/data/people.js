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

// 常用旅伴（在你其他旅程綁定過帳號的人）：建立者直接新增並綁定，同時加進共編成員，不用再傳邀請連結
export const addCompanion = (trip, c) => updateDoc(tripRef(trip.id), {
  [`participants.${doc(collection(db, 'trips')).id}`]: { name: cleanName(c.name), uid: c.uid, order: nextOrder(trip), status: 'active' },
  memberIds: arrayUnion(c.uid), updatedAt: serverTimestamp(),
});
// 把名單上沒有帳號的同行者綁到常用旅伴，名字改成對方最近一趟用的名字
export const bindCompanion = (tripId, pid, c) => updateDoc(tripRef(tripId), {
  [`participants.${pid}.uid`]: c.uid, [`participants.${pid}.name`]: cleanName(c.name),
  memberIds: arrayUnion(c.uid), updatedAt: serverTimestamp(),
});

export const removeMember =(tripId, uid) => updateDoc(tripRef(tripId), { memberIds: arrayRemove(uid) });
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
// 用邀請碼成為共編成員：安全規則只允許非成員改 memberIds 與 joinKey，而且 joinKey 要等於旅程的邀請碼
export const joinAsMember = (tripId, uid, key) => updateDoc(tripRef(tripId), { memberIds: arrayUnion(uid), joinKey: key });

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
      : { [`participants.${id}.uid`]: uid, ...(cleanName(newName) && cleanName(newName) !== trip.participants[id].name ? { [`participants.${id}.name`]: cleanName(newName) } : {}) };
    // bindPid 讓安全規則確認共編成員只動到自己綁定的那一位
    tx.update(tripRef(tripId), { ...field, bindPid: id, updatedAt: serverTimestamp() });
    return id;
  });
}

/* ---------- 刪除旅程（規格書 F05）：子資料一筆一筆刪，全部刪完才刪旅程本身 ---------- */
const SUBS = { itinerary: '行程', flights: '班機', stays: '住宿', todos: '待辦', expenses: '支出', fundDeposits: '公費放入紀錄', transits: '其他交通', diveLogs: '潛水日誌', images: '圖片', accommodations: '舊版住宿' };
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
