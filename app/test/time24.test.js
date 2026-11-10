import test from 'node:test';
import assert from 'node:assert/strict';
import { maskTime, normTime, joinDateTime } from '../src/lib/time24.js';

test('打字時整理成 HH:MM', () => {
  assert.equal(maskTime('1'), '1');
  assert.equal(maskTime('14'), '14');
  assert.equal(maskTime('143'), '14:3');
  assert.equal(maskTime('14:30'), '14:30');
  assert.equal(maskTime('9'), '09');
  assert.equal(maskTime('930'), '09:30');
  assert.equal(maskTime('12345'), '12:34');
  assert.equal(maskTime('下午2點'), '2');
  assert.equal(maskTime('1:'), '01:');
});

test('有冒號時照冒號切開，打字整理後再補齊結果不變', () => {
  for (const [typed, want] of [['0:15', '00:15'], ['1:30', '01:30'], ['2:30', '02:30'], ['9:5', '09:05'], ['14:30', '14:30'], ['1430', '14:30'], ['930', '09:30'], ['0015', '00:15']]) {
    assert.equal(normTime(maskTime(typed)), want, typed);
  }
  // 一個字一個字打進去，每次都經過整理
  const typeIn = str => [...str].reduce((v, c) => maskTime(v + c), '');
  assert.equal(normTime(typeIn('0:15')), '00:15');
  assert.equal(normTime(typeIn('1:30')), '01:30');
  assert.equal(normTime(typeIn('2:30')), '02:30');
});

test('離開欄位時補齊或判斷錯誤', () => {
  assert.equal(normTime(''), '');
  assert.equal(normTime('9'), '09:00');
  assert.equal(normTime('09'), '09:00');
  assert.equal(normTime('930'), '09:30');
  assert.equal(normTime('1430'), '14:30');
  assert.equal(normTime('14:5'), '14:05');
  assert.equal(normTime('0:15'), '00:15');
  assert.equal(normTime('23:59'), '23:59');
  assert.equal(normTime('24:00'), null);
  assert.equal(normTime('12:60'), null);
  assert.equal(normTime('abc'), null);
});

test('日期與時間合成', () => {
  assert.equal(joinDateTime('2026-11-21', '0:15'), '2026-11-21T00:15');
  assert.equal(joinDateTime('2026-11-21', ''), '');
  assert.equal(joinDateTime('', '12:00'), '');
  assert.equal(joinDateTime('2026-11-21', '25:00'), '');
});
