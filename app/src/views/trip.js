// 旅程內頁：上方封面與基本資訊，分頁在手機放底部、電腦放上方
import { $, esc, ICON, openSheet } from '../ui/dom.js';
import { coverHtml, coverImg, scene, STYLES } from '../ui/scene.js';
import { monthDay } from '../lib/dates.js';
import { TYPE_ICON, participantsOf } from '../lib/trips.js';
import { renderPlan } from './plan.js';
import { renderMove } from './move.js';
import { renderTodo } from './todo.js';
import { renderExp } from './expense.js';
import { renderMore } from './more.js';
import { renderDive } from './dive.js';

const TABS_BASE = [['plan', '行程', 'plan'], ['move', '交通住宿', 'plane'], ['todo', '待辦', 'todo'], ['exp', '支出', 'money'], ['more', '更多', 'more']];
export const tabsFor = trip => (trip.type === '潛旅' ? [TABS_BASE[0], ['dive', '潛水', 'dive'], ...TABS_BASE.slice(1)] : TABS_BASE);

export const tabButtons = (trip, tab) => tabsFor(trip).map(t => `<button type="button" data-act="tab" data-v="${t[0]}" ${tab === t[0] ? 'aria-current="page"' : ''}>${ICON[t[2]]}<span>${t[1]}</span></button>`).join('');

const DL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
const OK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
const pad = n => String(n).padStart(2, '0');
export const dlTime = ms => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const device = S => (S.wide ? '這台電腦' : '這支手機');

// 下載供離線使用（規格書 P05）：標題列的小圖示，還沒下載是下載箭頭，下載好變打勾，按打勾看下載時間或重新下載
function dlBtn(S, t) {
  if (S.dlBusy === t.id) return '<button type="button" class="iconbtn" disabled aria-label="下載中"><span class="spin" aria-hidden="true"></span></button>';
  if (S.dl[t.id]) return `<button type="button" class="iconbtn done" data-act="dlInfo" aria-label="已可離線查看" title="已可離線查看">${OK}</button>`;
  return `<button type="button" class="iconbtn" data-act="download" ${S.offline ? 'disabled' : ''} aria-label="下載供離線使用" title="下載供離線使用">${DL}</button>`;
}

export function dlSheet(S, t) {
  openSheet(`<div class="head"><h2>已可離線查看</h2><button type="button" class="iconbtn" data-act="close" aria-label="關閉">×</button></div>
    <p style="margin:0">這趟已經下載到${device(S)}，沒有網路也能看行程、班機、住宿、待辦、支出。最後更新 ${dlTime(S.dl[t.id])}。</p>
    ${S.localOnly ? '' : `<button type="button" class="btn" data-act="download" ${S.offline ? 'disabled' : ''}>重新下載</button>`}`);
}

function offBanner(S, t) {
  if (!S.offline) return '';
  const at = S.dl[t?.id];
  const msg = !t || at ? `只能查看，暫時不能修改。${S.localOnly && at ? `顯示的是 ${dlTime(at)} 下載的資料。` : ''}` : `這趟還沒下載到${device(S)}，連上網路後按標題右邊的下載圖示。`;
  return `<div class="banner" role="status"><b>離線中</b><span>${msg}</span></div>`;
}

const avatar = (p, i) => `<span class="avatar${p.uid ? '' : ' unbound'}" data-c="${i % 3}" title="${esc(p.name)}">${esc((p.name || '?').slice(0, 1))}</span>`;

function tripHead(S, t) {
  const people = participantsOf(t.raw).filter(p => p.status !== 'inactive');
  const range = t.start ? `${monthDay(t.start)} – ${monthDay(t.end || t.start)}` : '還沒設定日期';
  const cover = S.covers[t.id];
  const btns = S.offline ? '' : '<span class="covbtns"><button type="button" class="btn sm" data-act="coverMenu">📷 更換封面</button></span>';
  return `<div class="tripcover">${coverHtml(t, true, cover)}${btns}</div>
  <div class="triphead">
    <div class="when"><span class="num">${range}</span><span>${esc(t.place || '未填地點')}</span><span class="tag accent">${TYPE_ICON[t.type]} ${esc(t.type)}</span></div>
    ${people.length ? `<div class="row"><div class="people">${people.map(avatar).join('')}</div><span class="small muted grow">${people.map(p => esc(p.name)).join('、')}</span></div>` : ''}
  </div>`;
}

// 更換封面：上傳照片，或從預設圖案挑一張（挑預設圖案會拿掉照片）
export function coverSheet(t, cover) {
  const photo = !!cover?.src, cur = photo ? '' : cover?.style || 'auto';
  const opts = STYLES.map(([k, name]) => `<button type="button" class="stylepick${k === cur ? ' on' : ''}" data-act="pickStyle" data-v="${k}" aria-pressed="${k === cur}"><span class="thumb">${scene(t, k)}</span><span>${name}</span></button>`).join('');
  openSheet(`<div class="head"><h2>更換封面</h2><button type="button" class="iconbtn" data-act="close" aria-label="關閉">×</button></div>
    <div class="row"><button type="button" class="btn primary grow" data-act="pickCover">上傳照片</button>${photo ? '<button type="button" class="btn grow" data-act="adjustCover">調整照片位置</button>' : ''}</div>
    <p class="small muted" style="margin:0">或選一張預設圖案${photo ? '，選了之後會拿掉目前的照片' : ''}。「自動」會依旅程類型、地點與月份決定。</p>
    <div class="stylegrid">${opts}</div>`);
}

// 調整封面位置：拖曳照片移動、拉桿放大；c 會直接被改，儲存時讀它
export function cropSheet(c, info = '') {
  openSheet(`<div class="head"><h2>調整封面位置</h2><button type="button" class="iconbtn" data-act="close" aria-label="關閉">×</button></div>
    <div class="cropframe" id="cropFrame">${coverImg(c)}<span class="crophint">拖曳照片調整位置</span></div>
    <div class="field"><label for="cropZoom">放大</label><input type="range" id="cropZoom" min="1" max="2.5" step="0.05" value="${c.z}"></div>
    <p class="small muted" style="margin:0">首頁卡片和旅程頁上方用同一個位置。${info}</p>
    <div class="row"><button type="button" class="btn grow" data-act="pickCover">重新選照片</button><button type="button" class="btn primary grow" data-act="saveCover">儲存封面</button></div>`);
  const f = $('#cropFrame'), im = f.querySelector('img');
  const paint = () => { im.style.objectPosition = `${c.x}% ${c.y}%`; im.style.transformOrigin = `${c.x}% ${c.y}%`; im.style.transform = `scale(${c.z})`; };
  const clamp = v => Math.max(0, Math.min(100, Math.round(v * 10) / 10));
  let start = null;
  f.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y }; f.setPointerCapture(e.pointerId); f.classList.add('dragging'); });
  f.addEventListener('pointermove', e => {
    if (!start) return;
    const r = f.getBoundingClientRect();
    c.x = clamp(start.cx - (e.clientX - start.x) / r.width * 100 / c.z * 1.6);
    c.y = clamp(start.cy - (e.clientY - start.y) / r.height * 100 / c.z * 1.6);
    paint();
  });
  const end = () => { start = null; f.classList.remove('dragging'); };
  f.addEventListener('pointerup', end); f.addEventListener('pointercancel', end);
  $('#cropZoom').addEventListener('input', e => { c.z = +e.target.value; paint(); });
}

export function renderTrip(S) {
  const t = S.trips.find(x => x.id === S.tripId);
  const back = `<button type="button" class="iconbtn" data-act="home" aria-label="回首頁">${ICON.back}</button>`;
  if (!t) {
    return `<header class="appbar" id="appbar">${back}<h1>旅程</h1></header><div class="wrap narrow"><div class="empty">${S.loadingTrips ? '正在讀取旅程…' : '找不到這趟旅程，可能已被刪除，或你不是這趟旅程的成員。'}</div></div>`;
  }
  const tab = tabsFor(t).some(x => x[0] === S.tab) ? S.tab : 'plan';
  const VIEWS = { plan: renderPlan, dive: renderDive, move: renderMove, todo: renderTodo, exp: renderExp, more: renderMore };
  const body = VIEWS[tab](S, t);
  return `
  ${offBanner(S, t)}
  <header class="appbar" id="appbar">${back}<h1>${esc(t.name)}</h1>${dlBtn(S, t)}<span class="label">${tabsFor(t).find(x => x[0] === tab)[1]}</span></header>
  ${S.wide ? `<nav class="toptabs" aria-label="旅程分頁">${tabButtons(t, tab)}</nav>` : ''}
  <div class="wrap">
    ${tab === 'plan' || S.wide ? tripHead(S, t) : ''}
    ${body}
  </div>`;
}
