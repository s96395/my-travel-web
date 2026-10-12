// 支出與公費的寫入；欄位沿用舊版（name、amount、category、payMethod、note、personalShares）
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase.js';
import { addRecord, updateRecord } from './records.js';

// 沒有分攤時不寫 personalShares；編輯改成「先不分攤」時把原本的分攤刪掉
export function saveExpense(tripId, id, fields, user, nickname) {
  const { personalShares, splitMode, ...rest } = fields;
  if (!id) return addRecord(tripId, 'expenses', personalShares ? { ...rest, splitMode, personalShares } : rest, user, nickname);
  return updateRecord(tripId, 'expenses', id, {
    ...rest,
    splitMode: personalShares ? splitMode : deleteField(),
    personalShares: personalShares || deleteField(),
    paymentMethod: deleteField(), // 舊欄位統一成 payMethod（規格書第 6 節）
  }, user, nickname);
}

// 旅程主檔上的欄位：總支出（舊版首頁會用）、公費設定、已還款標記
export const updateTrip = (tripId, fields) => updateDoc(doc(db, 'trips', tripId), fields);
export const setRepaid = (tripId, key, on) => updateTrip(tripId, { [`repaid.${key}`]: on ? true : deleteField() });
