import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortTodos, progress, missingTemplate, templateOf } from '../src/lib/todos.js';

test('依加入順序排列', () => {
  const list = [{ id: 'b', order: 2 }, { id: 'a', order: 1 }, { id: 'c', order: 2 }];
  assert.deepEqual(sortTodos(list).map(t => t.id), ['a', 'b', 'c']);
});

test('完成進度', () => {
  assert.deepEqual(progress([]), { total: 0, done: 0, pct: 0 });
  assert.deepEqual(progress([{ done: true }, { done: false }, { done: true }]), { total: 3, done: 2, pct: 67 });
});

test('範本只補清單裡還沒有的項目', () => {
  assert.equal(templateOf('潛旅')[2], '確認潛水執照');
  assert.deepEqual(templateOf('不明類型'), templateOf('自由行'));
  const miss = missingTemplate([{ text: '訂機票' }, { text: ' 換匯 ' }], '自由行');
  assert.equal(miss.length, 7);
  assert.ok(!miss.includes('訂機票') && !miss.includes('換匯'));
});
