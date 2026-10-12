// 舊資料轉換執行程式（規格書第 6 章）
//
// 預設只預覽，不寫入：  node scripts/migrate.mjs --project <專案 ID>
// 只備份（唯讀）：      node scripts/migrate.mjs --project <專案 ID> --backup <備份資料夾>
// 先備份再寫入：        node scripts/migrate.mjs --project <專案 ID> --apply --backup <備份資料夾>
// 把備份載入演練環境：  node scripts/migrate.mjs --project <專案 ID> --load <備份檔>（只能載入模擬環境或測試專案）
//
// 連本機模擬環境：先設 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
// 連測試或正式環境：先設 GOOGLE_APPLICATION_CREDENTIALS=<服務帳戶金鑰路徑>
// --apply 一定要搭配 --backup；連正式環境時還要加 --yes-production，避免打錯專案
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { planTrip, hasChanges, totals } from '../src/lib/migrate.js';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = name => args.includes(name);
const projectId = opt('--project');
const apply = flag('--apply');
const backupDir = opt('--backup');
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const loadFile = opt('--load');
const rehearsal = emulator || projectId?.includes('test');

if (!projectId) fail('請用 --project 指定專案 ID');
if (apply && !backupDir) fail('寫入前一定要備份：請加上 --backup <資料夾>');
if (loadFile && !rehearsal) fail('備份只能載入本機模擬環境或測試專案，不能載入正式環境');
if (apply && !rehearsal && !flag('--yes-production')) fail(`${projectId} 看起來是正式環境；確定要寫入請加上 --yes-production`);

initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() });
const db = getFirestore();
const auth = getAuth();

const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const newId = () => db.collection('trips').doc().id;
const newShareKey = () => [...randomBytes(8)].map(b => (b % 36).toString(36)).join('');
const WHO = { createdByUid: 'migration', createdByName: '舊資料轉換' };

function fail(msg) { console.error(`停止：${msg}`); process.exit(1); }

// 帳號名稱：先看 users/{uid}.nickname，再看登入帳號的顯示名稱
const names = new Map();
async function loadName(uid) {
  if (names.has(uid)) return;
  let name = '';
  try { const u = await db.doc(`users/${uid}`).get(); name = u.exists ? u.data().nickname || u.data().displayName || '' : ''; } catch { /* 讀不到就用下一個來源 */ }
  if (!name) { try { name = (await auth.getUser(uid)).displayName || ''; } catch { /* 帳號已刪除等情況 */ } }
  names.set(uid, name);
}

// 備份檔裡的時間是 { _seconds, _nanoseconds }，載入時換回 Timestamp
function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (!v || typeof v !== 'object') return v;
  if (typeof v._seconds === 'number' && typeof v._nanoseconds === 'number') return new Timestamp(v._seconds, v._nanoseconds);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
}

async function load() {
  const data = JSON.parse(readFileSync(loadFile, 'utf8'));
  for (const item of data) {
    const { id, ...trip } = item.trip;
    const ref = db.collection('trips').doc(id);
    await ref.set(revive(trip));
    for (const name of ['expenses', 'images', 'flights', 'stays']) {
      for (const { id: did, ...d } of item[name] || []) await ref.collection(name).doc(did).set(revive(d));
    }
  }
  console.log(`已把 ${data.length} 趟旅程載入 ${projectId}`);
}

async function main() {
  if (loadFile) return load();
  console.log(`專案：${projectId}${emulator ? '（本機模擬環境）' : ''}　模式：${apply ? '寫入' : '只預覽'}`);
  const trips = rows(await db.collection('trips').get());
  const all = [];
  for (const trip of trips) {
    const ref = db.collection('trips').doc(trip.id);
    const [expenses, images, flights, stays] = await Promise.all(['expenses', 'images', 'flights', 'stays'].map(async n => rows(await ref.collection(n).get())));
    // 先把分攤裡用到、但不在同行者名單的帳號名稱讀好
    const pids = new Set(Object.keys(trip.participants || {}));
    const uids = new Set(expenses.flatMap(e => (e.personalShares && typeof e.personalShares === 'object' ? Object.keys(e.personalShares) : [])).filter(k => !pids.has(k)));
    await Promise.all([...uids].map(loadName));
    const plan = planTrip({ trip, expenses, images, flights, stays }, { newId, nameOf: uid => names.get(uid) || '', newShareKey });
    all.push({ trip, expenses, images, flights, stays, plan });
  }

  // 報告
  const changed = all.filter(x => hasChanges(x.plan));
  const before = totals(all.flatMap(x => x.expenses));
  console.log(`旅程 ${all.length} 趟，要轉換 ${changed.length} 趟；支出 ${before.count} 筆，總金額 ${before.amount}`);
  for (const { plan } of changed) {
    const parts = [
      plan.newFlights.length && `班機 ${plan.newFlights.length} 段`,
      plan.newStays.length && `住宿 ${plan.newStays.length} 筆`,
      plan.newParticipants.length && `補建同行者 ${plan.newParticipants.map(p => p.name).join('、')}`,
      plan.expenseUpdates.length && `支出 ${plan.expenseUpdates.length} 筆`,
      plan.imageUpdates.length && `圖片網址 ${plan.imageUpdates.length} 筆`,
      plan.tripUpdate.shareKey && '補邀請碼',
    ].filter(Boolean);
    console.log(`・${plan.title || plan.tripId}：${parts.join('，')}`);
  }
  const problems = all.flatMap(x => x.plan.problems.map(p => `${x.plan.title}：${p}`));
  if (problems.length) { console.log('有問題，先不寫入：'); problems.forEach(p => console.log(`  ${p}`)); process.exit(2); }

  // 備份：每趟旅程的主檔與子集合存成一個 JSON 檔
  if (backupDir) {
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(backupDir, `${projectId}_${stamp}.json`);
    writeFileSync(file, JSON.stringify(all.map(({ trip, expenses, images, flights, stays }) => ({ trip, expenses, images, flights, stays })), null, 1));
    console.log(`已備份到 ${file}`);
  }
  if (!apply) { console.log('只預覽，沒有寫入任何資料。'); return; }

  // 寫入：每趟旅程的變更收集起來，每 450 筆送出一批（Firestore 一批上限 500 筆）
  for (const { trip, plan } of changed) {
    const ref = db.collection('trips').doc(trip.id);
    const ops = [];
    if (Object.keys(plan.tripUpdate).length) ops.push(b => b.update(ref, { ...plan.tripUpdate, migratedAt: FieldValue.serverTimestamp() }));
    for (const f of plan.newFlights) ops.push(b => b.set(ref.collection('flights').doc(), { ...f, ...WHO, createdAt: FieldValue.serverTimestamp() }));
    for (const s of plan.newStays) ops.push(b => b.set(ref.collection('stays').doc(), { ...s, ...WHO, createdAt: FieldValue.serverTimestamp() }));
    for (const u of plan.expenseUpdates) ops.push(b => b.update(ref.collection('expenses').doc(u.id), u.fields));
    for (const u of plan.imageUpdates) ops.push(b => b.update(ref.collection('images').doc(u.id), u.fields));
    for (let i = 0; i < ops.length; i += 450) {
      const batch = db.batch();
      ops.slice(i, i + 450).forEach(op => op(batch));
      await batch.commit();
    }
  }

  // 核對：重新讀一次，筆數與總金額要和轉換前一樣
  const after = totals((await Promise.all(trips.map(async t => rows(await db.collection('trips').doc(t.id).collection('expenses').get())))).flat());
  const ok = after.count === before.count && after.amount === before.amount;
  console.log(`轉換後：支出 ${after.count} 筆，總金額 ${after.amount}　${ok ? '與轉換前相同' : '與轉換前不同，請用備份檔檢查'}`);
  if (!ok) process.exit(3);
}

main().catch(err => { console.error(err); process.exit(1); });
