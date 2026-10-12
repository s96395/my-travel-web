import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flightMinutes, sortFlights, parseAirport, legacyFlights, legacyStays, withLegacy, nights, airportTz } from '../src/lib/flights.js';

test('跨時區計算飛行時間', () => {
  assert.equal(flightMinutes({ dep: '2026-11-20 07:10', fromTz: '+8', arr: '2026-11-20 10:50', toTz: '+9' }), 160);
  assert.equal(flightMinutes({ dep: '2026-11-20 10:00', fromTz: '+8', arr: '2026-11-20 10:00', toTz: '+9' }), null);
  assert.equal(flightMinutes({ dep: '', fromTz: '+8', arr: '2026-11-20 10:00', toTz: '+9' }), null);
});

test('依實際起飛時間排序', () => {
  const a = { id: 'a', dep: '2026-11-20 09:00', fromTz: '+9' }; // 台灣時間 08:00
  const b = { id: 'b', dep: '2026-11-20 08:30', fromTz: '+8' };
  const c = { id: 'c', dep: '', fromTz: '+8' };
  assert.deepEqual(sortFlights([c, b, a]).map(f => f.id), ['a', 'b', 'c']);
});

test('解析舊版機場文字', () => {
  assert.deepEqual(parseAirport('臺中 RMQ（第 2 航廈）'), { code: 'RMQ', city: '臺中', term: '第 2 航廈', tz: '+8' });
  assert.deepEqual(parseAirport('PUS'), { code: 'PUS', city: '釜山金海', term: '', tz: '+9' });
});

test('舊版班機轉成去程、回程兩筆', () => {
  const list = legacyFlights({ airline: '台灣虎航', flightCode: 'F8FMCW', depFlightNo: 'JX310', depDate: '2026-11-21', depAirport: '臺中 RMQ（第 2 航廈）', depTime: '08.00', depArrAirport: '釜山 PUS（國際航廈）', arrTime: '11:15', retFlightNo: 'JX311', retDate: '2026-11-25', retAirport: '釜山 PUS（國際航廈）', retDepTime: '12:15', retArrTime: '14:00' });
  assert.equal(list.length, 2);
  assert.equal(list[0].dep, '2026-11-21 08:00');
  assert.equal(list[0].toTerminal, '國際航廈');
  assert.equal(list[1].to, 'RMQ'); // 回程沒填抵達機場時，用去程的出發機場
  assert.equal(list[1].pnr, 'F8FMCW');
  assert.deepEqual(legacyFlights({}), []);
});

test('早期舊班機沒有日期：用旅程起訖日，機場名稱對到代碼，跨日抵達算隔天', () => {
  const trip = { startDate: '2026-03-13', endDate: '2026-03-16' };
  const [go, back] = legacyFlights({ airline: '華航', depAirport: '桃園機場', depTime: '16:50', arrTime: '19:20', retAirport: '那霸機場', retDepTime: '23:55', retArrTime: '00:35' }, trip);
  assert.equal(go.dep, '2026-03-13 16:50');
  assert.equal(go.from, 'TPE');
  assert.equal(go.to, 'OKA');
  assert.equal(go.toTz, '+9');
  assert.equal(back.dep, '2026-03-16 23:55');
  assert.equal(back.arr, '2026-03-17 00:35');
  const [london] = legacyFlights({ retAirport: 'TPE', retDepTime: '23:00', retArrAirport: 'LHR', retArrTime: '07:00' }, { endDate: '2026-03-28' });
  assert.equal(london.arr, '2026-03-29 07:00');
  assert.equal(london.toTz, '+1'); // 3/29 起英國夏令時間
  assert.equal(parseAirport('首爾機場').code, ''); // 對到兩個機場時不猜
  assert.equal(legacyFlights({ airline: '星宇' }, trip).length, 0);
});

test('舊版住宿與轉換後隱藏', () => {
  const [s] = legacyStays({ hotelName: 'A 飯店', hotelCode: 'X1', checkIn: '15:00' }, { startDate: '2026-11-21', endDate: '2026-11-25' });
  assert.equal(nights(s), 4);
  assert.equal(s.note, '入住 15:00');
  assert.equal(withLegacy([{ id: 'n1', fromLegacy: 'hotel' }], [s]).length, 1);
  assert.equal(withLegacy([], [s]).length, 1);
});

test('夏令時間機場依日期換算時區', () => {
  assert.equal(airportTz('LAX', '2026-07-01 10:00'), '-7');
  assert.equal(airportTz('LAX', '2026-12-01 10:00'), '-8');
  assert.equal(airportTz('JFK', '2026-07-01'), '-4');
  assert.equal(airportTz('LHR', '2026-07-01'), '+1');
  assert.equal(airportTz('LHR', '2026-01-10'), '0');
  assert.equal(airportTz('CDG', '2026-07-01'), '+2');
  assert.equal(airportTz('LAX', ''), '-8');
  assert.equal(airportTz('TPE', '2026-07-01'), '+8');
  assert.equal(airportTz('XXX', '2026-07-01'), '');
});
