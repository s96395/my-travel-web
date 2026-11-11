// Google 地圖（Maps JavaScript API，要金鑰）：想去清單與當天行程插針
// 畫面每次重畫都會換掉 HTML，所以地圖放在一個固定的區塊，重畫後搬回 #mapslot，縮放位置不會跑掉
import { esc } from './dom.js';
import { mapsKey } from '../firebase.js';
import { distanceKm, openAt, pickAreaName } from '../lib/places.js';

let ready, map, box, info, line, temp, search, act, dayOptsHtml = '', lastKey = '', lastFit = '', lastFocus = '', lastOpts = '';
const markers = new Map();
let wishPts = [], wishMarks = [], clusterZoom = -1, onActRef;
let nearCat = '', nearAt = null, nearBtn, nearBar, nearSeq = 0;
const nearMarks = [];

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
  // 一行放「第幾天＋加入」，其他動作放下面一行小字連結
  el.innerHTML = `${p.sub ? `<span class="mpopsub">${esc(p.sub)}</span>` : ''}
    ${p.kind === 'wish' ? `<div class="mpoprow">${p.d ? `<button type="button" class="btn sm primary" data-act="wishDay" data-id="${esc(p.id.slice(2))}" data-d="${p.d}">加入第 ${p.d} 天</button>` : `<button type="button" class="btn sm primary" data-act="wishAdd" data-id="${esc(p.id.slice(2))}">加入行程</button>`}</div>` : ''}
    <div class="mpoplinks">${p.kind === 'wish' && p.d ? `<button type="button" data-act="wishAdd" data-id="${esc(p.id.slice(2))}">加到別天</button>` : ''}${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">在 Google 地圖開啟</a>` : ''}</div>`;
  el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => { if (!b.disabled) { info.close(); onAct(b); } }));
  return el;
}

// 搜尋到或在地圖上點到的地點：先插一根紅色大頭針，彈出框可以直接加到某天，或先放想去清單
function placePopup(p) {
  const el = document.createElement('div');
  el.className = 'mpop';
  el.innerHTML = `${p.addr ? `<span class="mpopsub">${esc(p.addr)}</span>` : ''}
    ${dayOptsHtml ? '<div class="mpoprow"><button type="button" class="btn sm primary" data-pact="placeAdd">加入行程</button></div>' : ''}
    <div class="mpoplinks"><button type="button" data-pact="placeWish">放想去清單</button>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">Google 地圖</a>` : ''}</div>`;
  // 擋掉往上傳，免得畫面共用的點擊處理再執行一次
  el.querySelectorAll('[data-pact]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    if (b.disabled) return;
    b.disabled = true;
    // 「加入行程」會先跳出要加在哪一天，選好後再收掉這根針
    Promise.resolve(act?.(b.dataset.pact, p, 0)).then(ok => { if (ok) clearPlace(); else b.disabled = false; });
  }));
  return el;
}
function showPlace(p, stay) {
  const g = window.google.maps;
  temp ??= new g.Marker({ zIndex: 3 });
  temp.setOptions({ map, position: { lat: p.lat, lng: p.lng }, title: p.title });
  if (!stay) { map.panTo(temp.getPosition()); if (map.getZoom() < 15) map.setZoom(15); }
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
const INFO_FIELDS = ['displayName', 'location', 'googleMapsURI', 'formattedAddress', 'types'];
async function placeInfo(place) {
  await place.fetchFields({ fields: INFO_FIELDS });
  return toInfo(place);
}
function toInfo(place) {
  const loc = place.location;
  if (!loc) return null;
  // Google 給的連結後面帶一長串追蹤參數，只留地點代碼 cid
  const cid = (place.googleMapsURI || '').match(/[?&]cid=(\d+)/)?.[1];
  const url = cid ? `https://maps.google.com/?cid=${cid}` : place.googleMapsURI || '';
  return { title: (place.displayName || '').slice(0, 60), lat: +loc.lat().toFixed(6), lng: +loc.lng().toFixed(6), url, addr: place.formattedAddress || '', type: typeOf(place.types) };
}

// 地圖上方的分類（景點、美食…）：點了就把目前畫面附近的地點標出來；移動地圖後按「搜尋此區域」重找
const NEAR_CATS = [
  ['sight', '景點', '#2f6fdb', ['tourist_attraction', 'museum', 'park', 'amusement_park', 'art_gallery', 'zoo', 'aquarium', 'historical_landmark']],
  ['food', '美食', '#c2255c', ['restaurant']],
  ['cafe', '咖啡甜點', '#9c6b3f', ['cafe', 'bakery']],
  ['shop', '購物', '#8e44ad', ['shopping_mall', 'department_store', 'market', 'store']],
];
function clearNear() { nearMarks.forEach(m => m.setMap(null)); nearMarks.length = 0; }
function nearView() {
  const b = map.getBounds(), c = map.getCenter();
  if (!b || !c) return null;
  const ne = b.getNorthEast();
  // 畫面中心到角落的距離當半徑，Google 最多只收 50 公里
  const r = Math.min(50000, Math.max(300, distanceKm({ lat: c.lat(), lng: c.lng() }, { lat: ne.lat(), lng: ne.lng() }) * 1000));
  return { lat: c.lat(), lng: c.lng(), r, z: map.getZoom() };
}
function syncNearUi() {
  nearBar?.querySelectorAll('[data-cat]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cat === nearCat));
  if (!nearBtn) return;
  const v = nearCat && nearView();
  // 移動超過畫面寬度的三分之一，或縮放過，才出現「搜尋此區域」
  const moved = v && nearAt && (v.z !== nearAt.z || distanceKm(v, nearAt) * 1000 > nearAt.r / 3);
  nearBtn.hidden = !moved;
}
async function runNear() {
  const cat = NEAR_CATS.find(c => c[0] === nearCat), v = nearView();
  if (!cat || !v) return;
  const g = window.google.maps, my = ++nearSeq;
  nearAt = v; syncNearUi();
  nearBtn.hidden = false; nearBtn.disabled = true; nearBtn.textContent = '搜尋中…';
  try {
    const { Place } = await g.importLibrary('places');
    const { places } = await Place.searchNearby({ locationRestriction: { center: { lat: v.lat, lng: v.lng }, radius: v.r }, includedTypes: cat[3], fields: INFO_FIELDS, maxResultCount: 20, rankPreference: 'POPULARITY', language: 'zh-TW' });
    if (my !== nearSeq) return;
    clearNear();
    for (const pl of places || []) {
      const p = toInfo(pl);
      if (!p) continue;
      const m = new g.Marker({ map, position: { lat: p.lat, lng: p.lng }, title: p.title, zIndex: 2, icon: { path: g.SymbolPath.CIRCLE, scale: 6, fillColor: cat[2], fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, labelOrigin: new g.Point(0, 3.2) }, label: { text: p.title.length > 10 ? p.title.slice(0, 10) + '…' : p.title, color: cat[2], fontSize: '12px', fontWeight: '700', className: 'mnearlab' } });
      m.addListener('click', () => showPlace(p, true));
      nearMarks.push(m);
    }
    nearBtn.textContent = places?.length ? '搜尋此區域' : '這附近沒找到，換個地方再搜尋';
  } catch (err) { console.error(err); if (my === nearSeq) nearBtn.textContent = '搜尋失敗，再試一次'; }
  if (my !== nearSeq) return;
  nearBtn.disabled = false;
  nearBtn.hidden = nearBtn.textContent === '搜尋此區域';
}
function nearControls(g, bar) {
  nearBar = document.createElement('div');
  nearBar.className = 'mcats';
  nearBar.innerHTML = NEAR_CATS.map(([k, label, color]) => `<button type="button" data-cat="${k}" aria-pressed="false" style="--c:${color}">${label}</button>`).join('');
  nearBar.addEventListener('click', ev => {
    const b = ev.target.closest('[data-cat]');
    if (!b) return;
    ev.stopPropagation();
    nearCat = nearCat === b.dataset.cat ? '' : b.dataset.cat;
    nearSeq++; clearNear(); nearAt = null;
    if (nearCat) runNear(); else syncNearUi();
  });
  bar.appendChild(nearBar);
  nearBtn = document.createElement('button');
  nearBtn.type = 'button';
  nearBtn.className = 'mnear';
  nearBtn.hidden = true;
  nearBtn.textContent = '搜尋此區域';
  nearBtn.addEventListener('click', ev => { ev.stopPropagation(); runNear(); });
  map.controls[g.ControlPosition.BOTTOM_CENTER].push(nearBtn);
  map.addListener('idle', syncNearUi);
}

// 輸入框打字時跳出 Google 候選地點（Places API (New) 自動完成）
// near()：回傳要優先找的範圍（地圖目前看到的範圍，或行程大約位置），沒有就回傳 null；onPick(地點)
// onSelf(名稱)：有給的話，清單最後一列是「自己輸入」，找不到地點時用
export async function attachSuggest(input, near, onPick, onSelf) {
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
    if (!pred) { if (onSelf && i === rows.length) onSelf(input.value.trim()); return; }
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
      list.innerHTML = rows.map((r, i) => `<button type="button" role="option" data-i="${i}"><b>${esc(r.mainText?.text || r.text.text)}</b><span>${esc(r.secondaryText?.text || '')}</span></button>`).join('')
        + (onSelf ? `<button type="button" role="option" data-i="${rows.length}" class="suggself"><span>找不到？自己輸入「${esc(q)}」</span></button>` : '');
      list.hidden = !list.children.length;
    } catch (err) { console.error(err); close(); }
  }
  input.addEventListener('input', ev => { if (ev.isComposing) return; clearTimeout(timer); timer = setTimeout(run, 250); });
  input.addEventListener('compositionend', () => { clearTimeout(timer); timer = setTimeout(run, 250); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', ev => {
    if (input.closest('.msearch')) ev.stopPropagation(); // 不讓地圖拿方向鍵去移動畫面
    if (list.hidden) return;
    ev.stopPropagation(); // 候選清單開著時，Enter、Esc 只管清單
    const n = list.children.length;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); at = (at + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n; mark(); }
    else if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); pick(Math.max(at, 0)); }
    else if (ev.key === 'Escape') close();
  });
  list.addEventListener('pointerdown', ev => ev.preventDefault()); // 點選項時輸入框不要先失去焦點
  list.addEventListener('click', ev => { ev.stopPropagation(); const b = ev.target.closest('button'); if (b) pick(+b.dataset.i); });
}

// 名稱放在彈出框的標題列（和關閉鈕同一行），上方才不會空一大塊
function openPop(p, m) {
  const head = document.createElement('b');
  head.className = 'mpophead';
  head.textContent = p.title;
  info.setOptions({ headerContent: head, content: popup(p, onActRef) });
  info.open({ map, anchor: m });
}
// 點地圖上的號碼針，左邊行程捲到那一站並閃一下
function showInList(id) {
  const el = document.querySelector(`section.day [data-iid="${CSS.escape(id)}"]`);
  if (!el) return;
  // 電腦版只捲左邊行程欄；手機版捲整頁，讓那一站出現在地圖下面
  const box = el.closest('.day');
  if (box && box.scrollHeight > box.clientHeight + 4) box.scrollTo({ top: el.offsetTop - box.offsetTop - box.clientHeight / 3, behavior: 'smooth' });
  else { const top = document.querySelector('.mtop'); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - (top ? top.getBoundingClientRect().bottom : 80) - 12, behavior: 'smooth' }); }
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
// 想去清單的點：粉紅色愛心圓點；縮小地圖時相近的點合併成一個數字圓圈，放大再散開
// 想去清單照 Google 地圖收藏「最愛」的樣子：粉紅色圓形、白邊、白色愛心，使用者一看就知道是自己收藏的
const WISH_PINK = '#e8577a', CELL = 44;
const WISH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="${WISH_PINK}" stroke="#fff" stroke-width="2.5"/><path d="M14 20.2s-5.8-3.6-5.8-7.6a3.1 3.1 0 0 1 5.8-1.6 3.1 3.1 0 0 1 5.8 1.6c0 4-5.8 7.6-5.8 7.6z" fill="#fff"/></svg>`;
const WISH_ICON = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(WISH_SVG);
function drawWish() {
  const g = window.google?.maps, z = map?.getZoom(), proj = map?.getProjection();
  if (!g || z === undefined || !proj || z === clusterZoom) return;
  clusterZoom = z;
  wishMarks.forEach(m => m.setMap(null)); wishMarks = [];
  const scale = 2 ** z, cells = new Map();
  for (const p of wishPts) {
    const w = proj.fromLatLngToPoint(new g.LatLng(p.lat, p.lng));
    const k = `${Math.floor(w.x * scale / CELL)}:${Math.floor(w.y * scale / CELL)}`;
    (cells.get(k) || cells.set(k, []).get(k)).push(p);
  }
  for (const list of cells.values()) {
    if (list.length === 1 || z >= 17) {
      for (const p of list) {
        const m = new g.Marker({ map, position: { lat: p.lat, lng: p.lng }, title: p.title, zIndex: 1, icon: { url: WISH_ICON, scaledSize: new g.Size(26, 26), anchor: new g.Point(13, 13) } });
        m.addListener('click', () => openPop(p, m));
        markers.set(p.id, m); wishMarks.push(m);
      }
      continue;
    }
    const b = new g.LatLngBounds();
    list.forEach(p => b.extend({ lat: p.lat, lng: p.lng }));
    const m = new g.Marker({ map, position: b.getCenter(), zIndex: 0, title: `${list.length} 個想去的地點，點一下放大`,
      icon: { path: g.SymbolPath.CIRCLE, scale: 11 + Math.min(6, list.length / 3), fillColor: WISH_PINK, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      label: { text: String(list.length), color: '#fff', fontSize: '12px', fontWeight: '700' } });
    m.addListener('click', () => { map.fitBounds(b, 60); if (map.getZoom() <= z) map.setZoom(z + 2); });
    wishMarks.push(m);
  }
}

// data：{ points: [{ id, kind: 'day'|'wish', n, lat, lng, title, sub, url, opts（天數下拉選項）, color }], fit, fitAll（只看某區域時連想去清單一起框）, focus, opts }
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
    bar.innerHTML = `<div class="suggwrap"><input type="search" class="input" placeholder="搜尋地點，加進行程" aria-label="搜尋地點"></div>`;
    search = bar.querySelector('input');
    map.controls[g.ControlPosition.TOP_LEFT].push(bar);
    nearControls(g, bar);
    map.addListener('idle', drawWish);
    attachSuggest(search, () => map.getBounds() || null, showPlace, title => act?.('placeSelf', { title }, 0)).catch(console.error);
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
    // 當天行程照 1、2、3 的順序用虛線連起來，看得出怎麼走
    const route = data.points.filter(p => p.kind === 'day').sort((a, b) => a.n - b.n).map(p => ({ lat: p.lat, lng: p.lng }));
    line?.setMap(null);
    line = route.length > 1 ? new g.Polyline({ map, path: route, strokeOpacity: 0, zIndex: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeColor: DAY, strokeOpacity: 0.9, strokeWeight: 3, scale: 3 }, offset: '0', repeat: '14px' }] }) : null;
    wishPts = data.points.filter(p => p.kind === 'wish'); clusterZoom = -1;
    for (const p of data.points.filter(q => q.kind === 'day')) {
      const day = true;
      const m = new g.Marker({
        map, position: { lat: p.lat, lng: p.lng }, title: day ? `${p.n}. ${p.title}` : p.title, zIndex: day ? 1000 - p.n : 1,
        icon: { path: g.SymbolPath.CIRCLE, scale: day ? 13 : 7, fillColor: day ? DAY : p.color || WISH, fillOpacity: day ? 1 : 0.85, strokeColor: '#fff', strokeWeight: day ? 3 : 2 },
        label: day ? { text: String(p.n), color: '#fff', fontSize: '12px', fontWeight: '700' } : null,
      });
      m.addListener('click', () => { openPop(p, m); showInList(p.id); });
      markers.set(p.id, m);
    }
  }
  onActRef = onAct;
  drawWish();
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
    const wp = wishPts.find(p => p.id === data.focus);
    if (wp && !wishMarks.some(m => m === markers.get(wp.id) && m.getMap())) { map.setCenter({ lat: wp.lat, lng: wp.lng }); map.setZoom(Math.max(map.getZoom(), 17)); drawWish(); }
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
    // maxKm：查到的地點離大約位置多遠以內才算數（預設 30 公里；位置有誤重查時用旅程中心，放寬）
    const max = p.maxKm || 30;
    const { places } = await Place.searchByText({ textQuery: p.title, fields: ['location'], ...(near ? { locationBias: { center: near, radius: Math.min(max, 50) * 1000 } } : {}), maxResultCount: 1, language: 'zh-TW' });
    const loc = places?.[0]?.location;
    const xy = loc && { lat: +loc.lat().toFixed(6), lng: +loc.lng().toFixed(6) };
    if (xy && (!near || distanceKm(near, xy) < max)) return xy; // 查到太遠的同名地點就不用
    // 用旅程中心查不到時，可能本來就在別的城市（例如兩國的旅程），改在它原本的位置附近查
    return p.own ? locate({ ...p.own, title: p.title }) : null;
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

// 現在有沒有營業：用名稱在地點附近找到 Google 的店家，看營業時間。回傳 true／false；
// 查不到或沒有營業時間是 null；永久歇業回傳 'gone'；沒啟用 Places API 回傳 'off'
export async function openNow(p) {
  await loadApi();
  const { Place } = await window.google.maps.importLibrary('places');
  try {
    const { places } = await Place.searchByText({ textQuery: p.title, fields: ['location', 'regularOpeningHours', 'currentOpeningHours', 'utcOffsetMinutes', 'businessStatus'], locationBias: { center: { lat: p.lat, lng: p.lng }, radius: 300 }, maxResultCount: 1, language: 'zh-TW' });
    const pl = places?.[0], loc = pl?.location;
    if (!pl || !loc || distanceKm(p, { lat: loc.lat(), lng: loc.lng() }) > 0.5) return null; // 找到的是別處的同名店家就不算
    if (pl.businessStatus === 'CLOSED_PERMANENTLY') return 'gone';
    // 國定假日、臨時公休等特殊時段在 currentOpeningHours，有的話優先用；Place.isOpen() 只有測試版地圖才有，自己照營業時段算
    const hours = pl.currentOpeningHours?.periods?.length ? pl.currentOpeningHours : pl.regularOpeningHours;
    return hours ? openAt(hours.periods, pl.utcOffsetMinutes) : null;
  } catch (err) {
    console.error(err);
    return /not been used|disabled|not authorized|PERMISSION_DENIED|REQUEST_DENIED/i.test(String(err?.message || err)) ? 'off' : null;
  }
}

// 區域名稱：查這區中心 800 公尺內熱門的景點、車站、市場，挑一個中文地名（例如「青沙浦」「廣安」）；查不到回傳空字串
export async function areaName(center) {
  await loadApi();
  const { Place } = await window.google.maps.importLibrary('places');
  try {
    const { places } = await Place.searchNearby({ locationRestriction: { center, radius: 800 }, includedPrimaryTypes: ['tourist_attraction', 'beach', 'park', 'subway_station', 'train_station', 'shopping_mall', 'market'], fields: ['displayName'], maxResultCount: 10, rankPreference: 'POPULARITY', language: 'zh-TW' });
    return pickAreaName((places || []).map(p => p.displayName));
  } catch (err) {
    console.error(err);
    return /not been used|disabled|not authorized|PERMISSION_DENIED|REQUEST_DENIED/i.test(String(err?.message || err)) ? 'off' : '';
  }
}
