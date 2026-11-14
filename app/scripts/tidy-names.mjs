// 行程名稱整理（下一輪修改清單第 6 項，一次性）
// 名稱開頭的 emoji、「午餐｜」「〔晚餐〕」拿掉轉成餐別；結尾（有空再去）轉成優先度、（晚餐備選）移到備註；時間欄只寫「午餐」的轉成餐別
//
// 預設只預覽，不寫入：  node scripts/tidy-names.mjs --project <專案 ID>
// 先備份再寫入：        node scripts/tidy-names.mjs --project <專案 ID> --apply --backup <備份檔.json>
// 照備份還原：        node scripts/tidy-names.mjs --project <專案 ID> --restore <備份檔.json>
// 連正式環境寫入或還原時還要加 --yes-production，避免打錯專案
// 預覽同時存成 tidy-preview.txt；備份檔記著每一筆改之前的欄位，可以拿來還原
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tidyItem, MEAL_LABEL, PRIORITY_LABEL } from '../src/lib/itinerary.js';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = name => args.includes(name);
const projectId = opt('--project'), apply = flag('--apply'), backup = opt('--backup'), restore = opt('--restore');
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const TEST_PROJECTS = ['my-travel-test-7812e'];
if (!projectId) { console.error('請加上 --project <專案 ID>'); process.exit(1); }
if (apply && !backup) { console.error('寫入一定要加 --backup <備份檔.json>'); process.exit(1); }
if (apply && existsSync(backup)) { console.error(`備份檔 ${backup} 已經存在，請換一個檔名，免得蓋掉之前的備份`); process.exit(1); }
if ((apply || restore) && !emulator && !TEST_PROJECTS.includes(projectId) && !flag('--yes-production')) { console.error('這是正式環境，確定要寫入請再加 --yes-production'); process.exit(1); }

initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() });
const db = getFirestore();

// 還原：把備份裡改之前的欄位寫回去，原本沒有的欄位刪掉
if (restore) {
  const list = JSON.parse(readFileSync(restore, 'utf8'));
  for (let i = 0; i < list.length; i += 400) {
    const batch = db.batch();
    list.slice(i, i + 400).forEach(({ path, before }) => batch.update(db.doc(path), Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v === null ? FieldValue.delete() : v]))));
    await batch.commit();
  }
  console.log(`已照 ${restore} 還原 ${list.length} 筆。`);
  process.exit(0);
}

const lines = [], saved = [], todo = [];
const show = (raw, p) => {
  const after = [];
  if (p.title) after.push(`名稱「${p.title}」`);
  if (p.meal) after.push(`餐別 ${MEAL_LABEL[p.meal]}`);
  if ('priority' in p) after.push(`優先度 ${PRIORITY_LABEL[p.priority] || '不設定'}`);
  if ('timeText' in p) after.push('時間欄清空');
  if (p.tip) after.push(`一句提示「${p.tip}」`);
  if (p.note) after.push(`備註加上「${p.note.split('\n')[0]}」`);
  return `  第 ${raw.day || '?'} 天「${raw.title}」${raw.timeText && 'timeText' in p ? `（時間欄：${raw.timeText}）` : ''} → ${after.join('、')}`;
};
for (const trip of (await db.collection('trips').get()).docs) {
  const rows = [];
  for (const d of (await trip.ref.collection('itinerary').get()).docs) {
    const raw = d.data(), p = tidyItem(raw);
    if (!p) continue;
    rows.push(show(raw, p));
    saved.push({ path: d.ref.path, before: Object.fromEntries(Object.keys(p).map(k => [k, k in raw ? raw[k] : null])) });
    todo.push({ ref: d.ref, p });
  }
  if (rows.length) lines.push(`【${trip.data().title || trip.id}】${rows.length} 筆`, ...rows, '');
}
lines.push(`共 ${todo.length} 筆要改。`);
const text = lines.join('\n');
console.log(text);
writeFileSync('tidy-preview.txt', text + '\n');

if (!apply) { console.log('\n（只預覽，沒有修改任何東西。預覽也存在 tidy-preview.txt）'); process.exit(0); }
writeFileSync(backup, JSON.stringify(saved, null, 1));
console.log(`\n已備份 ${saved.length} 筆改之前的欄位到 ${backup}`);
for (let i = 0; i < todo.length; i += 400) {
  const batch = db.batch();
  todo.slice(i, i + 400).forEach(({ ref, p }) => batch.update(ref, { ...p, updatedAt: FieldValue.serverTimestamp() }));
  await batch.commit();
}
console.log(`已寫入 ${todo.length} 筆。`);
process.exit(0);
