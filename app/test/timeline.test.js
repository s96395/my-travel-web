import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayEvents, buildDay, nowIndex, hmOf, roughMin } from '../src/lib/timeline.js';

const it = (title, extra = {}) => ({ id: title, title, note: '', type: 'attraction', time: '', stay: 0, ...extra });

test('班機、交通、入住退房轉成當天事件；行程裡記過的不重複', () => {
  const data = {
    flights: [{ id: 'f', flightNo: 'CI152', from: 'TPE', to: 'KIX', dep: '2026-11-20 07:10', arr: '2026-11-20 10:50' }],
    transits: [{ id: 't', number: '', from: '京都', to: '大阪', dep: '2026-11-21 09:00', arr: '2026-11-21 09:30' }],
    stays: [{ id: 's', name: '四條飯店', checkInDate: '2026-11-20', checkOutDate: '2026-11-22' }],
  };
  const ev = dayEvents('2026-11-20', data, []);
  assert.deepEqual(ev.map(e => e.kind), ['flight', 'in']);
  assert.equal(ev[0].t, 430); assert.equal(ev[0].end, 650);
  assert.deepEqual(dayEvents('2026-11-20', data, [it('桃園 → 關西', { note: 'ci152 07:10' }), it('入住四條飯店', { type: 'stay' })]), []);
  assert.deepEqual(dayEvents('2026-11-22', data, []).map(e => e.kind), ['out']);
  // 住在中間的日子：頭尾自動加從飯店出發、回到飯店
  assert.deepEqual(dayEvents('2026-11-21', data, [it('A')]).map(e => e.kind + (e.pos ? ':' + e.pos : '')), ['transit', 'home:start', 'home:end']);
  assert.deepEqual(dayEvents('2026-11-21', data, []).map(e => e.kind), ['transit']); // 還沒排行程的日子不加
  // 那天第一站、最後一站已經是住宿，就不再加
  assert.deepEqual(dayEvents('2026-11-21', data, [it('四條飯店', { type: 'stay' }), it('A'), it('四條飯店 ', { type: 'stay' })]).map(e => e.kind), ['transit']);
  // 班機落地：下一站從出關後開始算
  assert.equal(ev[0].ready, 650 + 90);
});

test('推算幾點到：填了時間的站加停留，接著往下算；班機抵達時間接著算', () => {
  const rows = buildDay([it('A', { time: '09:00', stay: 90 }), it('B', { stay: 60 }), it('C'), it('D')], []);
  // C 沒填停留，景點抓 1 小時 30 分
  assert.deepEqual(rows.map(r => r.at), [540, 630, 690, 780]);
  assert.deepEqual(rows.map(r => r.est), [false, true, true, true]);
  // 有出關時間的班機，從出關後開始算
  const land = buildDay([it('A')], [{ kind: 'flight', t: 430, end: 650, ready: 740 }]);
  assert.equal(land[1].at, 740);
  const fl = buildDay([it('A', { stay: 60 }), it('B', { time: '14:00' })], [{ kind: 'flight', t: 430, end: 650, title: 'TPE → KIX' }]);
  assert.deepEqual(fl.map(r => r.kind), ['flight', 'item', 'item']);
  assert.deepEqual(fl.map(r => r.at), [430, 650, 840]);
  assert.equal(hmOf(650), '10:50');
});

test('前面排太滿，趕不上下一站填的時間時標出來', () => {
  const rows = buildDay([it('A', { time: '09:00', stay: 180 }), it('B', { time: '11:00' })], []);
  assert.equal(rows[1].late, true);
});

test('事件依時間插進行程；入住放最後、退房放最前', () => {
  const rows = buildDay([it('A', { time: '09:00' }), it('B', { time: '18:00' })], [{ kind: 'transit', t: 720, end: 780 }, { kind: 'in', pos: 'end' }, { kind: 'out', pos: 'start' }]);
  assert.deepEqual(rows.map(r => r.kind === 'item' ? r.it.title : r.kind), ['out', 'A', 'transit', 'B', 'in']);
  // 行程都沒填時間：中午前的事件放在行程前面
  assert.deepEqual(buildDay([it('A')], [{ kind: 'flight', t: 430, end: 650 }]).map(r => r.kind), ['flight', 'item']);
});

test('現在的位置：最後一個已經過了的時間之後', () => {
  const rows = buildDay([it('A', { time: '09:00', stay: 60 }), it('B'), it('C', { time: '15:00' })], []);
  assert.equal(nowIndex(rows, 8 * 60), 0);
  assert.equal(nowIndex(rows, 12 * 60), 2);
  assert.equal(nowIndex(rows, 16 * 60), 3);
  assert.equal(nowIndex(buildDay([it('A')], []), 600), -1);
});

test('站與站的交通：近的走路、遠的搭車，推算時間加上路上的時間', async () => {
  const { legOf } = await import('../src/lib/timeline.js');
  const a = it('A', { time: '09:00', stay: 60, lat: 34.9671, lng: 135.7727 });
  const b = it('B', { lat: 34.9676, lng: 135.7792 }); // 約 600 公尺
  const c = it('C', { lat: 35.0116, lng: 135.7681 });
  assert.equal(legOf(a, b).mode, 'WALKING');
  assert.equal(legOf(b, c).mode, 'TRANSIT');
  assert.equal(legOf(a, it('X')), null);
  const legs = new Map([[legOf(a, b).key, 10]]);
  const rows = buildDay([a, b, c], [], legs);
  assert.equal(rows[1].at, 9 * 60 + 60 + 10);
  assert.equal(rows[1].leg.min, 10);
  assert.equal(rows[2].leg.min, null);
});

test('區域卡片不打斷前後兩站的交通與推算時間', () => {
  const a = { id: 'a', time: '09:00', stay: 60, lat: 35.15, lng: 129.16 };
  const card = { id: 'c', kind: 'area', time: '', stay: 0 };
  const b = { id: 'b', time: '', stay: 0, lat: 35.16, lng: 129.19 };
  const rows = buildDay([a, card, b], []);
  assert.equal(rows[1].at, 600);
  assert.equal(rows[2].at, 600);
  assert.ok(rows[2].leg && rows[2].leg.from === a);
});

test('回到飯店：最後一站的推算時間加上路上時間；飯店沒有位置就不推算', () => {
  const hotel = { title: '海雲台飯店', lat: 35.16, lng: 129.16 };
  const data = { stays: [{ id: 's', name: '海雲台飯店', checkInDate: '2026-11-20', checkOutDate: '2026-11-23' }] };
  const its = [it('A', { time: '10:00', stay: 60, lat: 35.10, lng: 129.04 })];
  const rows = buildDay(its, dayEvents('2026-11-21', data, its, [hotel]));
  assert.deepEqual(rows.map(r => r.kind), ['home', 'item', 'home']);
  assert.equal(rows[0].title, '從 海雲台飯店 出發');
  const back = rows[2];
  assert.equal(back.title, '回到 海雲台飯店');
  assert.equal(back.est, true);
  assert.equal(back.at, 660 + roughMin(its[0], hotel));
  assert.match(back.sub, /搭車約 \d+ 分/);
  // 找不到飯店位置：照樣顯示，但不推算時間
  const none = buildDay(its, dayEvents('2026-11-21', data, its, []));
  assert.equal(none[2].at, null);
  // 有查到的交通時間就用查到的
  const legs = new Map();
  const r0 = buildDay(its, dayEvents('2026-11-21', data, its, [hotel]));
  const key = [its[0].lat, its[0].lng, hotel.lat, hotel.lng].map(v => v.toFixed(5)).join(',') + ',TRANSIT';
  legs.set(key, 40);
  assert.equal(buildDay(its, dayEvents('2026-11-21', data, its, [hotel]), legs)[2].at, 700);
  assert.ok(r0[2].at > 660);
});

test('粗估交通時間', () => {
  assert.equal(roughMin({ lat: 35, lng: 129 }, { lat: 35, lng: 129 }), 5);
  assert.equal(roughMin({ lat: 35, lng: 129 }, { lat: 35.09, lng: 129 }), 50); // 約 10 公里搭車：15＋30 分，進位到 50
});

test('抵達日加回到飯店；退房日從飯店出發，退房、出發去機場、班機排最後', () => {
  const data = {
    flights: [{ id: 'f2', flightNo: 'BR169', from: 'PUS', to: 'TPE', dep: '2026-11-24 14:00', arr: '2026-11-24 15:40' }],
    stays: [{ id: 's', name: 'Lavi', checkInDate: '2026-11-20', checkOutDate: '2026-11-24' }],
  };
  // 抵達日先去飯店寄放行李：最後加「回到 Lavi」
  const d1 = dayEvents('2026-11-20', data, [it('Lavi 寄放行李', { type: 'stay' }), it('A')]);
  assert.deepEqual(d1.map(e => e.kind + ':' + e.pos), ['home:end']);
  assert.equal(d1[0].title, '回到 Lavi');
  // 退房日：從飯店出發在最前，退房、出發去機場（14:00 − 2.5 小時 − 1 小時＝10:30）、班機在最後
  const ev = dayEvents('2026-11-24', data, [it('A'), it('B')]);
  const rows = buildDay([it('A', { time: '08:00' }), it('B')], ev);
  assert.deepEqual(rows.map(r => r.kind === 'item' ? r.it.title : r.kind), ['home', 'A', 'B', 'out', 'airport', 'flight']);
  assert.deepEqual(rows.slice(-3).map(r => r.at), [630, 630, 840]);
});

test('有空再去的站顯示大約時間，但不把後面的站往後推', () => {
  const rows = buildDay([it('A', { time: '09:00', stay: 60 }), it('B', { priority: 'optional', stay: 120 }), it('C')], []);
  assert.deepEqual(rows.map(r => r.at), [540, 600, 600]);
});
