import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseCsv, parseSavedList, findCoords, clusterNear, farOff, openAt } from '../src/lib/places.js';

const { coordsFrom } = createRequire(import.meta.url)('../../api/place.js');

test('解析 CSV：引號裡的逗號、換行與跳脫', () => {
  assert.deepEqual(parseCsv('a,"b,c","d\n""e"""\r\nx,y,z'), [['a', 'b,c', 'd\n"e"'], ['x', 'y', 'z']]);
});

test('解析 Google 匯出的已儲存清單（中文欄位、空白列）', () => {
  const csv = '﻿標題,筆記,網址,標籤,留言\n,,,,\nMillac The Market,早上去,https://www.google.com/maps/place/Millac/data=!4m2!3m1!1s0x1:0x2,,\n';
  assert.deepEqual(parseSavedList(csv), [{ title: 'Millac The Market', note: '早上去', url: 'https://www.google.com/maps/place/Millac/data=!4m2!3m1!1s0x1:0x2' }]);
  assert.equal(parseSavedList('Title,Note,URL\nA,,https://maps.app.goo.gl/x\n')[0].title, 'A');
  // 清單有說明時，第一行是說明，欄位名稱在後面
  assert.equal(parseSavedList('阿孝開團地點\n\n標題,筆記,網址,標籤,留言\n,,,,\nA,,https://www.google.com/maps/place/A\n').length, 1);
  assert.equal(parseSavedList('名稱,金額\n午餐,100\n'), null);
});

test('伺服器只認地點標記，不用地圖中心', () => {
  assert.deepEqual(coordsFrom('...!3d35.1531!4d129.1186!16s...'), { lat: 35.1531, lng: 129.1186 });
  assert.equal(coordsFrom('https://www.google.com/maps/place/x/@39.04,-84.5,17z'), null); // 美國的伺服器拿到的地圖中心
  assert.equal(coordsFrom('沒有座標'), null);
});

test('從 Google 地圖連結的地點代碼算出座標', async () => {
  const { coordsFromUrl } = await import('../src/lib/places.js');
  // 唐吉訶德國際通店，實際位置約 26.2158, 127.6879
  const c = coordsFromUrl('https://www.google.com/maps/place/Don+Quijote+Kokusai-dori/data=!4m2!3m1!1s0x34e5697a0d58c635:0x7c12668747aa6dd3');
  assert.ok(Math.abs(c.lat - 26.2158) < 0.001 && Math.abs(c.lng - 127.6878) < 0.001, JSON.stringify(c));
  assert.deepEqual(coordsFromUrl('https://www.google.com/maps/place/x/data=!3m1!4b1!4m6!3m5!1s0x1:0x2!8m2!3d35.1531!4d129.1186'), { lat: 35.1531, lng: 129.1186 });
  assert.equal(coordsFromUrl('https://www.google.com/maps/place/x/@22.2793,114.1628,17z'), null);
  assert.equal(coordsFromUrl('https://maps.app.goo.gl/abc'), null);
});

test('查座標：同時查、查不到的留空', async () => {
  const places = [{ url: 'a' }, { url: 'b' }, { url: 'c' }, { url: 'd' }];
  const fake = async u => (u.endsWith('b') ? { ok: false } : { ok: true, json: async () => (u.endsWith('c') ? {} : u.endsWith('d') ? { url: 'https://www.google.com/maps/place/x/data=!3d1.5!4d2.5' } : { lat: 1, lng: 2 }) });
  assert.deepEqual(await findCoords(places, fake), [{ lat: 1, lng: 2 }, null, null, { lat: 1.5, lng: 2.5 }]);
});

test('想去清單依離這天行程的距離排序', async () => {
  const { distanceKm, nearDay, kmText } = await import('../src/lib/places.js');
  assert.ok(Math.abs(distanceKm({ lat: 25.0478, lng: 121.5170 }, { lat: 25.0330, lng: 121.5654 }) - 5.1) < 0.2); // 台北車站到 101
  const day = [{ lat: 26.21, lng: 127.68 }];
  const places = [{ title: '遠', lat: 26.70, lng: 127.88 }, { title: '沒座標' }, { title: '近', lat: 26.215, lng: 127.685 }];
  assert.deepEqual(nearDay(places, day).map(p => p.title), ['近', '遠', '沒座標']);
  assert.deepEqual(nearDay(places, []).map(p => p.title), ['遠', '沒座標', '近']);
  assert.equal(kmText(0.42), '400 公尺');
  assert.equal(kmText(3.26), '3.3 公里');
  assert.equal(kmText(25.4), '25 公里');
});

test('依距離自動分組：1 公里內的放一起，單獨一個的不分組', () => {
  const p = (id, lat, lng) => ({ id, lat, lng });
  const g = clusterNear([p('a', 22.2950, 114.1700), p('far', 22.2540, 113.9050), p('b', 22.2960, 114.1680), p('c', 22.3186, 114.1717), p('d', 22.3205, 114.1705), p('e', 22.2938, 114.1702), p('none')]);
  assert.deepEqual(g.map(x => x.map(q => q.id)), [['a', 'b', 'e'], ['c', 'd']]);
});

test('離整趟旅程其他地點太遠的當成位置有誤', () => {
  const pts = [{ id: 'a', lat: 35.16, lng: 129.16 }, { id: 'b', lat: 35.10, lng: 129.03 }, { id: 'c', lat: 35.15, lng: 129.12 }, { id: 'x', lat: 36.2, lng: 36.2 }];
  const far = farOff(pts);
  assert.deepEqual([...far], ['x']);
  assert.ok(Math.abs(far.center.lng - 129.12) < 0.1);
  assert.equal(farOff(pts.slice(2)).size, 0);
});

test('位置有誤的判斷：精確位置不算有誤，重複的地點只算一次', () => {
  const kr = [{ id: 'a', lat: 35.16, lng: 129.16 }, { id: 'b', lat: 35.10, lng: 129.03 }];
  assert.equal(farOff([...kr, { id: 'p', lat: 48.86, lng: 2.35, exact: true }]).size, 0);
  const bad = { lat: 36.21, lng: 36.16 };
  assert.deepEqual([...farOff([...kr, { id: 'w', ...bad }, { id: 'd1', ...bad }, { id: 'd2', ...bad }])].sort(), ['d1', 'd2', 'w']);
});

test('openAt 照營業時段和當地時差判斷現在有沒有營業', () => {
  // 首爾 UTC+9；每天 10:00–22:00
  const daily = [0, 1, 2, 3, 4, 5, 6].map(day => ({ open: { day, hour: 10, minute: 0 }, close: { day, hour: 22, minute: 0 } }));
  assert.equal(openAt(daily, 540, new Date('2026-11-21T03:00:00Z')), true); // 當地 12:00
  assert.equal(openAt(daily, 540, new Date('2026-11-21T14:00:00Z')), false); // 當地 23:00
  // 跨午夜：週六 18:00 到週日 02:00
  const late = [{ open: { day: 6, hour: 18, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }];
  assert.equal(openAt(late, 540, new Date('2026-11-21T16:30:00Z')), true); // 週日 01:30
  assert.equal(openAt([{ open: { day: 0, hour: 0, minute: 0 } }], 540), true); // 24 小時
  assert.equal(openAt([], 540), null);
});
