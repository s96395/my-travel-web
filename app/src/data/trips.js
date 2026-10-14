// 讀寫旅程。沿用舊版的 trips 集合與欄位，權限欄位 ownerId、memberIds 不變
import { collection, doc, query, where, onSnapshot, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

// 同時監看「我建立的」與「我是成員的」旅程，合併後回傳
export function watchMyTrips(uid, onChange, onError) {
  const ref = collection(db, 'trips');
  const parts = { owned: null, member: null };
  const emit = () => {
    if (!parts.owned || !parts.member) return;
    const byId = new Map();
    [...parts.owned, ...parts.member].forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
    onChange([...byId.values()].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')));
  };
  const u1 = onSnapshot(query(ref, where('ownerId', '==', uid)), s => { parts.owned = s.docs; emit(); }, onError);
  const u2 = onSnapshot(query(ref, where('memberIds', 'array-contains', uid)), s => { parts.member = s.docs; emit(); }, onError);
  return () => { u1(); u2(); };
}

export function watchExpenses(tripId, onChange, onError) {
  return onSnapshot(collection(db, `trips/${tripId}/expenses`), s => onChange(s.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

// 邀請碼 20 碼；安全規則只接受 16 碼以上的邀請碼加入
export const SHARE_KEY_MIN = 16;
export function newShareKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return [...bytes].map(b => (b % 36).toString(36)).join('');
}

// 舊版的 8 碼邀請碼：建立者打開網站時自動換成新的，換過之後舊連結就不能加入
const upgrading = new Set();
export function upgradeShareKeys(trips, uid) {
  trips.filter(t => t.ownerId === uid && String(t.shareKey || '').length < SHARE_KEY_MIN && !upgrading.has(t.id)).forEach(t => {
    upgrading.add(t.id);
    updateDoc(doc(db, 'trips', t.id), { shareKey: newShareKey() }).catch(err => console.warn('邀請碼沒有更新', err));
  });
}

export async function createTrip(form, user, nickname) {
  const ownerPid = doc(collection(db, 'trips')).id;
  const ref = await addDoc(collection(db, 'trips'), {
    title: form.title,
    country: form.country,
    city: form.city,
    startDate: form.startDate,
    endDate: form.endDate,
    tripType: form.tripType,
    status: form.status,
    shareKey: newShareKey(),
    totalExpense: 0,
    totalTanks: 0,
    ownerId: user.uid,
    ownerName: nickname,
    memberIds: [user.uid],
    participants: { [ownerPid]: { name: nickname, uid: user.uid, order: 1, status: 'active' } },
    createdByName: nickname,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
