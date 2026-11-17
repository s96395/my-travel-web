// 讀寫 trips/{tripId}/itinerary
import { collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, writeBatch, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '../firebase.js';

const col = tripId => collection(db, `trips/${tripId}/itinerary`);
// 記錄是誰建立或修改（欄位名同舊版）
const who = (user, nickname, kind) => ({ [`${kind}ByUid`]: user.uid, [`${kind}ByName`]: nickname, [`${kind}At`]: serverTimestamp() });

export function watchItinerary(tripId, onChange, onError) {
  return onSnapshot(col(tripId), s => onChange(s.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

// fields：title、area、type、priority、reservationTime、note、day、order
// 編輯畫面已拿掉的欄位（停留多久、訂位網址、票券標記、一句提示併進備註）：存檔時 clean 為 true 就從資料裡刪掉
const GONE = ['stay', 'bookUrl', 'tickets', 'tip'];
export const addItem = (tripId, { clean, ...fields }, user, nickname) => addDoc(col(tripId), { ...fields, ...who(user, nickname, 'created') });

export const updateItem = (tripId, id, { clean, ...fields }, user, nickname) => updateDoc(doc(col(tripId), id), { ...fields, ...(clean ? Object.fromEntries(GONE.map(k => [k, deleteField()])) : {}), ...who(user, nickname, 'updated') });

export const deleteItem = (tripId, id) => deleteDoc(doc(col(tripId), id));

// 復原刪除：用原本的 id 和內容寫回去（raw 是讀進來時的原始欄位）
export const restoreItem = (tripId, id, raw) => { const { id: _, ...data } = raw; return setDoc(doc(col(tripId), id), data); };

// 拖曳或「移到第幾天」後，一次寫回所有改變的天數與順序
export async function saveMoves(tripId, updates, user, nickname) {
  if (!updates.length) return;
  const batch = writeBatch(db);
  updates.forEach(u => batch.update(doc(col(tripId), u.id), { day: u.day, order: u.order, ...who(user, nickname, 'updated') }));
  await batch.commit();
}
