import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs } from '../src/lib/ics.js';

const trip = { id: 't1', name: '京都賞楓', start: '2026-11-20', end: '2026-11-22', place: '日本・京都' };
const ics = buildIcs(trip, {
  items: [
    { id: 'i1', day: 1, title: '南禪寺', area: '東山', time: '' },
    { id: 'i2', day: 1, title: '湯豆腐, 晚餐', area: '東山', time: '18:30', note: '已訂位' },
    { id: 'i3', day: 0, title: '還沒排', area: '', time: '' },
  ],
  flights: [{ id: 'f1', flightNo: 'CI152', from: 'TPE', to: 'KIX', fromCity: '台北', fromTerminal: '第 2 航廈', fromTz: '+8', toTz: '+9', dep: '2026-11-20 07:10', arr: '2026-11-20 10:50', pnr: 'ABC123' }],
  stays: [{ id: 's1', name: '京都飯店', address: '京都市下京區', checkInDate: '2026-11-20', checkOutDate: '2026-11-22', confirmCode: 'XYZ', pin: '9999' }],
}, Date.UTC(2026, 9, 14));
const lines = ics.split('\r\n');

test('整趟旅程是全天事件，結束日要多一天', () => {
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20261120') && lines.includes('DTEND;VALUE=DATE:20261123'));
});
test('每天一則行程摘要，有時間的行程另外排一小時', () => {
  assert.ok(lines.includes('SUMMARY:第 1 天｜東山'));
  assert.ok(lines.includes('DTSTART:20261120T183000') && lines.includes('DTEND:20261120T193000'));
  assert.ok(lines.includes('SUMMARY:湯豆腐\\, 晚餐'));
  assert.ok(!ics.includes('還沒排'));
});
test('班機換算成實際時間', () => {
  assert.ok(lines.includes('DTSTART:20261119T231000Z') && lines.includes('DTEND:20261120T015000Z'));
});
test('不放訂位代號、確認碼與 PIN', () => {
  assert.ok(!ics.includes('ABC123') && !ics.includes('XYZ') && !ics.includes('9999'));
});
test('每行不超過 75 個位元組', () => {
  const long = buildIcs({ ...trip, name: '很長'.repeat(40) });
  assert.ok(long.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75));
});
