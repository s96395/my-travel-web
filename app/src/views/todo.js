// 待辦分頁：新增、勾選、刪除，上方顯示完成進度；下方可套用旅程類型的範本（規格書 F40、F41）
// 另一個分段是行李清單，每個人各自一份
import { esc } from '../ui/dom.js';
import { parseDate } from '../lib/dates.js';
import { sortTodos, progress, missingTemplate, PACK_GROUPS, PACK_KINDS, packKindOf, missingPack } from '../lib/todos.js';
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

const R = 26, C = 2 * Math.PI * R;
const ring = p => `<svg class="ring" viewBox="0 0 64 64" role="img" aria-label="完成 ${p.done} / ${p.total}"><circle cx="32" cy="32" r="${R}"/><circle class="on" cx="32" cy="32" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - p.pct / 100)).toFixed(1)}"/><text x="32" y="37" text-anchor="middle">${p.done}/${p.total}</text></svg>`;

const segs = cur => `<div class="seg" style="justify-self:start">${[['todo', '出發前準備'], ['pack', '我的行李']].map(s => `<button type="button" data-act="todoSeg" data-v="${s[0]}" aria-pressed="${cur === s[0]}">${s[1]}</button>`).join('')}</div>`;

export function renderTodo(S, trip) {
  const seg = S.todoSeg === 'pack' ? 'pack' : 'todo';
  return segs(seg) + (seg === 'pack' ? renderPack(S, trip) : renderTodoList(S, trip));
}

// 搭飛機常見的限制，只放提醒，細節以官方公告為準
const RULES = [
  '行動電源、備用鋰電池只能隨身帶，不能托運。',
  '隨身的液體、膠狀、噴霧每瓶 100 毫升以下，裝進 1 公升的透明夾鏈袋，每人一袋。',
  '打火機、火柴每人限帶一個，放在身上，不能托運。',
  '刀子、剪刀等尖銳物品要放托運行李。',
  '肉類、水果等動植物產品，多數國家入境有限制，回台灣也不能帶肉製品。',
];
const rulesBox = () => `<details class="tplbox">
    <summary class="small"><b>搭飛機不能帶的東西</b></summary>
    <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:4px">${RULES.map(x => `<li>${x}</li>`).join('')}</ul>
    <p class="small muted" style="margin:0">規定會變，也各國不同，出發前請看<a href="https://www.caa.gov.tw/" target="_blank" rel="noopener">民航局</a>、<a href="https://www.aphia.gov.tw/" target="_blank" rel="noopener">動植物防疫檢疫署</a>和航空公司的公告。</p>
  </details>`;

const packRow = (t, off) => `
    <label class="todo${t.done ? ' done' : ''}">
      <input type="checkbox" data-pack="${esc(t.id)}" ${t.done ? 'checked' : ''} ${off}>
      <span class="grow" style="flex:1">${esc(t.text)}</span>
      <button type="button" class="more" data-act="delPack" data-id="${esc(t.id)}" ${off} aria-label="刪除「${esc(t.text)}」">×</button>
    </label>`;

function renderPack(S, trip) {
  if (S.loadingTodo) return '<div class="empty">正在讀取行李清單…</div>';
  const mine = sortTodos(S.packDocs.filter(t => t.uid === S.user.uid)), p = progress(mine), off = S.offline ? 'disabled' : '';
  const kind = packKindOf(trip), groups = PACK_GROUPS.filter(g => g[0] !== 'dive' || trip.type === '潛旅' || mine.some(t => t.group === 'dive'));
  const miss = mine.length ? missingPack(mine, kind, trip.type) : [];
  return `
  <div class="todohead">
    ${ring(p)}
    <div><b>我的行李</b><div class="small muted">${!p.total ? '還沒有行李清單，每個人各自一份' : p.done < p.total ? `還剩 ${p.total - p.done} 件沒放` : '都收好了'}</div></div>
  </div>
  ${!mine.length ? `<div class="tplbox">
    <b class="small">從範本開始</b>
    <div class="row" style="gap:8px;flex-wrap:wrap">${['domestic', 'abroad'].sort((a, b) => (b === kind) - (a === kind)).map(k => `<button type="button" class="btn sm${k === kind ? ' primary' : ''}" data-act="packTpl" data-v="${k}" ${off}>套用${PACK_KINDS[k]}</button>`).join('')}</div>
    <p class="small muted" style="margin:0">套用後可以自己增減項目${trip.type === '潛旅' ? '，潛旅會多一區潛水裝備' : ''}。</p>
  </div>` : ''}
  <form class="quickadd" data-form="pack">
    <select id="packGroup" aria-label="放在哪一區" style="border:0;background:none;font-size:14px" ${off}>${groups.map(g => `<option value="${g[0]}">${g[1]}</option>`).join('')}</select>
    <input class="grow" id="packNew" maxlength="100" placeholder="還要帶什麼？例如：雨傘" aria-label="新增行李" ${off}>
    <button type="submit" ${off} aria-label="新增">＋</button>
  </form>
  ${groups.map(([g, label]) => {
    // 已勾的排到這一區最下面；每一區可以收起來，全部勾完的預設收起
    const list = mine.filter(t => (t.group || 'bag') === g).sort((a, b) => a.done - b.done), done = list.filter(t => t.done).length;
    if (!list.length) return '';
    const open = S.packOpen[g] ?? done < list.length;
    return `<button type="button" class="label donehead packhead" data-act="packFold" data-v="${g}" aria-expanded="${open}"><span aria-hidden="true">${open ? '▾' : '▸'}</span> ${label} ${done}/${list.length}</button>${open ? `<div class="divide">${list.map(t => packRow(t, off)).join('')}</div>` : ''}`;
  }).join('')}
  ${miss.length ? `<div class="tplbox">
    <div class="row"><b class="grow small">${PACK_KINDS[kind]}範本還有這些</b><button type="button" class="btn sm" data-act="packTpl" data-v="${kind}" ${off}>全部加入</button></div>
    <div class="tplchips small muted">${miss.map(x => `<span>${esc(x.text)}</span>`).join('')}</div>
  </div>` : ''}
  ${rulesBox()}`;
}

function renderTodoList(S, trip) {
  if (S.loadingTodo) return '<div class="empty">正在讀取待辦…</div>';
  const list = sortTodos(S.todoDocs), p = progress(list), off = S.offline ? 'disabled' : '';
  const miss = missingTemplate(list, trip.type), d = daysLeft(trip);
  const todo = list.filter(t => !t.done), done = list.filter(t => t.done);
  return `
  <div class="todohead">
    ${ring(p)}
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
