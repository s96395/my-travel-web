// 進入點：讀取設定、登入狀態、監看資料、畫面切換與事件
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { initFirebase, mapsKey } from './firebase.js';
import { watchUser, signIn, logOut, nicknameOf, exposeTestSignIn, confirmIdentity, removeAccount } from './auth.js';
import { watchMyTrips, watchExpenses, createTrip, upgradeShareKeys } from './data/trips.js';
import { addSampleTrips } from './data/sample.js';
import { viewTrip, countdown } from './lib/trips.js';
import { $, esc, store, toast, closeSheet, sheetOpen, ICON } from './ui/dom.js';
import { renderHome } from './views/home.js';
import { renderLogin, loginErrorText } from './views/login.js';
import { renderTrip, tabButtons, cropSheet, dlSheet, coverSheet } from './views/trip.js';
import { sceneUrl } from './ui/scene.js';
import { itemMenuSheet, itemFormSheet, readItemForm, importSheet, mapData, areaSheet, areaMoveSheet, daySheet, driverData, driverSheet, driverText } from './views/plan.js';
import { parseSavedList, findCoords, coordsFromUrl, clusterNear, distanceKm, farOff, nearArea } from './lib/places.js';
import { watchItinerary, addItem, updateItem, deleteItem, restoreItem, saveMoves } from './data/itinerary.js';
import { normalizeItem, planMove, planAreaMove, nextOrder, itemsOfDay, isMapLink, onMap, geoKey, sameName, afterArea, bestSpot, centerOf } from './lib/itinerary.js';
import { legOf } from './lib/timeline.js';
import { maskTime, normTime, joinDateTime } from './lib/time24.js';
import { initDrag } from './ui/drag.js';
import { watchRecords, addRecord, updateRecord, deleteRecord } from './data/records.js';
import { ticketFormSheet, readTicketForm, ticketSheet } from './views/move.js';
import { allFlights, allStays, flightFormSheet, stayFormSheet, transitFormSheet, readTransitForm, readFlightForm, readStayForm, updateDuration, updateNights, fillAirport } from './views/move.js';
import { missingTemplate, missingPack } from './lib/todos.js';
import { renderExpSheet, expDraft, draftFields, draftCheck, shareList, depositSheet, ctxOf, canEdit as canEditRecord } from './views/expense.js';
import { saveExpense, updateTrip, setRepaid } from './data/expenses.js';
import { TWD, getRate } from './lib/fx.js';
import { equalSplit, amountOf } from './lib/expenses.js';
import { diveFormSheet, readDiveForm, totalTanks, tanksByPerson } from './views/dive.js';
import { renderMore, personSheet, confirmSheet, delTripSheet, inviteUrl, companionsOf, quickSheet } from './views/more.js';
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
function setTheme(v) {
  S.theme = v; store.set('theme', v); applyTheme(v);
  document.querySelectorAll('[data-act="theme"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
}

const S = {
  env: '', user: null, nickname: '', ready: false,
  trips: [], expenses: new Map(), loadingTrips: true,
  view: 'home', tripId: null,
  tab: 'plan', days: {}, pday: 1, items: [], loadingItems: false,
  flightDocs: [], stayDocs: [], transitDocs: [], ticketDocs: [], tkImg: '', loadingMove: false, reveal: {},
  todoDocs: [], packDocs: [], packOpen: {}, todoSeg: 'todo', loadingTodo: false,
  diveDocs: [], loadingDive: false,
  depositDocs: [], expSeg: 'list', expFilter: 'all', draft: null,
  q: '', filter: '全部', years: {}, stats: {},
  wide: WIDE.matches, offline: !navigator.onLine, standalone: STANDALONE,
  hideInstall: store.get('hideInstall') === '1',
  visits: (Number(store.get('visits')) || 0) + 1, // 第幾次打開，第二次起才提示加到主畫面
  wishDocs: [], mside: 'plan', // 想去清單（匯入的 Google 地圖收藏）；手機版看行程還是想去清單
  wishOpen: false, // 電腦版想去清單蓋在地圖上，平常收著
  wbox: null, wboxList: '', // 搜尋此區域：按下時的地圖範圍；想去清單只列範圍內（'in'）或沒有位置的（'noxy'）
  side: store.get('side') === 'list' ? 'list' : 'map', mapFocus: '', mapArea: '', areaOpen: {}, // 電腦版右半邊在看地圖或清單、地圖正在看哪個地點、只看哪個區域、哪些區域卡片展開
  here: null, hours: new Map(), // 附近模式：目前位置、地點 id → 現在有沒有營業
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
// 電腦版資訊卡（views/plan.js infoCard）：開卡前記下左欄捲到哪裡，關卡時捲回去；地圖範圍由 ui/map.js 還原
let cardBack = null;
function openCard(c) {
  if (S.offline) return;
  // 晚到的 Google 詳細資料：卡片已關或換成別的地點，就不用了
  if (c.p?.more && (S.card?.kind !== 'place' || S.card.p?.pid !== c.p.pid || S.card.p?.title !== c.p.title)) return;
  if (!S.card) cardBack = { top: $('.two > .day, .msheet .mbody')?.scrollTop || 0 };
  const t = curTrip(), it = c.kind === 'day' ? findItem(c.id) : null;
  S.card = { ...c, tid: S.tripId, canDel: !!(t && it && canDelRecord(t, it)) };
  render();
}
function closeCard() {
  if (!S.card) return;
  S.card = null; S.mapFocus = '';
  render();
  const el = $('.two > .day, .msheet .mbody');
  if (el && cardBack) el.scrollTop = cardBack.top;
  cardBack = null;
  import('./ui/map.js').then(m => m.closeCard()).catch(console.error);
}
// 卡片上的地點被刪掉、換了旅程或分頁、改成手機版時，卡片直接收掉
function cardGone() {
  const c = S.card;
  if (!c) return false;
  return c.tid !== S.tripId || S.view !== 'trip' || S.tab !== 'plan' || S.offline
    || (c.kind === 'day' && !findItem(c.id)) || (c.kind === 'wish' && !S.wishDocs.some(p => p.id === c.id));
}

function render() {
  if (cardGone()) { S.card = null; cardBack = null; import('./ui/map.js').then(m => m.closeCard()).catch(console.error); }
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
  // 電腦版三欄的行程欄、想去清單欄各自捲動，重畫後要停在原位（換天才回到最上面）
  const keep = ['.two > .day', '.wishover .wishpane', '.msheet .mbody'].map(s => { const el = $(s); return el && { s, top: el.scrollTop, day: el.id }; }).filter(Boolean);
  $('#scroller').innerHTML = html + envTag();
  for (const k of keep) { const el = $(k.s); if (el && el.id === k.day) el.scrollTop = k.top; }
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
  fetchLegs();
  fetchHours();
  fillAreas();
  if ($('#mapslot')) import('./ui/map.js').then(async m => { const t = curTrip(); if (!t) return; await m.syncMap(mapData(S, t), el => actions[el.dataset.act]?.(el), placeAct, openCard); exactCoords(m); }).catch(err => { console.error(err); toast('Google 地圖載入失敗，請稍後再試'); });
}

// 收藏連結算出的座標只到大約哪一區，地圖載入後逐一查精確位置，查到就存起來（每個地點只查一次）
const tried = new Set();
let locating = false, placesOff = false;
const RENEW_MS = 25 * 86400000;
async function exactCoords(m) {
  if (locating || placesOff || S.offline || !S.tripId) return;
  // 已經結束的旅程不自動查（使用者 11/13 決定）：每天清理掉座標後地圖上沒有針，清單和時間軸照常，地點代碼保留
  const end = curTrip()?.end;
  if (end && end < new Date().toLocaleDateString('sv')) return;
  // 離整趟旅程其他地點太遠的（連結換算錯），用旅程中心＋名稱＋城市重查一次
  const far = farOff([...S.wishDocs, ...S.items]);
  // 有地點代碼的交給下面的到期重查，用代碼查比較準
  const rough = x => !x.exact && !x.placeId && Number.isFinite(x.lat) && !tried.has(x.id) && !far.has(x.id);
  // 自己打的行程（沒從想去清單加、沒貼連結）沒有座標，地圖上就沒有針、對不起來：用名稱或地址、城市請 Google 查，
  // 靠近這趟旅程其他地點的才用；先查正在看的那天
  const mid = list => { const xy = list.filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng) && !far.has(x.id)); return xy.length ? { lat: xy.reduce((a, x) => a + x.lat, 0) / xy.length, lng: xy.reduce((a, x) => a + x.lng, 0) / xy.length } : null; };
  const near = d => mid(itemsOfDay(S.items, d)) || mid([...S.items, ...S.wishDocs]) || {};
  const city = curTrip()?.city || '';
  const bare = S.items.filter(it => it.day && !it.placeId && !Number.isFinite(it.lat) && geoKey(it) && !tried.has(it.id + '|' + geoKey(it))).sort((a, b) => (b.day === S.pday) - (a.day === S.pday));
  // 沒填地址、想去清單裡有同名地點的，直接用它的座標（不必再查）；其餘才請 Google 查，類型是交通、其他又沒填地址的不查
  const same = it => !it.address && S.wishDocs.find(p => p.exact && !far.has(p.id) && sameName(p.title, it.title)); // 自己填了地址的照地址查，不拿同名地點的座標
  for (const it of bare.filter(same)) {
    tried.add(it.id + '|' + geoKey(it));
    const p = same(it);
    // 借用的座標沿用原本的地點代碼和查詢時間，到期時一起重查
    updateItem(S.tripId, it.id, { lat: p.lat, lng: p.lng, exact: true, placeId: p.placeId || '', geoAt: p.geoAt || 0, geoq: geoKey(it) }, S.user, S.nickname).catch(console.error);
  }
  const again = x => far.has(x.id) && !tried.has('far:' + x.id);
  const fix = (x, save) => ({ id: 'far:' + x.id, title: [x.title, city].filter(Boolean).join(' '), ...far.center, maxKm: 500, own: { lat: x.lat, lng: x.lng }, save });
  // 要重查的：精確座標超過 25 天（或舊資料沒有查詢時間）；或有地點代碼但精確座標已被每天清理清掉
  const old = x => !far.has(x.id) && !tried.has('old:' + x.id) && (x.exact && Number.isFinite(x.lat) ? !(Date.now() - (x.geoAt || 0) < RENEW_MS) : !!x.placeId && !x.exact);
  // 排隊等重查時有人改了地點（座標或代碼變了），就不寫回，免得舊地點蓋掉新選的
  const same0 = (x, now) => now && now.lat === x.lat && now.lng === x.lng && (now.placeId || '') === (x.placeId || '');
  const renew = (x, save) => ({ id: 'old:' + x.id, pid: x.placeId || '', title: x.title, lat: x.lat, lng: x.lng, maxKm: 2, save: c => (same0(x, [...S.items, ...S.wishDocs].find(y => y.id === x.id)) ? save(c) : Promise.resolve()) });
  const todo = [
    ...S.wishDocs.filter(again).map(p => fix(p, c => updateRecord(S.tripId, 'wishlist', p.id, c, S.user, S.nickname))),
    ...S.items.filter(again).map(it => fix(it, c => updateItem(S.tripId, it.id, c, S.user, S.nickname))),
    ...S.wishDocs.filter(rough).map(p => ({ ...p, save: c => updateRecord(S.tripId, 'wishlist', p.id, c, S.user, S.nickname) })),
    ...S.items.filter(it => rough(it) && coordsFromUrl(it.address)).map(it => ({ ...it, save: c => updateItem(S.tripId, it.id, c, S.user, S.nickname) })),
    // 查到超過 25 天（或舊資料沒有查詢時間）的精確座標：有地點代碼就用代碼重查，沒有就用名稱在原本位置附近查，順便補代碼
    // （Google 規定座標最多存 30 天，提早幾天重查，避免被每天的清理先清掉）
    ...[...S.wishDocs.filter(old).map(p => renew(p, c => updateRecord(S.tripId, 'wishlist', p.id, c, S.user, S.nickname))),
      ...S.items.filter(old).map(it => renew(it, c => updateItem(S.tripId, it.id, c, S.user, S.nickname)))],
    ...bare.filter(it => onMap(it) && !same(it)).map(it => ({ id: it.id + '|' + geoKey(it), title: [geoKey(it), city].filter(Boolean).join(' '), ...near(it.day), save: c => updateItem(S.tripId, it.id, { ...c, geoq: geoKey(it) }, S.user, S.nickname) })),
  ];
  if (!todo.length) return;
  locating = true;
  try {
    for (const p of todo) {
      tried.add(p.id);
      // 有地點代碼先用代碼查；代碼失效時改用名稱查
      const byId = p.pid ? await m.locateById(p.pid) : null;
      // 代碼查不到又沒有原本位置可以對照時不改用名稱查，免得查到別處的同名地點
      const xy = byId === 'off' ? 'off' : byId || (p.pid && !Number.isFinite(p.lat) ? null : await m.locate(p));
      if (xy === 'off') { placesOff = true; toast('要在 Google Cloud 啟用 Places API (New)，地圖上的位置才會準'); break; }
      if (xy) await p.save({ ...xy, exact: true, geoAt: Date.now() }).catch(console.error);
    }
  } finally { locating = false; }
}

// 站與站的交通時間：看行程時查這天還沒查過的，記在這台裝置（同樣兩點、同樣方式只查一次）
// 行程裡沒有區域、但有座標的點（例如從地圖直接加的），照座標歸到 1 公里內最近的區域；每個點只補一次
const areaTried = new Set();
function fillAreas() {
  if (S.offline || !S.tripId || S.view !== 'trip') return;
  for (const it of S.items) {
    if (it.area || !it.day || it.kind === 'area' || ['transport', 'stay'].includes(it.type) || !Number.isFinite(it.lat) || areaTried.has(it.id)) continue;
    const area = nearArea(it, S.wishDocs); // 想去清單還沒讀到時找不到，下次畫面更新再試
    if (!area) continue;
    areaTried.add(it.id);
    updateItem(S.tripId, it.id, { area }, S.user, S.nickname).catch(console.error);
  }
}

// 附近模式：展開的區域卡片裡、有座標的地點，查現在有沒有營業（每個地點每 10 分鐘最多查一次）
let hoursBusy = false, hoursOff = false;
const hoursAt = new Map();
// 附近模式開著時，每 10 分鐘、以及切回這個畫面時，重查過期的營業狀態
setInterval(() => fetchHours(), 600000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fetchHours(); });
async function fetchHours() {
  if (hoursBusy || hoursOff || !S.here || !mapsKey || S.offline || S.view !== 'trip' || S.tab !== 'plan') return;
  const areas = new Set(S.items.filter(it => it.kind === 'area' && it.day === S.pday && S.areaOpen[it.id]).map(it => it.area));
  const todo = S.wishDocs.filter(p => areas.has(p.area) && !p.visited && Number.isFinite(p.lat) && !(Date.now() - (hoursAt.get(p.id) || 0) < 600000));
  if (!todo.length) return;
  hoursBusy = true;
  try {
    const m = await import('./ui/map.js');
    for (const p of todo) {
      hoursAt.set(p.id, Date.now());
      const v = await m.openNow(p);
      if (v === 'off') { hoursOff = true; break; }
      S.hours.set(p.id, v);
    }
  } catch (err) { console.error(err); } finally { hoursBusy = false; }
  render();
}

const legTried = new Set();
let legsBusy = false, legsOff = false;
// 站與站的交通時間：使用者目前不需要（2026-11-11），先關掉，也不再跳 Routes API 提示
const LEGS_ON = false;
S.legs = !LEGS_ON ? new Map() : (() => { try { return new Map(Object.entries(JSON.parse(store.get('legs') || '{}'))); } catch { return new Map(); } })();
async function fetchLegs() {
  if (!LEGS_ON || legsBusy || legsOff || !mapsKey || S.offline || S.view !== 'trip' || S.tab !== 'plan') return;
  const its = itemsOfDay(S.items, S.pday).filter(it => it.kind !== 'area'); // 區域卡片不是實際的一站，交通算前後兩站
  const todo = its.slice(1).map((b, i) => ({ a: its[i], b, leg: legOf(its[i], b) })).filter(x => x.leg && !S.legs.has(x.leg.key) && !legTried.has(x.leg.key));
  if (!todo.length) return;
  legsBusy = true;
  try {
    const m = await import('./ui/map.js');
    for (const { a, b, leg } of todo) {
      legTried.add(leg.key);
      const min = await m.travelMin(a, b, leg.mode);
      if (min === 'off') { legsOff = true; toast('要在 Google Cloud 啟用 Routes API，才看得到站與站的交通時間'); break; }
      if (min) S.legs.set(leg.key, min);
    }
    store.set('legs', JSON.stringify(Object.fromEntries([...S.legs].slice(-300))));
  } catch (err) { console.error(err); } finally { legsBusy = false; }
  render();
}

// 操作導覽：只給新使用者，正式環境第一次看到首頁、第一次打開旅程時各出現一次；之後可以在帳號選單或「更多」重看
// 「看過了」記在這台裝置，換瀏覽器、從主畫面開或清掉資料就記不得，所以另外用旅程數判斷：
// 首頁要還沒有旅程才自動出現，旅程頁要只有一趟（剛建立第一趟或剛載入示範旅程）
let tour = null; // 用到時才載入 ui/tour.js
function tourCheck() {
  if (tour?.touring()) { tour.refreshTour(); return; }
  // 測試環境每個預覽網址都記不到看過了，不自動跳出，要看從帳號選單重看
  if (S.env !== 'production' || !S.user || S.localOnly || S.offline || sheetOpen() || S.loadingTrips) return;
  const which = S.view === 'home' && !S.trips.length ? 'Home'
    : S.view === 'trip' && S.trips.length === 1 && curTrip() && S.tab === 'plan' && !S.loadingItems ? 'Trip' : '';
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
// 給司機看畫面：重畫時把小地圖放回去
function showDriver(d) {
  driverSheet(d, S.offline);
  if ($('#drvmap')) import('./ui/map.js').then(m => m.driverMap($('#drvmap'), d)).catch(console.error);
}
const findItem = id => S.items.find(it => it.id === id);

// 進入旅程時開始監看行程、班機、住宿、待辦、公費放入紀錄，離開時停止（支出在首頁就已經在監看）；換旅程時分頁與展開狀態歸零
function syncItineraryWatch() {
  const want = S.user && S.view === 'trip' ? S.tripId : null;
  if (want === itin.tripId) return;
  itin.stops.forEach(off => off());
  itin = { tripId: want, stops: [], tries: 0 };
  Object.assign(S, { items: [], flightDocs: [], stayDocs: [], transitDocs: [], ticketDocs: [], todoDocs: [], packDocs: [], packOpen: {}, todoSeg: 'todo', diveDocs: [], depositDocs: [], wishDocs: [], mside: 'plan', mapFull: false, mapArea: '', wbox: null, wboxList: '', expSeg: 'list', expFilter: 'all', reveal: {}, days: {}, pday: 1, tab: 'plan', loadingItems: !!want, loadingMove: !!want, loadingTodo: !!want, loadingDive: !!want });
  if (!want) return;
  // 旅途中打開旅程，直接看今天
  const t = S.trips.find(x => x.id === want), c = t?.start && t.end ? countdown(t) : null;
  if (c?.ongoing) S.pday = c.day;
  // 這裡在畫完畫面之後才執行，填好資料要再畫一次
  if (S.localOnly) { fillFromLocal(local.get(want)); queueMicrotask(render); return; }
  startTripWatch(want);
  // 連線中途斷網、這趟還沒讀到時，先顯示下載的資料
  if (S.offline && S.dl[want]) listOffline(S.user.uid).then(list => { if (itin.tripId === want && S.loadingItems) { fillFromLocal(list.find(r => r.id === want)); render(); } }).catch(() => {});
}

function fillFromLocal(rec) {
  const x = rec?.subs || {};
  Object.assign(S, { items: (x.itinerary || []).map(normalizeItem), flightDocs: x.flights || [], stayDocs: x.stays || [], transitDocs: x.transits || [], ticketDocs: x.tickets || [], todoDocs: x.todos || [], packDocs: x.packing || [], diveDocs: x.diveLogs || [], wishDocs: (x.wishlist || []).map(p => (p.exact ? p : { ...p, ...coordsFromUrl(p.url) })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)), depositDocs: x.fundDeposits || [], loadingItems: false, loadingMove: false, loadingTodo: false, loadingDive: false });
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
    watchItinerary(tripId, ok(list => { raw = new Map(list.map(d => [d.id, d])); S.items = list.map(normalizeItem); S.loadingItems = false; }), fail),
    watchRecords(tripId, 'flights', ok(list => { S.flightDocs = list; moveLoaded(); }), fail),
    watchRecords(tripId, 'stays', ok(list => { S.stayDocs = list; moveLoaded(); }), fail),
    watchRecords(tripId, 'transits', ok(list => { S.transitDocs = list; moveLoaded(); }), fail),
    watchRecords(tripId, 'tickets', ok(list => { S.ticketDocs = list; }), fail),
    watchRecords(tripId, 'todos', ok(list => { S.todoDocs = list; S.loadingTodo = false; }), fail),
    watchRecords(tripId, 'packing', ok(list => { S.packDocs = list; }), fail),
    watchRecords(tripId, 'fundDeposits', ok(list => { S.depositDocs = list; }), fail),
    watchRecords(tripId, 'wishlist', ok(list => { S.wishDocs = list.map(p => (p.exact ? p : { ...p, ...coordsFromUrl(p.url) })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)); }), fail),
    watchRecords(tripId, 'diveLogs', ok(list => { S.diveDocs = list; S.loadingDive = false; syncTanks(); }), fail),
  ];
}

/* ---------- 復原上一步：加入、刪除、移動行程後，提示列有「復原」可以按 ---------- */
let raw = new Map(); // 行程 id → 讀進來時的原始資料，復原刪除時寫回去
let undoFn = null;
// tid：開始寫入前記下的旅程 id（寫入途中換到別趟旅程，復原也只寫回原本那趟）
function undoable(tid, msg, fn) {
  undoFn = async () => { if (S.tripId === tid) await fn(tid); };
  toast(msg, ['復原', 'undo']);
}
// 移動前的天數與順序，復原時寫回去
const posOf = ids => S.items.filter(x => ids.includes(x.id)).map(x => ({ id: x.id, day: x.day, order: x.order }));
const undoMoves = before => tid => saveMoves(tid, before, S.user, S.nickname);

// 想去清單的地點排進某一天（放最後，或拖曳時放在 beforeId 前面）
async function wishToDay(wid, day, beforeId, extra = {}) {
  const p = S.wishDocs.find(x => x.id === wid);
  if (!p || !day || S.busy || S.offline) return false;
  // 可以下拉選別天，選到的那天已經有這個地點就不重複加
  if (p.url && S.items.some(it => it.day === day && it.address === p.url)) { toast(`「${p.title}」已經在第 ${day} 天了`); return false; }
  S.busy = true;
  const xy = Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng, exact: !!p.exact, placeId: p.placeId || '', geoAt: p.geoAt || 0 } : {};
  const tid = S.tripId;
  try {
    // 沒指定位置（不是拖曳、也不是區域卡片的加入）：放在那天最順路的位置
    const spot = beforeId === undefined ? bestSpot(itemsOfDay(S.items, day), { ...p, ...xy }) : null;
    const ref = await addItem(tid, { title: p.title, type: 'attraction', priority: '', reservationTime: '', area: p.area || '', address: p.url, note: p.note || '', ...xy, ...extra, day, order: nextOrder(S.items, day) }, S.user, S.nickname);
    S.busy = false;
    const to = spot ? spot.beforeId : beforeId;
    if (to) await moveItem(ref.id, { day, beforeId: to }, true);
    undoable(tid, spot ? spotMsg(day, spot) : `已加到第 ${day} 天`, t => deleteItem(t, ref.id));
    return true;
  } catch (err) { console.error(err); S.busy = false; toast('沒有加成功，請稍後再試'); return false; }
}

// 地圖上搜尋到、或點到的 Google 地點：直接加到某一天，或先放想去清單；成功回傳 true
async function placeAct(kind, p, day) {
  if (S.busy || S.offline || !S.tripId) return false;
  // 搜尋找不到：開自己輸入的表單，名稱先帶進去
  if (kind === 'placeSelf') {
    itemFormSheet(S.pday || 1, null, tripNear());
    const t = $('#n-title');
    if (t) t.value = p.title || '';
    return false;
  }
  // 存地點代碼和查到座標的時間（Google 規定座標最多存 30 天）
  const xy = { lat: p.lat, lng: p.lng, exact: true, placeId: p.pid || '', geoAt: Date.now() };
  if (kind === 'placeWish') {
    if (p.url && S.wishDocs.some(w => w.url === p.url)) { toast(`「${p.title}」已經在想去清單了`); return false; }
    S.busy = true;
    // 1 公里內有已分區域的收藏，就放進同一區（和「依距離分組」的範圍一樣）
    const near = S.wishDocs.filter(w => w.area && Number.isFinite(w.lat)).map(w => ({ w, km: distanceKm(w, p) })).filter(x => x.km <= 1).sort((a, b) => a.km - b.km)[0];
    const area = near ? near.w.area : '';
    const tid = S.tripId;
    try { const ref = await addRecord(tid, 'wishlist', { title: p.title, note: '', url: p.url, list: '', area, ...xy }, S.user, S.nickname); undoable(tid, area ? `已加入想去清單「${area}」` : '已加入想去清單', t => deleteRecord(t, 'wishlist', ref.id)); return true; } catch (err) { console.error(err); toast('沒有加成功，請稍後再試'); return false; } finally { S.busy = false; }
  }
  // 還沒選天數：先問要加在哪一天
  if (!day) { const t = curTrip(); if (t) { S.pick = { kind: 'place', p }; daySheet(S, t, { ...p, area: nearArea(p, S.wishDocs) }, 'place'); } return false; }
  if (p.url && S.items.some(it => it.day === day && it.address === p.url)) { toast(`「${p.title}」已經在第 ${day} 天了`); return false; }
  S.busy = true;
  const tid = S.tripId;
  try {
    const spot = bestSpot(itemsOfDay(S.items, day), p);
    const ref = await addItem(tid, { title: p.title, type: p.type, priority: '', reservationTime: '', area: nearArea(p, S.wishDocs), address: p.url, note: '', ...xy, day, order: nextOrder(S.items, day) }, S.user, S.nickname);
    S.busy = false;
    if (spot.beforeId) await moveItem(ref.id, { day, beforeId: spot.beforeId }, true);
    undoable(tid, spotMsg(day, spot), t => deleteItem(t, ref.id));
    return true;
  } catch (err) { console.error(err); toast('沒有加成功，請稍後再試'); return false; } finally { S.busy = false; }
}
// 行程和想去清單有位置的地點取中心，自己輸入時 Google 候選地點優先找這附近
function tripNear() {
  const pts = [...S.items, ...S.wishDocs].filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!pts.length) return null;
  return { center: { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length }, radius: 30000 };
}

// 想去清單、地圖彈出框：旁邊的下拉選單選了第幾天
// 加入後的提示：排在哪兩站中間
function spotMsg(day, spot) {
  const prev = findItem(spot.prevId)?.title, next = spot.beforeId ? findItem(spot.beforeId)?.title : '';
  if (prev && next) return `已加到第 ${day} 天，排在「${prev}」和「${next}」中間`;
  if (prev) return `已加到第 ${day} 天，排在「${prev}」後面`;
  return `已加到第 ${day} 天`;
}

// 整個區域排進某一天：當天只多一張區域卡片，地點留在想去清單，到當地再展開挑；要去的按「加入」才排進時間軸
async function areaToDay(area, day) {
  if (!area || !day || S.busy || S.offline) return;
  if (S.items.some(it => it.kind === 'area' && it.day === day && it.area === area)) { toast(`「${area}」已經在第 ${day} 天了`); return; }
  S.busy = true;
  const tid = S.tripId;
  try {
    const spot = bestSpot(itemsOfDay(S.items, day), centerOf(S.wishDocs.filter(p => p.area === area)));
    const ref = await addItem(tid, { kind: 'area', title: area, type: 'other', priority: '', reservationTime: '', area, address: '', note: '', day, order: nextOrder(S.items, day) }, S.user, S.nickname);
    S.areaOpen = { ...S.areaOpen, [ref.id]: true };
    S.busy = false;
    if (spot.beforeId) await moveItem(ref.id, { day, beforeId: spot.beforeId }, true);
    undoable(tid, `「${area}」已加到第 ${day} 天，展開卡片可以挑要去的點`, t => deleteItem(t, ref.id));
  } catch (err) { console.error(err); toast('沒有加成功，請稍後再試'); }
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
    if (c) { xy.set(id, c); updateRecord(tid, 'wishlist', id, { ...c, exact: true, geoAt: Date.now() }, S.user, S.nickname).catch(console.error); }
  }
  return xy;
}

// 還沒分區域的地點依距離自動分組，區域名稱用附近的中文地名（例如「海雲台」），查不到先叫「新區域」，之後可以改
async function groupNear(xy = new Map()) {
  const tid = S.tripId, free = S.wishDocs.filter(p => !p.area).map(p => ({ ...p, ...(xy.get(p.id) || {}) }));
  const groups = clusterNear(free);
  if (!groups.length) { toast('沒有距離 1 公里內的地點可以分在一起'); return; }
  const names = new Set(S.wishDocs.map(p => p.area).filter(Boolean));
  const writes = [];
  for (const g of groups) {
    const geo = await geoName(g);
    const base = geo || '新區域';
    let name = base;
    for (let i = 2; names.has(name); i++) name = `${base} ${i}`;
    names.add(name);
    g.forEach(p => writes.push(updateRecord(tid, 'wishlist', p.id, { area: name }, S.user, S.nickname)));
  }
  try { await Promise.all(writes); toast(`分成 ${groups.length} 個區域，按區域旁的 ⋯ 可以改名`); } catch (err) { console.error(err); toast('沒有分組完成，請稍後再試'); }
}

// 一群地點的中文地名（Google 查中心附近的景點、車站）；沒有地圖金鑰或查不到時是空字串
let geoOff = false;
async function geoName(list) {
  const xy = list.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!mapsKey || geoOff || !xy.length) return '';
  const center = { lat: xy.reduce((a, p) => a + p.lat, 0) / xy.length, lng: xy.reduce((a, p) => a + p.lng, 0) / xy.length };
  const m = await import('./ui/map.js');
  const n = await m.areaName(center).catch(() => '');
  if (n === 'off') { geoOff = true; return ''; }
  return n;
}

// 自動取的暫時名稱：舊版用店名加「一帶」，現在查不到地名時叫「新區域」；按「區域改用地名」會換成真正的地名
const AUTO_AREA = /一帶$|^新區域( \d+)?$/;

// 改區域名稱：想去清單、行程、區域卡片一起改
const renameWrites = (old, name) => [
  ...S.wishDocs.filter(p => p.area === old).map(p => updateRecord(S.tripId, 'wishlist', p.id, { area: name }, S.user, S.nickname)),
  ...S.items.filter(it => it.area === old).map(it => updateItem(S.tripId, it.id, it.kind === 'area' ? { area: name, title: name } : { area: name }, S.user, S.nickname)),
];

// 整個區域移到別天
async function moveArea(area, from, to) {
  const updates = planAreaMove(S.items, from, area, to);
  if (!updates.length || S.offline) return;
  const before = posOf(updates.map(u => u.id));
  const byId = new Map(updates.map(u => [u.id, u]));
  S.items = S.items.map(x => (byId.has(x.id) ? { ...x, ...byId.get(x.id) } : x));
  S.pday = to; render();
  undoable(S.tripId, `「${area}」已從第 ${from} 天移到第 ${to} 天`, undoMoves(before));
  try { await saveMoves(S.tripId, updates, S.user, S.nickname); } catch (err) { console.error(err); toast('移動沒有儲存成功，請再試一次'); }
}

// 移動行程：先更新畫面，再寫回資料庫
async function moveItem(id, target, quiet = false) {
  const it = findItem(id);
  if (!it || S.offline) return;
  const updates = planMove(S.items, id, target);
  if (!updates.length) return;
  const from = it.day, before = posOf(updates.map(u => u.id));
  const byId = new Map(updates.map(u => [u.id, u]));
  S.items = S.items.map(x => (byId.has(x.id) ? { ...x, ...byId.get(x.id) } : x));
  S.days[target.day] = true;
  render();
  if (!quiet) undoable(S.tripId, from === target.day ? `已調整第 ${from} 天的順序` : from ? `已從第 ${from} 天移到第 ${target.day} 天` : `已排到第 ${target.day} 天`, undoMoves(before));
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
// 外幣支出：查這個幣別的最新匯率填進表單；自己改過匯率就不蓋掉
async function loadRate(d) {
  const cur = d.cur;
  if (!cur || cur === TWD) return;
  d.rateState = 'loading'; expSheet();
  try {
    const r = await getRate(cur);
    if (S.draft !== d || d.cur !== cur || d.rateState !== 'loading') return;
    Object.assign(d, { rate: String(r.rate), rateDate: r.date, rateState: r.stale ? 'stale' : 'ok' });
  } catch (err) {
    console.error(err);
    if (S.draft !== d || d.cur !== cur || d.rateState !== 'loading') return;
    d.rateState = 'fail';
  }
  expSheet();
}
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
  // 從想去清單拖過來的地點：拖到日期或某天就排在最後，拖到行程上就插在那個位置
  if (id.startsWith('w:')) {
    const ref = t.kind === 'item' ? findItem(t.id) : null;
    const day = t.kind === 'day' ? t.d : ref?.day;
    if (!day) return;
    // 拖到區域卡片上：加進那一區，放在區域卡片和它後面已排的同區地點之後（和卡片裡按「加入」一樣）
    if (ref?.kind === 'area') { wishToDay(id.slice(2), day, afterArea(S.items, ref.id), { area: ref.area }); return; }
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
  tourTrip() { closeSheet(); if (S.tab !== 'plan') { S.tab = 'plan'; render(); window.scrollTo(0, 0); } startTour('Trip'); },
  theme(el) { setTheme(el.dataset.v); },
  // 標題列的切換鈕：照目前看到的外觀換成另一種
  toggleTheme() { setTheme((S.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark' ? 'light' : 'dark'); },
  quick: () => quickSheet(S),
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
  // 電腦版：想去清單蓋在地圖右邊，按「想去清單」打開或收起
  wishOpen() { S.wishOpen = !S.wishOpen; if (!S.wishOpen) S.wboxList = ''; render(); },
  // 搜尋此區域：只篩已載入的收藏，不查 Google；行程欄和面板維持原樣，按「看清單」才打開想去清單
  wboxRun(el) { const [s, w, n, e, z] = el.dataset.box.split(',').map(Number); S.wbox = { s, w, n, e, z }; S.wboxList = ''; render(); },
  wboxList(el) {
    S.wboxList = el.dataset.v || '';
    if (S.wboxList) { if (S.wide) S.wishOpen = true; else { S.mside = 'wish'; if ($('.mplan') && (S.sheet === 'peek' || S.card)) { S.sheet = 'half'; S.card = null; } } }
    render();
  },
  wboxClear() { S.wbox = null; S.wboxList = ''; render(); },
  pday(el) { S.pday = +el.dataset.d; S.mapFocus = ''; render(); },
  // 資訊卡：關閉；Google 地點的「加入行程」先問哪一天，「加入想去清單」直接加
  cardClose() { closeCard(); },
  // 給司機看：蓋在資訊卡上的視窗，關掉後資訊卡、日期、清單捲動位置都不變；只用現有資料，不查 Google 地點資料
  driver(el) {
    const t = curTrip(), d = t && driverData(S, t, el.dataset.k, el.dataset.id);
    if (!d) return;
    S.drv = d;
    showDriver(d);
  },
  // 給司機看「顯示韓文」等：按了才查 Google，查到的名稱、地址只放在 S.drv（不存）
  async drvLocal() {
    const d = S.drv;
    if (!d?.lang || d.busy || d.local) return;
    const tok = {};
    showDriver(S.drv = { ...d, busy: true, miss: false, tok });
    let local = null, err = false;
    try { local = await (await import('./ui/map.js')).localPlace(d, d.lang); } catch (e) { console.error(e); err = true; }
    // 查詢中關掉、換了別的地點，或開了別的視窗（例如編輯表單）就不重畫，免得蓋掉別的視窗
    if (S.drv?.tok !== tok || !$('#layer .drvname')) return;
    showDriver(S.drv = { ...d, busy: false, tok: null, local, miss: !local });
    if (err) toast('查詢失敗，請稍後再試');
  },
  async drvCopy() {
    const text = S.drv && driverText(S.drv);
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast('已複製'); } catch { toast('沒辦法自動複製，請長按名稱或地址選取'); }
  },
  async cardPlace(el) {
    const c = S.card;
    if (c?.kind !== 'place' || !c.p) return;
    if (await placeAct(el.dataset.k, c.p, 0)) closeCard();
  },
  timeWord(el) { const t = $('#n-time'); if (t) { t.value = el.dataset.v; t.classList.remove('err'); } },
  // 設成某一站的備案，或修改什麼時候改去
  async backupSet(el) {
    const id = el.dataset.id, of = el.dataset.of || $('#bk-of')?.value;
    if (!of || S.busy || S.offline) return;
    S.busy = true;
    try {
      await updateItem(S.tripId, id, { backupOf: of, backupWhen: $('#bk-when')?.value.trim() || '' }, S.user, S.nickname);
      closeSheet(); toast(el.dataset.of ? '已儲存' : '已設成備案');
    } catch (err) { console.error(err); toast('儲存失敗，請稍後再試'); }
    S.busy = false;
  },
  // 備案改回正式行程：排回時間軸，放在原本那一站的後面
  async backupOff(el) {
    const it = findItem(el.dataset.id);
    if (!it || S.busy || S.offline) return;
    const main = findItem(it.backupOf), day = main ? main.day : it.day;
    const items = S.items.map(x => (x.id === it.id ? { ...x, backupOf: '', day } : x));
    const list = itemsOfDay(items, day).filter(x => x.id !== it.id), at = list.findIndex(x => x.id === main?.id);
    S.busy = true;
    try {
      await updateItem(S.tripId, it.id, { backupOf: '', backupWhen: '', day }, S.user, S.nickname);
      await saveMoves(S.tripId, planMove(items, it.id, { day, beforeId: list[at + 1]?.id }), S.user, S.nickname);
      closeSheet(); toast('已排回時間軸');
    } catch (err) { console.error(err); toast('儲存失敗，請稍後再試'); }
    S.busy = false;
  },
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
  areaSheet(el) { if (!S.offline) areaSheet(S, el.dataset.area || '', el.dataset.wid || ''); },
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
        // 取消區域時，排在各天的區域卡片一起拿掉；已排進時間軸的地點留著
        ...its.map(it => (it.kind === 'area' ? (drop ? deleteItem(S.tripId, it.id) : updateItem(S.tripId, it.id, { area: name, title: name }, S.user, S.nickname)) : updateItem(S.tripId, it.id, { area: name }, S.user, S.nickname))),
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
  // 自動取的區域名稱（「○○一帶」「新區域」），改成附近的中文地名，例如「海雲台」
  async areaGeo(el) {
    if (S.busy || S.offline) return;
    S.busy = true; el.disabled = true;
    const olds = [...new Set(S.wishDocs.map(p => p.area).filter(a => a && AUTO_AREA.test(a)))];
    const names = new Set(S.wishDocs.map(p => p.area).filter(Boolean)); // 沒改到的舊名稱也要算，免得新名稱撞名把兩區併在一起
    let n = 0;
    try {
      for (const old of olds) {
        const base = await geoName(S.wishDocs.filter(p => p.area === old));
        if (!base || base === old) continue;
        names.delete(old);
        let name = base;
        for (let i = 2; names.has(name); i++) name = `${base} ${i}`;
        names.add(name);
        await Promise.all(renameWrites(old, name));
        if (S.mapArea === old) S.mapArea = name;
        n++;
      }
      toast(n ? `${n} 個區域改好了，不滿意可以按區域旁的 ⋯ 自己改` : '查不到合適的中文名稱，可以按區域旁的 ⋯ 自己改');
    } catch (err) { console.error(err); toast('沒有改完，請稍後再試'); }
    S.busy = false; el.disabled = false;
  },
  areaAdd(el) {
    const t = curTrip(), area = el.dataset.area;
    if (!t || !area || S.offline) return;
    S.pick = { kind: 'area', area };
    daySheet(S, t, { kind: 'area', area, title: `「${area}」`, ...centerOf(S.wishDocs.filter(p => p.area === area)) }, 'area');
  },
  // 「要加在哪一天」選好了：照剛才按的是想去清單、區域還是地圖上的點來加
  async dayPick(el) {
    const k = S.pick, day = +el.dataset.d;
    if (!k || !day) return;
    S.pick = null; closeSheet();
    if (k.kind === 'wish') await wishToDay(k.id, day);
    else if (k.kind === 'area') await areaToDay(k.area, day);
    else if (k.kind === 'place' && await placeAct('placeAdd', k.p, day)) { if (S.card?.kind === 'place') closeCard(); else import('./ui/map.js').then(m => m.clearPlace()).catch(console.error); }
  },
  async pickWish() {
    const k = S.pick;
    S.pick = null; closeSheet();
    if (k?.kind === 'place' && await placeAct('placeWish', k.p)) { if (S.card?.kind === 'place') closeCard(); else import('./ui/map.js').then(m => m.clearPlace()).catch(console.error); }
  },
  // 我在附近：用手機定位，區域卡片裡的地點照離我多遠排；再按一次關閉
  nearMe(el) {
    if (S.here && !el.dataset.again) { S.here = null; render(); return; }
    if (!navigator.geolocation) { toast('這台裝置沒辦法定位'); return; }
    el.disabled = true;
    navigator.geolocation.getCurrentPosition(pos => {
      S.here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      hoursAt.clear(); render();
    }, err => {
      el.disabled = false;
      toast(err.code === 1 ? '要允許網站使用位置，才能照距離排（可到瀏覽器的網站設定打開）' : '暫時定位不到，請稍後再試');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  },
  // 逛過打勾：存在想去清單，回來寫遊記也看得到
  async wishSeen(el) {
    const p = S.wishDocs.find(x => x.id === el.dataset.id);
    if (!p || S.offline) return;
    el.disabled = true;
    try { await updateRecord(S.tripId, 'wishlist', p.id, { visited: !p.visited }, S.user, S.nickname); } catch (err) { console.error(err); el.disabled = false; toast('沒有儲存成功，請稍後再試'); }
  },
  async undo() {
    const fn = undoFn;
    undoFn = null;
    $('#toastSlot').innerHTML = '';
    if (!fn || S.offline) return;
    try { await fn(); toast('已復原'); } catch (err) { console.error(err); toast('沒有復原成功，請稍後再試'); }
  },
  // 把這天某個區域的行程一次拿掉（例如不小心整區加到同一天）；地點還在想去清單，可以復原
  async areaDrop(el) {
    if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = '再按一次確定移除'; return; }
    if (S.busy || S.offline) return;
    const area = el.dataset.area, d = +el.dataset.d;
    const list = S.items.filter(x => x.day === d && x.area === area).map(x => [x.id, raw.get(x.id)]).filter(([, v]) => v);
    const tid = S.tripId;
    S.busy = true;
    try {
      await Promise.all(list.map(([id]) => deleteItem(tid, id)));
      closeSheet();
      undoable(tid, `已從第 ${d} 天移除「${area}」的 ${list.length} 個行程`, t => Promise.all(list.map(([id, v]) => restoreItem(t, id, v))));
    } catch (err) { console.error(err); toast('沒有移除完，請稍後再試'); }
    S.busy = false;
  },
  areaOpen(el) { S.areaOpen = { ...S.areaOpen, [el.dataset.id]: !S.areaOpen?.[el.dataset.id] }; render(); },
  // 區域卡片的「地圖看這區」：電腦切到右邊地圖，手機換到有地圖的想去清單
  areaMap(el) {
    const a = el.dataset.area || '';
    S.mapArea = S.mapArea === a ? '' : a; S.mapFocus = '';
    if (S.mapArea) { S.side = 'map'; if (!S.wide) { S.mside = 'wish'; window.scrollTo(0, 0); } }
    render();
  },
  // 區域卡片裡按「加入」：排進時間軸，接在這張卡片（和先前加入的）後面
  areaMust(el) {
    const card = findItem(el.dataset.id);
    if (!card) return;
    el.disabled = true;
    wishToDay(el.dataset.wid, card.day, afterArea(S.items, card.id)).then(ok => { if (!ok) el.disabled = false; });
  },
  areaMove(el) { const t = curTrip(); if (t && !S.offline) areaMoveSheet(S, t, el.dataset.area, +el.dataset.d); },
  moveArea(el) { closeSheet(); moveArea(el.dataset.area, +el.dataset.from, +el.dataset.d); },
  side(el) { S.side = el.dataset.v; store.set('side', S.side); render(); },
  // 手機版地圖下面切換行程或想去清單：捲到地圖剛好貼在上方，下面就是清單
  mside(el) {
    S.mside = el.dataset.v;
    if (S.mside !== 'wish') S.wboxList = '';
    // 手機底部面板收合時，切換後打開到半展開才看得到清單
    if ($('.mplan') && (S.sheet === 'peek' || S.card)) { S.sheet = 'half'; S.card = null; }
    render();
    if ($('.mplan')) return;
    const d = $('.dpills'); window.scrollTo(0, d ? d.getBoundingClientRect().bottom + scrollY - 58 : 0);
  },
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
  editItem(el) { const it = findItem(el.dataset.id); if (it) itemFormSheet(it.day || 1, it, tripNear()); },
  addItem(el) { if (!S.offline) itemFormSheet(+el.dataset.d, null, tripNear()); },
  // 右下角「＋」：電腦切到右邊的地圖並捲過去，手機打開全螢幕地圖
  mapSearch() {
    if (S.offline) return;
    if (S.wide) { S.side = 'map'; store.set('side', S.side); } else S.mapFull = true;
    render();
    if (S.wide) import('./ui/map.js').then(m => m.showSearch()).catch(console.error);
  },
  mapClose() { S.mapFull = false; render(); },
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
  // 地圖上想去地點的彈出框：直接加到目前看的那天
  async wishDay(el) { const d = +el.dataset.d; if (d && !S.offline) await wishToDay(el.dataset.id, d); },
  wishAdd(el) {
    const t = curTrip(), p = S.wishDocs.find(x => x.id === el.dataset.id);
    if (!t || !p || S.offline) return;
    S.pick = { kind: 'wish', id: p.id };
    daySheet(S, t, p, 'wish');
  },
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
    const day = +el.dataset.d, id = el.dataset.id, tid = S.tripId;
    S.busy = true; el.disabled = true;
    try {
      // 改了地址，舊的座標就不準了
      const old = id && findItem(id);
      if (id) await updateItem(S.tripId, id, old && old.address !== form.address && old.lat !== null && !('lat' in form) ? { ...form, lat: null, lng: null, exact: false, placeId: '', geoAt: 0 } : form, S.user, S.nickname);
      const ref = id ? null : await addItem(tid, { ...form, day, order: nextOrder(S.items, day) }, S.user, S.nickname);
      S.days[day] = true; S.pday = day;
      closeSheet();
      if (ref) undoable(tid, '已加入行程', t => deleteItem(t, ref.id)); else toast('已儲存');
    } catch (err) { console.error(err); el.disabled = false; toast('儲存失敗，請稍後再試'); }
    S.busy = false;
  },
  async delItem(el) {
    // 第一次按只換成確認文字，再按一次才真的刪除
    if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = '再按一次確定刪除'; return; }
    if (S.busy) return;
    S.busy = true;
    const id = el.dataset.id, data = raw.get(id), tid = S.tripId;
    try { await deleteItem(tid, id); closeSheet(); if (data) undoable(tid, '已刪除', t => restoreItem(t, id, data)); else toast('已刪除'); } catch (err) { console.error(err); toast('刪除失敗，請稍後再試'); }
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
  // 票券：截圖壓小後存在資料裡；S.tkImg 是表單上目前選的圖
  ticketForm(el) {
    const trip = curTrip();
    if (!trip || S.offline) return;
    const t = S.ticketDocs.find(x => x.id === el.dataset.id);
    S.tkImg = t?.img || '';
    ticketFormSheet(trip, t, canDelRecord(trip, t));
  },
  pickTicket() {
    const trip = curTrip();
    if (!trip || S.offline) return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      if (!f.type.startsWith('image/')) { toast('請選擇圖片檔，PDF 請先截圖'); return; }
      // 重畫表單前先記下已經填的字
      const id = $('#layer [data-act="saveTicket"]')?.dataset.id || '';
      const typed = ['tk-title', 'tk-date', 'tk-note'].map(k => [k, $(`#${k}`)?.value || '']);
      try {
        S.tkImg = await shrinkImage(f);
        if (!$('#tk-title')) return; // 選圖時表單已經關掉
        const t = S.ticketDocs.find(x => x.id === id);
        ticketFormSheet(trip, t, canDelRecord(trip, t), S.tkImg);
        typed.forEach(([k, v]) => { if ($(`#${k}`)) $(`#${k}`).value = v; });
      } catch { toast('這張圖讀不出來，請換一張'); }
    };
    inp.click();
  },
  saveTicket: el => saveRecord(el, 'tickets', readTicketForm(S.tkImg), () => S.ticketDocs, ['已新增票券', '已更新票券']),
  delTicket: el => removeRecord(el, 'tickets', '已刪除票券'),
  showTicket(el) { ticketSheet(S, el.dataset.id); },
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
    loadRate(S.draft);
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
      if (!d.id) store.set(`fxCur:${trip.id}`, d.cur); // 下一筆預設用同一種幣別
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
// 記下按下時間，用來分辨一般點擊和長按拖曳
let pressAt = 0;
document.addEventListener('pointerdown', () => { pressAt = Date.now(); }, true);
document.addEventListener('click', ev => {
  // 行程頁右下角「＋」選單：點了選項或點外面就收起
  const fab = document.querySelector('.addfab[open]');
  if (fab && (!fab.contains(ev.target) || ev.target.closest('[data-act]'))) fab.open = false;
  const el = ev.target.closest('[data-act]');
  // 時間軸整塊都可以點：沒點到按鈕、連結、備註、拖曳把手時，等於點地點名稱（開資訊卡、地圖跳過去）；長按拖曳放開不算
  if (!el) {
    // 區域卡片裡有很多地點：只認點到的那一個地點（.aplace），點到區域卡片其他地方不動作
    const row = ev.target.closest('.item[data-iid]');
    const box = row && (row.classList.contains('areacard') ? ev.target.closest('.aplace') : row);
    const name = box && !ev.target.closest('a, button, summary, details, input, label, .grip') && Date.now() - pressAt < 400 && box.querySelector('.wname[data-act="mapFocus"]');
    if (name) actions.mapFocus(name, ev);
    return;
  }
  if (el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el, ev);
});
// 中文輸入法組字時不重畫，否則會打斷組字；組完字再更新列表
// 支出表單：金額只留數字與小數點；名稱、備註打字時不重畫，以免打斷輸入法
const cleanAmt = v => { const [a, ...b] = v.replace(/[^\d.]/g, '').split('.'); return b.length ? `${a}.${b.join('').slice(0, 2)}` : a; };
const cleanRate = v => { const [a, ...b] = v.replace(/[^\d.]/g, '').split('.'); return b.length ? `${a}.${b.join('').slice(0, 6)}` : a; };
function onDraftInput(t) {
  const d = S.draft;
  if (!d || !$('#x-name')) return;
  if (t.dataset.f) {
    const f = t.dataset.f, v = f === 'amt' ? cleanAmt(t.value) : f === 'rate' ? cleanRate(t.value) : t.value;
    d[f] = v; d.dirty = true;
    if (['amt', 'rate'].includes(f) && t.value !== v) t.value = v;
    if (f === 'rate') d.rateState = 'manual';
    if (f === 'cur') { d.rate = ''; d.rateDate = ''; d.rateState = ''; loadRate(d); }
    if (['amt', 'rate', 'cur', 'payer', 'cat', 'pay'].includes(f)) expSheet();
    else if (t.dataset.f === 'name') { const b = $('[data-act="saveExp"]'); if (b) b.disabled = S.offline || !draftCheck(d, shareList(ctxOf(S, curTrip()), d)).ok; }
  }
  if (t.dataset.cust) { d.custom[t.dataset.cust] = cleanAmt(t.value); d.dirty = true; expSheet(); }
  if (t.dataset.paid) { d.paid[t.dataset.paid] = cleanAmt(t.value); d.dirty = true; expSheet(); }
}
// 24 小時制時間欄：打字時補冒號；日期＋時間兩格合成到同名隱藏欄位，下面照舊用隱藏欄位的 id 判斷
function onTimeInput(ev) {
  const t = ev.target;
  // 行程的時間欄也能寫「午餐」：打的是數字才補冒號
  if ((t.classList?.contains('t24') || (t.classList?.contains('tany') && /^[\d:：.\s]+$/.test(t.value))) && !String(ev.inputType || '').startsWith('delete')) {
    const v = maskTime(t.value);
    if (v !== t.value) t.value = v;
  }
  if (!t.dataset?.dt) return t;
  const id = t.dataset.dt, hidden = $(`#${id}`);
  hidden.value = joinDateTime($(`#${id}-d`).value, $(`#${id}-t`).value);
  return hidden;
}
document.addEventListener('focusout', ev => {
  const t = ev.target;
  if (!t.classList?.contains('t24') && !(t.classList?.contains('tany') && /^[\d:：.\s]+$/.test(t.value.trim()))) return;
  const v = normTime(t.value);
  t.classList.toggle('err', v === null);
  if (v && v !== t.value) { t.value = v; t.dispatchEvent(new Event('change', { bubbles: true })); }
});
document.addEventListener('input', ev => {
  const t = onTimeInput(ev);
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
  const t = ev.target, key = t.dataset?.dt || t.id;
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
  if (t.dataset?.dt) onTimeInput(ev);
  if (['ff-fromTz', 'ff-toTz', 'ff-dep', 'ff-arr'].includes(key)) updateDuration();
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
// 手機底部面板（views/plan.js planSheet）：只有頂端把手可以拖；放開時停在最近的一段，點一下在收合與半展開間切換。
// 資訊卡只有一層，開卡不改面板高度；把手照常拖，收合時再往下拖或在卡片頂端往下拉就關閉
const SHEET_H = ['peek', 'half', 'full'];
let grip = null, pull = null;
document.addEventListener('pointerdown', e => {
  const g = e.target.closest('[data-grip]');
  if (!g) return;
  const sh = g.closest('.msheet');
  grip = { y: e.clientY, h: sh.getBoundingClientRect().height, sh, moved: false };
  sh.classList.add('moving');
  try { g.setPointerCapture(e.pointerId); } catch { /* 有些瀏覽器不支援 */ }
});
document.addEventListener('pointermove', e => {
  if (!grip) return;
  const dy = e.clientY - grip.y;
  if (Math.abs(dy) > 6) grip.moved = true;
  if (grip.moved) grip.sh.style.height = `${Math.max(80, grip.h - dy)}px`;
});
function gripEnd() {
  if (!grip) return;
  const { sh, moved, h: from } = grip;
  grip = null;
  const now = sh.getBoundingClientRect().height;
  sh.classList.remove('moving'); sh.style.height = '';
  const cur = sh.closest('.mplan')?.dataset.h || 'half';
  let to;
  if (!moved) to = cur === 'peek' ? 'half' : 'peek';
  else {
    // 完整展開的高度和 CSS 一樣：畫面高扣掉標題列、底部分頁列，上方留 64px 地圖（地圖高度會跟著面板變，不能拿來算）
    const top = $('.mmap')?.getBoundingClientRect().top ?? 62, tab = $('.tabbar')?.getBoundingClientRect().height ?? 63;
    const full = innerHeight - top - tab - 64;
    const hs = { peek: 120, half: innerHeight * 0.45, full };
    // 開著資訊卡時，從收合再往下拖就關掉資訊卡
    if (S.card && cur === 'peek' && now < from - 30) { closeCard(); return; }
    to = SHEET_H.reduce((a, b) => (Math.abs(hs[b] - now) < Math.abs(hs[a] - now) ? b : a));
  }
  if (to !== cur) { S.sheet = to; render(); }
}
document.addEventListener('pointerup', gripEnd);
document.addEventListener('pointercancel', gripEnd);
// 列表已經捲到最上面還往下拉：面板往下收一段（拿起行程排序時不算）
document.addEventListener('touchstart', e => {
  const b = e.target.closest('.msheet .mbody');
  pull = b && b.scrollTop <= 0 ? { y: e.touches[0].clientY } : null;
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (!pull || document.querySelector('.lifted')) return;
  if (e.touches[0].clientY - pull.y < 70) return;
  pull = null;
  if (S.card) { closeCard(); return; }
  const i = SHEET_H.indexOf(S.sheet || 'half');
  if (i > 0) { S.sheet = SHEET_H[i - 1]; render(); }
}, { passive: true });
// 中文輸入法組字時按 Esc 是取消選字，不關閉視窗
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape' || ev.isComposing || ev.keyCode === 229) return;
  if (sheetOpen()) tryClose();
  else if (S.card && !ev.target.closest?.('input,textarea,select')) closeCard();
});
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
