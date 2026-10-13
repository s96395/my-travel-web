// 待辦分頁：新增、勾選、刪除，上方顯示完成進度；下方可套用旅程類型的範本（規格書 F40、F41）
import { esc } from '../ui/dom.js';
import { sortTodos, progress, missingTemplate } from '../lib/todos.js';
import { isMember } from '../lib/people.js';

// 共編成員都可以刪除
const canDel = (S, trip) => isMember(trip.raw, S.user.uid);

export function renderTodo(S, trip) {
  if (S.loadingTodo) return '<div class="empty">正在讀取待辦…</div>';
  const list = sortTodos(S.todoDocs), p = progress(list), off = S.offline ? 'disabled' : '';
  const left = missingTemplate(list, trip.type).length;
  return `
  <div class="card" style="display:grid;gap:8px">
    <div class="row"><b class="grow">出發前準備</b><span class="num small">${p.total ? `${p.done} / ${p.total} 完成` : '還沒有待辦'}</span></div>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}" aria-label="完成進度"><i style="width:${p.pct}%"></i></div>
  </div>
  <form class="row" data-form="todo">
    <input class="input grow" id="todoNew" maxlength="100" placeholder="新增待辦，例如：買轉接插頭" aria-label="新增待辦" ${off}>
    <button type="submit" class="btn primary" ${off}>新增</button>
  </form>
  <div class="divide">${list.map(t => `
    <label class="todo${t.done ? ' done' : ''}">
      <input type="checkbox" data-todo="${esc(t.id)}" ${t.done ? 'checked' : ''} ${off}>
      <span class="grow" style="flex:1">${esc(t.text)}</span>
      ${canDel(S, trip, t) ? `<button type="button" class="more" data-act="delTodo" data-id="${esc(t.id)}" ${off} aria-label="刪除「${esc(t.text)}」">×</button>` : ''}
    </label>`).join('') || '<div class="empty">還沒有待辦，可以自己新增，或套用下方範本</div>'}</div>
  <div class="card row" style="flex-wrap:wrap">
    <div class="grow"><b class="small">${esc(trip.type)}範本</b><div class="small muted">${left ? `補上清單裡還沒有的 ${left} 個常用項目` : '範本項目都已經在清單裡'}</div></div>
    <button type="button" class="btn sm" data-act="todoTpl" ${off || (left ? '' : 'disabled')}>套用</button>
  </div>`;
}
