// 安全規則測試（規格書 N01–N04、N08）：建立者、共編成員、非成員、未登入四種身分，加上管理者
// 要先開本機模擬環境（npm run emulators），再執行 npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, arrayUnion, arrayRemove, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

let env;
const TRIP = {
  title: '京都賞楓', ownerId: 'owner', memberIds: ['owner', 'member'], shareKey: 'k1',
  participants: { p1: { name: '芳佑', uid: 'owner', order: 1 }, p2: { name: '小安', uid: '', order: 2 }, p3: { name: '肉格', order: 3 }, p4: { name: '男友', uid: null, order: 4 } },
};
const as = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const trip = uid => doc(as(uid), 'trips/t1');
const png = new Uint8Array([137, 80, 78, 71]);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-travel',
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
    storage: { host: '127.0.0.1', port: 9199, rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8') },
  });
});
after(() => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'trips/t1'), TRIP);
    await setDoc(doc(db, 'trips/t1/expenses/e1'), { name: '晚餐', amount: 1200 });
    await setDoc(doc(db, 'users/admin'), { nickname: '管理者' });
    await setDoc(doc(db, 'roles/admin'), { role: 'admin' });
    await setDoc(doc(db, 'users/oldfake'), { nickname: '舊資料', role: 'admin' });
    await setDoc(doc(db, 'users/member'), { nickname: '小安' });
    await setDoc(doc(db, 'optionSets/o1'), { list: [] });
    await uploadBytes(ref(ctx.storage(), 'trips/t1/cover/a.png'), png, { contentType: 'image/png' });
  });
});

/* ---------- 未登入 ---------- */
test('未登入：讀不到旅程、使用者與選項', async () => {
  await assertFails(getDoc(trip(null)));
  await assertFails(getDoc(doc(as(null), 'users/member')));
  await assertFails(getDoc(doc(as(null), 'optionSets/o1')));
  await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), 'trips/t1/cover/a.png')));
});

/* ---------- 非成員 ---------- */
test('非成員：讀不到旅程與子資料，也不能列出全部旅程', async () => {
  await assertFails(getDoc(trip('stranger')));
  await assertFails(getDocs(collection(as('stranger'), 'trips/t1/expenses')));
  await assertFails(getDocs(collection(as('stranger'), 'trips')));
  await assertSucceeds(getDocs(query(collection(as('stranger'), 'trips'), where('memberIds', 'array-contains', 'stranger'))));
});
test('非成員：帶正確邀請碼只能把自己加進成員', async () => {
  await assertFails(updateDoc(trip('stranger'), { memberIds: arrayUnion('stranger') }));
  await assertFails(updateDoc(trip('stranger'), { memberIds: arrayUnion('stranger'), joinKey: 'wrong' }));
  await assertFails(updateDoc(trip('stranger'), { memberIds: arrayUnion('stranger', 'friend'), joinKey: 'k1' }));
  await assertFails(updateDoc(trip('stranger'), { memberIds: arrayUnion('friend'), joinKey: 'k1' }));
  await assertFails(updateDoc(trip('stranger'), { memberIds: arrayUnion('stranger'), joinKey: 'k1', title: '改名' }));
  await assertSucceeds(updateDoc(trip('stranger'), { memberIds: arrayUnion('stranger'), joinKey: 'k1' }));
  await assertSucceeds(getDoc(trip('stranger')));
});
test('非成員：不能建立別人的旅程，也不能看或上傳照片', async () => {
  await assertFails(setDoc(doc(as('stranger'), 'trips/t2'), { ownerId: 'owner', memberIds: ['owner', 'stranger'] }));
  await assertSucceeds(setDoc(doc(as('stranger'), 'trips/t2'), { ownerId: 'stranger', memberIds: ['stranger'], shareKey: 'k2' }));
  const st = env.authenticatedContext('stranger').storage();
  await assertFails(getBytes(ref(st, 'trips/t1/cover/a.png')));
  await assertFails(uploadBytes(ref(st, 'trips/t1/cover/b.png'), png, { contentType: 'image/png' }));
  await assertFails(deleteObject(ref(st, 'trips/t1/cover/a.png')));
});

/* ---------- 共編成員 ---------- */
test('共編成員：可以讀寫旅程資料與一般欄位', async () => {
  await assertSucceeds(getDoc(trip('member')));
  await assertSucceeds(getDocs(collection(as('member'), 'trips/t1/expenses')));
  await assertSucceeds(setDoc(doc(as('member'), 'trips/t1/expenses/e2'), { name: '車票', amount: 300 }));
  await assertSucceeds(updateDoc(trip('member'), { totalExpense: 1500, fund: { on: true, keeper: 'p1' } }));
});
test('共編成員：不能改建立者、邀請碼與別人的成員身分', async () => {
  await assertFails(updateDoc(trip('member'), { ownerId: 'member' }));
  await assertFails(updateDoc(trip('member'), { shareKey: 'new' }));
  await assertFails(updateDoc(trip('member'), { memberIds: arrayUnion('friend') }));
  await assertFails(updateDoc(trip('member'), { memberIds: arrayRemove('owner') }));
  await assertFails(deleteDoc(trip('member')));
});
test('共編成員：可以自己退出', async () => {
  await assertFails(updateDoc(trip('member'), { memberIds: arrayRemove('member'), title: '改名' }));
  await assertSucceeds(updateDoc(trip('member'), { memberIds: arrayRemove('member') }));
  await assertFails(getDoc(trip('member')));
});
test('共編成員：只能把沒有帳號的同行者綁成自己', async () => {
  await assertFails(updateDoc(trip('member'), { 'participants.p2.uid': 'member' }));
  await assertFails(updateDoc(trip('member'), { 'participants.p2.uid': 'friend', bindPid: 'p2' }));
  await assertFails(updateDoc(trip('member'), { 'participants.p1.uid': 'member', bindPid: 'p1' }));
  await assertFails(updateDoc(trip('member'), { 'participants.p2.uid': 'member', 'participants.p3.name': '改名', bindPid: 'p2' }));
  await assertFails(updateDoc(trip('member'), { 'participants.p1.uid': deleteField(), bindPid: 'p1' }));
  await assertFails(updateDoc(trip('member'), { 'participants.p2': { name: '改掉名字', uid: 'member', order: 5 }, bindPid: 'p2' }));
  await assertFails(updateDoc(trip('member'), { 'participants.p2.uid': 'member', 'participants.p2.name': '', bindPid: 'p2' }));
  await assertFails(updateDoc(trip('member'), { 'participants.p3.uid': 'member', 'participants.p3.status': 'inactive', bindPid: 'p3' }));
  await assertSucceeds(updateDoc(trip('member'), { 'participants.p3.uid': 'member', bindPid: 'p3' }));
  await assertSucceeds(updateDoc(trip('owner'), { 'participants.p3.uid': '' }));
  await assertSucceeds(updateDoc(trip('member'), { 'participants.p3.uid': 'member', 'participants.p3.name': '俞皓', bindPid: 'p3' }));
  await assertSucceeds(updateDoc(trip('member'), { 'participants.p4.uid': 'member', 'participants.p4.name': '俞皓', bindPid: 'p4' }));
  await assertSucceeds(updateDoc(trip('member'), { 'participants.p9': { name: '新朋友', uid: 'member', order: 9 }, bindPid: 'p9' }));
});
test('共編成員：可以看、上傳與刪除這趟的照片，但不能放非圖片', async () => {
  const st = env.authenticatedContext('member').storage();
  await assertSucceeds(getBytes(ref(st, 'trips/t1/cover/a.png')));
  await assertSucceeds(uploadBytes(ref(st, 'trips/t1/cover/b.png'), png, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(st, 'trips/t1/cover/c.txt'), png, { contentType: 'text/plain' }));
  await assertSucceeds(deleteObject(ref(st, 'trips/t1/cover/a.png')));
});

/* ---------- 建立者 ---------- */
test('建立者：可以管理同行者、移除成員與刪除旅程，但不能把旅程轉給別人', async () => {
  await assertSucceeds(updateDoc(trip('owner'), { 'participants.p2.name': '小安安', 'participants.p3.status': 'inactive' }));
  await assertSucceeds(updateDoc(trip('owner'), { memberIds: arrayRemove('member') }));
  await assertFails(updateDoc(trip('owner'), { ownerId: 'member' }));
  await assertSucceeds(deleteDoc(trip('owner')));
});

/* ---------- 使用者、選項與管理者 ---------- */
test('使用者資料：只能改自己的暱稱，不能給自己管理者身分', async () => {
  await assertSucceeds(getDoc(doc(as('stranger'), 'users/member')));
  await assertSucceeds(updateDoc(doc(as('member'), 'users/member'), { nickname: '安安' }));
  await assertSucceeds(setDoc(doc(as('stranger'), 'users/stranger'), { nickname: '路人' }));
  await assertFails(updateDoc(doc(as('stranger'), 'users/member'), { nickname: '亂改' }));
  // 不能列出所有使用者，也不能存 Email 等個資
  await assertFails(getDocs(collection(as('member'), 'users')));
  await assertFails(setDoc(doc(as('stranger'), 'users/stranger'), { nickname: '路人', email: 'a@b.c' }));
  await assertFails(setDoc(doc(as('member'), 'roles/member'), { role: 'admin' }));
  await assertFails(getDoc(doc(as('member'), 'roles/admin')));
  // users 裡自己寫的 role 不算數
  await assertFails(getDoc(doc(as('oldfake'), 'trips/t1')));
  await assertFails(setDoc(doc(as('oldfake'), 'optionSets/o1'), { list: ['x'] }));
});
test('選項與設定：登入才可讀，只有管理者可寫', async () => {
  await assertSucceeds(getDoc(doc(as('member'), 'optionSets/o1')));
  await assertFails(setDoc(doc(as('member'), 'optionSets/o1'), { list: ['x'] }));
  await assertFails(setDoc(doc(as('owner'), 'settings/s1'), { on: true }));
  await assertSucceeds(setDoc(doc(as('admin'), 'optionSets/o1'), { list: ['x'] }));
  await assertSucceeds(setDoc(doc(as('admin'), 'settings/s1'), { on: true }));
});
test('管理者：看得到所有旅程（處理問題用）', async () => {
  await assertSucceeds(getDoc(trip('admin')));
});
