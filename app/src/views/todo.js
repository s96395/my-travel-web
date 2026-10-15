// 待辦分頁：新增、勾選、刪除，上方顯示完成進度；下方可套用旅程類型的範本（規格書 F40、F41）
import { esc } from '../ui/dom.js';
import { parseDate } from '../lib/dates.js';
import { sortTodos, progress, missingTemplate } from '../lib/todos.js';
import { isMember } from '../lib/people.js';

// 共編成員都可以刪除
const canDel = (S, trip) => isMember(trip.raw, S.user.uid);

// 離出發還有幾天（已出發或沒填日期就不顯示）
function daysLeft(trip) {
  if (!trip.start) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((parseDate(trip.start) - today) / 86400000);
}

const todoRow = (S, trip, t, off) => `
    <label class="todo${t.done ? ' done' : ''}">
      <input type="checkbox" data-todo="${esc(t.id)}" ${t.done ? 'checked' : ''} ${off}>
      <span class="grow" style="flex:1">${esc(t.text)}</span>
      ${canDel(S, trip, t) ? `<button type="button" class="more" data-act="delTodo" data-id="${esc(t.id)}" ${off} aria-label="刪除「${esc(t.text)}」">×</button>` : ''}
    </label>`;

export function renderTodo(S, trip) {
  if (S.loadingTodo) return '<div class="empty">正在讀取待辦…</div>';
  const list = sortTodos(S.todoDocs), p = progress(list), off = S.offline ? 'disabled' : '';
  const miss = missingTemplate(list, trip.type), d = daysLeft(trip);
  const todo = list.filter(t => !t.done), done = list.filter(t => t.done);
  const R = 26, C = 2 * Math.PI * R;
  return `
  <div class="todohead">
    <svg class="ring" viewBox="0 0 64 64" role="img" aria-label="完成 ${p.done} / ${p.total}"><circle cx="32" cy="32" r="${R}"/><circle class="on" cx="32" cy="32" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - p.pct / 100)).toFixed(1)}"/><text x="32" y="37" text-anchor="middle">${p.done}/${p.total}</text></svg>
    <div><b>出發前準備</b><div class="small muted">${!p.total ? '還沒有待辦' : todo.length ? `還剩 ${todo.length} 件` : '都準備好了'}${d > 0 ? `，${d} 天後出發` : ''}</div></div>
  </div>
  <form class="quickadd" data-form="todo">
    <input class="grow" id="todoNew" maxlength="100" placeholder="還要準備什麼？例如：買轉接插頭" aria-label="新增待辦" ${off}>
    <button type="submit" ${off} aria-label="新增">＋</button>
  </form>
  <div class="divide">${todo.map(t => todoRow(S, trip, t, off)).join('') || (done.length ? '' : '<div class="empty">還沒有待辦，可以自己新增，或套用下方範本</div>')}</div>
  ${done.length ? `<div class="label donehead">已完成 ${done.length}</div><div class="divide">${done.map(t => todoRow(S, trip, t, off)).join('')}</div>` : ''}
  ${miss.length ? `<div class="tplbox">
    <div class="row"><b class="grow small">${esc(trip.type)}常見的準備項目</b><button type="button" class="btn sm" data-act="todoTpl" ${off}>全部加入</button></div>
    <div class="tplchips small muted">${miss.map(x => `<span>${esc(x)}</span>`).join('')}</div>
  </div>` : ''}`;
}
