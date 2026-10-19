import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortTodos, progress, missingTemplate, templateOf, packKindOf, packTemplate, missingPack } from '../src/lib/todos.js';

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

test('行李清單：只填台灣是國內版，其他都是出國版', () => {
  assert.equal(packKindOf({ country: '台灣', city: '花蓮' }), 'domestic');
  assert.equal(packKindOf({ country: '臺灣' }), 'domestic');
  assert.equal(packKindOf({ country: '', city: '綠島' }), 'domestic');
  assert.equal(packKindOf({ country: '日本' }), 'abroad');
  assert.equal(packKindOf({ country: '台灣、日本' }), 'abroad');
  assert.equal(packKindOf({ country: '' }), 'abroad');
});

test('行李清單範本：行動電源放隨身，潛旅多潛水裝備，已有的不重複加', () => {
  const abroad = packTemplate('abroad', '自由行');
  assert.equal(abroad.find(x => x.text.startsWith('行動電源')).group, 'carry');
  assert.ok(!abroad.some(x => x.group === 'dive'));
  assert.ok(packTemplate('domestic', '潛旅').some(x => x.group === 'dive'));
  const miss = missingPack([{ text: '護照' }, { text: ' 錢包 ' }], 'abroad', '自由行');
  assert.equal(miss.length, abroad.length - 2);
  assert.ok(!miss.some(x => x.text === '護照' || x.text === '錢包'));
});
