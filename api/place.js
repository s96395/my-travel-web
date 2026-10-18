// 讀 Google 地圖地點連結的座標（Vercel 伺服器端執行，瀏覽器不能直接讀 Google 的頁面）
// GET /api/place?url=<Google 地圖連結> → { lat, lng }；這是讀頁面內容的非官方做法，Google 改版時可能要修
const ALLOWED = /^(www\.)?google\.[a-z.]+$|^maps\.google\.[a-z.]+$|^maps\.app\.goo\.gl$/;

const ok = (lat, lng) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

// 依可靠程度試幾種寫法：地點標記 !3d!4d、網址的 @緯度,經度、頁面預覽圖的 center、頁面初始畫面
function coordsFrom(text) {
  const tries = [
    [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, m => [+m[1], +m[2]]],
    [/@(-?\d+\.\d+),(-?\d+\.\d+)/, m => [+m[1], +m[2]]],
    [/center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/, m => [+m[1], +m[2]]],
    [/\[\[\[-?\d+(?:\.\d+)?,(-?\d+\.\d+),(-?\d+\.\d+)\]/, m => [+m[2], +m[1]]],
  ];
  for (const [re, pick] of tries) {
    const m = text.match(re);
    if (m) { const [lat, lng] = pick(m); if (ok(lat, lng)) return { lat, lng }; }
  }
  return null;
}

module.exports = async function handler(req, res) {
  let u;
  try { u = new URL(String(req.query.url || '')); } catch { return res.status(400).json({ error: 'bad url' }); }
  if (u.protocol !== 'https:' || !ALLOWED.test(u.hostname) || u.username || u.port) return res.status(400).json({ error: 'not a google maps url' });
  try {
    const r = await fetch(u, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'accept-language': 'zh-TW,zh;q=0.9' } });
    const found = coordsFrom(decodeURIComponent(r.url)) || coordsFrom(await r.text());
    if (!found) return res.status(404).json({ error: 'not found' });
    res.setHeader('Cache-Control', 'public, s-maxage=2592000');
    return res.status(200).json(found);
  } catch {
    return res.status(502).json({ error: 'fetch failed' });
  }
};
module.exports.coordsFrom = coordsFrom;
