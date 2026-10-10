// 測試環境用的範例旅程（內容同雛形），正式環境不會出現這個功能
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import { newShareKey } from './trips.js';

const TRIPS = [
  { title: '京都賞楓', country: '日本', city: '京都', tripType: '自由行', status: '規劃中', startDate: '2026-11-20', endDate: '2026-11-25', code: 'KIX',
    expenses: [['京都飯店 3 晚', 27000, 'equal'], ['HARUKA 車票 ×4', 7360, 'equal'], ['錦市場午餐', 2400, 'custom'], ['和服體驗 2 人', 6000, 'none'], ['伏見稻荷御守', 800, 'me']] },
  { title: '綠島潛水', country: '台灣', city: '綠島', tripType: '潛旅', status: '已完成', startDate: '2026-07-10', endDate: '2026-07-13', code: 'GNI', totalTanks: 8,
    expenses: [['潛水套裝 8 支', 28800, 'equal'], ['民宿 3 晚', 9800, 'equal']] },
  { title: '北海道雪祭', country: '日本', city: '北海道', tripType: '跟團', status: '已完成', startDate: '2026-02-03', endDate: '2026-02-08', code: 'CTS',
    expenses: [['團費', 52000, 'equal']] },
  { title: '首爾秋天', country: '韓國', city: '首爾', tripType: '自由行', status: '已完成', startDate: '2025-10-02', endDate: '2025-10-06', code: 'ICN',
    expenses: [['機票', 19600, 'equal'], ['明洞住宿', 9600, 'equal'], ['烤肉', 2000, 'none']] },
  { title: '墾丁潛水', country: '台灣', city: '墾丁', tripType: '潛旅', status: '已完成', startDate: '2025-05-16', endDate: '2025-05-18', code: 'KTG', totalTanks: 6,
    expenses: [['潛水 6 支', 12800, 'equal']] },
  { title: '曼谷吃吃喝喝', country: '泰國', city: '曼谷', tripType: '自由行', status: '已完成', startDate: '2024-12-27', endDate: '2024-12-31', code: 'BKK',
    expenses: [['飯店', 18000, 'equal'], ['夜市', 6500, 'none'], ['按摩', 3000, 'none']] },
];

// 同行者：我（綁定帳號）、小安、肉格（兩位都還沒綁定帳號）
export async function addSampleTrips(user, nickname) {
  const batch = writeBatch(db);
  for (const t of TRIPS) {
    const ref = doc(collection(db, 'trips'));
    const me = doc(collection(db, 'trips')).id, an = doc(collection(db, 'trips')).id, rou = doc(collection(db, 'trips')).id;
    const people = [me, an, rou];
    const { expenses, ...fields } = t;
    batch.set(ref, {
      ...fields, totalTanks: fields.totalTanks || 0, totalExpense: expenses.reduce((a, e) => a + e[1], 0),
      shareKey: newShareKey(), ownerId: user.uid, ownerName: nickname, memberIds: [user.uid],
      participants: {
        [me]: { name: nickname, uid: user.uid, order: 1, status: 'active' },
        [an]: { name: '小安', uid: '', order: 2, status: 'active' },
        [rou]: { name: '肉格', uid: '', order: 3, status: 'active' },
      },
      createdByName: nickname, createdAt: serverTimestamp(), sample: true,
    });
    for (const [name, amount, mode] of expenses) {
      const e = { name, amount, category: '其他', payMethod: '現金', createdByName: nickname, createdAt: serverTimestamp() };
      if (mode === 'equal') e.personalShares = splitEqually(amount, people);
      if (mode === 'custom') e.personalShares = { [me]: amount / 2, [an]: amount / 2 };
      if (mode === 'me') e.personalShares = { [me]: amount };
      batch.set(doc(collection(db, `trips/${ref.id}/expenses`)), e);
    }
  }
  await batch.commit();
}

// 平均分攤：餘數從名單第一位起每人多分 1 元（同舊版）
export function splitEqually(amount, ids) {
  const base = Math.floor(amount / ids.length), rest = amount - base * ids.length;
  return Object.fromEntries(ids.map((id, i) => [id, base + (i < rest ? 1 : 0)]));
}
