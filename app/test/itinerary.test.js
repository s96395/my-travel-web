import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItem, sortItems, planMove, planDays, nextOrder } from '../src/lib/itinerary.js';

const mk = (id, day, order) => normalizeItem({ id, day, order, title: id });

test('舊欄位名稱可以讀到', () => {
  const it = normalizeItem({ id: 'a', day: '2', activity: '清水寺', location: '東山', type: 'xxx', priority: 'must', reservationTime: '10:00' });
  assert.deepEqual([it.day, it.title, it.area, it.type, it.priority, it.time], [2, '清水寺', '東山', 'other', 'must', '10:00']);
  assert.equal(normalizeItem({ id: 'b', day: '' }).day, 0);
});

test('有順序的排前面，沒排天數的在最後', () => {
  const list = sortItems([mk('c', 1, null), mk('b', 1, 2), mk('a', 1, 1), mk('z', 0, 1), mk('d', 2, 1)]);
  assert.deepEqual(list.map(i => i.id), ['a', 'b', 'c', 'd', 'z']);
});

test('同一天換順序只寫有變的項目', () => {
  const items = [mk('a', 1, 1), mk('b', 1, 2), mk('c', 1, 3)];
  assert.deepEqual(planMove(items, 'c', { day: 1, beforeId: 'a' }), [
    { id: 'c', day: 1, order: 1 }, { id: 'a', day: 1, order: 2 }, { id: 'b', day: 1, order: 3 },
  ]);
  assert.deepEqual(planMove(items, 'a', { day: 1, beforeId: 'b' }), []);
});

test('跨天移動：原本那天重新編號，新的一天插入指定位置', () => {
  const items = [mk('a', 1, 1), mk('b', 1, 2), mk('c', 1, 3), mk('x', 2, 1), mk('y', 2, 2)];
  assert.deepEqual(planMove(items, 'a', { day: 2, beforeId: 'y' }), [
    { id: 'b', day: 1, order: 1 }, { id: 'c', day: 1, order: 2 }, { id: 'a', day: 2, order: 2 }, { id: 'y', day: 2, order: 3 },
  ]);
  assert.deepEqual(planMove(items, 'b', { day: 3 }), [{ id: 'c', day: 1, order: 2 }, { id: 'b', day: 3, order: 1 }]);
});

test('從還沒排天數的地方移出來', () => {
  const items = [mk('z', 0, null), mk('w', 0, null), mk('a', 1, 1)];
  assert.deepEqual(planMove(items, 'z', { day: 1 }), [{ id: 'z', day: 1, order: 2 }]);
});

test('天數與下一個順序', () => {
  assert.equal(planDays([mk('a', 8, 1)], 6), 8);
  assert.equal(planDays([], 0), 1);
  assert.equal(nextOrder([mk('a', 1, 4), mk('b', 1, null), mk('c', 2, 9)], 1), 5);
});
