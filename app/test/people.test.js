import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMember, memberUids, nextOrder, moveUp, boundTo, bindProblem, cleanName } from '../src/lib/people.js';

const trip = {
  ownerId: 'u1', memberIds: ['u1', 'u2'],
  participants: {
    a: { name: '芳佑', uid: 'u1', order: 1, status: 'active' },
    b: { name: '小安', uid: '', order: 2, status: 'active' },
    c: { name: '肉格', uid: '', order: 3, status: 'inactive' },
    d: { name: '阿哲', uid: 'u2', order: 4, status: 'active' },
  },
};

test('成員', () => {
  assert.equal(isMember(trip, 'u2'), true);
  assert.equal(isMember(trip, 'u9'), false);
  assert.deepEqual(memberUids(trip), ['u1', 'u2']);
  assert.equal(nextOrder(trip), 5);
  assert.equal(nextOrder({}), 1);
});

test('往上移', () => {
  assert.deepEqual(moveUp(trip, 'b'), { b: 1, a: 2 });
  assert.deepEqual(moveUp(trip, 'a'), {});
  // 順序值重複時重新編號
  const t2 = { participants: { x: { order: 1 }, y: { order: 1 }, z: { order: 1 } } };
  const r = moveUp(t2, 'z');
  const after = Object.fromEntries(Object.keys(t2.participants).map(k => [k, r[k] ?? 1]));
  assert.deepEqual(new Set(Object.values(after)).size, 3);
});

test('綁定檢查', () => {
  assert.equal(boundTo(trip, 'u2').id, 'd');
  assert.equal(bindProblem(trip, 'u3', 'b'), '');
  assert.equal(bindProblem(trip, 'u3', 'new'), '');
  assert.match(bindProblem(trip, 'u3', 'd'), /已經綁定別的帳號/);
  assert.match(bindProblem(trip, 'u3', 'c'), /已停用/);
  assert.match(bindProblem(trip, 'u2', 'b'), /已經綁定/);
  assert.match(bindProblem(trip, 'u3', 'zz'), /找不到/);
  assert.equal(cleanName('  阿凱  '), '阿凱');
});
