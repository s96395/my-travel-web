// 範例旅程（內容同雛形）：測試環境可以一次載入 6 趟；示範旅程只放京都那趟，正式環境也能用
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import { newShareKey } from './trips.js';

const TRIPS = [
  { title: '京都賞楓', country: '日本', city: '京都', tripType: '自由行', status: '規劃中', startDate: '2026-11-20', endDate: '2026-11-25', code: 'KIX',
    // [名稱, 金額, 分攤方式, 分類, 付款人]；付款人 fund 是公費
    expenses: [['京都飯店 3 晚', 27000, 'equal', '住宿', 'me'], ['HARUKA 車票 ×3', 5520, 'equal', '交通', 'fund'], ['錦市場午餐', 2400, 'custom', '餐飲', 'an'],
      ['和服體驗 2 人', 6000, 'none', '景點', 'rou'], ['嵐山小火車', 2640, 'equal', '交通', ''], ['燒肉晚餐', 5200, 'equal', '餐飲', 'rou'], ['伏見稻荷御守', 800, 'me', '購物', 'me']] },
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
  [2, 'attraction', '和服體驗', '我和小安兩人', 'must', '10:00', '東山'],
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

// 京都的班機與住宿（同雛形）
const KYOTO_FLIGHTS = [
  { leg: '去程', airline: '中華航空', flightNo: 'CI152', from: 'TPE', fromCity: '台北桃園', fromTerminal: '第 1 航廈', fromTz: '+8', dep: '2026-11-20 07:10', to: 'KIX', toCity: '大阪關西', toTerminal: '第 1 航廈', toTz: '+9', arr: '2026-11-20 10:50', pnr: '6KXQ2M', note: '託運 23 公斤' },
  { leg: '回程', airline: '星宇航空', flightNo: 'JX821', from: 'KIX', fromCity: '大阪關西', fromTerminal: '第 1 航廈', fromTz: '+9', dep: '2026-11-25 12:35', to: 'TPE', toCity: '台北桃園', toTerminal: '第 1 航廈', toTz: '+8', arr: '2026-11-25 14:40', pnr: 'Q8T3VA', note: '' },
];
const KYOTO_STAYS = [
  { name: 'Hotel Resol 京都四條室町', address: '京都府京都市下京區四條通室町東入函谷鉾町 82', checkInDate: '2026-11-20', checkOutDate: '2026-11-23', confirmCode: 'HR-558201', pin: '4826', note: '雙床房 ×2' },
  { name: '嵐山溫泉 花傳抄', address: '京都府京都市西京區嵐山上河原町 1', checkInDate: '2026-11-23', checkOutDate: '2026-11-25', confirmCode: 'KD-20931', pin: '', note: '含早晚餐' },
];
const KYOTO_TODOS = [['確認護照效期', true], ['保旅平險', true], ['預約和服體驗', true], ['嵐山小火車劃位', true], ['換匯', false], ['買 eSIM', false], ['充好行動電源', false]];
// 首爾用舊版的單筆格式，方便檢查舊資料的顯示
const SEOUL_LEGACY = {
  flight: { airline: '台灣虎航', flightCode: 'T7K2PQ', depFlightNo: 'IT602', depDate: '2025-10-02', depAirport: '桃園 TPE（第 1 航廈）', depTime: '06.50', depArrAirport: '首爾 ICN（第 1 航廈）', arrTime: '10:25', retFlightNo: 'IT603', retDate: '2025-10-06', retAirport: '首爾 ICN（第 1 航廈）', retDepTime: '11:45', retArrTime: '13:30' },
  hotel: { hotelName: 'L7 明洞', hotelAddr: '首爾特別市中區退溪路 137', hotelCode: 'L7-99812', hotelPin: '', checkIn: '15:00', checkOut: '11:00' },
};
// 同行者：我（綁定帳號）、小安、肉格（兩位都還沒綁定帳號）
// 旅程與支出分兩次寫入：安全規則要讀到已存在的旅程，才允許寫支出
// demo：只加京都一趟（標題加「示範」），回傳那趟的 id
export async function addSampleTrips(user, nickname, demo = false) {
  const batch = writeBatch(db);
  const later = writeBatch(db);
  let first = '';
  for (const t of demo ? [{ ...TRIPS[0], title: `${TRIPS[0].title}（示範）` }] : TRIPS) {
    const ref = doc(collection(db, 'trips'));
    first ||= ref.id;
    const me = doc(collection(db, 'trips')).id, an = doc(collection(db, 'trips')).id, rou = doc(collection(db, 'trips')).id;
    const people = [me, an, rou];
    const { expenses, ...fields } = t;
    batch.set(ref, {
      ...fields, ...(fields.code === 'ICN' ? SEOUL_LEGACY : {}), totalTanks: fields.totalTanks || 0, totalExpense: expenses.reduce((a, e) => a + e[1], 0),
      shareKey: newShareKey(), ownerId: user.uid, ownerName: nickname, memberIds: [user.uid],
      participants: {
        [me]: { name: nickname, uid: user.uid, order: 1, status: 'active' },
        [an]: { name: '小安', uid: '', order: 2, status: 'active' },
        [rou]: { name: '肉格', uid: '', order: 3, status: 'active' },
      },
      ...(fields.code === 'KIX' ? { fund: { on: true, keeper: an } } : {}),
      createdByName: nickname, createdAt: serverTimestamp(), sample: true,
    });
    const pid = { me, an, rou, fund: 'fund', '': '' };
    for (const [name, amount, mode, category = '其他', payer = ''] of expenses) {
      const e = { name, amount, category, payMethod: payer === 'fund' ? '現金' : '刷卡', payerId: pid[payer], createdByUid: user.uid, createdByName: nickname, createdAt: serverTimestamp() };
      if (mode === 'equal') e.personalShares = splitEqually(amount, people);
      if (mode === 'custom') e.personalShares = { [me]: amount / 2, [an]: amount / 2 };
      if (mode === 'me') e.personalShares = { [me]: amount };
      if (e.personalShares) e.splitMode = mode === 'equal' ? 'equal' : 'custom';
      later.set(doc(collection(db, `trips/${ref.id}/expenses`)), e);
    }
    if (t.code === 'KIX') {
      const by = { createdByUid: user.uid, createdByName: nickname, createdAt: serverTimestamp() };
      KYOTO_FLIGHTS.forEach(f => later.set(doc(collection(db, `trips/${ref.id}/flights`)), { ...f, ...by }));
      KYOTO_STAYS.forEach(st => later.set(doc(collection(db, `trips/${ref.id}/stays`)), { ...st, ...by }));
      [me, an, rou].forEach(p => later.set(doc(collection(db, `trips/${ref.id}/fundDeposits`)), { pid: p, amount: 3000, ...by }));
      KYOTO_TODOS.forEach(([text, done], i) => later.set(doc(collection(db, `trips/${ref.id}/todos`)), { text, done, order: i + 1, ...by }));
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
  return first;
}

// 平均分攤：餘數從名單第一位起每人多分 1 元（同舊版）
export function splitEqually(amount, ids) {
  const base = Math.floor(amount / ids.length), rest = amount - base * ids.length;
  return Object.fromEntries(ids.map((id, i) => [id, base + (i < rest ? 1 : 0)]));
}
