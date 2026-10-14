// 同行者、共編成員、加入旅程與旅程設定的讀寫
import { collection, doc, getDoc, getDocs, updateDoc, deleteDoc, runTransaction, arrayUnion, arrayRemove, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { bindProblem, boundTo, nextOrder, cleanName } from '../lib/people.js';
import { newShareKey } from './trips.js';

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
// 寫入前重讀一次，對方剛好自己用連結綁定時不會被蓋掉
export function bindCompanion(tripId, pid, c) {
  return runTransaction(db, async tx => {
    const s = await tx.get(tripRef(tripId));
    const trip = s.exists() ? { id: s.id, ...s.data() } : null;
    const p = trip?.participants?.[pid];
    const problem = !p ? '找不到這位同行者，可能已經被移除' : p.uid ? '這位同行者剛綁定了帳號，請重新整理' : boundTo(trip, c.uid) ? `${c.name} 已經在這趟旅程裡` : '';
    if (problem) throw Object.assign(new Error(problem), { friendly: true });
    tx.update(tripRef(tripId), {
      [`participants.${pid}.uid`]: c.uid, [`participants.${pid}.name`]: cleanName(c.name),
      memberIds: arrayUnion(c.uid), updatedAt: serverTimestamp(),
    });
  });
}

export const removeMember =(tripId, uid) => updateDoc(tripRef(tripId), { memberIds: arrayRemove(uid) });
// 建立者移除成員時同時換一組邀請碼，對方手上的舊連結就不能再加入
export const kickMember = (tripId, uid) => updateDoc(tripRef(tripId), { memberIds: arrayRemove(uid), shareKey: newShareKey() });
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
const SUBS = { itinerary: '行程', flights: '班機', stays: '住宿', todos: '待辦', expenses: '支出', fundDeposits: '公費放入紀錄', transits: '其他交通', diveLogs: '潛水日誌', images: '圖片', accommodations: '舊版住宿', cover: '封面照' };
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

/* ---------- 刪除帳號：處理這個帳號參加的每一趟旅程，再刪掉暱稱資料 ---------- */
// 自己建立、沒有其他成員的旅程整趟刪除；還有成員的轉給最早加入的那位；別人的旅程就退出
// 綁定的同行者改回沒有帳號，名字與分攤金額保留，帳才不會亂掉
export async function deleteAccountData(uid) {
  const ref = collection(db, 'trips');
  const [owned, member] = await Promise.all([
    getDocs(query(ref, where('ownerId', '==', uid))),
    getDocs(query(ref, where('memberIds', 'array-contains', uid))),
  ]);
  const trips = new Map();
  [...owned.docs, ...member.docs].forEach(d => trips.set(d.id, { id: d.id, ...d.data() }));
  const failed = [];
  for (const trip of trips.values()) {
    try {
      const mine = boundTo(trip, uid);
      // 舊版潛水日誌沒有 divers，靠記錄者的帳號找人；解除綁定前先寫成同行者 ID，瓶數才不會算到別人頭上
      if (mine) {
        const logs = await getDocs(query(collection(db, `trips/${trip.id}/diveLogs`), where('createdByUid', '==', uid)));
        await Promise.all(logs.docs.filter(d => !Array.isArray(d.data().divers)).map(d => updateDoc(d.ref, { divers: [mine.id] })));
      }
      const unbind = mine ? { [`participants.${mine.id}.uid`]: null } : {};
      const left = (trip.memberIds || []).filter(u => u !== uid);
      if (trip.ownerId !== uid) {
        await updateDoc(tripRef(trip.id), { memberIds: arrayRemove(uid), ...unbind, ...(mine ? { unbindPid: mine.id } : {}) });
      } else if (left.length) {
        await updateDoc(tripRef(trip.id), { ownerId: left[0], memberIds: arrayRemove(uid), ...unbind, updatedAt: serverTimestamp() });
      } else {
        const bad = await deleteTripAll(trip.id);
        if (bad.length) failed.push(trip.title || trip.id);
      }
    } catch (err) { console.error(err); failed.push(trip.title || trip.id); }
  }
  if (!failed.length) await deleteDoc(doc(db, 'users', uid));
  return failed;
}
