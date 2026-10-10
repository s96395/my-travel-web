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
import { renderTrip } from './views/trip.js';
import { accountSheet, installSheet, newTripSheet, readTripForm } from './views/sheets.js';

const WIDE = window.matchMedia('(min-width: 1000px)');
const STANDALONE = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const S = {
  env: '', user: null, nickname: '', ready: false,
  trips: [], expenses: new Map(), loadingTrips: true,
  view: 'home', tripId: null,
  q: '', filter: '全部', years: {}, stats: {},
  wide: WIDE.matches, offline: !navigator.onLine, standalone: STANDALONE,
  hideInstall: store.get('hideInstall') === '1',
  signingIn: false, loginError: '', busy: false,
};

let stopTrips = null;
const expenseWatch = new Map(); // tripId → 取消監看函式

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
  $('#scroller').innerHTML = html + envTag();
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
function stopAll() {
  stopTrips?.(); stopTrips = null;
  expenseWatch.forEach(off => off()); expenseWatch.clear();
  S.trips = []; S.expenses = new Map(); S.loadingTrips = true;
}

function syncExpenseWatch() {
  const ids = new Set(S.trips.map(t => t.id));
  expenseWatch.forEach((off, id) => { if (!ids.has(id)) { off(); expenseWatch.delete(id); S.expenses.delete(id); } });
  ids.forEach(id => {
    if (expenseWatch.has(id)) return;
    expenseWatch.set(id, watchExpenses(id, list => { S.expenses.set(id, list); render(); }, err => console.warn('讀取支出失敗', id, err)));
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
document.addEventListener('input', ev => {
  if (ev.target.id === 'q') { S.q = ev.target.value; render(); }
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && sheetOpen()) closeSheet(); });
window.addEventListener('scroll', () => $('#appbar')?.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
window.addEventListener('hashchange', () => { readRoute(); render(); window.scrollTo(0, 0); });
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
