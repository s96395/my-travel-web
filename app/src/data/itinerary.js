// 讀寫 trips/{tripId}/itinerary
import { collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

const col = tripId => collection(db, `trips/${tripId}/itinerary`);
// 記錄是誰建立或修改（欄位名同舊版）
const who = (user, nickname, kind) => ({ [`${kind}ByUid`]: user.uid, [`${kind}ByName`]: nickname, [`${kind}At`]: serverTimestamp() });

export function watchItinerary(tripId, onChange, onError) {
  return onSnapshot(col(tripId), s => onChange(s.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

// fields：title、area、type、priority、reservationTime、note、day、order
export const addItem = (tripId, fields, user, nickname) => addDoc(col(tripId), { ...fields, ...who(user, nickname, 'created') });

export const updateItem = (tripId, id, fields, user, nickname) => updateDoc(doc(col(tripId), id), { ...fields, ...who(user, nickname, 'updated') });

export const deleteItem = (tripId, id) => deleteDoc(doc(col(tripId), id));

// 拖曳或「移到第幾天」後，一次寫回所有改變的天數與順序
export async function saveMoves(tripId, updates, user, nickname) {
  if (!updates.length) return;
  const batch = writeBatch(db);
  updates.forEach(u => batch.update(doc(col(tripId), u.id), { day: u.day, order: u.order, ...who(user, nickname, 'updated') }));
  await batch.commit();
}
