import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftDate, copyEnd, planCopy } from '../src/lib/copy.js';

test('日期往後挪，時間不變；跨月跨年也對', () => {
  assert.equal(shiftDate('2026-11-20', 10), '2026-11-30');
  assert.equal(shiftDate('2026-12-30 07:10', 3), '2027-01-02 07:10');
  assert.equal(shiftDate('2027-03-01', -1), '2027-02-28');
  assert.equal(shiftDate('', 5), '');
  assert.equal(copyEnd({ startDate: '2026-11-20', endDate: '2026-11-25' }, '2027-04-01'), '2027-04-06');
});

const src = {
  id: 'old', title: '京都賞楓', country: '日本', city: '京都', tripType: '自由行', startDate: '2026-11-20', endDate: '2026-11-25',
  status: '已完成', totalExpense: 9999, ownerId: 'me', memberIds: ['me', 'an'], shareKey: 'x'.repeat(20), repaid: { a: true },
  participants: { p1: { name: '我', uid: 'me', order: 1, status: 'active' }, p2: { name: '小安', uid: 'an', order: 2, status: 'active' }, p3: { name: '舊朋友', uid: '', order: 3, status: 'inactive' } },
  fund: { on: true, keeper: 'p2' },
};
const subs = {
  itinerary: [{ id: 'i1', day: 2, title: '清水寺', book: 'done', createdByUid: 'an', createdAt: 1 }, { id: 'i2', day: 2, title: '備案', backupOf: 'i1' }],
  wishlist: [{ id: 'w1', title: '錦市場', visited: true, lat: 1, lng: 2, exact: true, geoAt: 123 }],
  flights: [{ id: 'f1', dep: '2026-11-20 07:10', arr: '2026-11-20 10:50' }],
  stays: [{ id: 's1', checkInDate: '2026-11-20', checkOutDate: '2026-11-23' }],
  transits: [], todos: [{ id: 't1', text: '換匯', done: true }],
  packing: [{ id: 'k1', uid: 'me', text: '護照', done: true }, { id: 'k2', uid: 'an', text: '別人的', done: false }],
};
let n = 0;
const newId = () => `n${++n}`;
const all = new Set(['itinerary', 'wishlist', 'flights', 'stays', 'transits', 'todos', 'packing']);

test('整趟複製：日期挪動、勾選清掉、只帶自己的行李、不帶支出與共編成員', () => {
  n = 0;
  const { trip, subs: out } = planCopy(src, subs, { title: '京都再訪', startDate: '2027-04-01', parts: all, people: true, uid: 'me', nickname: '我', newId });
  assert.equal(trip.startDate, '2027-04-01');
  assert.equal(trip.endDate, '2027-04-06');
  assert.equal(trip.status, '規劃中');
  assert.equal(trip.totalExpense, 0);
  assert.deepEqual(trip.memberIds, ['me']);
  assert.equal(trip.repaid, undefined);
  assert.equal(trip.shareKey, undefined);
  assert.deepEqual(Object.keys(trip.participants), ['p1', 'p2']);
  assert.equal(trip.participants.p2.uid, '');
  assert.deepEqual(trip.fund, { on: true, keeper: 'p2' });
  assert.equal(out.flights[0].data.dep, '2027-04-01 07:10');
  assert.equal(out.stays[0].data.checkOutDate, '2027-04-04');
  assert.equal(out.itinerary[0].data.book, 'need');
  assert.equal(out.itinerary[0].data.createdByUid, undefined);
  assert.equal(out.itinerary[1].data.backupOf, out.itinerary[0].id);
  assert.equal(out.wishlist[0].data.visited, false);
  assert.equal(out.wishlist[0].data.geoAt, 123);
  assert.equal(out.todos[0].data.done, false);
  assert.deepEqual(out.packing.map(x => x.data.text), ['護照']);
  // 原本的資料沒有被改到
  assert.equal(subs.itinerary[0].book, 'done');
  assert.equal(subs.wishlist[0].visited, true);
});

test('不帶同行者時只留自己；別人複製時自己變成建立者', () => {
  n = 0;
  const { trip, subs: out } = planCopy(src, subs, { title: 'x', startDate: '2026-11-20', parts: new Set(['flights']), people: false, uid: 'an', nickname: '小安', newId });
  assert.equal(trip.ownerId, 'an');
  assert.deepEqual(Object.values(trip.participants).map(p => [p.name, p.uid]), [['小安', 'an']]);
  assert.deepEqual(Object.keys(out), ['flights']);
  assert.equal(out.flights[0].data.dep, '2026-11-20 07:10');
  const solo = planCopy({ ...src, participants: {} }, subs, { title: 'x', startDate: '2026-11-20', parts: new Set(), people: true, uid: 'me', nickname: '我', newId });
  assert.deepEqual(Object.values(solo.trip.participants).map(p => p.uid), ['me']);
  assert.equal(solo.trip.fund.keeper, undefined);
});
