import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTrip, hasChanges, totals } from '../src/lib/migrate.js';

let n = 0;
const deps = names => ({ newId: () => `new${++n}`, nameOf: uid => names[uid] || '', newShareKey: () => 'key1' });
const OLD = {
  id: 't1', title: '首爾', startDate: '2025-10-02', endDate: '2025-10-06', shareKey: 'k',
  participants: { p1: { name: '芳佑', uid: 'u1', order: 1 }, p2: { name: '小安', uid: '', order: 2 } },
  flight: { airline: '台灣虎航', flightCode: 'T7K2PQ', depFlightNo: 'IT602', depDate: '2025-10-02', depAirport: '桃園 TPE（第 1 航廈）', depTime: '06.50', depArrAirport: '首爾 ICN（第 1 航廈）', arrTime: '10:25' },
  hotel: { hotelName: 'L7 明洞', hotelAddr: '退溪路 137', hotelCode: 'L7-99812' },
};

test('舊班機、住宿各建一筆，記下 fromLegacy，已轉過的不重複', () => {
  const p = planTrip({ trip: OLD }, deps({}));
  assert.equal(p.newFlights.length, 1);
  assert.equal(p.newFlights[0].fromLegacy, 'dep');
  assert.equal(p.newFlights[0].flightNo, 'IT602');
  assert.equal(p.newFlights[0].pnr, 'T7K2PQ');
  assert.equal(p.newStays[0].name, 'L7 明洞');
  assert.equal(p.newStays[0].checkInDate, '2025-10-02');
  const again = planTrip({ trip: OLD, flights: [{ fromLegacy: 'dep' }], stays: [{ fromLegacy: 'hotel' }] }, deps({}));
  assert.equal(again.newFlights.length + again.newStays.length, 0);
  assert.equal(hasChanges(again), false);
});

test('分攤的帳號換成同行者 ID，找不到的補建同行者，金額不變', () => {
  const expenses = [
    { id: 'e1', name: '晚餐', amount: 900, personalShares: { u1: 300, u2: 300, p2: 300 } },
    { id: 'e2', name: '車票', amount: 100, personalShares: { u2: 50, u3: 50 }, paymentMethod: '現金' },
    { id: 'e3', name: '新格式', amount: 60, personalShares: { p1: 30, p2: 30 }, payMethod: '刷卡' },
  ];
  const p = planTrip({ trip: OLD, expenses }, deps({ u2: '阿哲' }));
  assert.deepEqual(p.newParticipants.map(x => [x.name, x.uid, x.order]), [['阿哲', 'u2', 3], ['旅伴', 'u3', 4]]);
  const [a, b] = p.expenseUpdates;
  const u2 = p.newParticipants[0].id, u3 = p.newParticipants[1].id;
  assert.deepEqual(a.fields.personalShares, { p1: 300, [u2]: 300, p2: 300 });
  assert.deepEqual(b.fields, { personalShares: { [u2]: 50, [u3]: 50 }, payMethod: '現金' });
  assert.equal(p.expenseUpdates.length, 2);
  assert.deepEqual(p.tripUpdate[`participants.${u2}`], { name: '阿哲', uid: 'u2', order: 3, status: 'active' });
  assert.equal(p.problems.length, 0);
});

test('同名不合併：名字一樣但帳號不同，仍各自一位', () => {
  const p = planTrip({ trip: OLD, expenses: [{ id: 'e1', amount: 10, personalShares: { u9: 10 } }] }, deps({ u9: '芳佑' }));
  assert.equal(p.newParticipants.length, 1);
  assert.equal(p.newParticipants[0].name, '芳佑');
});

test('圖片網址統一為 url，沒有邀請碼的補一組', () => {
  const p = planTrip({ trip: { ...OLD, shareKey: '' }, images: [{ id: 'i1', imageUrl: 'https://x/1.jpg' }, { id: 'i2', url: 'https://x/2.jpg' }] }, deps({}));
  assert.deepEqual(p.imageUpdates, [{ id: 'i1', fields: { url: 'https://x/1.jpg' } }]);
  assert.equal(p.tripUpdate.shareKey, 'key1');
});

test('核對用的筆數與總金額', () => {
  assert.deepEqual(totals([{ amount: 10.5 }, { amount: '20' }, {}]), { count: 3, amount: 30.5 });
});
