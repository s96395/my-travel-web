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

test('回到飯店：不推算幾點到，也不寫搭車多久', () => {
  const hotel = { title: '海雲台飯店', lat: 35.16, lng: 129.16 };
  const data = { stays: [{ id: 's', name: '海雲台飯店', checkInDate: '2026-11-20', checkOutDate: '2026-11-23' }] };
  const its = [it('A', { time: '10:00', stay: 60, lat: 35.10, lng: 129.04 })];
  const rows = buildDay(its, dayEvents('2026-11-21', data, its, [hotel]));
  assert.deepEqual(rows.map(r => r.kind), ['home', 'item', 'home']);
  assert.equal(rows[0].title, '從 海雲台飯店 出發');
  const back = rows[2];
  assert.equal(back.title, '回到 海雲台飯店');
  assert.equal(back.at, null);
  assert.ok(!back.sub);
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
  // 退房、出發去機場是推算的時間，畫面不顯示；班機時間照常顯示
  assert.deepEqual(rows.slice(-3).map(r => !!r.est), [true, true, false]);
  assert.ok(!rows[rows.length - 2].sub);
});

test('有空再去的站顯示大約時間，但不把後面的站往後推', () => {
  const rows = buildDay([it('A', { time: '09:00', stay: 60 }), it('B', { priority: 'optional', stay: 120 }), it('C')], []);
  assert.deepEqual(rows.map(r => r.at), [540, 600, 600]);
});

test('接駁或下一站早於預估出關時間：標 early，不算排太滿', () => {
  // 11:30 落地，抓 1 小時 30 分出關＝13:00；12:30 的接駁要提醒
  const fl = { kind: 'flight', t: 480, end: 690, ready: 780 };
  const tr = buildDay([], [fl, { kind: 'transit', t: 750, end: 810 }]);
  assert.equal(tr[1].early, 780);
  // 行程裡自己加的接駁（12:30）也一樣
  const its = buildDay([{ id: 'a', title: '機場接駁', type: 'transport', time: '12:30' }], [fl]);
  const row = its.find(r => r.kind === 'item');
  assert.equal(row.early, 780);
  assert.equal(row.late, false);
  // 13:30 才接駁就不提醒
  assert.equal(buildDay([], [fl, { kind: 'transit', t: 810 }])[1].early, undefined);
});

test('落地和接駁中間還有沒填時間的站，接駁太早仍要提醒', () => {
  const rows = buildDay([{ id: 'a', title: '錦市場', type: 'restaurant' }], [{ kind: 'flight', t: 430, end: 650, ready: 740 }, { kind: 'transit', t: 720 }]);
  assert.equal(rows.find(r => r.kind === 'transit').early, 740);
});
