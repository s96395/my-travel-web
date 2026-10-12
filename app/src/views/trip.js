// 旅程內頁：上方封面與基本資訊，分頁在手機放底部、電腦放上方
import { esc, ICON } from '../ui/dom.js';
import { coverHtml } from '../ui/scene.js';
import { monthDay } from '../lib/dates.js';
import { TYPE_ICON, participantsOf } from '../lib/trips.js';
import { renderPlan } from './plan.js';
import { renderMove } from './move.js';
import { renderTodo } from './todo.js';

const TABS_BASE = [['plan', '行程', 'plan'], ['move', '交通住宿', 'plane'], ['todo', '待辦', 'todo'], ['exp', '支出', 'money'], ['more', '更多', 'more']];
export const tabsFor = trip => (trip.type === '潛旅' ? [TABS_BASE[0], ['dive', '潛水', 'dive'], ...TABS_BASE.slice(1)] : TABS_BASE);
const LATER = { exp: '第 5 批', more: '第 6 批', dive: '之後的批次' };

export const tabButtons = (trip, tab) => tabsFor(trip).map(t => `<button type="button" data-act="tab" data-v="${t[0]}" ${tab === t[0] ? 'aria-current="page"' : ''}>${ICON[t[2]]}<span>${t[1]}</span></button>`).join('');

const avatar = (p, i) => `<span class="avatar${p.uid ? '' : ' unbound'}" data-c="${i % 3}" title="${esc(p.name)}">${esc((p.name || '?').slice(0, 1))}</span>`;

function tripHead(t) {
  const people = participantsOf(t.raw).filter(p => p.status !== 'inactive');
  const range = t.start ? `${monthDay(t.start)} – ${monthDay(t.end || t.start)}` : '還沒設定日期';
  return `<div class="tripcover">${coverHtml(t, true)}</div>
  <div class="triphead">
    <div class="when"><span class="num">${range}</span><span>${esc(t.place || '未填地點')}</span><span class="tag accent">${TYPE_ICON[t.type]} ${esc(t.type)}</span></div>
    ${people.length ? `<div class="row"><div class="people">${people.map(avatar).join('')}</div><span class="small muted grow">${people.map(p => esc(p.name)).join('、')}</span></div>` : ''}
  </div>`;
}

export function renderTrip(S) {
  const t = S.trips.find(x => x.id === S.tripId);
  const back = `<button type="button" class="iconbtn" data-act="home" aria-label="回首頁">${ICON.back}</button>`;
  if (!t) {
    return `<header class="appbar" id="appbar">${back}<h1>旅程</h1></header><div class="wrap narrow"><div class="empty">${S.loadingTrips ? '正在讀取旅程…' : '找不到這趟旅程，可能已被刪除，或你不是這趟旅程的成員。'}</div></div>`;
  }
  const tab = tabsFor(t).some(x => x[0] === S.tab) ? S.tab : 'plan';
  const VIEWS = { plan: renderPlan, move: renderMove, todo: renderTodo };
  const body = VIEWS[tab] ? VIEWS[tab](S, t) : `<div class="empty">這個分頁會在${LATER[tab]}加入。</div>`;
  return `
  ${S.offline ? '<div class="banner" role="status"><b>離線中</b><span>只能查看，暫時不能修改。</span></div>' : ''}
  <header class="appbar" id="appbar">${back}<h1>${esc(t.name)}</h1><span class="label">${tabsFor(t).find(x => x[0] === tab)[1]}</span></header>
  ${S.wide ? `<nav class="toptabs" aria-label="旅程分頁">${tabButtons(t, tab)}</nav>` : ''}
  <div class="wrap">
    ${tab === 'plan' || S.wide ? tripHead(t) : ''}
    ${body}
  </div>`;
}
