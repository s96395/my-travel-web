// 開放地圖（Leaflet＋OpenStreetMap，不用金鑰）：想去清單與當天行程插針
// 畫面每次重畫都會換掉 HTML，所以地圖放在一個固定的區塊，重畫後搬回 #mapslot，縮放位置不會跑掉
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { esc } from './dom.js';

let map, box, layer, lastKey = '', lastFit = '', lastFocus = '';
const markers = new Map();

function init(onAct) {
  box = document.createElement('div');
  box.className = 'lmap';
  map = L.map(box, { zoomControl: true, attributionControl: true }).setView([23.7, 121], 7);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  layer = L.layerGroup().addTo(map);
  // Leaflet 會擋掉彈出框裡的點擊冒泡，所以自己把按鈕交給畫面的動作處理
  map.on('popupopen', e => e.popup.getElement()?.querySelectorAll('[data-act]').forEach(b => { if (!b.dataset.bound) { b.dataset.bound = '1'; b.addEventListener('click', () => { if (!b.disabled) onAct(b); }); } }));
}

const popup = p => `<div class="mpop"><b>${esc(p.title)}</b>${p.sub ? `<span>${esc(p.sub)}</span>` : ''}
  <div class="mpopbtn">${p.kind === 'wish' && p.day ? `<button type="button" class="btn sm primary" data-act="wishAdd" data-id="${esc(p.id.slice(2))}" data-d="${p.day}">加到第 ${p.day} 天</button>` : ''}
  ${p.url ? `<a class="btn sm" href="${esc(p.url)}" target="_blank" rel="noopener">Google 地圖</a>` : ''}</div></div>`;

// data：{ points: [{ id, kind: 'day'|'wish', n, lat, lng, title, sub, url, day }], fit, focus }
export function syncMap(slot, data, onAct) {
  if (!slot) return;
  if (!map) init(onAct);
  if (box.parentNode !== slot) { slot.appendChild(box); map.invalidateSize(); }
  const key = JSON.stringify(data.points);
  if (key !== lastKey) {
    lastKey = key;
    layer.clearLayers(); markers.clear();
    // 想去清單先畫，當天行程畫在上面
    for (const p of [...data.points].sort((a, b) => (a.kind === 'day') - (b.kind === 'day'))) {
      const icon = L.divIcon({ className: `pin pin-${p.kind}`, html: p.kind === 'day' ? `<b>${p.n}</b>` : '', iconSize: p.kind === 'day' ? [26, 26] : [16, 16] });
      markers.set(p.id, L.marker([p.lat, p.lng], { icon, title: p.title }).bindPopup(popup(p)).addTo(layer));
    }
  }
  // 換天或資料第一次到齊時，把所有針放進畫面
  if (data.fit !== lastFit && data.points.length) {
    lastFit = data.fit;
    map.fitBounds(L.latLngBounds(data.points.map(p => [p.lat, p.lng])), { padding: [30, 30], maxZoom: 15 });
  }
  if (data.focus !== lastFocus) {
    lastFocus = data.focus;
    const m = markers.get(data.focus);
    if (m) { map.setView(m.getLatLng(), Math.max(map.getZoom(), 15)); m.openPopup(); }
  }
}
