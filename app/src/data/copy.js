// 複製旅程：讀原本那趟的資料，寫成一趟新的旅程；原本那趟只讀不改
import { collection, doc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import { COPY_PARTS, planCopy } from '../lib/copy.js';
import { newShareKey } from './trips.js';
import { loadCover } from './cover.js';

export async function readCopySource(tripId) {
  const lists = await Promise.all(COPY_PARTS.map(([name]) => getDocs(collection(db, `trips/${tripId}/${name}`))));
  return Object.fromEntries(COPY_PARTS.map(([name], i) => [name, lists[i].docs.map(d => ({ id: d.id, ...d.data() }))]));
}

// 回傳新旅程的 id；子資料有寫不進去的，丟出錯誤並帶上新旅程 id（旅程已建立，可以打開看）
export async function copyTrip(trip, subs, opt, user, nickname) {
  const newId = () => doc(collection(db, 'trips')).id;
  const plan = planCopy(trip, subs, { ...opt, uid: user.uid, nickname, newId });
  const ref = doc(collection(db, 'trips'));
  // 安全規則要先讀得到旅程才允許寫子資料，所以旅程本身先寫
  const first = writeBatch(db);
  first.set(ref, { ...plan.trip, shareKey: newShareKey(), createdAt: serverTimestamp() });
  let cover = null;
  if (opt.cover) { try { cover = await loadCover(trip.id); } catch (err) { console.warn('封面照讀不到，先不複製', err); } }
  await first.commit();
  const by = { createdByUid: user.uid, createdByName: nickname, createdAt: serverTimestamp() };
  const writes = [];
  for (const [name, list] of Object.entries(plan.subs)) list.forEach(x => writes.push([`trips/${ref.id}/${name}`, x.id, { ...x.data, ...by }]));
  const at = Date.now();
  const withCover = !!(cover && (cover.src || (cover.style && cover.style !== 'auto')));
  if (withCover) writes.push([`trips/${ref.id}/cover`, 'main', { ...cover, at, byUid: user.uid }]);
  try {
    // 一批最多 500 筆，分批寫
    for (let i = 0; i < writes.length; i += 400) {
      const b = writeBatch(db);
      writes.slice(i, i + 400).forEach(([path, id, data]) => b.set(doc(db, path, id), data));
      if (i + 400 >= writes.length && withCover) b.update(ref, { coverAt: at });
      await b.commit();
    }
  } catch (err) { throw Object.assign(err, { tripId: ref.id }); }
  return ref.id;
}
