// 讀 Google 地圖地點連結的座標（Vercel 伺服器端執行，瀏覽器不能直接讀 Google 的頁面）
// GET /api/place?url=<Google 地圖短網址> → { url, lat?, lng? }；只用來展開短網址，Google 改版時可能要修
const ALLOWED = /^(www\.)?google\.[a-z.]+$|^maps\.google\.[a-z.]+$|^maps\.app\.goo\.gl$/;

const ok = (lat, lng) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

// 只認地點標記 !3d!4d；@緯度,經度、預覽圖 center 和頁面初始畫面是地圖中心，伺服器在美國時會變成美國的位置，不能用
function coordsFrom(text) {
  const m = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return ok(lat, lng) ? { lat, lng } : null;
}

module.exports = async function handler(req, res) {
  let u;
  try { u = new URL(String(req.query.url || '')); } catch { return res.status(400).json({ error: 'bad url' }); }
  if (u.protocol !== 'https:' || !ALLOWED.test(u.hostname) || u.username || u.port) return res.status(400).json({ error: 'not a google maps url' });
  try {
    const r = await fetch(u, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'accept-language': 'zh-TW,zh;q=0.9' } });
    // 回傳展開後的完整網址（網頁再從裡面的地點代碼算座標），有地點標記時也一併回傳座標
    const url = decodeURIComponent(r.url);
    const found = coordsFrom(url);
    if (!found && !/!1s0x[0-9a-f]+:0x/i.test(url)) return res.status(404).json({ error: 'not found' });
    res.setHeader('Cache-Control', 'public, s-maxage=2592000');
    return res.status(200).json({ url, ...found });
  } catch {
    return res.status(502).json({ error: 'fetch failed' });
  }
};
module.exports.coordsFrom = coordsFrom;
