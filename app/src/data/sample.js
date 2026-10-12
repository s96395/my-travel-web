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

// 京都的每日行程（同雛形）：[天, 類型, 名稱, 備註, 優先度, 預約時間, 區域]
const KYOTO_PLAN = [
  [1, 'transport', '桃園機場 → 關西機場', 'CI152，07:10 起飛', '', '', ''],
  [1, 'transport', 'HARUKA 到京都車站', '四人用公費買票', '', '', ''],
  [1, 'stay', '入住四條室町飯店', '15:00 後可入住', '', '', '四條'],
  [1, 'restaurant', '錦市場邊走邊吃', '玉子燒、豆乳甜甜圈', 'want', '', '四條'],
  [2, 'attraction', '清水寺', '早上 8 點前人比較少', 'must', '', '東山'],
  [2, 'attraction', '和服體驗', '芳佑、小安兩人', 'must', '10:00', '東山'],
  [2, 'attraction', '二年坂、三年坂', '', 'want', '', '東山'],
  [2, 'restaurant', '祇園晚餐', '', 'optional', '', '祇園'],
  [3, 'attraction', '嵐山竹林小徑', '', 'must', '', '嵐山'],
  [3, 'attraction', '嵐山小火車', '已劃位 2 車', 'must', '13:32', '嵐山'],
  [3, 'attraction', '天龍寺', '', 'want', '', '嵐山'],
  [4, 'attraction', '東福寺通天橋', '楓葉最佳觀賞點', 'must', '', '伏見'],
  [4, 'attraction', '伏見稻荷大社', '', 'want', '', '伏見'],
  [4, 'restaurant', '燒肉晚餐', '肉格請客先付', '', '18:30', ''],
  [5, 'attraction', '永觀堂夜楓', '需排隊入場', 'must', '17:30', '左京'],
  [5, 'shopping', '京都車站買伴手禮', '八橋、抹茶', 'want', '', '京都車站'],
  [6, 'transport', '關西機場 → 桃園機場', 'JX821，12:35 起飛', '', '', ''],
];

// 同行者：我（綁定帳號）、小安、肉格（兩位都還沒綁定帳號）
// 旅程與支出分兩次寫入：安全規則要讀到已存在的旅程，才允許寫支出
export async function addSampleTrips(user, nickname) {
  const batch = writeBatch(db);
  const later = writeBatch(db);
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
      later.set(doc(collection(db, `trips/${ref.id}/expenses`)), e);
    }
    if (t.code === 'KIX') {
      const orders = {};
      for (const [day, type, title, note, priority, reservationTime, area] of KYOTO_PLAN) {
        orders[day] = (orders[day] || 0) + 1;
        later.set(doc(collection(db, `trips/${ref.id}/itinerary`)), {
          day, order: orders[day], type, title, note, priority, reservationTime, area,
          createdByUid: user.uid, createdByName: nickname, createdAt: serverTimestamp(),
        });
      }
    }
  }
  await batch.commit();
  await later.commit();
}

// 平均分攤：餘數從名單第一位起每人多分 1 元（同舊版）
export function splitEqually(amount, ids) {
  const base = Math.floor(amount / ids.length), rest = amount - base * ids.length;
  return Object.fromEntries(ids.map((id, i) => [id, base + (i < rest ? 1 : 0)]));
}
