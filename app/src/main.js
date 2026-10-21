// 進入點：讀取設定、登入狀態、監看資料、畫面切換與事件
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { initFirebase, mapsKey } from './firebase.js';
import { watchUser, signIn, logOut, nicknameOf, exposeTestSignIn, confirmIdentity, removeAccount } from './auth.js';
import { watchMyTrips, watchExpenses, createTrip, upgradeShareKeys } from './data/trips.js';
import { addSampleTrips } from './data/sample.js';
import { viewTrip } from './lib/trips.js';
import { $, esc, store, toast, closeSheet, sheetOpen, ICON } from './ui/dom.js';
import { renderHome } from './views/home.js';
import { renderLogin, loginErrorText } from './views/login.js';
import { renderTrip, tabButtons, cropSheet, dlSheet, coverSheet } from './views/trip.js';
import { sceneUrl } from './ui/scene.js';
import { itemMenuSheet, itemFormSheet, readItemForm, importSheet, mapData, wishLeft, areaSheet, areaMoveSheet } from './views/plan.js';
import { parseSavedList, findCoords, coordsFromUrl, nearDay, clusterNear } from './lib/places.js';
import { watchItinerary, addItem, updateItem, deleteItem, saveMoves } from './data/itinerary.js';
import { normalizeItem, planMove, planAreaMove, nextOrder, itemsOfDay, isMapLink } from './lib/itinerary.js';
import { initDrag } from './ui/drag.js';
import { watchRecords, addRecord, updateRecord, deleteRecord } from './data/records.js';
import { allFlights, allStays, flightFormSheet, stayFormSheet, transitFormSheet, readTransitForm, readFlightForm, readStayForm, updateDuration, updateNights, fillAirport } from './views/move.js';
import { missingTemplate, missingPack } from './lib/todos.js';
import { renderExpSheet, expDraft, draftFields, draftCheck, shareList, depositSheet, ctxOf, canEdit as canEditRecord } from './views/expense.js';
import { saveExpense, updateTrip, setRepaid } from './data/expenses.js';
import { equalSplit, amountOf } from './lib/expenses.js';
import { diveFormSheet, readDiveForm, totalTanks, tanksByPerson } from './views/dive.js';
import { renderMore, personSheet, confirmSheet, delTripSheet, inviteUrl, companionsOf } from './views/more.js';
import { renderJoin } from './views/join.js';
import { addParticipant, patchParticipants, removeMember, kickMember, updateTripInfo, userName, readJoinTrip, joinAsMember, sharesNow, bindParticipant, deleteTripAll, deleteAccountData, addCompanion, bindCompanion } from './data/people.js';
import { moveUp, boundTo, isMember, memberUids, cleanName } from './lib/people.js';
import { perPerson } from './lib/expenses.js';
import { participantsOf } from './lib/trips.js';
import { buildIcs } from './lib/ics.js';
import { accountSheet, installSheet, privacySheet, delAccountSheet, newTripSheet, readTripForm } from './views/sheets.js';
import { downloadTrip, listOffline, removeOffline, saveAccount, readAccount, clearOffline } from './data/offline.js';
import { shrinkImage, loadCover, saveCover } from './data/cover.js';

const WIDE = window.matchMedia('(min-width: 1000px)');
const STANDALONE = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// 外觀：跟著系統、淺色或深色，記在這台裝置上
const applyTheme = v => { if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme; };
applyTheme(store.get('theme') || '');

const S = {
  env: '', user: null, nickname: '', ready: false,
  trips: [], expenses: new Map(), loadingTrips: true,
  view: 'home', tripId: null,
  tab: 'plan', days: {}, pday: 1, items: [], loadingItems: false,
  flightDocs: [], stayDocs: [], transitDocs: [], loadingMove: false, reveal: {},
  todoDocs: [], packDocs: [], packOpen: {}, todoSeg: 'todo', loadingTodo: false,
  diveDocs: [], loadingDive: false,
  depositDocs: [], expSeg: 'list', expFilter: 'all', draft: null,
  q: '', filter: '全部', years: {}, stats: {},
  wide: WIDE.matches, offline: !navigator.onLine, standalone: STANDALONE,
  hideInstall: store.get('hideInstall') === '1',
  visits: (Number(store.get('visits')) || 0) + 1, // 第幾次打開，第二次起才提示加到主畫面
  tipDrag: store.get('tipDrag') === '1', // 拖曳提示看過了
  wishDocs: [], mside: 'plan', // 想去清單（匯入的 Google 地圖收藏）；手機版看行程還是想去清單
  side: store.get('side') === 'list' ? 'list' : 'map', mapFocus: '', mapArea: '', // 電腦版右半邊在看地圖或清單、地圖正在看哪個地點、只看哪個區域
  signingIn: false, loginError: '', busy: false,
  userNames: {}, join: null,
  theme: store.get('theme') || '', // 外觀：''＝跟著系統
  covers: {}, crop: null, // covers：旅程 id → 封面照；crop：正在調整的封面
  dl: {}, dlBusy: null, localOnly: false, // dl：下載過的旅程 id → 下載時間；localOnly：沒網路開啟，只讀手機上下載的資料
};
store.set('visits', String(S.visits));
let local = new Map(); // 沒網路開啟時，下載的旅程 id → 整份資料

let stopTrips = null;
const expenseWatch = new Map(); // tripId → 取消監看函式
const retries = new Map();
let itin = { tripId: null, stops: [], tries: 0 }; // 目前開著的旅程資料監看

/* ---------- 畫面 ---------- */
function render() {
  const device = $('#device');
  device.classList.toggle('wide', S.wide);
  const active = document.activeElement;
  const keepQ = active?.id === 'q' ? [active.selectionStart, active.selectionEnd] : null;
  let html;
  if (!S.ready) html = '<div class="boot"><div class="brand">沈迷旅行</div><div class="spin" aria-hidden="true"></div><p>載入中…</p></div>';
  else if (S.view === 'join') { maybeLoadJoin(); html = renderJoin(S); }
  else if (!S.user) html = renderLogin(S);
  else html = S.view === 'trip' ? renderTrip(S) : renderHome(S);
  if (S.view === 'trip' && S.tab === 'more' && !S.localOnly) loadNames();
  syncItineraryWatch();
  $('#scroller').innerHTML = html + envTag();
  const trip = curTrip();
  $('#tabSlot').innerHTML = S.user && S.view === 'trip' && trip && !S.wide
    ? `<nav class="tabbar" aria-label="旅程分頁">${tabButtons(trip, S.tab)}</nav>` : '';
  $('#fabSlot').innerHTML = S.user && S.view === 'home' && !S.wide
    ? `<button type="button" class="fab" data-act="newTrip" ${S.offline ? 'disabled' : ''}>${ICON.plus}新增旅程</button>` : '';
  if (keepQ) { const q = $('#q'); q.focus(); q.setSelectionRange(...keepQ); }
  // 日期列重畫後會回到最左邊；天數多時把選到的那天捲到中間
  const pill = $('.dpill[aria-current="true"]');
  if (pill) { const row = pill.parentNode; row.scrollLeft += pill.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - pill.offsetWidth) / 2; }
  // 地圖只在用到時才載入
  tourCheck();
  if ($('#mapslot')) import('./ui/map.js').then(async m => { const t = curTrip(); if (!t) return; await m.syncMap(mapData(S, t), el => actions[el.dataset.act]?.(el)); exactCoords(m); }).catch(err => { console.error(err); toast('Google 地圖載入失敗，請稍後再試'); });
}

// 收藏連結算出的座標只到大約哪一區，地圖載入後逐一查精確位置，查到就存起來（每個地點只查一次）
const tried = new Set();
let locating = false, placesOff = false;
async function exactCoords(m) {
  if (locating || placesOff || S.offline || !S.tripId) return;
  const rough = x => !x.exact && Number.isFinite(x.lat) && !tried.has(x.id);
  const todo = [
    ...S.wishDocs.filter(rough).map(p => ({ ...p, save: c => updateRecord(S.tripId, 'wishlist', p.id, c, S.user, S.nickname) })),
    ...S.items.filter(it => rough(it) && coordsFromUrl(it.address)).map(it => ({ ...it, save: c => updateItem(S.tripId, it.id, c, S.user, S.nickname) })),
  ];
  if (!todo.length) return;
  locating = true;
  try {
    for (const p of todo) {
      tried.add(p.id);
      const xy = await m.locate(p);
      if (xy === 'off') { placesOff = true; toast('要在 Google Cloud 啟用 Places API (New)，地圖上的位置才會準'); break; }
      if (xy) await p.save({ ...xy, exact: true }).catch(console.error);
    }
  } finally { locating = false; }
}

// 操作導覽：第一次看到首頁、第一次打開旅程時各出現一次；之後可以在帳號選單或「更多」重看
let tour = null; // 用到時才載入 ui/tour.js
function tourCheck() {
  if (tour?.touring()) { tour.refreshTour(); return; }
  if (!S.user || S.localOnly || S.offline || sheetOpen()) return;
  const which = S.view === 'home' && !S.loadingTrips ? 'Home' : S.view === 'trip' && curTrip() && S.tab === 'plan' && !S.loadingItems ? 'Trip' : '';
  if (!which || store.get('tour' + which) === '1') return;
  store.set('tour' + which, '1');
  startTour(which);
}
function startTour(which) {
  import('./ui/tour.js').then(m => {
    tour = m;
    // 等畫面排好再框按鈕
    setTimeout(() => (which === 'Home' ? m.homeTour(S.wide, !S.trips.length) : m.tripTour(S.wide)), 300);
  }).catch(err => console.error(err));
}

function envTag() {
  if (!S.env || S.env === 'production') return '';
  return `<div class="envtag">${S.env === 'emulator' ? '本機模擬環境' : '測試環境'}</div>`;
}

function fatal(msg) {
  $('#scroller').innerHTML = `<div class="boot"><div class="brand">沈迷旅行</div><p>${msg}</p><button type="button" class="btn" onclick="location.reload()">重新整理</button></div>`;
}

/* ---------- 路徑：#/trip/<id> 開旅程，#/join/<id>/<key> 加入旅程，其他回首頁 ---------- */
function readRoute() {
  // 舊版邀請連結 join.html?id=…&key=…（離線快取直接給首頁時也要認得）
  const q = new URLSearchParams(location.search);
  if (/\/join\.html$/.test(location.pathname) && q.get('id')) history.replaceState(null, '', `/#/join/${q.get('id')}/${q.get('key') || ''}`);
  const m = location.hash.match(/^#\/trip\/([\w-]+)$/), j = location.hash.match(/^#\/join\/([\w-]+)\/([\w-]*)$/);
  const was = S.view;
  S.view = m ? 'trip' : j ? 'join' : 'home';
  S.tripId = m ? m[1] : null;
  // 從別的頁面回到加入頁時重新讀一次，避免停在上次的步驟
  if (j && (was !== 'join' || S.join?.tripId !== j[1] || S.join?.key !== j[2])) S.join = { tripId: j[1], key: j[2], step: 'load', pick: null, newName: '', amount: 0 };
}
function go(hash) {
  if (location.hash === hash) return;
  location.hash = hash;
}

/* ---------- 資料監看 ---------- */
const curTrip = () => S.trips.find(t => t.id === S.tripId);
const findItem = id => S.items.find(it => it.id === id);

// 進入旅程時開始監看行程、班機、住宿、待辦、公費放入紀錄，離開時停止（支出在首頁就已經在監看）；換旅程時分頁與展開狀態歸零
function syncItineraryWatch() {
  const want = S.user && S.view === 'trip' ? S.tripId : null;
  if (want === itin.tripId) return;
  itin.stops.forEach(off => off());
  itin = { tripId: want, stops: [], tries: 0 };
  Object.assign(S, { items: [], flightDocs: [], stayDocs: [], transitDocs: [], todoDocs: [], packDocs: [], packOpen: {}, todoSeg: 'todo', diveDocs: [], depositDocs: [], wishDocs: [], mside: 'plan', mapArea: '', expSeg: 'list', expFilter: 'all', reveal: {}, days: {}, pday: 1, tab: 'plan', loadingItems: !!want, loadingMove: !!want, loadingTodo: !!want, loadingDive: !!want });
  if (!want) return;
  // 這裡在畫完畫面之後才執行，填好資料要再畫一次
  if (S.localOnly) { fillFromLocal(local.get(want)); queueMicrotask(render); return; }
  startTripWatch(want);
  // 連線中途斷網、這趟還沒讀到時，先顯示下載的資料
  if (S.offline && S.dl[want]) listOffline(S.user.uid).then(list => { if (itin.tripId === want && S.loadingItems) { fillFromLocal(list.find(r => r.id === want)); render(); } }).catch(() => {});
}

function fillFromLocal(rec) {
  const x = rec?.subs || {};
  Object.assign(S, { items: (x.itinerary || []).map(normalizeItem), flightDocs: x.flights || [], stayDocs: x.stays || [], transitDocs: x.transits || [], todoDocs: x.todos || [], packDocs: x.packing || [], diveDocs: x.diveLogs || [], wishDocs: (x.wishlist || []).map(p => (p.exact ? p : { ...p, ...coordsFromUrl(p.url) })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)), depositDocs: x.fundDeposits || [], loadingItems: false, loadingMove: false, loadingTodo: false, loadingDive: false });
}

/* ---------- 下載供離線使用 ---------- */
// 開啟時：換了帳號就清掉前一個帳號的資料（P07），記下這次的帳號，讀出下載過哪些旅程
async function loadOffline(user) {
  try {
    const acc = await readAccount();
    if (acc && acc.uid !== user.uid) await clearOffline();
    await saveAccount({ uid: user.uid, name: user.displayName || '', email: user.email || '', nickname: S.nickname });
    const list = await listOffline(user.uid);
    if (S.user?.uid === user.uid) { S.dl = Object.fromEntries(list.map(r => [r.id, r.savedAt])); dlReady = true; refreshOffline(); render(); }
  } catch (err) { console.warn('讀取離線資料失敗', err); }
}
// 每次讀到旅程清單：已被移出或刪除的旅程刪掉離線資料（P08）；開啟後第一次讀到時，其他下載過的旅程重新下載一次
let dlChecked = false, dlReady = false; // dlReady：已讀出這台裝置下載過哪些旅程
async function refreshOffline() {
  if (S.offline || !dlReady || S.loadingTrips) return;
  const uid = S.user.uid, mine = new Set(S.trips.map(t => t.id));
  const gone = Object.keys(S.dl).filter(id => !mine.has(id));
  for (const id of gone) {
    try { await removeOffline(id); delete S.dl[id]; } catch (err) { console.warn('刪除離線資料失敗', id, err); }
  }
  if (!dlChecked) {
    dlChecked = true;
    for (const id of Object.keys(S.dl)) {
      try { S.dl[id] = await downloadTrip(id, uid); } catch (err) { console.warn('更新離線資料失敗', id, err); }
    }
  }
  render();
}
// 沒有網路、讀不到連線設定時，改顯示上次登入的帳號下載的旅程
async function enterLocal() {
  try {
    const acc = await readAccount();
    if (!acc) return false;
    const list = await listOffline(acc.uid);
    local = new Map(list.map(r => [r.id, r]));
    Object.assign(S, {
      localOnly: true, offline: true, ready: true, loadingTrips: false,
      user: { uid: acc.uid, displayName: acc.name, email: acc.email }, nickname: acc.nickname,
      trips: list.map(r => viewTrip(r.raw)).sort((a, b) => (b.raw.startDate || '').localeCompare(a.raw.startDate || '')),
      expenses: new Map(list.map(r => [r.id, r.subs.expenses || []])),
      dl: Object.fromEntries(list.map(r => [r.id, r.savedAt])),
      covers: Object.fromEntries(list.map(r => [r.id, r.subs.cover?.find(d => d.id === 'main')]).filter(x => x[1])),
    });
    render();
    return true;
  } catch (err) { console.warn('讀取離線資料失敗', err); return false; }
}

function startTripWatch(tripId) {
  const ok = fn => list => { if (itin.tripId === tripId) { fn(list); render(); } };
  const fail = err => {
    // 剛建立的旅程還沒寫到伺服器時會被安全規則擋下，稍後全部重來
    if (itin.tripId !== tripId) return;
    itin.stops.forEach(off => off()); itin.stops = [];
    if (++itin.tries <= 3) { setTimeout(() => itin.tripId === tripId && !itin.stops.length && startTripWatch(tripId), 1500 * itin.tries); return; }
    console.error(err);
    S.loadingItems = false; S.loadingMove = false; S.loadingTodo = false; S.loadingDive = false;
    toast('讀取旅程資料失敗，請重新整理再試');
    render();
  };
  let got = 0;
  const moveLoaded = () => { if (++got >= 3) S.loadingMove = false; };
  itin.stops = [
    watchItinerary(tripId, ok(list => { S.items = list.map(normalizeItem); S.loadingItems = false; }), fail),
    watchRecords(tripId, 'flights', ok(list => { S.flightDocs = list; moveLoaded(); }), fail),
    watchRecords(tripId, 'stays', ok(list => { S.stayDocs = list; moveLoaded(); }), fail),
    watchRecords(tripId, 'transits', ok(list => { S.transitDocs = list; moveLoaded(); }), fail),
    watchRecords(tripId, 'todos', ok(list => { S.todoDocs = list; S.loadingTodo = false; }), fail),
    watchRecords(tripId, 'packing', ok(list => { S.packDocs = list; }), fail),
    watchRecords(tripId, 'fundDeposits', ok(list => { S.depositDocs = list; }), fail),
    watchRecords(tripId, 'wishlist', ok(list => { S.wishDocs = list.map(p => (p.exact ? p : { ...p, ...coordsFromUrl(p.url) })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)); }), fail),
    watchRecords(tripId, 'diveLogs', ok(list => { S.diveDocs = list; S.loadingDive = false; syncTanks(); }), fail),
  ];
}

// 想去清單的地點排進某一天（放最後，或拖曳時放在 beforeId 前面）
async function wishToDay(wid, day, beforeId) {
  const p = S.wishDocs.find(x => x.id === wid);
  if (!p || !day || S.busy || S.offline) return false;
  S.busy = true;
  const xy = Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng, exact: !!p.exact } : {};
  try {
    const ref = await addItem(S.tripId, { title: p.title, type: 'attraction', priority: '', reservationTime: '', area: p.area || '', address: p.url, note: p.note || '', ...xy, day, order: nextOrder(S.items, day) }, S.user, S.nickname);
    S.busy = false;
    if (beforeId) await moveItem(ref.id, { day, beforeId });
    toast(`已加到第 ${day} 天`);
    return true;
  } catch (err) { console.error(err); S.busy = false; toast('沒有加成功，請稍後再試'); return false; }
}

// 整個區域排進某一天：這區還沒排進這天的地點，照離這天行程的遠近接在最後
async function areaToDay(area, day) {
  const ps = nearDay(wishLeft(S, day).filter(p => p.area === area), itemsOfDay(S.items, day));
  if (!ps.length || !day || S.busy || S.offline) return;
  S.busy = true;
  const tid = S.tripId, base = nextOrder(S.items, day); // 加的途中換到別趟旅程，也要寫回原本這趟
  try {
    for (const [i, p] of ps.entries()) {
      const xy = Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng, exact: !!p.exact } : {};
      await addItem(tid, { title: p.title, type: 'attraction', priority: '', reservationTime: '', area, address: p.url, note: p.note || '', ...xy, day, order: base + i }, S.user, S.nickname);
    }
    toast(`「${area}」${ps.length} 個地點已加到第 ${day} 天`);
  } catch (err) { console.error(err); toast('沒有加完，請稍後再試'); }
  S.busy = false;
}

// 依距離分組前先查好精確位置（收藏連結算出的位置誤差有好幾公里，分組會不準）；回傳 id → 座標
async function exactNow(ids) {
  const xy = new Map();
  if (!mapsKey || placesOff) return xy;
  const m = await import('./ui/map.js'), tid = S.tripId;
  for (const id of ids) {
    const p = S.wishDocs.find(x => x.id === id);
    if (!p || p.exact || !Number.isFinite(p.lat)) continue;
    tried.add(id);
    const c = await m.locate(p).catch(() => null);
    if (c === 'off') { placesOff = true; break; }
    if (c) { xy.set(id, c); updateRecord(tid, 'wishlist', id, { ...c, exact: true }, S.user, S.nickname).catch(console.error); }
  }
  return xy;
}

// 還沒分區域的地點依距離自動分組，區域名稱先用中心那個地點，例如「海港城一帶」，之後可以改
async function groupNear(xy = new Map()) {
  const tid = S.tripId, free = S.wishDocs.filter(p => !p.area).map(p => ({ ...p, ...(xy.get(p.id) || {}) }));
  const groups = clusterNear(free);
  if (!groups.length) { toast('沒有距離 1 公里內的地點可以分在一起'); return; }
  const names = new Set(S.wishDocs.map(p => p.area).filter(Boolean));
  const writes = [];
  for (const g of groups) {
    const base = `${g[0].title.slice(0, 15)}一帶`;
    let name = base;
    for (let i = 2; names.has(name); i++) name = `${base} ${i}`;
    names.add(name);
    g.forEach(p => writes.push(updateRecord(tid, 'wishlist', p.id, { area: name }, S.user, S.nickname)));
  }
  try { await Promise.all(writes); toast(`分成 ${groups.length} 個區域，按區域旁的 ⋯ 可以改名`); } catch (err) { console.error(err); toast('沒有分組完成，請稍後再試'); }
}

// 整個區域移到別天
async function moveArea(area, from, to) {
  const updates = planAreaMove(S.items, from, area, to);
  if (!updates.length || S.offline) return;
  const byId = new Map(updates.map(u => [u.id, u]));
  S.items = S.items.map(x => (byId.has(x.id) ? { ...x, ...byId.get(x.id) } : x));
  S.pday = to; render();
  toast(`「${area}」已從第 ${from} 天移到第 ${to} 天`);
  try { await saveMoves(S.tripId, updates, S.user, S.nickname); } catch (err) { console.error(err); toast('移動沒有儲存成功，請再試一次'); }
}

// 移動行程：先更新畫面，再寫回資料庫
async function moveItem(id, target) {
  const it = findItem(id);
  if (!it || S.offline) return;
  const updates = planMove(S.items, id, target);
  if (!updates.length) return;
  const from = it.day;
  const byId = new Map(updates.map(u => [u.id, u]));
  S.items = S.items.map(x => (byId.has(x.id) ? { ...x, ...byId.get(x.id) } : x));
  S.days[target.day] = true;
  render();
  toast(from === target.day ? `已調整第 ${from} 天的順序` : from ? `已從第 ${from} 天移到第 ${target.day} 天` : `已排到第 ${target.day} 天`);
  try { await saveMoves(S.tripId, updates, S.user, S.nickname); } catch (err) { console.error(err); toast('移動沒有儲存成功，請再試一次'); }
}

// 行程、班機、住宿等：同行的共編成員都可以刪除
const canDelRecord = (trip, r) => !!r && isMember(trip.raw, S.user.uid);

// 儲存班機或住宿；舊版資料第一次儲存時新增一筆，並記下是從哪個舊欄位轉來的
async function saveRecord(el, name, form, all, [addedMsg, updatedMsg]) {
  if (form.error) { toast(form.error); return; }
  if (S.busy) return;
  const trip = curTrip(), old = all(S, trip).find(r => r.id === el.dataset.id);
  S.busy = true; el.disabled = true;
  try {
    if (old && !old.legacy) await updateRecord(S.tripId, name, old.id, form.data, S.user, S.nickname);
    else await addRecord(S.tripId, name, old?.legacy ? { ...form.data, fromLegacy: old.legacy } : form.data, S.user, S.nickname);
    closeSheet();
    toast(old ? updatedMsg : addedMsg);
  } catch (err) { console.error(err); el.disabled = false; toast('儲存失敗，請稍後再試'); }
  S.busy = false;
}

async function removeRecord(el, name, msg) {
  // 第一次按只換成確認文字，再按一次才真的刪除
  if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = '再按一次確定刪除'; return; }
  if (S.busy) return;
  S.busy = true;
  try { await deleteRecord(S.tripId, name, el.dataset.id); closeSheet(); toast(msg); } catch (err) { console.error(err); toast('刪除失敗，請稍後再試'); }
  S.busy = false;
}

// 待辦：新增一筆或套用範本；order 用加入時間，和舊版相同
async function addTodos(texts, msg) {
  if (S.busy || S.offline || !texts.length) return false;
  S.busy = true;
  const now = Date.now();
  try {
    await Promise.all(texts.map((text, i) => addRecord(S.tripId, 'todos', { text, done: false, order: now + i }, S.user, S.nickname)));
    toast(msg);
    return true;
  } catch (err) { console.error(err); toast('待辦新增失敗，請稍後再試'); return false; } finally { S.busy = false; }
}

async function toggleTodo(box) {
  if (S.offline) { box.checked = !box.checked; return; }
  try { await updateRecord(S.tripId, 'todos', box.dataset.todo, { done: box.checked }, S.user, S.nickname); } catch (err) { console.error(err); box.checked = !box.checked; toast('待辦更新失敗，請稍後再試'); }
}

// 行李清單：每個人各自一份，用 uid 分開；group 是放在哪一區
async function addPack(items, msg) {
  if (S.busy || S.offline || !items.length) return false;
  S.busy = true;
  const now = Date.now();
  try {
    await Promise.all(items.map((x, i) => addRecord(S.tripId, 'packing', { uid: S.user.uid, group: x.group, text: x.text, done: false, order: now + i }, S.user, S.nickname)));
    toast(msg);
    return true;
  } catch (err) { console.error(err); toast('行李新增失敗，請稍後再試'); return false; } finally { S.busy = false; }
}

async function togglePack(box) {
  if (S.offline) { box.checked = !box.checked; return; }
  try { await updateRecord(S.tripId, 'packing', box.dataset.pack, { done: box.checked }, S.user, S.nickname); } catch (err) { console.error(err); box.checked = !box.checked; toast('行李更新失敗，請稍後再試'); }
}

/* ---------- 共編成員名字：沒綁定同行者的成員讀帳號暱稱 ---------- */
const nameLoading = new Set();
function loadNames() {
  const trip = curTrip();
  if (!trip) return;
  memberUids(trip.raw).filter(u => !boundTo(trip.raw, u) && !(u in S.userNames) && !nameLoading.has(u)).forEach(u => {
    nameLoading.add(u);
    userName(u).then(n => { S.userNames[u] = n || '未知旅伴'; nameLoading.delete(u); render(); });
  });
}

/* ---------- 加入旅程 ---------- */
async function maybeLoadJoin() {
  const J = S.join;
  if (!J || !S.user || J.step !== 'load' || J.loading) return;
  J.loading = true;
  const fail = msg => { Object.assign(J, { step: 'error', error: msg }); render(); };
  if (S.localOnly) return fail('目前沒有網路，連上網路後再打開邀請連結。');
  // 安全規則不讓非成員讀旅程（N04）：讀不到時先用連結裡的邀請碼加入，再讀一次
  let trip = null;
  try { trip = await readJoinTrip(J.tripId); } catch (err) { if (err?.code !== 'permission-denied') { console.error(err); return fail('沒有成功讀到旅程，請稍後再試。'); } }
  if (!trip) {
    try { await joinAsMember(J.tripId, S.user.uid, J.key); trip = await readJoinTrip(J.tripId); } catch (err) { console.warn(err); }
    if (!trip) return fail('邀請連結不正確，或旅程已經被刪除。請向建立者要最新的連結。');
  }
  const member = isMember(trip, S.user.uid);
  const mine = boundTo(trip, S.user.uid);
  Object.assign(J, { trip, member, step: mine ? 'already' : 'pick', boundName: mine?.name || '', newName: S.nickname });
  render();
}
async function companionAct(el, write, done) {
  const trip = curTrip(), c = trip && companionsOf(S, trip).find(x => x.uid === el.dataset.uid);
  if (!c || S.busy || S.offline) return;
  S.busy = true; el.disabled = true;
  try { await write(trip, c); closeSheet(); toast(done(c)); } catch (err) { console.error(err); el.disabled = false; toast(joinErr(err)); }
  S.busy = false;
}
const joinErr = err => (err?.friendly ? err.message : '沒有成功，請稍後再試');

/* ---------- 支出 ---------- */
const expSheet = () => { const trip = curTrip(); if (trip && S.draft) renderExpSheet(S, trip, S.draft); };
const dropDraft = () => { S.draft = null; closeSheet(); };
// 關閉表單：支出表單有沒儲存的修改時先問一次
function tryClose() {
  if (S.draft?.dirty && S.draft.edit && !S.draft.askClose && $('#x-name')) { S.draft.askClose = true; expSheet(); return; }
  dropDraft();
}
// 寫完支出後，把總支出寫回旅程主檔（舊版首頁與歷史頁會讀這個欄位）
function syncTotal(change) {
  const list = (S.expenses.get(S.tripId) || []).filter(e => e.id !== change.id);
  const total = [...list, ...(change.amount === undefined ? [] : [change])].reduce((a, e) => a + amountOf(e), 0);
  updateTrip(S.tripId, { totalExpense: total }).catch(err => console.warn('總支出沒有更新', err));
}

// 潛水紀錄變動後，把整趟瓶數與每個人的瓶數寫回旅程主檔（首頁卡片與統計讀這兩個欄位）
function syncTanks() {
  const trip = curTrip();
  if (!trip || trip.type !== '潛旅' || S.offline) return;
  const total = totalTanks(S.diveDocs), by = tanksByPerson(S.diveDocs, trip);
  if (trip.tanks === total && JSON.stringify(trip.raw.tanksBy || {}) === JSON.stringify(by)) return;
  updateTrip(S.tripId, { totalTanks: total, tanksBy: by }).catch(err => console.warn('累計瓶數沒有更新', err));
}

function onDrop(id, t) {
  if (!S.tipDrag) { S.tipDrag = true; store.set('tipDrag', '1'); } // 拖曳過一次就不再提示
  // 從想去清單拖過來的地點：拖到日期或某天就排在最後，拖到行程上就插在那個位置
  if (id.startsWith('w:')) {
    const ref = t.kind === 'item' ? findItem(t.id) : null;
    const day = t.kind === 'day' ? t.d : ref?.day;
    if (!day) return;
    const list = itemsOfDay(S.items, day);
    const beforeId = ref ? (t.before ? ref.id : list[list.findIndex(x => x.id === ref.id) + 1]?.id) : undefined;
    wishToDay(id.slice(2), day, beforeId);
    return;
  }
  if (t.kind === 'day') { if (t.d) moveItem(id, { day: t.d }); return; }
  const ref = findItem(t.id);
  if (!ref || !ref.day) return;
  let beforeId = ref.id;
  if (!t.before) {
    const list = itemsOfDay(S.items, ref.day).filter(x => x.id !== id);
    beforeId = list[list.findIndex(x => x.id === ref.id) + 1]?.id;
  }
  moveItem(id, { day: ref.day, beforeId });
}

function stopAll() {
  stopTrips?.(); stopTrips = null;
  expenseWatch.forEach(off => off()); expenseWatch.clear(); retries.clear();
  S.trips = []; S.expenses = new Map(); S.loadingTrips = true; S.covers = {};
}

function syncExpenseWatch() {
  const ids = new Set(S.trips.map(t => t.id));
  expenseWatch.forEach((off, id) => { if (!ids.has(id)) { off(); expenseWatch.delete(id); S.expenses.delete(id); } });
  ids.forEach(id => {
    if (expenseWatch.has(id)) return;
    // 剛建立的旅程還沒寫到伺服器時，讀支出會被安全規則擋下，稍後再試
    expenseWatch.set(id, watchExpenses(id, list => { S.expenses.set(id, list); render(); }, err => {
      expenseWatch.delete(id);
      const n = (retries.get(id) || 0) + 1;
      retries.set(id, n);
      if (n <= 3) setTimeout(syncExpenseWatch, 1500 * n);
      else console.warn('讀取支出失敗', id, err);
    }));
  });
}

// 有封面照的旅程（主檔有 coverAt）才去讀照片；別人換了封面 coverAt 會變，再讀一次
const coverLoading = new Set();
function syncCovers() {
  S.trips.forEach(t => {
    const at = t.raw.coverAt;
    if (!at || S.covers[t.id]?.at === at || coverLoading.has(t.id)) return;
    coverLoading.add(t.id);
    loadCover(t.id).then(c => { if (c) { S.covers[t.id] = c; render(); } }, err => console.warn('讀取封面失敗', t.id, err))
      .finally(() => coverLoading.delete(t.id));
  });
}

function startWatching(user) {
  stopTrips = watchMyTrips(user.uid, raw => {
    S.trips = raw.map(viewTrip);
    S.loadingTrips = false;
    upgradeShareKeys(raw, user.uid);
    syncExpenseWatch();
    syncCovers();
    render();
    refreshOffline();
  }, err => {
    console.error(err);
    S.loadingTrips = false;
    toast('讀取旅程失敗，請重新整理再試');
    render();
  });
}

/* ---------- 動作 ---------- */
const actions = {
  async signIn() {
    S.signingIn = true; S.loginError = ''; render();
    try { await signIn(); } catch (err) { S.loginError = loginErrorText(err); console.error(err); }
    S.signingIn = false; render();
  },
  async signOut() {
    closeSheet();
    // 登出時清掉手機上的旅程資料（P07）
    await clearOffline().catch(err => console.warn('清除離線資料失敗', err));
    // 沒網路開啟時還沒連上 Firebase，記下來等下次連線時再真的登出
    if (S.localOnly) { store.set('pendingLogout', '1'); location.reload(); return; }
    await logOut();
    go('#/');
    toast('已登出');
  },
  account: () => accountSheet(S),
  tourHome() { closeSheet(); startTour('Home'); },
  tourTrip() { if (S.tab !== 'plan') { S.tab = 'plan'; render(); window.scrollTo(0, 0); } startTour('Trip'); },
  theme(el) { S.theme = el.dataset.v; store.set('theme', S.theme); applyTheme(S.theme); el.parentElement.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', b === el)); },
  install: () => installSheet(),
  privacy: () => privacySheet(),
  exportIcs() {
    const trip = curTrip();
    if (!trip) return;
    if (S.loadingItems || S.loadingMove) { toast('行程還在讀取，請稍等一下再下載'); return; }
    const ics = buildIcs(trip, { items: S.items, flights: allFlights(S, trip), stays: allStays(S, trip) });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = `${trip.name.replace(/[\\/:*?"<>|]/g, '')}.ics`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('已下載行事曆檔，打開就能加進行事曆');
  },
  delAccount() { if (!S.offline) delAccountSheet(); },
  async yesDelAccount(el) {
    const input = $('#delacc'), box = $('#del-err');
    if (input.value.trim() !== '刪除') { input.classList.add('err'); input.focus(); return; }
    if (S.busy) return;
    S.busy = true; el.disabled = true; el.textContent = '刪除中…';
    try {
      await confirmIdentity();
      const failed = await deleteAccountData(S.user.uid);
      if (failed.length) {
        box.textContent = `這些旅程沒有處理完，帳號先保留：${failed.join('、')}。請稍後再試。`; box.hidden = false;
        el.disabled = false; el.textContent = '再試一次';
        return;
      }
      await clearOffline().catch(err => console.warn('清除離線資料失敗', err));
      await removeAccount();
      closeSheet(); go('#/'); toast('帳號已刪除');
    } catch (err) {
      console.error(err);
      el.disabled = false; el.textContent = '刪除帳號';
      box.textContent = err.code === 'auth/requires-recent-login'
        ? '旅程資料已處理完，但 Google 要求重新登入才能刪除帳號。請登出再登入後，再按一次刪除帳號。'
        : err.code === 'auth/popup-closed-by-user' ? '沒有完成身分確認，帳號沒有刪除。' : '刪除失敗，請稍後再試。';
      box.hidden = false;
    } finally { S.busy = false; }
  },
  hideInstall() { S.hideInstall = true; store.set('hideInstall', '1'); render(); toast('之後可以在帳號選單或旅程的「更多」找到「加到手機主畫面」'); },
  tipDrag() { S.tipDrag = true; store.set('tipDrag', '1'); render(); },
  newTrip() { if (!S.offline) newTripSheet(); },
  ntType(el) { el.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === el)); },
  async saveTrip(el) {
    const form = readTripForm();
    if (!form || S.busy) return;
    S.busy = true; el.disabled = true;
    try {
      const id = await createTrip(form, S.user, S.nickname);
      S.years[form.startDate.slice(0, 4)] = true;
      closeSheet();
      go(`#/trip/${id}`);
      toast('已建立旅程');
    } catch (err) {
      console.error(err); el.disabled = false; toast('建立失敗，請稍後再試');
    }
    S.busy = false;
  },
  async sample(el) {
    if (S.env === 'production' || S.busy) return;
    S.busy = true; el.disabled = true;
    try { await addSampleTrips(S.user, S.nickname); closeSheet(); toast('已加入 6 趟範例旅程'); } catch (err) { console.error(err); el.disabled = false; toast('載入失敗'); }
    S.busy = false;
  },
  // 示範旅程：京都 6 天，加到自己的帳號裡，看完可以在「更多」刪掉（正式環境也有）
  async demoTrip(el) {
    if (S.offline || S.busy) return;
    S.busy = true; el.disabled = true;
    try {
      const id = await addSampleTrips(S.user, S.nickname, true);
      closeSheet(); go(`#/trip/${id}`);
      toast('已加入示範旅程，看完可以在「更多」刪掉');
    } catch (err) { console.error(err); el.disabled = false; toast('載入失敗，請稍後再試'); }
    S.busy = false;
  },
  open(el) { go(`#/trip/${el.dataset.id}`); },
  home() { go('#/'); },
  dlInfo() { const trip = curTrip(); if (trip && S.dl[trip.id]) dlSheet(S, trip); },
  async download() {
    const trip = curTrip();
    if (!trip || S.offline || S.dlBusy) return;
    closeSheet();
    S.dlBusy = trip.id; render();
    try {
      S.dl[trip.id] = await downloadTrip(trip.id, S.user.uid);
      toast('已下載，沒有網路也能查看這趟旅程');
    } catch (err) { console.error(err); toast('下載失敗，請稍後再試'); }
    S.dlBusy = null; render();
  },
  reloadPage: () => location.reload(),
  stat(el) { S.stats[el.dataset.k] = el.getAttribute('aria-expanded') !== 'true'; render(); },
  filter(el) { S.filter = el.dataset.v; render(); },
  year(el) {
    const y = el.dataset.y;
    const open = el.getAttribute('aria-expanded') === 'true';
    S.years[y] = !open; render();
  },
  tab(el) { S.tab = el.dataset.v; render(); window.scrollTo(0, 0); },
  day(el) { S.days[+el.dataset.d] = el.getAttribute('aria-expanded') !== 'true'; render(); },
  pday(el) { S.pday = +el.dataset.d; S.mapFocus = ''; render(); },
  mapFocus(el) {
    // 再按同一個地點：先清掉再設回去，地圖才會重新打開它的說明
    if (S.mapFocus && S.mapFocus === el.dataset.id) { S.mapFocus = ''; render(); }
    S.mapFocus = el.dataset.id || '';
    // 只看某區時點了別區的地點，改回看全部，地圖上才有那根針
    if (S.mapArea && S.wishDocs.find(p => 'w:' + p.id === S.mapFocus && p.area !== S.mapArea)) S.mapArea = '';
    if (S.mapFocus) S.side = 'map'; render(); if (!S.wide) $('#mapslot')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
  // 地圖只看某個區域的想去清單地點；再按一次看全部
  mapArea(el) {
    const a = el.dataset.area || '';
    S.mapArea = S.mapArea === a ? '' : a; S.mapFocus = '';
    if (S.mapArea) S.side = 'map';
    render(); if (!S.wide && S.mapArea) $('#mapslot')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  areaSheet(el) { if (!S.offline) areaSheet(S, el.dataset.area || ''); },
  // 存區域：勾的地點放進這區，沒勾的移出；改名時，已排進行程的同區域行程也一起改
  async areaSave(el) {
    const old = el.dataset.area || '', drop = !!el.dataset.drop;
    const inp = $('#a-name'), name = drop ? '' : inp.value.trim();
    if (!drop && !name) { inp.classList.add('err'); inp.focus(); return; }
    if (S.busy || S.offline) return;
    const on = new Set(drop ? [] : [...document.querySelectorAll('[data-apick]:checked')].map(c => c.dataset.apick));
    const wish = S.wishDocs.filter(p => (on.has(p.id) ? p.area !== name : old && p.area === old)).map(p => [p.id, on.has(p.id) ? name : '']);
    const its = old && name !== old ? S.items.filter(it => it.area === old) : [];
    S.busy = true; el.disabled = true;
    try {
      await Promise.all([
        ...wish.map(([id, area]) => updateRecord(S.tripId, 'wishlist', id, { area }, S.user, S.nickname)),
        ...its.map(it => updateItem(S.tripId, it.id, { area: name }, S.user, S.nickname)),
      ]);
      if (S.mapArea === old) S.mapArea = '';
      closeSheet();
      toast(drop ? `已取消「${old}」，地點留在想去清單` : `已儲存「${name}」`);
    } catch (err) { console.error(err); el.disabled = false; toast('沒有儲存成功，請稍後再試'); }
    S.busy = false;
  },
  async areaNear(el) {
    if (S.busy || S.offline) return;
    S.busy = true; el.disabled = true;
    try { await groupNear(await exactNow(S.wishDocs.filter(p => !p.area).map(p => p.id))); } finally { S.busy = false; el.disabled = false; }
  },
  areaAdd(el) { el.disabled = true; areaToDay(el.dataset.area, +el.dataset.d); },
  areaMove(el) { const t = curTrip(); if (t && !S.offline) areaMoveSheet(S, t, el.dataset.area, +el.dataset.d); },
  moveArea(el) { closeSheet(); moveArea(el.dataset.area, +el.dataset.from, +el.dataset.d); },
  side(el) { S.side = el.dataset.v; store.set('side', S.side); render(); },
  mside(el) { S.mside = el.dataset.v; render(); window.scrollTo(0, 0); },
  jump(el) {
    const d = +el.dataset.d;
    S.days[d] = true; render();
    document.getElementById('day' + d)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  itemMenu(el) {
    const it = findItem(el.dataset.id), trip = curTrip();
    if (it && trip && !S.offline) itemMenuSheet(S, trip, it, canDelRecord(trip, it));
  },
  moveTo(el) { closeSheet(); moveItem(el.dataset.id, { day: +el.dataset.d }); },
  editItem(el) { const it = findItem(el.dataset.id); if (it) itemFormSheet(it.day || 1, it); },
  addItem(el) { if (!S.offline) itemFormSheet(+el.dataset.d); },
  importSheet() { S.imp = null; importSheet(); },
  // 勾選的地點加進想去清單，再到 /api/place 查座標；查不到座標也照樣留在清單
  async doImport(el) {
    if (!S.imp || S.busy || S.offline) return;
    const picked = [...document.querySelectorAll('[data-imp]:checked')].map(c => S.imp[+c.dataset.imp]);
    if (!picked.length) { toast('請先勾選要匯入的地點'); return; }
    const mode = $('input[name="imp-area"]:checked')?.value || '';
    S.busy = true; el.disabled = true; el.textContent = '匯入中…';
    try {
      const todo = [], ids = [];
      for (const p of picked) {
        const old = p.moveId && findItem(p.moveId);
        const xy = coordsFromUrl(p.url) || (old && old.lat !== null ? { lat: old.lat, lng: old.lng } : {});
        const ref = await addRecord(S.tripId, 'wishlist', { title: p.title.slice(0, 60), note: p.note.slice(0, 200), url: p.url, list: p.list || '', area: mode === 'list' ? (p.list || '').slice(0, 20) : '', ...xy }, S.user, S.nickname);
        if (old) await deleteItem(S.tripId, old.id);
        ids.push(ref.id);
        if (!xy.lat) todo.push({ ...p, id: ref.id });
      }
      S.imp = null; S.busy = false; // 查位置要一段時間，不擋其他操作
      closeSheet();
      if (!todo.length && mode !== 'near') { toast(`已加入想去清單 ${picked.length} 個`); return; }
      toast(`已加入想去清單 ${picked.length} 個，正在查位置…`);
      const found = await findCoords(todo, fetch, (i, c) => { if (c) updateRecord(S.tripId, 'wishlist', todo[i].id, c, S.user, S.nickname).catch(console.error); });
      const n = found.filter(Boolean).length;
      if (mode === 'near') { await groupNear(await exactNow(ids)); return; }
      toast(n === todo.length ? `${picked.length} 個地點都找到位置了` : `有 ${todo.length - n} 個地點找不到位置，不會出現在地圖上`);
    } catch (err) { console.error(err); if (S.imp) S.busy = false; toast('匯入失敗，請稍後再試'); }
  },
  wishAdd(el) { el.disabled = true; wishToDay(el.dataset.id, +el.dataset.d).then(ok => { if (!ok) el.disabled = false; }); },
  async wishDel(el) {
    if (!el.dataset.sure) { el.dataset.sure = '1'; el.classList.add('sure'); el.textContent = '確定移除'; return; }
    if (S.busy) return;
    S.busy = true;
    try { await deleteRecord(S.tripId, 'wishlist', el.dataset.id); toast('已從想去清單移除'); } catch (err) { console.error(err); toast('移除失敗，請稍後再試'); }
    S.busy = false;
  },
  // 先前匯入在「還沒排天數」的 Google 地圖地點搬到想去清單
  async wishMove(el) {
    if (S.busy || S.offline) return;
    const have = new Set(S.wishDocs.map(p => p.url));
    const its = S.items.filter(it => it.day === 0 && isMapLink(it.address));
    S.busy = true; el.disabled = true;
    try {
      for (const it of its) {
        if (!have.has(it.address)) {
          const xy = it.lat !== null && it.lng !== null ? { lat: it.lat, lng: it.lng } : {};
          await addRecord(S.tripId, 'wishlist', { title: it.title, note: it.note, url: it.address, list: '', ...xy }, S.user, S.nickname);
          have.add(it.address);
        }
        await deleteItem(S.tripId, it.id);
      }
      S.pday = 1;
      toast(`已把 ${its.length} 個地點搬到想去清單`);
    } catch (err) { console.error(err); el.disabled = false; toast('沒有搬完，請稍後再試'); }
    S.busy = false;
  },
  async saveItem(el) {
    const form = readItemForm();
    if (!form || S.busy) return;
    const day = +el.dataset.d, id = el.dataset.id;
    S.busy = true; el.disabled = true;
    try {
      // 改了地址，舊的座標就不準了
      const old = id && findItem(id);
      if (id) await updateItem(S.tripId, id, old && old.address !== form.address && old.lat !== null ? { ...form, lat: null, lng: null, exact: false } : form, S.user, S.nickname);
      else await addItem(S.tripId, { ...form, day, order: nextOrder(S.items, day) }, S.user, S.nickname);
      S.days[day] = true; S.pday = day;
      closeSheet();
      toast(id ? '已儲存' : '已加入行程');
    } catch (err) { console.error(err); el.disabled = false; toast('儲存失敗，請稍後再試'); }
    S.busy = false;
  },
  async delItem(el) {
    // 第一次按只換成確認文字，再按一次才真的刪除
    if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = '再按一次確定刪除'; return; }
    if (S.busy) return;
    S.busy = true;
    try { await deleteItem(S.tripId, el.dataset.id); closeSheet(); toast('已刪除'); } catch (err) { console.error(err); toast('刪除失敗，請稍後再試'); }
    S.busy = false;
  },
  reveal(el) { S.reveal[el.dataset.k] = !S.reveal[el.dataset.k]; render(); },
  pickSeg(el) { el.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === el)); },
  flightForm(el) {
    const trip = curTrip();
    if (!trip || S.offline) return;
    const f = allFlights(S, trip).find(x => x.id === el.dataset.id);
    flightFormSheet(trip, f, canDelRecord(trip, f));
  },
  stayForm(el) {
    const trip = curTrip();
    if (!trip || S.offline) return;
    const s = allStays(S, trip).find(x => x.id === el.dataset.id);
    stayFormSheet(trip, s, canDelRecord(trip, s));
  },
  saveFlight: el => saveRecord(el, 'flights', readFlightForm(), allFlights, ['已新增航段，會依起飛時間排序', '已更新航段']),
  saveStay: el => saveRecord(el, 'stays', readStayForm(), allStays, ['已新增住宿，會依入住日排序', '已更新住宿']),
  delFlight: el => removeRecord(el, 'flights', '已刪除航段'),
  delStay: el => removeRecord(el, 'stays', '已刪除住宿'),
  transitForm(el) {
    const trip = curTrip();
    if (!trip || S.offline) return;
    const t = S.transitDocs.find(x => x.id === el.dataset.id);
    transitFormSheet(trip, t, canDelRecord(trip, t));
  },
  saveTransit: el => saveRecord(el, 'transits', readTransitForm(), () => S.transitDocs, ['已新增交通，會依出發時間排序', '已更新交通']),
  delTransit: el => removeRecord(el, 'transits', '已刪除交通'),
  diveForm(el) {
    const trip = curTrip();
    if (!trip || S.offline) return;
    const d = S.diveDocs.find(x => x.id === el.dataset.id);
    diveFormSheet(trip, d, canDelRecord(trip, d));
  },
  saveDive: el => saveRecord(el, 'diveLogs', readDiveForm(curTrip(), !el.dataset.id), () => S.diveDocs, ['已記下這支', '已更新潛水紀錄']),
  delDive: el => removeRecord(el, 'diveLogs', '已刪除潛水紀錄'),
  pickDiver(el) { el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') !== 'true'); },
  async delTodo(el, ev) {
    ev.preventDefault(); // 按鈕在勾選框的 label 裡，不要順便勾選
    if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = '確定刪除？'; el.classList.add('sure'); return; }
    if (S.busy) return;
    S.busy = true;
    try { await deleteRecord(S.tripId, 'todos', el.dataset.id); toast('已刪除待辦'); } catch (err) { console.error(err); toast('刪除失敗，請稍後再試'); }
    S.busy = false;
  },
  todoTpl() {
    const trip = curTrip();
    if (!trip) return;
    const miss = missingTemplate(S.todoDocs, trip.type);
    addTodos(miss, `已加入 ${miss.length} 項`);
  },
  todoSeg(el) { S.todoSeg = el.dataset.v; render(); },
  packFold(el) { S.packOpen[el.dataset.v] = el.getAttribute('aria-expanded') !== 'true'; render(); },
  packTpl(el) {
    const trip = curTrip();
    if (!trip) return;
    const miss = missingPack(S.packDocs.filter(t => t.uid === S.user.uid), el.dataset.v, trip.type);
    addPack(miss, `已加入 ${miss.length} 項`);
  },
  async delPack(el, ev) {
    ev.preventDefault(); // 按鈕在勾選框的 label 裡，不要順便勾選
    if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = '確定刪除？'; el.classList.add('sure'); return; }
    if (S.busy) return;
    S.busy = true;
    try { await deleteRecord(S.tripId, 'packing', el.dataset.id); toast('已刪除'); } catch (err) { console.error(err); toast('刪除失敗，請稍後再試'); }
    S.busy = false;
  },
  expSeg(el) { S.expSeg = el.dataset.v; render(); },
  expFilter(el) { S.expFilter = el.dataset.v; render(); },
  newExp() {
    const trip = curTrip();
    if (!trip || S.offline) return;
    S.draft = expDraft(S, trip, null); expSheet();
  },
  editExp(el) {
    const trip = curTrip(), e = (S.expenses.get(S.tripId) || []).find(x => x.id === el.dataset.id);
    if (!trip || !e) return;
    S.draft = expDraft(S, trip, e); expSheet();
    if (S.offline) toast('離線中只能查看，連上網路後才能修改');
  },
  expMode(el) {
    const d = S.draft;
    if (!d) return;
    d.mode = el.dataset.v; d.dirty = true;
    if (d.mode === 'custom' && !Object.keys(d.custom).length) {
      const c = ctxOf(S, curTrip());
      const eq = equalSplit(Number(d.amt) || 0, c.active.map(p => p.id).filter(id => d.sel.has(id)));
      for (const k in eq) d.custom[k] = String(eq[k]);
    }
    expSheet();
  },
  async saveExp(el) {
    const d = S.draft, trip = curTrip();
    if (!d || !trip || S.busy || S.offline || el.disabled) return;
    const fields = draftFields(S, trip, d);
    S.busy = true; d.saving = true; expSheet();
    try {
      const ref = await saveExpense(S.tripId, d.id, fields, S.user, S.nickname);
      // 新增時畫面可能已經先收到這筆，用新編號排除，避免重複加總
      syncTotal({ id: d.id || ref?.id, amount: fields.amount });
      dropDraft();
      toast(d.id ? '已儲存' : '已記下這筆支出');
    } catch (err) {
      console.error(err); d.saving = false; expSheet(); toast('儲存失敗，請稍後再試');
    }
    S.busy = false;
  },
  askDelExp() { if (S.draft) { S.draft.confirmDel = true; expSheet(); } },
  noDelExp() { if (S.draft) { S.draft.confirmDel = false; expSheet(); } },
  async yesDelExp() {
    const d = S.draft;
    if (!d?.id || S.busy) return;
    S.busy = true;
    try { await deleteRecord(S.tripId, 'expenses', d.id); syncTotal({ id: d.id }); dropDraft(); toast('已刪除支出'); } catch (err) { console.error(err); toast('刪除失敗，請稍後再試'); }
    S.busy = false;
  },
  stayExp() { if (S.draft) { S.draft.askClose = false; expSheet(); } },
  discardExp: () => dropDraft(),
  async repaid(el) {
    if (S.offline) return;
    const trip = curTrip(), on = !trip?.raw.repaid?.[el.dataset.k];
    try { await setRepaid(S.tripId, el.dataset.k, on); toast(on ? '已標記還款' : '已取消標記'); } catch (err) { console.error(err); toast('沒有更新成功，請稍後再試'); }
  },
  async fundOn() {
    const trip = curTrip();
    if (!trip || S.offline) return;
    const c = ctxOf(S, trip);
    const keeper = c.active.some(p => p.id === c.fund.keeper) ? c.fund.keeper : c.me || c.active[0]?.id || '';
    try { await updateTrip(S.tripId, { fund: { on: true, keeper } }); toast('已開啟公費'); } catch (err) { console.error(err); toast('開啟失敗，請稍後再試'); }
  },
  async fundOff(el) {
    if (S.offline) return;
    if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = '再按一次確定關閉'; return; }
    try { await updateTrip(S.tripId, { 'fund.on': false }); toast('已關閉公費，公費支付的支出暫不算進結算'); } catch (err) { console.error(err); toast('關閉失敗，請稍後再試'); }
  },
  addDeposit() { const trip = curTrip(); if (trip && !S.offline) depositSheet(S, trip); },
  async saveDeposit(el) {
    const amt = $('#dp-amt'), n = Number(amt.value);
    if (!(n > 0)) { amt.classList.add('err'); amt.focus(); toast('請填大於 0 的金額'); return; }
    if (S.busy) return;
    S.busy = true; el.disabled = true;
    try { await addRecord(S.tripId, 'fundDeposits', { pid: $('#dp-who').value, amount: n }, S.user, S.nickname); closeSheet(); toast('已放入公費'); } catch (err) { console.error(err); el.disabled = false; toast('儲存失敗，請稍後再試'); }
    S.busy = false;
  },
  async delDeposit(el) {
    const trip = curTrip(), dp = S.depositDocs.find(x => x.id === el.dataset.id);
    if (!trip || !dp || !canEditRecord(S, trip, dp) || S.offline) return;
    if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = '確定刪除？'; el.classList.add('sure'); return; }
    try { await deleteRecord(S.tripId, 'fundDeposits', dp.id); toast('已刪除放入紀錄'); } catch (err) { console.error(err); toast('刪除失敗，請稍後再試'); }
  },
  // 更多：同行者
  addPerson() { if (!S.offline) personSheet(null, companionsOf(S, curTrip())); },
  renameP(el) { const p = participantsOf(curTrip().raw).find(x => x.id === el.dataset.id); if (p && !S.offline) personSheet(p, companionsOf(S, curTrip()), curTrip().raw); },
  // 常用旅伴：直接新增，或綁到名單上沒有帳號的那一位
  addCompanion(el) { return companionAct(el, (trip, c) => addCompanion(trip.raw, c), c => `已加入「${c.name}」`); },
  bindCompanion(el) { return companionAct(el, (trip, c) => bindCompanion(trip.id, el.dataset.id, c), c => `已綁定為「${c.name}」`); },
  async savePerson(el) {
    const name = cleanName($('#pp-name').value), trip = curTrip();
    if (!name) { $('#pp-name').classList.add('err'); $('#pp-name').focus(); toast('請填名字'); return; }
    if (!trip || S.busy) return;
    S.busy = true; el.disabled = true;
    try {
      if (el.dataset.id) await patchParticipants(trip.id, { [`${el.dataset.id}.name`]: name });
      else await addParticipant(trip.raw, name);
      closeSheet(); toast(el.dataset.id ? '已改名' : `已新增「${name}」`);
    } catch (err) { console.error(err); el.disabled = false; toast('儲存失敗，請稍後再試'); }
    S.busy = false;
  },
  async moveP(el) {
    const trip = curTrip(), changes = moveUp(trip.raw, el.dataset.id), fields = {};
    for (const k in changes) fields[`${k}.order`] = changes[k];
    if (!Object.keys(fields).length) { closeSheet(); return; }
    try { await patchParticipants(trip.id, fields); closeSheet(); } catch (err) { console.error(err); toast('沒有更新成功，請稍後再試'); }
  },
  async toggleP(el) {
    const trip = curTrip(), p = participantsOf(trip.raw).find(x => x.id === el.dataset.id);
    if (!p || (p.uid && p.uid === trip.raw.ownerId)) return;
    const next = p.status === 'inactive' ? 'active' : 'inactive';
    try { await patchParticipants(trip.id, { [`${p.id}.status`]: next }); closeSheet(); toast(next === 'active' ? `${p.name} 已啟用` : `${p.name} 已停用，不會出現在新支出`); } catch (err) { console.error(err); toast('沒有更新成功，請稍後再試'); }
  },
  async createOwnerP() {
    const trip = curTrip();
    if (!trip || boundTo(trip.raw, S.user.uid)) return;
    try { await addParticipant(trip.raw, S.nickname, S.user.uid); toast('已建立你的同行者'); } catch (err) { console.error(err); toast('沒有成功，請稍後再試'); }
  },
  // 更多：共編成員
  rmMember(el) {
    const trip = curTrip(), u = el.dataset.id, n = boundTo(trip.raw, u)?.name || S.userNames[u] || '這位成員';
    confirmSheet(`移除 ${esc(n)}？`, '移除後對方馬上看不到這趟旅程，邀請連結也會換成新的。同行者名單和分攤金額都會保留。', 'yesRm', '移除', u);
  },
  async yesRm(el) {
    try { await kickMember(S.tripId, el.dataset.id); closeSheet(); toast('已移除共編成員，邀請連結已更換'); } catch (err) { console.error(err); toast('移除失敗，請稍後再試'); }
  },
  leaveTrip() { confirmSheet('退出這趟旅程？', '退出後你就看不到這趟旅程，之後要再加入，請建立者重新給你邀請連結。你的同行者名字和分攤金額會保留。', 'yesLeave', '退出'); },
  async yesLeave() {
    const id = S.tripId;
    try { await removeMember(id, S.user.uid); closeSheet(); go('#/'); toast('已退出旅程'); } catch (err) { console.error(err); toast('退出失敗，請稍後再試'); }
  },
  async copyInvite() {
    const trip = curTrip(), url = inviteUrl(trip);
    try { await navigator.clipboard.writeText(url); toast('已複製邀請連結'); } catch { $('#invite')?.select(); toast('請長按連結自行複製'); }
  },
  // 封面照：選照片後先壓小，再調整位置，按儲存才寫入
  coverMenu() { const t = curTrip(); if (t && !S.offline) coverSheet(t, S.covers[t.id]); },
  async pickStyle(el) {
    const style = el.dataset.v, cur = S.covers[S.tripId];
    if (S.busy || S.offline || (!cur?.src && (cur?.style || 'auto') === style)) { closeSheet(); return; }
    S.busy = true;
    try {
      const c = { src: '', style };
      const at = await saveCover(S.tripId, c, S.user);
      S.covers[S.tripId] = { ...c, at };
      closeSheet(); render(); toast(cur?.src ? '已拿掉照片，改用預設圖案' : '已換封面');
    } catch (err) { console.error(err); toast('封面沒有儲存成功，請稍後再試'); }
    S.busy = false;
  },
  pickCover() {
    if (S.offline || !curTrip()) return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      if (!f.type.startsWith('image/')) { toast('請選擇照片檔'); return; }
      try {
        const src = await shrinkImage(f);
        S.crop = { src, x: 50, y: 50, z: 1 };
        cropSheet(S.crop, `照片壓縮後約 ${Math.round(src.length * 0.75 / 1024)} KB。`);
      } catch { toast('這張照片讀不出來，請換一張'); }
    };
    inp.click();
  },
  adjustCover() {
    const c = S.covers[S.tripId] || {}, t = curTrip();
    if (!t || S.offline) return;
    S.crop = { src: c.src || '', style: c.style || 'auto', x: c.x ?? 50, y: c.y ?? 50, z: c.z ?? 1 };
    if (!c.src) S.crop.view = sceneUrl(t, S.crop.style);
    cropSheet(S.crop);
  },
  async saveCover(el) {
    const c = S.crop;
    if (!c || S.busy || S.offline) return;
    S.busy = true; el.disabled = true;
    try {
      const at = await saveCover(S.tripId, c, S.user);
      const { view, ...saved } = c;
      S.covers[S.tripId] = { ...saved, at };
      S.crop = null; closeSheet(); render(); toast('已儲存封面');
    } catch (err) { console.error(err); el.disabled = false; toast('封面沒有儲存成功，請稍後再試'); }
    S.busy = false;
  },
  // 更多：旅程設定
  editTrip() { const trip = curTrip(); if (trip && !S.offline) newTripSheet(trip); },
  async saveTripEdit(el) {
    const form = readTripForm();
    if (!form || S.busy) return;
    S.busy = true; el.disabled = true;
    try { await updateTripInfo(S.tripId, form); closeSheet(); toast('已儲存'); } catch (err) { console.error(err); el.disabled = false; toast('儲存失敗，請稍後再試'); }
    S.busy = false;
  },
  delTrip() { const trip = curTrip(); if (trip && !S.offline) delTripSheet(trip); },
  async yesDelTrip(el) {
    const trip = curTrip(), input = $('#delname');
    if (!trip || input.value.trim() !== trip.name) { input.classList.add('err'); input.focus(); return; }
    if (S.busy) return;
    S.busy = true; el.disabled = true; el.textContent = '刪除中…';
    try {
      const failed = await deleteTripAll(trip.id);
      if (failed.length) {
        const box = $('#del-err'); box.textContent = `這些資料沒有刪掉，旅程先保留：${failed.join('、')}。請稍後再試。`; box.hidden = false;
        el.disabled = false; el.textContent = '再試一次';
      } else { closeSheet(); go('#/'); toast('已刪除旅程'); }
    } catch (err) { console.error(err); el.disabled = false; el.textContent = '刪除旅程'; toast('刪除失敗，請稍後再試'); }
    S.busy = false;
  },
  // 加入旅程
  joinPick(el) {
    if (el.disabled) return;
    const J = S.join, id = el.dataset.id;
    // 選名單上的人時帶入原本的名字，選「我不在名單上」時帶入帳號暱稱；都可以再改
    J.pick = id; J.newName = id === 'new' ? S.nickname : participantsOf(J.trip).find(p => p.id === id)?.name || '';
    render(); if (id === 'new') $('#joinName')?.focus();
  },
  async joinNext() {
    const J = S.join;
    if (!J?.pick || J.busy) return;
    if (!cleanName(J.newName)) { $('#joinName')?.classList.add('err'); $('#joinName')?.focus(); toast('請填你的名字'); return; }
    J.busy = true; render();
    try {
      if (!J.member) { await joinAsMember(J.tripId, S.user.uid, J.key); J.member = true; }
      J.amount = J.pick === 'new' ? 0 : perPerson(await sharesNow(J.tripId), participantsOf(J.trip))[J.pick] || 0;
      J.step = 'confirm';
    } catch (err) { console.error(err); toast(joinErr(err)); }
    J.busy = false; render();
  },
  joinBack() { S.join.step = 'pick'; render(); },
  async joinConfirm() {
    const J = S.join;
    if (J.busy) return;
    J.busy = true; render();
    try {
      await bindParticipant(J.tripId, S.user.uid, J.pick, J.newName);
      J.step = 'done';
    } catch (err) {
      console.error(err); toast(joinErr(err));
      // 被別人先選走時回到名單，重新讀一次
      if (err?.friendly) Object.assign(J, { step: 'load', loading: false, pick: null });
    }
    J.busy = false; render();
  },
  // 之前綁定過、後來退出或被移除的人，重新打開邀請連結時先加回共編成員
  async joinEnter() {
    const J = S.join;
    if (J.busy) return;
    if (!J.member) {
      J.busy = true; render();
      try { await joinAsMember(J.tripId, S.user.uid, J.key); J.member = true; } catch (err) { console.error(err); toast(joinErr(err)); }
      J.busy = false;
      if (!J.member) return render();
    }
    go(`#/trip/${J.tripId}`);
  },
  close: () => tryClose(),
  // 按下和放開都在視窗外面才關閉：拖曳選字、點輸入法的選字框時，放開的位置可能落在外面
  bg(el, ev) { if (ev.target === el && downOn === el && upOn === el) tryClose(); },
  reload: () => updateSW?.(true),
};

let downOn = null, upOn = null; // 最後一次按下、放開的位置，用來判斷是不是在視窗外面按的
document.addEventListener('pointerdown', ev => { downOn = ev.target; }, true);
document.addEventListener('pointerup', ev => { upOn = ev.target; }, true);
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el, ev);
});
// 中文輸入法組字時不重畫，否則會打斷組字；組完字再更新列表
// 支出表單：金額只留數字與小數點；名稱、備註打字時不重畫，以免打斷輸入法
const cleanAmt = v => { const [a, ...b] = v.replace(/[^\d.]/g, '').split('.'); return b.length ? `${a}.${b.join('').slice(0, 2)}` : a; };
function onDraftInput(t) {
  const d = S.draft;
  if (!d || !$('#x-name')) return;
  if (t.dataset.f) {
    const v = t.dataset.f === 'amt' ? cleanAmt(t.value) : t.value;
    d[t.dataset.f] = v; d.dirty = true;
    if (t.dataset.f === 'amt' && t.value !== v) t.value = v;
    if (['amt', 'payer', 'cat', 'pay'].includes(t.dataset.f)) expSheet();
    else if (t.dataset.f === 'name') { const b = $('[data-act="saveExp"]'); if (b) b.disabled = S.offline || !draftCheck(d, shareList(ctxOf(S, curTrip()), d)).ok; }
  }
  if (t.dataset.cust) { d.custom[t.dataset.cust] = cleanAmt(t.value); d.dirty = true; expSheet(); }
  if (t.dataset.paid) { d.paid[t.dataset.paid] = cleanAmt(t.value); d.dirty = true; expSheet(); }
}
document.addEventListener('input', ev => {
  const t = ev.target;
  if (!ev.isComposing) onDraftInput(t);
  if (t.id === 'joinName' && S.join) S.join.newName = t.value;
  if (t.id === 'q' && !ev.isComposing) { S.q = t.value; render(); }
  if (t.dataset?.ap) fillAirport(t);
  if (['ff-fromCity', 'ff-toCity'].includes(t.id)) delete t.dataset.auto;
  // 日期改了，有夏令時間的機場要重算時區
  if (t.id === 'ff-dep') fillAirport($('#ff-from'));
  if (t.id === 'ff-arr') fillAirport($('#ff-to'));
  if (['ff-dep', 'ff-arr'].includes(t.id)) updateDuration();
  if (['sf-in', 'sf-out'].includes(t.id)) updateNights();
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset?.todo) toggleTodo(t);
  if (t.dataset?.pack) togglePack(t);
  if (t.id === 'imp-file' && t.files?.length) {
    const files = [...t.files];
    Promise.all(files.map(f => f.text())).then(texts => {
      const lists = texts.map((text, i) => (parseSavedList(text) || null)?.map(p => ({ ...p, list: files[i].name.replace(/\.csv$/i, '').replace(/#U([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))) })));
      if (lists.every(l => !l)) { toast('這不是 Google 地圖收藏清單的 CSV 檔'); return; }
      S.imp = lists.filter(Boolean).flat();
      // 已經有的地點標出在哪裡；放在「還沒排天數」的（先前版本匯入的）勾了就搬到想去清單
      const have = new Map();
      S.items.filter(it => it.address).forEach(it => have.set(it.address, it.day ? { label: `已排在第 ${it.day} 天` } : { label: '在「還沒排天數」，會搬到想去清單', moveId: it.id }));
      S.wishDocs.forEach(p => have.set(p.url, { label: '已在想去清單' }));
      S.imp = S.imp.map(p => ({ ...p, moveId: have.get(p.url)?.moveId }));
      importSheet(S.imp, have);
    }, () => toast('讀不到這個檔案'));
  }
  if (t.dataset?.sel && S.draft) { t.checked ? S.draft.sel.add(t.dataset.sel) : S.draft.sel.delete(t.dataset.sel); S.draft.dirty = true; expSheet(); }
  if (t.id === 'keeper' && !S.offline) {
    const name = t.selectedOptions[0]?.textContent || '';
    updateTrip(S.tripId, { 'fund.keeper': t.value }).then(() => toast(`保管人改為 ${name}`), err => { console.error(err); toast('沒有更新成功，請稍後再試'); });
  }
  if (['ff-fromTz', 'ff-toTz', 'ff-dep', 'ff-arr'].includes(ev.target.id)) updateDuration();
  if (['sf-in', 'sf-out'].includes(ev.target.id)) updateNights();
});
document.addEventListener('compositionend', ev => {
  if (ev.target.id === 'q') { S.q = ev.target.value; render(); }
  if (ev.target.dataset?.f) onDraftInput(ev.target);
});
document.addEventListener('submit', async ev => {
  if (ev.target.dataset.form === 'pack') {
    ev.preventDefault();
    const input = $('#packNew'), text = input.value.trim(), group = $('#packGroup').value;
    if (!text) { input.focus(); return; }
    if (await addPack([{ group, text }], `已新增「${text}」`)) { const i = $('#packNew'); if (i) { i.value = ''; i.focus(); } const g = $('#packGroup'); if (g) g.value = group; }
    return;
  }
  if (ev.target.dataset.form !== 'todo') return;
  ev.preventDefault();
  const input = $('#todoNew'), text = input.value.trim();
  if (!text) { input.focus(); return; }
  if (await addTodos([text], `已新增「${text}」`)) { const i = $('#todoNew'); if (i) { i.value = ''; i.focus(); } }
});
// 中文輸入法組字時按 Esc 是取消選字，不關閉視窗
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !ev.isComposing && ev.keyCode !== 229 && sheetOpen()) tryClose(); });
window.addEventListener('scroll', () => $('#appbar')?.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
window.addEventListener('hashchange', () => { tour?.stopTour(); readRoute(); render(); window.scrollTo(0, 0); });
initDrag({
  canEdit: () => !S.offline,
  onLocked: () => toast('離線中只能查看，連上網路後才能修改'),
  onDrop,
});
WIDE.addEventListener('change', e => { S.wide = e.matches; render(); });
window.addEventListener('online', () => {
  // 沒網路開啟的要重新整理才會連線
  if (S.localOnly) { toast('已連上網路，重新整理後就能修改', ['重新整理', 'reloadPage']); return; }
  S.offline = false; render();
});
window.addEventListener('offline', () => { S.offline = true; render(); });

/* ---------- 新版提示（規格書 P03）：有新版時問使用者要不要重新整理 ---------- */
const updateSW = registerSW({
  onNeedRefresh() { toast('有新版本可以使用', ['重新整理', 'reload']); },
});

/* ---------- 啟動 ---------- */
async function boot() {
  readRoute();
  render();
  try {
    S.env = await initFirebase();
  } catch (err) {
    console.error(err);
    if (err.message !== 'config-missing' && await enterLocal()) return;
    fatal(navigator.onLine ? '無法讀取連線設定，已停止連線。請稍後再試，或通知管理者。' : '目前沒有網路，連上網路後再開啟。');
    return;
  }
  exposeTestSignIn();
  if (store.get('pendingLogout') === '1') {
    try { await logOut(); store.set('pendingLogout', ''); } catch (err) { console.warn('登出失敗', err); }
  }
  watchUser(async user => {
    stopAll();
    S.user = user;
    S.nickname = user ? await nicknameOf(user) : '';
    S.ready = true;
    S.dl = {}; dlChecked = false; dlReady = false;
    if (user) { startWatching(user); loadOffline(user); }
    render();
  });
}
boot();
