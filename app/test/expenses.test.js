import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equalSplit, sharesOf, isSplit, modeOf, perPerson, byCategory, settlement, fundIn, fundOut, repaidKey } from '../src/lib/expenses.js';

const people = [{ id: 'p1', uid: 'u1' }, { id: 'p2', uid: '' }, { id: 'p3', uid: 'u3' }, { id: 'p4', uid: '' }];

test('平均分攤：餘數從前面的人開始多分', () => {
  assert.deepEqual(equalSplit(100, ['a', 'b', 'c']), { a: 34, b: 33, c: 33 });
  assert.deepEqual(equalSplit(10.01, ['a', 'b']), { a: 5.01, b: 5 });
  assert.deepEqual(equalSplit(100, []), {});
  const s = equalSplit(7360, ['a', 'b', 'c']);
  assert.equal(Object.values(s).reduce((a, b) => a + b, 0), 7360);
});

test('舊資料以帳號為鍵時換成同行者', () => {
  const e = { amount: 300, personalShares: { u1: 100, p2: 100, u3: 100 } };
  assert.deepEqual(sharesOf(e, people), { p1: 100, p2: 100, p3: 100 });
  assert.deepEqual(sharesOf({ personalShares: { gone: 50 } }, people), { gone: 50 });
  assert.equal(sharesOf({ amount: 1 }, people), null);
  assert.equal(isSplit({ personalShares: {} }, people), false);
});

test('分攤方式', () => {
  assert.equal(modeOf({ amount: 100, personalShares: { p1: 34, p2: 33, p3: 33 } }, people), 'equal');
  assert.equal(modeOf({ amount: 100, personalShares: { p1: 50, p2: 50 }, splitMode: 'custom' }, people), 'custom');
  assert.equal(modeOf({ amount: 100, personalShares: { p1: 70, p2: 30 } }, people), 'custom');
  assert.equal(modeOf({ amount: 100 }, people), 'none');
});

test('每人負擔與分類', () => {
  const ex = [{ amount: 100, category: '餐飲', personalShares: { p1: 50, p4: 50 } }, { amount: 30, category: '交通' }, { amount: 20, category: '餐飲' }];
  assert.deepEqual(perPerson(ex, people), { p1: 50, p2: 0, p3: 0, p4: 50 });
  assert.deepEqual(byCategory(ex), [['餐飲', 120], ['交通', 30]]);
});

// 雛形的京都範例：四人、公費 12,000 由小安保管
const kyoto = [
  { amount: 24000, payerId: 'p1', personalShares: equalSplit(24000, ['p1', 'p2', 'p3', 'p4']) },
  { amount: 4400, payerId: 'fund', personalShares: equalSplit(4400, ['p1', 'p2', 'p3', 'p4']) },
  { amount: 2860, payerId: 'p2', personalShares: { p1: 800, p2: 700, p3: 660, p4: 700 } },
  { amount: 6000, payerId: 'p3', personalShares: equalSplit(6000, ['p1', 'p2']) },
  { amount: 3520, payerId: '', personalShares: equalSplit(3520, ['p1', 'p2', 'p3', 'p4']) },
  { amount: 5200, payerId: 'p4', personalShares: equalSplit(5200, ['p1', 'p2', 'p3', 'p4']) },
  { amount: 1280, payerId: '' },
];
const deposits = ['p1', 'p2', 'p3', 'p4'].map(pid => ({ pid, amount: 3000 }));

test('結算：差額加總為零，轉帳後大家都清了', () => {
  const s = settlement(kyoto, people, { on: true, keeper: 'p2' }, deposits);
  assert.equal(fundIn(deposits) - fundOut(kyoto), 7600);
  assert.equal(s.balance, 7600);
  assert.equal(Object.values(s.diff).reduce((a, b) => a + b, 0), 0);
  assert.equal(s.noPayer, 1);
  assert.equal(s.notSplit, 1);
  const left = { ...s.diff };
  s.tx.forEach(x => { left[x.from] += x.v; left[x.to] -= x.v; });
  assert.ok(Object.values(left).every(v => Math.abs(v) < 0.01));
  assert.ok(s.tx.length <= 3);
  // 芳佑先付飯店，應該收錢
  assert.ok(s.diff.p1 > 0);
});

test('沒開公費時，公費支付的支出不算，並提醒筆數', () => {
  const s = settlement(kyoto, people, { on: false, keeper: 'p2' }, deposits);
  assert.equal(s.fundOff, 1);
  assert.equal(s.rows.p1.paid, 24000);
  assert.equal(Object.values(s.diff).reduce((a, b) => a + b, 0), 0);
});

test('公費不夠時保管人先墊，差額照樣加總為零', () => {
  const ex = [{ amount: 1000, payerId: 'fund', personalShares: { p1: 500, p2: 500 } }];
  const s = settlement(ex, people, { on: true, keeper: 'p1' }, [{ pid: 'p2', amount: 200 }]);
  assert.equal(s.balance, -800);
  assert.deepEqual(s.tx, [{ from: 'p2', to: 'p1', v: 300 }]);
});

test('已還款代號', () => {
  assert.equal(repaidKey({ from: 'a', to: 'b', v: 12.5 }), 'a_b_12p5');
});
