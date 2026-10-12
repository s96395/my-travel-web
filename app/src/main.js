// 進入點：讀取設定、登入狀態、監看資料、畫面切換與事件
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { initFirebase } from './firebase.js';
import { watchUser, signIn, logOut, nicknameOf, exposeTestSignIn } from './auth.js';
import { watchMyTrips, watchExpenses, createTrip } from './data/trips.js';
import { addSampleTrips } from './data/sample.js';
import { viewTrip } from './lib/trips.js';
import { $, store, toast, closeSheet, sheetOpen, ICON } from './ui/dom.js';
import { renderHome } from './views/home.js';
import { renderLogin, loginErrorText } from './views/login.js';
import { renderTrip, tabButtons } from './views/trip.js';
import { itemMenuSheet, itemFormSheet, readItemForm } from './views/plan.js';
import { watchItinerary, addItem, updateItem, deleteItem, saveMoves } from './data/itinerary.js';
import { normalizeItem, planMove, nextOrder, itemsOfDay } from './lib/itinerary.js';
import { initDrag } from './ui/drag.js';
import { watchRecords, addRecord, updateRecord, deleteRecord } from './data/records.js';
import { allFlights, allStays, flightFormSheet, stayFormSheet, readFlightForm, readStayForm, updateDuration, updateNights, fillAirport } from './views/move.js';
import { accountSheet, installSheet, newTripSheet, readTripForm } from './views/sheets.js';

const WIDE = window.matchMedia('(min-width: 1000px)');
const STANDALONE = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const S = {
  env: '', user: null, nickname: '', ready: false,
  trips: [], expenses: new Map(), loadingTrips: true,
  view: 'home', tripId: null,
  tab: 'plan', days: {}, pday: 1, items: [], loadingItems: false,
  flightDocs: [], stayDocs: [], loadingMove: false, reveal: {},
  q: '', filter: '全部', years: {}, stats: {},
  wide: WIDE.matches, offline: !navigator.onLine, standalone: STANDALONE,
  hideInstall: store.get('hideInstall') === '1',
  signingIn: false, loginError: '', busy: false,
};

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
  else if (!S.user) html = renderLogin(S);
  else html = S.view === 'trip' ? renderTrip(S) : renderHome(S);
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

/* ---------- 路徑：#/trip/<id> 開旅程，其他回首頁 ---------- */
function readRoute() {
  const m = location.hash.match(/^#\/trip\/([\w-]+)$/);
  S.view = m ? 'trip' : 'home';
  S.tripId = m ? m[1] : null;
}
function go(hash) {
  if (location.hash === hash) return;
  location.hash = hash;
}

/* ---------- 資料監看 ---------- */
const curTrip = () => S.trips.find(t => t.id === S.tripId);
const findItem = id => S.items.find(it => it.id === id);

// 進入旅程時開始監看行程、班機、住宿，離開時停止；換旅程時分頁與展開狀態歸零
function syncItineraryWatch() {
  const want = S.user && S.view === 'trip' ? S.tripId : null;
  if (want === itin.tripId) return;
  itin.stops.forEach(off => off());
  itin = { tripId: want, stops: [], tries: 0 };
  Object.assign(S, { items: [], flightDocs: [], stayDocs: [], reveal: {}, days: {}, pday: 1, tab: 'plan', loadingItems: !!want, loadingMove: !!want });
  if (want) startTripWatch(want);
}

function startTripWatch(tripId) {
  const ok = fn => list => { if (itin.tripId === tripId) { fn(list); render(); } };
  const fail = err => {
    // 剛建立的旅程還沒寫到伺服器時會被安全規則擋下，稍後全部重來
    if (itin.tripId !== tripId) return;
    itin.stops.forEach(off => off()); itin.stops = [];
    if (++itin.tries <= 3) { setTimeout(() => itin.tripId === tripId && !itin.stops.length && startTripWatch(tripId), 1500 * itin.tries); return; }
    console.error(err);
    S.loadingItems = false; S.loadingMove = false;
    toast('讀取旅程資料失敗，請重新整理再試');
    render();
  };
  let got = 0;
  const moveLoaded = () => { if (++got >= 2) S.loadingMove = false; };
  itin.stops = [
    watchItinerary(tripId, ok(list => { S.items = list.map(normalizeItem); S.loadingItems = false; }), fail),
    watchRecords(tripId, 'flights', ok(list => { S.flightDocs = list; moveLoaded(); }), fail),
    watchRecords(tripId, 'stays', ok(list => { S.stayDocs = list; moveLoaded(); }), fail),
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

function onDrop(id, t) {
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
  S.trips = []; S.expenses = new Map(); S.loadingTrips = true;
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

function startWatching(user) {
  stopTrips = watchMyTrips(user.uid, raw => {
    S.trips = raw.map(viewTrip);
    S.loadingTrips = false;
    syncExpenseWatch();
    render();
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
    await logOut();
    go('#/');
    toast('已登出');
  },
  account: () => accountSheet(S),
  install: () => installSheet(),
  hideInstall() { S.hideInstall = true; store.set('hideInstall', '1'); render(); toast('之後可以在帳號選單找到「加到手機主畫面」'); },
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
  close: () => closeSheet(),
  bg(el, ev) { if (ev.target === el) closeSheet(); },
  reload: () => updateSW?.(true),
};

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el, ev);
});
// 中文輸入法組字時不重畫，否則會打斷組字；組完字再更新列表
document.addEventListener('input', ev => {
  const t = ev.target;
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
  if (['ff-fromTz', 'ff-toTz', 'ff-dep', 'ff-arr'].includes(ev.target.id)) updateDuration();
  if (['sf-in', 'sf-out'].includes(ev.target.id)) updateNights();
});
document.addEventListener('compositionend', ev => {
  if (ev.target.id === 'q') { S.q = ev.target.value; render(); }
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && sheetOpen()) closeSheet(); });
window.addEventListener('scroll', () => $('#appbar')?.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
window.addEventListener('hashchange', () => { readRoute(); render(); window.scrollTo(0, 0); });
initDrag({
  canEdit: () => !S.offline,
  onLocked: () => toast('離線中只能查看，連上網路後才能修改'),
  onDrop,
});
WIDE.addEventListener('change', e => { S.wide = e.matches; render(); });
window.addEventListener('online', () => { S.offline = false; render(); });
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
    fatal(navigator.onLine ? '無法讀取連線設定，已停止連線。請稍後再試，或通知管理者。' : '目前沒有網路，連上網路後再開啟。');
    return;
  }
  exposeTestSignIn();
  watchUser(async user => {
    stopAll();
    S.user = user;
    S.nickname = user ? await nicknameOf(user) : '';
    S.ready = true;
    if (user) startWatching(user);
    render();
  });
}
boot();
