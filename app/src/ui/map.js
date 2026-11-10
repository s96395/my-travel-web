// Google 地圖（Maps JavaScript API，要金鑰）：想去清單與當天行程插針
// 畫面每次重畫都會換掉 HTML，所以地圖放在一個固定的區塊，重畫後搬回 #mapslot，縮放位置不會跑掉
import { esc } from './dom.js';
import { mapsKey } from '../firebase.js';
import { distanceKm } from '../lib/places.js';

let ready, map, box, info, line, lastKey = '', lastFit = '', lastFocus = '';
const markers = new Map();

function loadApi() {
  ready ??= new Promise((ok, fail) => {
    window.__gmapsReady = ok;
    // 金鑰錯誤或沒開啟 Maps JavaScript API 時，Google 會呼叫這個
    window.gm_authFailure = () => { if (box) box.innerHTML = '<div class="mapempty">Google 地圖金鑰無法使用，請確認已開啟 Maps JavaScript API，並允許這個網址使用</div>'; };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key: mapsKey, callback: '__gmapsReady', language: 'zh-TW', loading: 'async' })}`;
    s.async = true;
    s.onerror = () => { ready = null; fail(new Error('Google 地圖載入失敗')); };
    document.head.appendChild(s);
  });
  return ready;
}

// 地圖底色固定是淺色，針的顏色不跟著網站主題走：行程橘色、想去清單紅色，在街道、綠地和海上都看得清楚
const DAY = '#e8792b', WISH = '#e03131';

function popup(p, onAct) {
  const el = document.createElement('div');
  el.className = 'mpop';
  el.innerHTML = `${p.sub ? `<span>${esc(p.sub)}</span>` : ''}
    <div class="mpopbtn">${p.kind === 'wish' && p.opts ? `<span class="addto"><select class="daysel" aria-label="加到第幾天">${p.opts}</select><button type="button" class="btn sm primary" data-act="wishAdd" data-id="${esc(p.id.slice(2))}">加入</button></span>` : ''}
    ${p.url ? `<a class="btn sm" href="${esc(p.url)}" target="_blank" rel="noopener">在 Google 地圖開啟</a>` : ''}</div>`;
  el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => { if (!b.disabled) { info.close(); onAct(b); } }));
  return el;
}

// data：{ points: [{ id, kind: 'day'|'wish', n, lat, lng, title, sub, url, opts（天數下拉選項）, color }], fit, fitAll（只看某區域時連想去清單一起框）, focus }
export async function syncMap(data, onAct) {
  await loadApi();
  const slot = document.getElementById('mapslot'); // 載入期間畫面可能重畫過，重新找一次
  if (!slot) return;
  const g = window.google.maps;
  if (!map) {
    box = document.createElement('div');
    box.className = 'lmap';
    map = new g.Map(box, { center: { lat: 23.7, lng: 121 }, zoom: 7, mapTypeControl: false, streetViewControl: false, clickableIcons: false, gestureHandling: 'greedy' });
    info = new g.InfoWindow();
  }
  if (box.parentNode !== slot) slot.appendChild(box);
  const key = JSON.stringify(data.points);
  if (key !== lastKey) {
    lastKey = key;
    markers.forEach(m => m.setMap(null)); markers.clear();
    // 當天行程照 1、2、3 的順序用虛線連起來，看得出怎麼走
    const route = data.points.filter(p => p.kind === 'day').sort((a, b) => a.n - b.n).map(p => ({ lat: p.lat, lng: p.lng }));
    line?.setMap(null);
    line = route.length > 1 ? new g.Polyline({ map, path: route, strokeOpacity: 0, zIndex: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeColor: DAY, strokeOpacity: 0.9, strokeWeight: 3, scale: 3 }, offset: '0', repeat: '14px' }] }) : null;
    for (const p of data.points) {
      const day = p.kind === 'day';
      const m = new g.Marker({
        map, position: { lat: p.lat, lng: p.lng }, title: day ? `${p.n}. ${p.title}` : p.title, zIndex: day ? 1000 - p.n : 1,
        icon: { path: g.SymbolPath.CIRCLE, scale: day ? 13 : 7, fillColor: day ? DAY : p.color || WISH, fillOpacity: day ? 1 : 0.85, strokeColor: '#fff', strokeWeight: day ? 3 : 2 },
        label: day ? { text: String(p.n), color: '#fff', fontSize: '12px', fontWeight: '700' } : null,
      });
      m.addListener('click', () => {
        // 名稱放在彈出框的標題列（和關閉鈕同一行），上方才不會空一大塊
        const head = document.createElement('b');
        head.className = 'mpophead';
        head.textContent = p.title;
        info.setOptions({ headerContent: head, content: popup(p, onAct) });
        info.open({ map, anchor: m });
      });
      markers.set(p.id, m);
    }
  }
  // 換天或地點數量變了，把所有針放進畫面
  // 當天有行程針時只框住行程針，想去清單的點在附近才會看到，不會把畫面拉到整座城市
  const dayPts = data.points.filter(p => p.kind === 'day'), fitPts = dayPts.length && !data.fitAll ? dayPts : data.points;
  if (data.fit !== lastFit && fitPts.length) {
    lastFit = data.fit;
    if (fitPts.length === 1) { map.setCenter({ lat: fitPts[0].lat, lng: fitPts[0].lng }); map.setZoom(15); } else {
      const b = new g.LatLngBounds();
      fitPts.forEach(p => b.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(b, 40);
    }
  }
  if (data.focus !== lastFocus) {
    lastFocus = data.focus;
    const m = markers.get(data.focus);
    if (m) { map.panTo(m.getPosition()); if (map.getZoom() < 15) map.setZoom(15); g.event.trigger(m, 'click'); }
  }
}

// 收藏連結只記到大約哪一區（誤差數公里），用名稱加大約位置請 Google 查精確座標
// 要在 Google Cloud 啟用 Places API (New)；沒啟用時回傳 'off'
export async function locate(p) {
  await loadApi();
  const { Place } = await window.google.maps.importLibrary('places');
  // 沒有大約位置（整趟旅程都還沒有座標）時只靠名稱加城市查
  const near = Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng } : null;
  try {
    const { places } = await Place.searchByText({ textQuery: p.title, fields: ['location'], ...(near ? { locationBias: { center: near, radius: 20000 } } : {}), maxResultCount: 1, language: 'zh-TW' });
    const loc = places?.[0]?.location;
    if (!loc) return null;
    const xy = { lat: +loc.lat().toFixed(6), lng: +loc.lng().toFixed(6) };
    return !near || distanceKm(near, xy) < 30 ? xy : null; // 查到太遠的同名地點就不用
  } catch (err) {
    console.error(err);
    return /not been used|disabled|not authorized|PERMISSION_DENIED|REQUEST_DENIED/i.test(String(err?.message || err)) ? 'off' : null;
  }
}

// 兩站之間要花幾分鐘（Routes API）；要在 Google Cloud 啟用 Routes API，沒啟用時回傳 'off'
export async function travelMin(a, b, mode) {
  await loadApi();
  const { Route } = await window.google.maps.importLibrary('routes');
  try {
    const { routes } = await Route.computeRoutes({ origin: { lat: a.lat, lng: a.lng }, destination: { lat: b.lat, lng: b.lng }, travelMode: mode, fields: ['durationMillis'] });
    const ms = routes?.[0]?.durationMillis;
    return Number.isFinite(ms) ? Math.max(1, Math.round(ms / 60000)) : null;
  } catch (err) {
    console.error(err);
    return /not been used|disabled|not authorized|PERMISSION_DENIED|REQUEST_DENIED/i.test(String(err?.message || err)) ? 'off' : null;
  }
}
