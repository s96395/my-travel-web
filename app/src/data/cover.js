// 封面照（規格書 F06）：第一版不用 Storage，照片壓小後存在旅程底下的 cover/main，旅程主檔記 coverAt 讓大家知道要重讀
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';

const LIMIT = 270000; // 存成文字後約 270 KB，也就是照片約 200 KB

// 先把長邊縮到 1600px，還太大就降低畫質，再不行就再縮小
export function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      const cv = document.createElement('canvas');
      let data = '';
      for (const side of [1600, 1280, 1024, 800]) {
        const r = Math.min(1, side / Math.max(im.width, im.height));
        cv.width = Math.round(im.width * r); cv.height = Math.round(im.height * r);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        for (const q of [0.82, 0.72, 0.62]) {
          data = cv.toDataURL('image/jpeg', q);
          if (data.length <= LIMIT) return resolve(data);
        }
      }
      resolve(data);
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad-image')); };
    im.src = url;
  });
}

const ref = tripId => doc(db, `trips/${tripId}/cover/main`);

export async function loadCover(tripId) {
  const s = await getDoc(ref(tripId));
  return s.exists() ? s.data() : null;
}

// c：{ src, x, y, z, style }，x、y 是照片對齊的位置（%），z 是放大倍數；src 空白表示不用照片，改用 style 預設圖案
export async function saveCover(tripId, c, user) {
  const at = Date.now();
  const b = writeBatch(db);
  b.set(ref(tripId), { src: c.src || '', x: c.x ?? 50, y: c.y ?? 50, z: c.z ?? 1, style: c.style || 'auto', at, byUid: user.uid });
  b.update(doc(db, 'trips', tripId), { coverAt: at });
  await b.commit();
  return at;
}
