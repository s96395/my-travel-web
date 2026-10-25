import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayEvents, buildDay, nowIndex, hmOf } from '../src/lib/timeline.js';

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
  assert.deepEqual(dayEvents('2026-11-21', data, []).map(e => e.kind), ['transit']);
});

test('推算幾點到：填了時間的站加停留，接著往下算；班機抵達時間接著算', () => {
  const rows = buildDay([it('A', { time: '09:00', stay: 90 }), it('B', { stay: 60 }), it('C'), it('D')], []);
  assert.deepEqual(rows.map(r => r.at), [540, 630, 690, null]);
  assert.deepEqual(rows.map(r => r.est), [false, true, true, false]);
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
