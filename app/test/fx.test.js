import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, toTwd, tripCurrencies, fxMoney, curInfo } from '../src/lib/fx.js';

test('外幣換新台幣四捨五入到元', () => {
  assert.equal(toTwd(3000, 0.2105), 632);
  assert.equal(toTwd('12.5', 32.4), 405);
  assert.equal(toTwd(100, 0), 0);
});

test('照比例分新台幣，加總等於總額', () => {
  const out = allocate(632, { a: 1000, b: 1000, c: 1000 });
  assert.equal(Object.values(out).reduce((x, y) => x + y, 0), 632);
  assert.deepEqual(Object.values(out).sort(), [210, 211, 211]);
  assert.deepEqual(allocate(405, { a: 10, b: 2.5 }), { a: 324, b: 81 });
  assert.deepEqual(allocate(100, {}), {});
});

test('依旅程國家帶出幣別', () => {
  assert.deepEqual(tripCurrencies('日本'), ['JPY']);
  assert.deepEqual(tripCurrencies('法國、義大利、瑞士'), ['EUR', 'CHF']);
  assert.deepEqual(tripCurrencies('台灣'), []);
  assert.deepEqual(tripCurrencies('澳洲'), ['AUD']);
});

test('外幣顯示', () => {
  assert.equal(fxMoney(3000, 'JPY'), '¥3,000');
  assert.equal(fxMoney(12.5, 'USD'), 'US$12.5');
  assert.equal(curInfo('XYZ').name, 'XYZ');
});
