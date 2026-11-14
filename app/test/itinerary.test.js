import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItem, stayText, sortItems, planMove, planDays, nextOrder, routeStops, routeUrl, embedUrl, isMapLink, placeHref, groupByArea, planAreaMove, geoKey, sameName, afterArea, itemsOfDay, backupsOf, naverHref, navHref, naverRoute } from '../src/lib/itinerary.js';

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

test('自動查到的座標：名稱或地址改了就不算數', () => {
  const raw = { id: 'a', day: 1, title: '🌊 海雲台市場', lat: 35.16, lng: 129.16, exact: true, geoq: '海雲台市場' };
  assert.equal(normalizeItem(raw).lat, 35.16);
  assert.equal(normalizeItem({ ...raw, title: '海雲台傳統市場' }).lat, null);
  assert.equal(normalizeItem({ ...raw, title: '海雲台傳統市場' }).exact, false);
  assert.equal(normalizeItem({ ...raw, address: '부산 해운대구' }).lat, null);
  assert.equal(geoKey({ title: '🍜 午餐｜海雲台市場' }), '午餐 海雲台市場');
});

test('行程和想去清單同名就當同一個地方', () => {
  assert.equal(sameName('🐰 Miffy 海雲台商店｜買水手服米菲', 'Miffy 海雲台商店'), true);
  assert.equal(sameName('午餐｜海雲台傳統市場', '海雲台傳統市場'), false);
  assert.equal(sameName('', ''), false);
});

test('區域卡片：kind 只認 area，必去接在同區域那段後面', () => {
  assert.equal(normalizeItem({ id: 'a', kind: 'area', title: '青沙浦一帶', area: '青沙浦一帶' }).kind, 'area');
  assert.equal(normalizeItem({ id: 'b', kind: 'x' }).kind, '');
  const its = [
    { id: 'f', day: 2, order: 1, area: '' },
    { id: 'c', day: 2, order: 2, area: '青沙浦一帶', kind: 'area' },
    { id: 'm', day: 2, order: 3, area: '青沙浦一帶' },
    { id: 's', day: 2, order: 4, area: '' },
  ].map(normalizeItem);
  assert.equal(afterArea(its, 'c'), 's');
  assert.equal(afterArea(its.filter(x => x.id !== 's'), 'c'), '');
});

import { bestSpot, rankDays, centerOf } from '../src/lib/itinerary.js';
const at = (id, day, order, lat, lng, extra = {}) => normalizeItem({ id, day, order, title: id, lat, lng, ...extra });

test('自動插在走路距離增加最少的兩站中間', () => {
  const list = [at('a', 1, 1, 35.00, 135.70), at('b', 1, 2, 35.00, 135.80), at('c', 1, 3, 35.00, 135.90)];
  assert.deepEqual(bestSpot(list, { lat: 35.0, lng: 135.75 }), { beforeId: 'b', prevId: 'a' });
  assert.deepEqual(bestSpot(list, { lat: 35.0, lng: 135.95 }), { beforeId: '', prevId: 'c' });
  // 不會排到第一站前面
  assert.deepEqual(bestSpot(list, { lat: 35.0, lng: 135.60 }), { beforeId: 'b', prevId: 'a' });
});

test('沒座標的站和區域卡片不影響位置，沒位置的點放最後', () => {
  const list = [at('a', 1, 1, 35.00, 135.70), normalizeItem({ id: 'x', day: 1, order: 2, title: 'x' }), at('b', 1, 3, 35.00, 135.80), normalizeItem({ id: 'z', day: 1, order: 4, title: '飯店' })];
  assert.deepEqual(bestSpot(list, { lat: 35.0, lng: 135.75 }), { beforeId: 'x', prevId: 'a' });
  assert.deepEqual(bestSpot(list, { lat: 35.0, lng: 135.85 }), { beforeId: 'z', prevId: 'b' });
  assert.deepEqual(bestSpot(list, { title: '自己打的' }), { beforeId: '', prevId: 'z' });
  assert.deepEqual(bestSpot([], { lat: 1, lng: 1 }), { beforeId: '', prevId: '' });
});

test('要加在哪一天：最近的那天標最順路，同區域其次，已經有的放最後', () => {
  const items = [at('a', 1, 1, 35.0, 135.70, { area: '四條' }), at('b', 2, 1, 35.0, 135.78, { area: '祇園' }), at('c', 3, 1, 35.0, 135.60, { area: '祇園' }), at('d', 4, 1, 35.0, 135.775, { address: 'u1' })];
  const r = rankDays(items, [1, 2, 3, 4, 5], { lat: 35.0, lng: 135.775, area: '祇園', url: 'u1', title: '花見小路' });
  assert.deepEqual(r.map(x => x.day), [2, 3, 1, 5, 4]);
  assert.equal(r[0].best, true);
  assert.equal(r.find(x => x.day === 4).has, true);
  // 沒有位置可比時，推薦有同區域的那天
  const r2 = rankDays(items, [1, 2, 3], { area: '祇園', title: '新地點' });
  assert.equal(r2.find(x => x.best).day, 2);
  assert.deepEqual(centerOf([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, {}]), { lat: 2, lng: 3 });
});

test('備案掛在主要那站下面，不算當天的站；主要那站不在了就回到時間軸', () => {
  const a = normalizeItem({ id: 'a', day: 1, order: 1, title: '正式晚餐' });
  const b = normalizeItem({ id: 'b', day: 1, order: 2, title: '豚笑', backupOf: 'a', backupWhen: '排隊超過 30 分鐘就改去' });
  assert.deepEqual(itemsOfDay([a, b], 1).map(x => x.id), ['a']);
  assert.deepEqual(backupsOf([a, b], 'a').map(x => x.backupWhen), ['排隊超過 30 分鐘就改去']);
  assert.deepEqual(itemsOfDay([b], 1).map(x => x.id), ['b']);
});

test('時間可以寫文字；有幾點時以幾點為準', () => {
  assert.equal(normalizeItem({ id: 'a', timeText: '看完夕陽後' }).timeText, '看完夕陽後');
  assert.equal(normalizeItem({ id: 'a', reservationTime: '18:00', timeText: '晚餐' }).timeText, '');
  assert.equal(normalizeItem({ id: 'a', tip: '先抽號碼牌' }).tip, '先抽號碼牌');
});

test('韓國導航手機電腦都開 Naver：有座標照座標開，名稱改成中文說明也找得到；沒座標才用名稱搜尋', () => {
  const it = { title: '青沙浦平交道拍膠囊列車', area: '靑沙浦', address: '', type: 'attraction', lat: 35.1606, lng: 129.1912 };
  // 電腦（測試環境沒有 matchMedia，當成電腦）：路線頁終點放 Web Mercator 座標
  const url = navHref(it, '釜山', '韓國');
  const m = /^https:\/\/map\.naver\.com\/p\/directions\/-\/([\d.]+),([\d.]+),([^,]+),,\/-\/transit$/.exec(url);
  assert.ok(m, url);
  assert.ok(Math.abs(+m[1] - 14381498.6) < 1 && Math.abs(+m[2] - 4185727.5) < 1, url);
  assert.equal(decodeURIComponent(m[3]), '青沙浦平交道拍膠囊列車');
  assert.ok(naverHref({ title: 'A, B｜備註', lat: 35, lng: 129 }, 'A').includes(',A%20%20B,,/'));
  const bare = { ...it, lat: null, lng: null };
  assert.equal(navHref(bare, '釜山', '韓國'), 'https://map.naver.com/p/search/' + encodeURIComponent('青沙浦平交道拍膠囊列車 靑沙浦 釜山'));
  assert.match(naverRoute({ title: '出發', lat: 35.1, lng: 129 }, it, true), /^https:\/\/map\.naver\.com\/p\/directions\/[\d.]+,[\d.]+,%E5%87%BA%E7%99%BC,,\/[\d.]+,[\d.]+,[^/]+,,\/-\/walk$/);
  // 手機：照座標開 Naver 地圖 App
  globalThis.matchMedia = () => ({ matches: true });
  try {
    assert.equal(navHref(it, '釜山', '韓國'), 'nmap://place?lat=35.1606&lng=129.1912&name=' + encodeURIComponent('青沙浦平交道拍膠囊列車') + '&appname=');
    assert.match(naverRoute({ title: '出發', lat: 35.1, lng: 129 }, it), /^nmap:\/\/route\/public\?slat=35\.1&slng=129&/);
  } finally { delete globalThis.matchMedia; }
});

test('storeName：導航和給司機看只用店名', async () => {
  const { storeName, mealOf, normalizeItem } = await import('../src/lib/itinerary.js');
  assert.equal(storeName('晚餐｜83 Haechi'), '83 Haechi');
  assert.equal(storeName('🍜 五福豬肉湯飯'), '五福豬肉湯飯');
  assert.equal(storeName('〔午餐〕濟州家'), '濟州家');
  assert.equal(storeName('Liberta（有空再去）'), 'Liberta');
  assert.equal(storeName('海雲台市場'), '海雲台市場');
  assert.equal(storeName('濟州家（晚餐備選）'), '濟州家');
  assert.equal(storeName('一蘭（新宿中央東口店）'), '一蘭（新宿中央東口店）');
  assert.ok(naverHref({ title: '晚餐｜83 Haechi', lat: 35, lng: 129 }, '').includes('83%20Haechi'));
  assert.equal(mealOf('晚飯'), 'dinner');
  assert.equal(mealOf('下午'), '');
  assert.equal(normalizeItem({ id: 'a', meal: 'lunch' }).meal, 'lunch');
  assert.equal(normalizeItem({ id: 'a', meal: 'xx' }).meal, '');
});

test('tidyItem：舊名稱轉成餐別、優先度、備註，geoq 跟著改', async () => {
  const { tidyItem } = await import('../src/lib/itinerary.js');
  assert.deepEqual(tidyItem({ title: '晚餐｜83 Haechi' }), { title: '83 Haechi', meal: 'dinner' });
  assert.deepEqual(tidyItem({ title: '🍜 五福豬肉湯飯' }), { title: '五福豬肉湯飯' });
  assert.deepEqual(tidyItem({ title: '〔午餐〕濟州家' }), { title: '濟州家', meal: 'lunch' });
  assert.deepEqual(tidyItem({ title: 'Liberta（有空再去）' }), { title: 'Liberta', priority: 'optional' });
  assert.deepEqual(tidyItem({ title: '濟州家（晚餐備選）', note: '好吃' }), { title: '濟州家', meal: 'dinner', note: '晚餐備選\n好吃' });
  assert.deepEqual(tidyItem({ title: 'Liberta', timeText: '晚餐' }), { meal: 'dinner', timeText: '' });
  assert.deepEqual(tidyItem({ title: '🍖 午餐｜五福', geoq: '午餐 五福' }), { title: '五福', meal: 'lunch', geoq: '五福' });
  assert.equal(tidyItem({ title: '海雲台市場' }), null);
  assert.equal(tidyItem({ title: '東大門獵奇辣炒年糕｜廣安里店' }), null);
  assert.equal(tidyItem({ title: '一蘭（新宿中央東口店）' }), null);
  assert.equal(tidyItem({ title: '午餐' }), null);
});

test('tidyItem：做什麼的說明移到一句提示，分店和地名保留', async () => {
  const { tidyItem } = await import('../src/lib/itinerary.js');
  assert.deepEqual(tidyItem({ title: '🐰 Miffy 專門店（買水手服米菲）' }), { title: 'Miffy 專門店', tip: '買水手服米菲' });
  assert.deepEqual(tidyItem({ title: '🍯 DIART coffee｜土耳其 Kaymak 奶油麵包' }), { title: 'DIART coffee', tip: '土耳其 Kaymak 奶油麵包' });
  assert.deepEqual(tidyItem({ title: '🍲 午餐｜濟州家 西面店（鮑魚粥）' }), { title: '濟州家 西面店', meal: 'lunch', tip: '鮑魚粥' });
  assert.deepEqual(tidyItem({ title: 'X the Sky 展望台（100 樓夜景）', tip: '先買票' }), { title: 'X the Sky 展望台', note: '100 樓夜景' });
  assert.deepEqual(tidyItem({ title: '☕ Liberta 海景咖啡（青沙浦）' }), { title: 'Liberta 海景咖啡（青沙浦）' });
});
