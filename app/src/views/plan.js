// 行程分頁：手機版依天數收合，電腦版左邊選天、右邊看那一天（規格書 F20–F22、U06）
import { esc, ICON, openSheet, $ } from '../ui/dom.js';
import { parseDate, toDateString, monthDay } from '../lib/dates.js';
import { tripDays } from '../lib/trips.js';
import { ITEM_TYPES, ITEM_LABEL, ITEM_ICON, PRIORITIES, PRIORITY_LABEL, planDays, itemsOfDay, dayAreas } from '../lib/itinerary.js';

const head = title => `<div class="head"><h2>${title}</h2><button type="button" class="iconbtn" data-act="close" aria-label="關閉">×</button></div>`;
const PRI_TAG = { must: ' bad', want: ' accent', optional: '' };

function dayDate(trip, d) {
  if (!trip.start || d > tripDays(trip)) return '';
  const dt = parseDate(trip.start);
  dt.setDate(dt.getDate() + d - 1);
  return monthDay(toDateString(dt));
}
const dayTitle = (items, d) => (d === 0 ? '還沒排天數' : dayAreas(items, d).join('・') || `第 ${d} 天`);

function itemHtml(it, S) {
  return `<div class="item" data-iid="${esc(it.id)}">
    <div class="grow" style="flex:1">
      <h4>${it.time ? `<span class="data" style="color:var(--accent)">${esc(it.time)}</span> ` : ''}${esc(it.title)}</h4>
      ${it.note ? `<p>${esc(it.note)}</p>` : ''}
      <div class="tags"><span class="tag">${ITEM_ICON[it.type]} ${ITEM_LABEL[it.type]}</span>${it.priority ? `<span class="tag${PRI_TAG[it.priority]}">${PRIORITY_LABEL[it.priority]}</span>` : ''}${it.time ? '<span class="tag warn">已預約</span>' : ''}</div>
    </div>
    <button type="button" class="more" data-act="itemMenu" data-id="${esc(it.id)}" ${S.offline ? 'disabled' : ''} aria-label="移動或編輯">⋯</button>
  </div>`;
}

function dayItems(S, d) {
  const its = itemsOfDay(S.items, d);
  return `<div class="items">${its.map(it => itemHtml(it, S)).join('') || '<div class="empty">這天還沒有安排</div>'}
    ${d ? `<button type="button" class="btn sm" data-act="addItem" data-d="${d}" style="justify-self:start" ${S.offline ? 'disabled' : ''}>${ICON.plus}新增到第 ${d} 天</button>` : ''}
  </div>`;
}

// 天數清單：1..N，再加上「還沒排天數」（有這種項目時才出現）
const dayList = (S, trip) => {
  const n = planDays(S.items, tripDays(trip));
  const list = Array.from({ length: n }, (_, i) => i + 1);
  return S.items.some(it => it.day === 0) ? [...list, 0] : list;
};

function planNarrow(S, trip) {
  const days = dayList(S, trip);
  return `
  <div class="chips" role="group" aria-label="跳到某一天">${days.filter(Boolean).map(d => `<button type="button" class="chip" data-act="jump" data-d="${d}">第 ${d} 天</button>`).join('')}</div>
  <p class="small muted" style="margin:-8px 0 0">長按行程就能拖曳，可以換順序，也能拖到別天；拖到收合的天數標題上會放在那天最後。</p>
  <div class="days">${days.map(d => {
    const open = S.days[d] ?? (d === 0);
    const n = S.items.filter(it => it.day === d).length;
    return `<section class="day" id="day${d}" data-open="${open}" data-dropd="${d}">
      <button type="button" data-act="day" data-d="${d}" aria-expanded="${open}"><span class="daynum">${d ? 'D' + d : '?'}</span><h3>${esc(dayTitle(S.items, d))} <span class="small muted num" style="font-weight:400">${dayDate(trip, d)}</span></h3><span class="small muted">${n} 項</span><span class="chev">${ICON.chev}</span></button>
      ${open ? dayItems(S, d) : ''}
    </section>`;
  }).join('')}</div>`;
}

function planWide(S, trip) {
  const days = dayList(S, trip);
  const sel = days.includes(S.pday) ? S.pday : days[0];
  const idx = days.indexOf(sel);
  const nav = days.map(d => `<button type="button" class="dli" data-act="pday" data-d="${d}" data-dropd="${d}" ${d === sel ? 'aria-current="true"' : ''}>
      <span class="daynum">${d ? 'D' + d : '?'}</span><span class="dl-t"><b>${esc(dayTitle(S.items, d))}</b><span class="small muted num">${dayDate(trip, d) || '未排定'}・${S.items.filter(it => it.day === d).length} 項</span></span></button>`).join('');
  return `<div class="planwide">
    <nav class="daylist" aria-label="選擇天數">${nav}<p class="small muted">長按行程可拖曳換順序；拖到這裡的某一天，會移到那天最後。</p></nav>
    <section class="day" id="day${sel}" data-open="true" data-dropd="${sel}">
      <div class="dayhead"><span class="daynum">${sel ? 'D' + sel : '?'}</span><h3>${esc(dayTitle(S.items, sel))} <span class="small muted num" style="font-weight:400">${dayDate(trip, sel)}</span></h3>
        <span class="row" style="gap:6px"><button type="button" class="btn sm" data-act="pday" data-d="${days[idx - 1]}" ${idx <= 0 ? 'disabled' : ''}>‹ 前一天</button><button type="button" class="btn sm" data-act="pday" data-d="${days[idx + 1]}" ${idx >= days.length - 1 ? 'disabled' : ''}>後一天 ›</button></span></div>
      ${dayItems(S, sel)}
    </section>
  </div>`;
}

export function renderPlan(S, trip) {
  if (S.loadingItems) return '<div class="empty">正在讀取行程…</div>';
  return S.wide ? planWide(S, trip) : planNarrow(S, trip);
}

/* ---------- 彈出選單與表單 ---------- */
export function itemMenuSheet(S, trip, it, isOwner) {
  const days = dayList(S, trip).filter(Boolean);
  openSheet(`${head(esc(it.title))}
    <p class="label">移到第幾天</p>
    <div class="chips" style="flex-wrap:wrap">${days.map(d => `<button type="button" class="chip" data-act="moveTo" data-id="${esc(it.id)}" data-d="${d}" aria-pressed="${it.day === d}">第 ${d} 天</button>`).join('')}</div>
    <p class="small muted" style="margin:0">也可以在列表上長按行程，直接拖曳到想放的位置。</p>
    <div class="row">${isOwner ? `<button type="button" class="btn danger" data-act="delItem" data-id="${esc(it.id)}">刪除</button>` : ''}<button type="button" class="btn grow" data-act="editItem" data-id="${esc(it.id)}">編輯內容</button></div>`);
}

export function itemFormSheet(day, it = null) {
  const v = it || { title: '', area: '', type: 'attraction', priority: '', time: '', note: '' };
  openSheet(`${head(it ? '編輯行程' : `新增到第 ${day} 天`)}
    <div class="field"><label for="n-title">名稱</label><input class="input" id="n-title" maxlength="60" placeholder="例如：南禪寺" value="${esc(v.title)}"></div>
    <div class="grid2"><div class="field"><label for="n-type">類型</label><select class="select" id="n-type">${ITEM_TYPES.map(t => `<option value="${t}" ${t === v.type ? 'selected' : ''}>${ITEM_ICON[t]} ${ITEM_LABEL[t]}</option>`).join('')}</select></div>
      <div class="field"><label for="n-pri">優先度</label><select class="select" id="n-pri"><option value="">不設定</option>${PRIORITIES.map(p => `<option value="${p}" ${p === v.priority ? 'selected' : ''}>${PRIORITY_LABEL[p]}</option>`).join('')}</select></div></div>
    <div class="grid2"><div class="field"><label for="n-time">預約時間（有預約才填）</label><input class="input" id="n-time" type="time" value="${esc(v.time)}"></div>
      <div class="field"><label for="n-area">區域</label><input class="input" id="n-area" maxlength="20" placeholder="例如：嵐山" value="${esc(v.area)}"></div></div>
    <div class="field"><label for="n-note">備註</label><input class="input" id="n-note" maxlength="200" value="${esc(v.note)}"></div>
    <button type="button" class="btn primary" data-act="saveItem" data-d="${day}" ${it ? `data-id="${esc(it.id)}"` : ''}>${it ? '儲存' : '加入行程'}</button>`);
}

// 讀表單；名稱空白時標示欄位並回傳 null
export function readItemForm() {
  const t = $('#n-title');
  if (!t.value.trim()) { t.classList.add('err'); t.focus(); return null; }
  return {
    title: t.value.trim(),
    type: $('#n-type').value,
    priority: $('#n-pri').value,
    reservationTime: $('#n-time').value,
    area: $('#n-area').value.trim(),
    note: $('#n-note').value.trim(),
  };
}
