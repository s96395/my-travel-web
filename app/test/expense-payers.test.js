// 記帳表單「誰付的錢」：列出全部人填金額，預設全額帶給自己
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expDraft, paidNow, payerCheck, draftFields } from '../src/views/expense.js';

const trip = { id: 't1', raw: { country: '台灣', participants: { me: { name: '我', uid: 'u1', order: 0 }, mom: { name: '媽媽', order: 1 }, bro: { name: '弟弟', uid: 'u2', order: 2 } } } };
const S = { user: { uid: 'u1' }, expenses: new Map([['t1', []]]), depositDocs: [], offline: false };

test('新的一筆：全額先算給自己，其他人填了會自動扣掉', () => {
  const d = expDraft(S, trip, null);
  Object.assign(d, { name: '機票', amt: '30000', cur: 'TWD' });
  assert.deepEqual(paidNow(d), { me: 30000 });
  assert.equal(payerCheck(d).ok, true);
  assert.equal(draftFields(S, trip, d).payerId, 'me');
  assert.equal(draftFields(S, trip, d).payers, null);
  d.paid.mom = '20000';
  assert.deepEqual(paidNow(d), { mom: 20000, me: 10000 });
  const f = draftFields(S, trip, d);
  assert.equal(f.payerId, 'multi');
  assert.deepEqual(f.payers, { mom: 20000, me: 10000 });
});

test('自己改過金額就不再自動算，加總不對不能存', () => {
  const d = expDraft(S, trip, null);
  Object.assign(d, { name: '晚餐', amt: '1000', cur: 'TWD', autoPay: '' });
  d.paid = { me: '300', mom: '500' };
  assert.equal(payerCheck(d).ok, false);
  d.paid.bro = '200';
  assert.equal(payerCheck(d).ok, true);
  d.paid = {};
  assert.equal(payerCheck(d).ok, false);
});

test('只有別人付全額時存成單一付款人', () => {
  const d = expDraft(S, trip, null);
  Object.assign(d, { name: '車票', amt: '500', cur: 'TWD', autoPay: '', paid: { mom: '500' } });
  const f = draftFields(S, trip, d);
  assert.equal(f.payerId, 'mom');
  assert.equal(f.payers, null);
});

test('舊資料：單一付款人跟著總金額走、多人付帶出原本金額、公費與還不確定', () => {
  const one = expDraft(S, trip, { id: 'a', name: 'x', amount: 800, payerId: 'mom' });
  assert.equal(one.payWay, 'people');
  assert.deepEqual(paidNow(one), { mom: 800 });
  const multi = expDraft(S, trip, { id: 'b', name: 'x', amount: 900, payerId: 'multi', payers: { me: 600, bro: 300 } });
  assert.deepEqual(paidNow(multi), { me: 600, bro: 300 });
  assert.equal(payerCheck(multi).ok, true);
  const fund = expDraft(S, trip, { id: 'c', name: 'x', amount: 900, payerId: 'fund' });
  assert.equal(fund.payWay, 'fund');
  assert.equal(draftFields(S, trip, fund).payerId, 'fund');
  const none = expDraft(S, trip, { id: 'd', name: 'x', amount: 900, payerId: '' });
  assert.equal(none.payWay, 'none');
  assert.equal(draftFields(S, trip, none).payerId, '');
});
