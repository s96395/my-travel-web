// 下載供離線使用（規格書 P04–P08）：使用者手動下載的旅程整趟存到這台裝置的 IndexedDB，沒有網路時改讀這份
// 只存按過下載的旅程，看過的不會自動存（Q04）；登出或換帳號時全部清掉
import { doc, getDoc, getDocs, collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

const SUBS = ['itinerary', 'flights', 'stays', 'transits', 'todos', 'expenses', 'fundDeposits', 'cover'];
let opening;

function openDb() {
  opening ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('travel-offline', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('trips', { keyPath: 'id' });
      req.result.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { opening = null; reject(req.error); };
  });
  return opening;
}

async function run(store, mode, fn) {
  const idb = await openDb();
  return new Promise((resolve, reject) => {
    const t = idb.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

// 存進 IndexedDB 後 Firestore 的時間會變成 { seconds, nanoseconds }，讀出來時換回 Timestamp
function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (!v || typeof v !== 'object') return v;
  const keys = Object.keys(v);
  if (keys.length === 2 && typeof v.seconds === 'number' && typeof v.nanoseconds === 'number') return new Timestamp(v.seconds, v.nanoseconds);
  return Object.fromEntries(keys.map(k => [k, revive(v[k])]));
}

const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));

// 整趟下載：旅程主檔與行程、班機、其他交通、住宿、待辦、支出、公費、封面照
export async function downloadTrip(tripId, uid) {
  const tripSnap = await getDoc(doc(db, 'trips', tripId));
  if (!tripSnap.exists()) throw new Error('trip-missing');
  const subs = await Promise.all(SUBS.map(name => getDocs(collection(db, `trips/${tripId}/${name}`))));
  const rec = { id: tripId, uid, savedAt: Date.now(), raw: { id: tripId, ...tripSnap.data() }, subs: Object.fromEntries(SUBS.map((name, i) => [name, rows(subs[i])])) };
  await run('trips', 'readwrite', s => s.put(rec));
  return rec.savedAt;
}

// 這個帳號下載過的旅程（不同帳號留下的不算）
export async function listOffline(uid) {
  const all = (await run('trips', 'readonly', s => s.getAll())) || [];
  return all.filter(r => r.uid === uid).map(r => ({ ...r, raw: revive(r.raw), subs: revive(r.subs) }));
}

export const removeOffline = tripId => run('trips', 'readwrite', s => s.delete(tripId));

// 沒有網路時要知道上次是誰登入，才能顯示他下載的旅程
export const saveAccount = acc => run('meta', 'readwrite', s => s.put(acc, 'account'));
export const readAccount = () => run('meta', 'readonly', s => s.get('account'));

export async function clearOffline() {
  await run('trips', 'readwrite', s => s.clear());
  await run('meta', 'readwrite', s => s.clear());
}
