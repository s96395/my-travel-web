// Google 地圖（Maps JavaScript API，要金鑰）：想去清單與當天行程插針
// 畫面每次重畫都會換掉 HTML，所以地圖放在一個固定的區塊，重畫後搬回 #mapslot，縮放位置不會跑掉
import { esc } from './dom.js';
import { mapsKey } from '../firebase.js';

let ready, map, box, info, lastKey = '', lastFit = '', lastFocus = '';
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

const color = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function popup(p, onAct) {
  const el = document.createElement('div');
  el.className = 'mpop';
  el.innerHTML = `<b>${esc(p.title)}</b>${p.sub ? `<span>${esc(p.sub)}</span>` : ''}
    <div class="mpopbtn">${p.kind === 'wish' && p.day ? `<button type="button" class="btn sm primary" data-act="wishAdd" data-id="${esc(p.id.slice(2))}" data-d="${p.day}">加到第 ${p.day} 天</button>` : ''}
    ${p.url ? `<a class="btn sm" href="${esc(p.url)}" target="_blank" rel="noopener">在 Google 地圖開啟</a>` : ''}</div>`;
  el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => { if (!b.disabled) { info.close(); onAct(b); } }));
  return el;
}

// data：{ points: [{ id, kind: 'day'|'wish', n, lat, lng, title, sub, url, day }], fit, focus }
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
    const warm = color('--warm') || '#e8792b', accent = color('--accent') || '#1e3a5f';
    for (const p of data.points) {
      const day = p.kind === 'day';
      const m = new g.Marker({
        map, position: { lat: p.lat, lng: p.lng }, title: p.title, zIndex: day ? 2 : 1,
        icon: { path: g.SymbolPath.CIRCLE, scale: day ? 12 : 7, fillColor: day ? warm : accent, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
        label: day ? { text: String(p.n), color: '#fff', fontSize: '12px', fontWeight: '700' } : null,
      });
      m.addListener('click', () => { info.setContent(popup(p, onAct)); info.open({ map, anchor: m }); });
      markers.set(p.id, m);
    }
  }
  // 換天或地點數量變了，把所有針放進畫面
  if (data.fit !== lastFit && data.points.length) {
    lastFit = data.fit;
    if (data.points.length === 1) { map.setCenter({ lat: data.points[0].lat, lng: data.points[0].lng }); map.setZoom(15); } else {
      const b = new g.LatLngBounds();
      data.points.forEach(p => b.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(b, 40);
    }
  }
  if (data.focus !== lastFocus) {
    lastFocus = data.focus;
    const m = markers.get(data.focus);
    if (m) { map.panTo(m.getPosition()); if (map.getZoom() < 15) map.setZoom(15); g.event.trigger(m, 'click'); }
  }
}
