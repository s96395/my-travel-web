// 每天清理超過 30 天的 Google 座標（Google 規定從 Places API 查到的座標最多存 30 天）
// Vercel 排程每天呼叫一次（vercel.json 的 crons），Vercel 會帶 Authorization: Bearer <CRON_SECRET>
// 只清行程（itinerary）和想去清單（wishlist）的 lat、lng，保留地點代碼 placeId，下次打開旅程時網頁再用代碼重查
// 環境變數：
//   CRON_SECRET  Vercel 排程用的密碼
//   GEO_SA       服務帳戶 JSON（只需要讀寫 Firestore 的權限）
//   GEO_CLEANUP  設成 on 才真的清；沒設時只統計筆數、寫在執行紀錄，不改資料
// 不用 firebase-admin：網站的套件裝在 app/，這裡讀不到，所以直接呼叫 Firestore REST API
const crypto = require('node:crypto');

const KEEP_MS = 30 * 86400000;
const COLLECTIONS = ['itinerary', 'wishlist'];

// 服務帳戶換存取權杖（JWT）
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  return (await r.json()).access_token;
}

const numOf = v => (v && 'doubleValue' in v ? Number(v.doubleValue) : v && 'integerValue' in v ? Number(v.integerValue) : NaN);
// 有座標、而且查詢時間超過 30 天（舊資料沒有查詢時間，也算過期）
function expired(fields, now) {
  const f = fields || {};
  if (!Number.isFinite(numOf(f.lat)) || !Number.isFinite(numOf(f.lng))) return false;
  const at = numOf(f.geoAt);
  return !(Number.isFinite(at) && now - at < KEEP_MS);
}

async function run({ base, token, apply, now = Date.now() }) {
  const auth = { authorization: `Bearer ${token}` };
  const out = { apply, at: new Date(now).toISOString() };
  for (const id of COLLECTIONS) {
    const r = await fetch(`${base}/documents:runQuery`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: id, allDescendants: true }] } }),
    });
    if (!r.ok) throw new Error(`query ${id} ${r.status}`);
    const docs = (await r.json()).map(x => x.document).filter(Boolean);
    const old = docs.filter(d => expired(d.fields, now));
    const stat = { total: docs.length, withCoords: docs.filter(d => Number.isFinite(numOf(d.fields?.lat))).length, expired: old.length, cleared: 0, failed: 0 };
    if (apply) {
      // 一次 10 筆；updateTime 條件：清理途中剛好有人改了那一筆就跳過，不蓋掉
      for (let i = 0; i < old.length; i += 10) {
        await Promise.all(old.slice(i, i + 10).map(async d => {
          // 每筆各自送出，一筆失敗不影響其他筆
          const p = await fetch(`${base}/documents:commit`, {
            method: 'POST',
            headers: { ...auth, 'content-type': 'application/json' },
            body: JSON.stringify({ writes: [{
              update: { name: d.name, fields: { lat: { nullValue: null }, lng: { nullValue: null }, exact: { booleanValue: false }, geoAt: { integerValue: '0' } } },
              updateMask: { fieldPaths: ['lat', 'lng', 'exact', 'geoAt'] },
              currentDocument: { updateTime: d.updateTime },
            }] }),
          });
          if (p.ok) stat.cleared++; else stat.failed++;
        }));
      }
    }
    out[id] = stat;
  }
  return out;
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  let sa;
  try { sa = JSON.parse(process.env.GEO_SA || ''); } catch { return res.status(500).json({ error: 'GEO_SA not set' }); }
  try {
    const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)`;
    const out = await run({ base, token: await accessToken(sa), apply: process.env.GEO_CLEANUP === 'on' });
    console.log('geo-cleanup', JSON.stringify(out)); // 只記筆數，不記地點名稱或位置
    return res.status(200).json(out);
  } catch (err) {
    console.error('geo-cleanup failed', err.message);
    return res.status(500).json({ error: 'cleanup failed' });
  }
};
module.exports.expired = expired;
module.exports.run = run;
