import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItem, stayText, sortItems, planMove, planDays, nextOrder, routeStops, routeUrl, embedUrl, isMapLink, placeHref, groupByArea, planAreaMove } from '../src/lib/itinerary.js';

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

test('地圖：有地址用地址，沒有用名稱＋區域＋城市；交通類不放進路線', () => {
  const its = [
    { title: '南禪寺', area: '東山', type: 'attraction', address: '' },
    { title: '搭巴士', area: '', type: 'transport', address: '' },
    { title: '湯豆腐', area: '', type: 'restaurant', address: '京都市左京區南禅寺福地町' },
    { title: '平安神宮', area: '', type: 'attraction', address: '' },
  ];
  const stops = routeStops(its, '京都');
  assert.deepEqual(stops, ['南禪寺 東山 京都', '京都市左京區南禅寺福地町', '平安神宮 京都']);
  const u = new URL(routeUrl(stops));
  assert.equal(u.searchParams.get('origin'), '南禪寺 東山 京都');
  assert.equal(u.searchParams.get('destination'), '平安神宮 京都');
  assert.equal(u.searchParams.get('waypoints'), '京都市左京區南禅寺福地町');
  assert.ok(routeUrl(stops.slice(0, 1)).includes('/maps/search/'));
  assert.equal(routeUrl([]), '');
  const many = Array.from({ length: 14 }, (_, i) => `P${i}`);
  assert.equal(new URL(routeUrl(many)).searchParams.get('waypoints').split('|').length, 9);
});
test('地圖：沒有金鑰就不嵌入，一個地點用 place，兩個以上用 directions', () => {
  assert.equal(embedUrl(['A', 'B'], ''), '');
  assert.ok(embedUrl(['A'], 'k').includes('/embed/v1/place?'));
  const u = new URL(embedUrl(['A', 'B', 'C'], 'k'));
  assert.ok(u.pathname.endsWith('/directions'));
  assert.equal(u.searchParams.get('waypoints'), 'B');
});
test('地圖：地址欄貼 Google 地圖連結時，地圖直接開連結，路線改用名稱搜尋', () => {
  const link = 'https://maps.app.goo.gl/AbC123';
  const it = { title: '甘川洞文化村', area: '沙下區', type: 'attraction', address: link };
  assert.ok(isMapLink(link));
  assert.ok(isMapLink('https://www.google.com/maps/place/Gamcheon/@35.09,129.01,17z'));
  assert.ok(!isMapLink('釜山廣域市沙下區甘內2路203'));
  assert.ok(!isMapLink('https://evil.example/maps.app.goo.gl/x'));
  assert.ok(!isMapLink('javascript:alert(1)'));
  assert.ok(!isMapLink('https://www.google.com.attacker.example/maps/login'));
  assert.ok(!isMapLink('https://google.com@evil.example/maps'));
  assert.ok(!isMapLink('http://maps.app.goo.gl/x'));
  assert.ok(isMapLink('https://www.google.com.tw/maps/place/x'));
  assert.equal(placeHref(it, '釜山'), link);
  assert.deepEqual(routeStops([it], '釜山'), ['甘川洞文化村 沙下區 釜山']);
  assert.deepEqual(routeStops([{ ...it, lat: 35.0975, lng: 129.0106 }], '釜山'), ['35.0975,129.0106']); // 有座標用座標
  assert.ok(placeHref({ ...it, address: '' }, '釜山').includes('/maps/search/'));
});

test('搜尋地點前拿掉名稱裡的表情符號和｜', () => {
  const it = normalizeItem({ id: 'a', title: '🌶️ 東大門獵奇辣炒年糕｜廣安里店', area: '', type: 'restaurant' });
  assert.deepEqual(routeStops([it], '釜山'), ['東大門獵奇辣炒年糕 廣安里店 釜山']);
});

test('依區域分組：照第一次出現的先後，沒有區域的放最後', () => {
  const g = groupByArea([{ id: 1, area: '' }, { id: 2, area: '尖沙咀' }, { id: 3, area: '中環' }, { id: 4, area: '尖沙咀 ' }]);
  assert.deepEqual(g.map(x => [x.area, x.places.map(p => p.id)]), [['尖沙咀', [2, 4]], ['中環', [3]], ['', [1]]]);
});

test('整個區域移到別天：同區域照原順序接到那天最後，原本那天重新編號', () => {
  const a = (id, day, order, area) => normalizeItem({ id, day, order, title: id, area });
  const items = [a('p', 1, 1, '中環'), a('q', 1, 2, '尖沙咀'), a('r', 1, 3, '中環'), a('s', 1, 4, '尖沙咀'), a('x', 2, 1, '旺角')];
  assert.deepEqual(planAreaMove(items, 1, '尖沙咀', 2), [
    { id: 'q', day: 2, order: 2 }, { id: 'r', day: 1, order: 2 }, { id: 's', day: 2, order: 3 },
  ]);
  assert.deepEqual(planAreaMove(items, 1, '尖沙咀', 1), []);
});

test('停留時間：讀 stay 分鐘數，顯示成幾小時幾分', () => {
  assert.equal(normalizeItem({ id: 'a', stay: 90 }).stay, 90);
  assert.equal(normalizeItem({ id: 'a', stay: 'x' }).stay, 0);
  assert.equal(normalizeItem({ id: 'a' }).stay, 0);
  assert.equal(stayText(90), '1 小時 30 分');
  assert.equal(stayText(60), '1 小時');
  assert.equal(stayText(45), '45 分');
  assert.equal(stayText(0), '');
});
