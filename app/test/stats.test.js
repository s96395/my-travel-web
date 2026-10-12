import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, myShare, isSplit } from '../src/lib/stats.js';
import { viewTrip, pickNextTrip, countdown, myParticipantId } from '../src/lib/trips.js';

const raw = (id, o) => ({ id, title: id, country: '日本', city: '京都', tripType: '自由行', status: '已完成',
  startDate: '2026-01-01', endDate: '2026-01-03', ownerId: 'U1', participants: { pMe: { name: '我', uid: 'U1', order: 1 }, pB: { name: '肉格', order: 2 } }, ...o });

test('我的支出依同行者 ID 計算，舊資料以 UID 為鍵也認得', () => {
  assert.equal(myShare({ personalShares: { pMe: 300, pB: 200 } }, 'pMe', 'U1'), 300);
  assert.equal(myShare({ personalShares: { U1: 150 } }, 'pMe', 'U1'), 150);
  assert.equal(myShare({ personalShares: { pB: 500 } }, 'pMe', 'U1'), 0);
  assert.equal(myShare({ amount: 500 }, 'pMe', 'U1'), 0);
});

test('未確認只算還沒分攤的支出', () => {
  const trips = [viewTrip(raw('a'))];
  const ex = new Map([['a', [
    { amount: 1000, personalShares: { pMe: 500, pB: 500 } },
    { amount: 300 },
    { amount: 200, personalShares: { pB: 200 } },
  ]]]);
  const s = computeStats(trips, ex, 'U1');
  assert.deepEqual(s.yearly, [{ year: '2026', mine: 500, unconfirmed: 1 }]);
  assert.equal(s.typeTotal, 500);
  assert.equal(s.yearTotals['2026'], 500);
});

test('依類型加總等於各年度旅程總支出合計，只算分給自己的', () => {
  const trips = [viewTrip(raw('a')), viewTrip(raw('b', { tripType: '潛旅', startDate: '2025-05-01', endDate: '2025-05-03', totalTanks: 6, city: '墾丁', country: '台灣' })), viewTrip(raw('c', { tripType: '跟團', totalExpense: 9000 }))];
  const ex = new Map([['a', [{ amount: 1000 }]], ['b', [{ amount: 2500, personalShares: { U1: 2500 } }]]]);
  const s = computeStats(trips, ex, 'U1');
  const yearSum = Object.values(s.yearTotals).reduce((a, b) => a + b, 0);
  assert.equal(s.typeTotal, yearSum);
  assert.equal(s.typeTotal, 2500);
  assert.deepEqual(s.tanks, [['墾丁', 6]]);
  assert.equal(s.tankTotal, 6);
});

test('加入別人的旅程也只算分給自己的', () => {
  const trips = [viewTrip(raw('a', { ownerId: 'U9', tripType: '潛旅', participants: { pO: { name: 'Y SHEN', uid: 'U9', order: 1 }, pMe: { name: '俞皓', uid: 'U1', order: 2 } } }))];
  const ex = new Map([['a', [{ amount: 16000, personalShares: { pO: 16000 } }, { amount: 600, personalShares: { pO: 300, pMe: 300 } }, { amount: 100 }]]]);
  const s = computeStats(trips, ex, 'U1');
  assert.equal(s.typeTotal, 300);
  assert.equal(s.yearTotals['2026'], 300);
  assert.equal(s.yearly[0].mine, 300);
});

test('去過的國家只算已完成或已封存', () => {
  const trips = [viewTrip(raw('a')), viewTrip(raw('b', { country: '韓國', status: '規劃中' })), viewTrip(raw('c', { status: '已封存' }))];
  assert.deepEqual(computeStats(trips, new Map(), 'U1').countries, [['日本', 2]]);
});

test('下一趟：旅行中的優先，其次最近要出發的', () => {
  const t = (id, start, end) => viewTrip(raw(id, { startDate: start, endDate: end }));
  const list = [t('past', '2026-01-01', '2026-01-03'), t('far', '2026-12-01', '2026-12-05'), t('soon', '2026-11-20', '2026-11-25')];
  assert.equal(pickNextTrip(list, '2026-10-10').id, 'soon');
  assert.equal(pickNextTrip([...list, t('now', '2026-10-08', '2026-10-12')], '2026-10-10').id, 'now');
  assert.deepEqual(countdown(list[2], '2026-10-10'), { ongoing: false, left: 41 });
  assert.equal(pickNextTrip([list[0]], '2026-10-10'), null);
});

test('找出登入者對應的同行者', () => {
  assert.equal(myParticipantId(raw('a'), 'U1'), 'pMe');
  assert.equal(myParticipantId(raw('a'), 'U9'), null);
  assert.equal(isSplit({ personalShares: [] }), false);
});
