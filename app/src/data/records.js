// 旅程底下子集合（flights、stays）的共用讀寫
import { collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

const col = (tripId, name) => collection(db, `trips/${tripId}/${name}`);
// 記錄是誰建立或修改（欄位名同舊版）
const who = (user, nickname, kind) => ({ [`${kind}ByUid`]: user.uid, [`${kind}ByName`]: nickname, [`${kind}At`]: serverTimestamp() });

export const watchRecords = (tripId, name, onChange, onError) =>
  onSnapshot(col(tripId, name), s => onChange(s.docs.map(d => ({ id: d.id, ...d.data() }))), onError);

export const addRecord = (tripId, name, fields, user, nickname) => addDoc(col(tripId, name), { ...fields, ...who(user, nickname, 'created') });

export const updateRecord = (tripId, name, id, fields, user, nickname) => updateDoc(doc(col(tripId, name), id), { ...fields, ...who(user, nickname, 'updated') });

export const deleteRecord = (tripId, name, id) => deleteDoc(doc(col(tripId, name), id));

// 復原刪除：用原本的 id 寫回去，之前記下的其他復原步驟才找得到同一筆
export const restoreRecord = (tripId, name, id, raw) => { const { id: _, ...data } = raw; return setDoc(doc(col(tripId, name), id), data); };
