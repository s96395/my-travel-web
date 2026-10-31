// Google 地圖（Maps JavaScript API，要金鑰）：想去清單與當天行程插針
// 畫面每次重畫都會換掉 HTML，所以地圖放在一個固定的區塊，重畫後搬回 #mapslot，縮放位置不會跑掉
import { esc } from './dom.js';
import { mapsKey } from '../firebase.js';
import { distanceKm } from '../lib/places.js';

let ready, map, box, info, temp, search, act, dayOptsHtml = '', lastKey = '', lastFit = '', lastFocus = '', lastOpts = '';
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

// 搜尋到或在地圖上點到的地點：先插一根紅色大頭針，彈出框可以直接加到某天，或先放想去清單
function placePopup(p) {
  const el = document.createElement('div');
  el.className = 'mpop';
  el.innerHTML = `${p.addr ? `<span>${esc(p.addr)}</span>` : ''}
    <div class="mpopbtn">${dayOptsHtml ? `<span class="addto"><select class="daysel" aria-label="加到第幾天">${dayOptsHtml}</select><button type="button" class="btn sm primary" data-pact="placeAdd">加入</button></span>` : ''}
    <button type="button" class="btn sm" data-pact="placeWish">放想去清單</button>
    ${p.url ? `<a class="btn sm" href="${esc(p.url)}" target="_blank" rel="noopener">在 Google 地圖開啟</a>` : ''}</div>`;
  // 擋掉往上傳，免得畫面共用的點擊處理再執行一次
  el.querySelectorAll('[data-pact]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    if (b.disabled) return;
    b.disabled = true;
    Promise.resolve(act?.(b.dataset.pact, p, +(el.querySelector('.daysel')?.value || 0))).then(ok => { if (ok) clearPlace(); else b.disabled = false; });
  }));
  return el;
}
function showPlace(p) {
  const g = window.google.maps;
  temp ??= new g.Marker({ zIndex: 3 });
  temp.setOptions({ map, position: { lat: p.lat, lng: p.lng }, title: p.title });
  map.panTo(temp.getPosition());
  if (map.getZoom() < 15) map.setZoom(15);
  const head = document.createElement('b');
  head.className = 'mpophead';
  head.textContent = p.title;
  info.setOptions({ headerContent: head, content: placePopup(p) });
  info.open({ map, anchor: temp });
}
export function clearPlace() { temp?.setMap(null); info?.close(); if (search) search.value = ''; }

// 右下角「＋」：地圖出來後捲到地圖（不先放游標，免得手機鍵盤蓋住地圖）
export async function showSearch() {
  await loadApi();
  for (let i = 0; i < 20 && !search?.isConnected; i++) await new Promise(r => setTimeout(r, 100));
  if (!search) return;
  search.closest('.mapwrap')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); // 封面照占掉上半，捲到地圖讓彈出框放得下
}

// Google 地點類型對到行程類型
const TYPE_OF = [[/restaurant|food|meal|bakery|bar\b/, 'restaurant'], [/cafe|coffee|tea/, 'cafe'], [/store|shop|mall|market/, 'shopping'], [/lodging|hotel|hostel/, 'stay'], [/station|airport|transit|bus_stop/, 'transport']];
const typeOf = types => (TYPE_OF.find(([re]) => (types || []).some(t => re.test(t))) || [0, 'attraction'])[1];

// 地點代碼查名稱、座標、Google 地圖連結；回傳 { title, lat, lng, url, addr, type }
async function placeInfo(place) {
  await place.fetchFields({ fields: ['displayName', 'location', 'googleMapsURI', 'formattedAddress', 'types'] });
  const loc = place.location;
  if (!loc) return null;
  // Google 給的連結後面帶一長串追蹤參數，只留地點代碼 cid
  const cid = (place.googleMapsURI || '').match(/[?&]cid=(\d+)/)?.[1];
  const url = cid ? `https://maps.google.com/?cid=${cid}` : place.googleMapsURI || '';
  return { title: (place.displayName || '').slice(0, 60), lat: +loc.lat().toFixed(6), lng: +loc.lng().toFixed(6), url, addr: place.formattedAddress || '', type: typeOf(place.types) };
}

// 輸入框打字時跳出 Google 候選地點（Places API (New) 自動完成）
// near()：回傳要優先找的範圍（地圖目前看到的範圍，或行程大約位置），沒有就回傳 null；onPick(地點)
export async function attachSuggest(input, near, onPick) {
  await loadApi();
  const { AutocompleteSuggestion, AutocompleteSessionToken } = await window.google.maps.importLibrary('places');
  const list = document.createElement('div');
  list.className = 'sugg';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  input.after(list);
  input.setAttribute('autocomplete', 'off');
  let token = new AutocompleteSessionToken(), timer, seq = 0, rows = [], at = -1;
  const close = () => { list.hidden = true; at = -1; };
  const mark = () => list.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', i === at));
  async function pick(i) {
    const pred = rows[i];
    close();
    if (!pred) return;
    try {
      const p = await placeInfo(pred.toPlace());
      token = new AutocompleteSessionToken();
      if (p) onPick({ ...p, addr: pred.secondaryText?.text || p.addr }); // 候選清單上的地址是中文，詳細資料的地址有時是英文
    } catch (err) { console.error(err); }
  }
  async function run() {
    const q = input.value.trim(), my = ++seq;
    if (q.length < 2) { close(); return; }
    try {
      const bias = near();
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: q, sessionToken: token, language: 'zh-TW', ...(bias ? { locationBias: bias } : {}) });
      if (my !== seq || document.activeElement !== input) return;
      rows = suggestions.map(s => s.placePrediction).filter(Boolean).slice(0, 5);
      at = -1;
      list.innerHTML = rows.map((r, i) => `<button type="button" role="option" data-i="${i}"><b>${esc(r.mainText?.text || r.text.text)}</b><span>${esc(r.secondaryText?.text || '')}</span></button>`).join('');
      list.hidden = !rows.length;
    } catch (err) { console.error(err); close(); }
  }
  input.addEventListener('input', ev => { if (ev.isComposing) return; clearTimeout(timer); timer = setTimeout(run, 250); });
  input.addEventListener('compositionend', () => { clearTimeout(timer); timer = setTimeout(run, 250); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', ev => {
    if (input.closest('.msearch')) ev.stopPropagation(); // 不讓地圖拿方向鍵去移動畫面
    if (list.hidden) return;
    ev.stopPropagation(); // 候選清單開著時，Enter、Esc 只管清單
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); at = (at + (ev.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length; mark(); }
    else if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); pick(Math.max(at, 0)); }
    else if (ev.key === 'Escape') close();
  });
  list.addEventListener('pointerdown', ev => ev.preventDefault()); // 點選項時輸入框不要先失去焦點
  list.addEventListener('click', ev => { ev.stopPropagation(); const b = ev.target.closest('button'); if (b) pick(+b.dataset.i); });
}

// data：{ points: [{ id, kind: 'day'|'wish', n, lat, lng, title, sub, url, opts（天數下拉選項）, color }], fit, focus, opts }
// onPlace(動作 'placeAdd'|'placeWish', 地點, 第幾天)：搜尋或點地圖上的地點後按加入，成功回傳 true
export async function syncMap(data, onAct, onPlace) {
  await loadApi();
  const slot = document.getElementById('mapslot'); // 載入期間畫面可能重畫過，重新找一次
  if (!slot) return;
  const g = window.google.maps;
  if (!map) {
    box = document.createElement('div');
    box.className = 'lmap';
    map = new g.Map(box, { center: { lat: 23.7, lng: 121 }, zoom: 7, mapTypeControl: false, streetViewControl: false, clickableIcons: true, gestureHandling: 'greedy' });
    info = new g.InfoWindow();
    // 左上角搜尋框：打字跳出候選地點，選了就插針
    const bar = document.createElement('div');
    bar.className = 'msearch';
    bar.innerHTML = `<input type="search" class="input" placeholder="搜尋地點，加進行程" aria-label="搜尋地點">`;
    search = bar.querySelector('input');
    map.controls[g.ControlPosition.TOP_LEFT].push(bar);
    attachSuggest(search, () => map.getBounds() || null, showPlace).catch(console.error);
    // 點地圖上的店家、景點圖示：不開 Google 原本的小視窗，改開可以加入行程的彈出框
    const { Place } = await g.importLibrary('places');
    map.addListener('click', async ev => {
      if (!ev.placeId) return;
      ev.stop();
      try { const p = await placeInfo(new Place({ id: ev.placeId, requestedLanguage: 'zh-TW' })); if (p) showPlace(p); } catch (err) { console.error(err); }
    });
  }
  act = onPlace;
  // 換了旅程或天數選項，先前搜到的地點彈出框裡的天數已經不對，收掉
  const opts = `${String(data.fit).split(':')[0]}|${data.opts || ''}`;
  if (opts !== lastOpts) { lastOpts = opts; clearPlace(); }
  dayOptsHtml = data.opts || '';
  if (box.parentNode !== slot) slot.appendChild(box);
  const key = JSON.stringify(data.points);
  if (key !== lastKey) {
    lastKey = key;
    markers.forEach(m => m.setMap(null)); markers.clear();
    for (const p of data.points) {
      const day = p.kind === 'day';
      const m = new g.Marker({
        map, position: { lat: p.lat, lng: p.lng }, title: p.title, zIndex: day ? 2 : 1,
        icon: { path: g.SymbolPath.CIRCLE, scale: day ? 12 : 8, fillColor: day ? DAY : p.color || WISH, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
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

// 收藏連結只記到大約哪一區（誤差數公里），用名稱加大約位置請 Google 查精確座標
// 要在 Google Cloud 啟用 Places API (New)；沒啟用時回傳 'off'
export async function locate(p) {
  await loadApi();
  const { Place } = await window.google.maps.importLibrary('places');
  const near = { lat: p.lat, lng: p.lng };
  try {
    const { places } = await Place.searchByText({ textQuery: p.title, fields: ['location'], locationBias: { center: near, radius: 20000 }, maxResultCount: 1, language: 'zh-TW' });
    const loc = places?.[0]?.location;
    if (!loc) return null;
    const xy = { lat: +loc.lat().toFixed(6), lng: +loc.lng().toFixed(6) };
    return distanceKm(near, xy) < 30 ? xy : null; // 查到太遠的同名地點就不用
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
