// 進入點：讀取設定、登入狀態、監看資料、畫面切換與事件
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { initFirebase } from './firebase.js';
import { watchUser, signIn, logOut, nicknameOf, exposeTestSignIn } from './auth.js';
import { watchMyTrips, watchExpenses, createTrip } from './data/trips.js';
import { addSampleTrips } from './data/sample.js';
import { viewTrip } from './lib/trips.js';
import { $, esc, store, toast, closeSheet, sheetOpen, ICON } from './ui/dom.js';
import { renderHome } from './views/home.js';
import { renderLogin, loginErrorText } from './views/login.js';
import { renderTrip, tabButtons, cropSheet, dlSheet, coverSheet } from './views/trip.js';
import { itemMenuSheet, itemFormSheet, readItemForm } from './views/plan.js';
import { watchItinerary, addItem, updateItem, deleteItem, saveMoves } from './data/itinerary.js';
import { normalizeItem, planMove, nextOrder, itemsOfDay } from './lib/itinerary.js';
import { initDrag } from './ui/drag.js';
import { watchRecords, addRecord, updateRecord, deleteRecord } from './data/records.js';
import { allFlights, allStays, flightFormSheet, stayFormSheet, transitFormSheet, readTransitForm, readFlightForm, readStayForm, updateDuration, updateNights, fillAirport } from './views/move.js';
import { missingTemplate } from './lib/todos.js';
import { renderExpSheet, expDraft, draftFields, draftCheck, shareList, depositSheet, ctxOf, canEdit as canEditRecord } from './views/expense.js';
import { saveExpense, updateTrip, setRepaid } from './data/expenses.js';
import { equalSplit, amountOf } from './lib/expenses.js';
import { diveFormSheet, readDiveForm, totalTanks, tanksByPerson } from './views/dive.js';
import { renderMore, personSheet, confirmSheet, delTripSheet, inviteUrl, companionsOf } from './views/more.js';
import { renderJoin } from './views/join.js';
import { addParticipant, patchParticipants, removeMember, updateTripInfo, userName, readJoinTrip, joinAsMember, sharesNow, bindParticipant, deleteTripAll, addCompanion, bindCompanion } from './data/people.js';
import { moveUp, boundTo, isMember, memberUids, cleanName } from './lib/people.js';
import { perPerson } from './lib/expenses.js';
import { participantsOf } from './lib/trips.js';
import { accountSheet, installSheet, newTripSheet, readTripForm } from './views/sheets.js';
import { downloadTrip, listOffline, removeOffline, saveAccount, readAccount, clearOffline } from './data/offline.js';
import { shrinkImage, loadCover, saveCover } from './data/cover.js';

const WIDE = window.matchMedia('(min-width: 1000px)');
const STANDALONE = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const S = {
  env: '', user: null, nickname: '', ready: false,
  trips: [], expenses: new Map(), loadingTrips: true,
  view: 'home', tripId: null,
  tab: 'plan', days: {}, pday: 1, items: [], loadingItems: false,
  flightDocs: [], stayDocs: [], transitDocs: [], loadingMove: false, reveal: {},
  todoDocs: [], loadingTodo: false,
  diveDocs: [], loadingDive: false,
  depositDocs: [], expSeg: 'list', expFilter: 'all', draft: null,
  q: '', filter: '全部', years: {}, stats: {},
  wide: WIDE.matches, offline: !navigator.onLine, standalone: STANDALONE,
  hideInstall: store.get('hideInstall') === '1',
  visits: (Number(store.get('visits')) || 0) + 1, // 第幾次打開，第二次起才提示加到主畫面
  tipDrag: store.get('tipDrag') === '1', // 拖曳提示看過了
  signingIn: false, loginError: '', busy: false,
  userNames: {}, join: null,
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
  Object.assign(S, { items: [], flightDocs: [], stayDocs: [], transitDocs: [], todoDocs: [], diveDocs: [], depositDocs: [], expSeg: 'list', expFilter: 'all', reveal: {}, days: {}, pday: 1, tab: 'plan', loadingItems: !!want, loadingMove: !!want, loadingTodo: !!want, loadingDive: !!want });
  if (!want) return;
  // 這裡在畫完畫面之後才執行，填好資料要再畫一次
  if (S.localOnly) { fillFromLocal(local.get(want)); queueMicrotask(render); return; }
  startTripWatch(want);
  // 連線中途斷網、這趟還沒讀到時，先顯示下載的資料
  if (S.offline && S.dl[want]) listOffline(S.user.uid).then(list => { if (itin.tripId === want && S.loadingItems) { fillFromLocal(list.find(r => r.id === want)); render(); } }).catch(() => {});
}

function fillFromLocal(rec) {
  const x = rec?.subs || {};
  Object.assign(S, { items: (x.itinerary || []).map(normalizeItem), flightDocs: x.flights || [], stayDocs: x.stays || [], transitDocs: x.transits || [], todoDocs: x.todos || [], diveDocs: x.diveLogs || [], depositDocs: x.fundDeposits || [], loadingItems: false, loadingMove: false, loadingTodo: false, loadingDive: false });
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
    watchRecords(tripId, 'fundDeposits', ok(list => { S.depositDocs = list; }), fail),
    watchRecords(tripId, 'diveLogs', ok(list => { S.diveDocs = list; S.loadingDive = false; syncTanks(); }), fail),
  ];
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

const isOwner = trip => trip.raw.ownerId === S.user.uid;
// 班機、住宿：旅程擁有者或這筆的建立者可以刪除
const canDelRecord = (trip, r) => isOwner(trip) || (!!r && r.createdByUid === S.user.uid);

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
  install: () => installSheet(),
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
  pday(el) { S.pday = +el.dataset.d; render(); },
  jump(el) {
    const d = +el.dataset.d;
    S.days[d] = true; render();
    document.getElementById('day' + d)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  itemMenu(el) {
    const it = findItem(el.dataset.id), trip = curTrip();
    if (it && trip && !S.offline) itemMenuSheet(S, trip, it, isOwner(trip));
  },
  moveTo(el) { closeSheet(); moveItem(el.dataset.id, { day: +el.dataset.d }); },
  editItem(el) { const it = findItem(el.dataset.id); if (it) itemFormSheet(it.day || 1, it); },
  addItem(el) { if (!S.offline) itemFormSheet(+el.dataset.d); },
  async saveItem(el) {
    const form = readItemForm();
    if (!form || S.busy) return;
    const day = +el.dataset.d, id = el.dataset.id;
    S.busy = true; el.disabled = true;
    try {
      if (id) await updateItem(S.tripId, id, form, S.user, S.nickname);
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
  renameP(el) { const p = participantsOf(curTrip().raw).find(x => x.id === el.dataset.id); if (p && !S.offline) personSheet(p, companionsOf(S, curTrip())); },
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
    if (Object.keys(fields).length) await patchParticipants(trip.id, fields).catch(err => { console.error(err); toast('沒有更新成功，請稍後再試'); });
  },
  async toggleP(el) {
    const trip = curTrip(), p = participantsOf(trip.raw).find(x => x.id === el.dataset.id);
    if (!p || (p.uid && p.uid === trip.raw.ownerId)) return;
    const next = p.status === 'inactive' ? 'active' : 'inactive';
    try { await patchParticipants(trip.id, { [`${p.id}.status`]: next }); toast(next === 'active' ? `${p.name} 已啟用` : `${p.name} 已停用，不會出現在新支出`); } catch (err) { console.error(err); toast('沒有更新成功，請稍後再試'); }
  },
  async createOwnerP() {
    const trip = curTrip();
    if (!trip || boundTo(trip.raw, S.user.uid)) return;
    try { await addParticipant(trip.raw, S.nickname, S.user.uid); toast('已建立你的同行者'); } catch (err) { console.error(err); toast('沒有成功，請稍後再試'); }
  },
  // 更多：共編成員
  rmMember(el) {
    const trip = curTrip(), u = el.dataset.id, n = boundTo(trip.raw, u)?.name || S.userNames[u] || '這位成員';
    confirmSheet(`移除 ${esc(n)}？`, '移除後對方馬上看不到這趟旅程。同行者名單和分攤金額都會保留。', 'yesRm', '移除', u);
  },
  async yesRm(el) {
    try { await removeMember(S.tripId, el.dataset.id); closeSheet(); toast('已移除共編成員'); } catch (err) { console.error(err); toast('移除失敗，請稍後再試'); }
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
    const c = S.covers[S.tripId];
    if (!c?.src || S.offline) return;
    S.crop = { src: c.src, x: c.x, y: c.y, z: c.z };
    cropSheet(S.crop);
  },
  async saveCover(el) {
    const c = S.crop;
    if (!c || S.busy || S.offline) return;
    S.busy = true; el.disabled = true;
    try {
      const at = await saveCover(S.tripId, c, S.user);
      S.covers[S.tripId] = { ...c, at };
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
  if (ev.target.dataset.form !== 'todo') return;
  ev.preventDefault();
  const input = $('#todoNew'), text = input.value.trim();
  if (!text) { input.focus(); return; }
  if (await addTodos([text], `已新增「${text}」`)) { const i = $('#todoNew'); if (i) { i.value = ''; i.focus(); } }
});
// 中文輸入法組字時按 Esc 是取消選字，不關閉視窗
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !ev.isComposing && ev.keyCode !== 229 && sheetOpen()) tryClose(); });
window.addEventListener('scroll', () => $('#appbar')?.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
window.addEventListener('hashchange', () => { readRoute(); render(); window.scrollTo(0, 0); });
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
