import test from 'node:test';
import assert from 'node:assert/strict';
import { countryNames, matchPlaces } from '../src/lib/world.js';

test('國家選單：常用的排前面，每個名稱都對得到國家', () => {
  const names = countryNames();
  assert.deepEqual(names.slice(0, 3), ['台灣', '日本', '韓國']);
  assert.equal(new Set(names).size, names.length);
  names.forEach(n => assert.equal(matchPlaces(n).unmatched.length, 0, n));
});

test('國家文字：可填多國，打錯的列在 unmatched', () => {
  assert.equal(matchPlaces('泰國、越南').ids.length, 2);
  assert.deepEqual(matchPlaces('日本、火星').unmatched, ['火星']);
});
