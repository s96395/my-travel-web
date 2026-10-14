// 行程分頁：手機版依天數收合，電腦版左邊選天、右邊看那一天（規格書 F20–F22、U06）
import { esc, ICON, openSheet, $ } from '../ui/dom.js';
import { parseDate, toDateString, monthDay } from '../lib/dates.js';
import { tripDays } from '../lib/trips.js';
import { ITEM_TYPES, ITEM_LABEL, ITEM_ICON, PRIORITIES, PRIORITY_LABEL, planDays, itemsOfDay, dayAreas, onMap, placeQuery, placeUrl, placeHref, routeStops, routeUrl, embedUrl } from '../lib/itinerary.js';
import { mapsKey } from '../firebase.js';

const head = title => `<div class="head"><h2>${title}</h2><button type="button" class="iconbtn" data-act="close" aria-label="關閉">×</button></div>`;
const PRI_TAG = { must: ' bad', want: ' accent', optional: '' };

function dayDate(trip, d) {
  if (!d || !trip.start || d > tripDays(trip)) return '';
  const dt = parseDate(trip.start);
  dt.setDate(dt.getDate() + d - 1);
  return monthDay(toDateString(dt));
}
const dayTitle = (items, d) => (d === 0 ? '還沒排天數' : dayAreas(items, d).join('・') || `第 ${d} 天`);

function itemHtml(it, S, trip) {
  return `<div class="item" data-iid="${esc(it.id)}">
    <div class="grow" style="flex:1">
      <h4>${it.time ? `<span class="data" style="color:var(--accent)">${esc(it.time)}</span> ` : ''}${esc(it.title)}</h4>
      ${it.note ? `<p>${esc(it.note)}</p>` : ''}
      <div class="tags"><span class="tag">${ITEM_ICON[it.type]} ${ITEM_LABEL[it.type]}</span>${it.priority ? `<span class="tag${PRI_TAG[it.priority]}">${PRIORITY_LABEL[it.priority]}</span>` : ''}${it.time ? '<span class="tag warn">已預約</span>' : ''}${onMap(it) && !S.offline ? `<a class="tag" href="${esc(placeHref(it, trip.city))}" target="_blank" rel="noopener">📍 地圖</a>` : ''}</div>
    </div>
    <span class="grip" title="長按拖曳" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></span>
    <button type="button" class="more" data-act="itemMenu" data-id="${esc(it.id)}" ${S.offline ? 'disabled' : ''} aria-label="移動或編輯">⋯</button>
  </div>`;
}

// 第一次進行程分頁出現一次的小提示，按「知道了」或拖曳過一次就不再出現
const dragTip = S => (S.tipDrag || S.offline || !S.items.length ? '' : `<div class="tip" role="note"><span>長按行程（右邊有 ⋮⋮ 的那一列）就能拖曳，換順序或移到別天。</span><button type="button" class="linkbtn" data-act="tipDrag">知道了</button></div>`);

// 當天路線：上面嵌入 Google 地圖小視窗（有金鑰時），下面一顆開啟完整路線；沒網路時不顯示
function dayRoute(S, trip, its) {
  const stops = routeStops(its, trip.city);
  if (S.offline || !stops.length) return '';
  const embed = embedUrl(stops, mapsKey);
  return `<div class="maproute" style="display:grid;gap:8px">
    ${embed ? `<iframe src="${esc(embed)}" title="當天路線地圖" loading="lazy" allowfullscreen style="width:100%;height:220px;border:0;border-radius:12px"></iframe>` : ''}
    <a class="btn sm" href="${esc(routeUrl(stops))}" target="_blank" rel="noopener" style="justify-self:start;text-decoration:none">🗺️ ${stops.length > 1 ? '開啟完整 Google 路線' : '開啟 Google 地圖'}</a>
  </div>`;
}

function dayItems(S, trip, d) {
  const its = itemsOfDay(S.items, d);
  return `<div class="items">${d ? dayRoute(S, trip, its) : ''}${its.map(it => itemHtml(it, S, trip)).join('') || '<div class="empty">這天還沒有安排</div>'}
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
  ${dragTip(S)}
  <div class="days">${days.map(d => {
    const open = S.days[d] ?? (d === 0);
    const n = S.items.filter(it => it.day === d).length;
    return `<section class="day" id="day${d}" data-open="${open}" data-dropd="${d}">
      <button type="button" data-act="day" data-d="${d}" aria-expanded="${open}"><span class="daynum">${d ? 'D' + d : '?'}</span><h3>${esc(dayTitle(S.items, d))} <span class="small muted num" style="font-weight:400">${dayDate(trip, d)}</span></h3><span class="small muted">${n} 項</span><span class="chev">${ICON.chev}</span></button>
      ${open ? dayItems(S, trip, d) : ''}
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
    <nav class="daylist" aria-label="選擇天數">${nav}</nav>
    <section class="day" id="day${sel}" data-open="true" data-dropd="${sel}">
      ${dragTip(S)}
      <div class="dayhead"><span class="daynum">${sel ? 'D' + sel : '?'}</span><h3>${esc(dayTitle(S.items, sel))} <span class="small muted num" style="font-weight:400">${dayDate(trip, sel)}</span></h3>
        <span class="row" style="gap:6px"><button type="button" class="btn sm" data-act="pday" data-d="${days[idx - 1]}" ${idx <= 0 ? 'disabled' : ''}>‹ 前一天</button><button type="button" class="btn sm" data-act="pday" data-d="${days[idx + 1]}" ${idx >= days.length - 1 ? 'disabled' : ''}>後一天 ›</button></span></div>
      ${dayItems(S, trip, sel)}
    </section>
  </div>`;
}

export function renderPlan(S, trip) {
  if (S.loadingItems) return '<div class="empty">正在讀取行程…</div>';
  return S.wide ? planWide(S, trip) : planNarrow(S, trip);
}

/* ---------- 彈出選單與表單 ---------- */
export function itemMenuSheet(S, trip, it, canDel) {
  const days = dayList(S, trip).filter(Boolean);
  openSheet(`${head(esc(it.title))}
    <p class="label">移到第幾天</p>
    <div class="chips" style="flex-wrap:wrap">${days.map(d => `<button type="button" class="chip" data-act="moveTo" data-id="${esc(it.id)}" data-d="${d}" aria-pressed="${it.day === d}">第 ${d} 天</button>`).join('')}</div>
    <p class="small muted" style="margin:0">也可以在列表上長按行程，直接拖曳到想放的位置。</p>
    <div class="row">${canDel ? `<button type="button" class="btn danger" data-act="delItem" data-id="${esc(it.id)}">刪除</button>` : ''}<button type="button" class="btn grow" data-act="editItem" data-id="${esc(it.id)}">編輯內容</button></div>`);
}

export function itemFormSheet(day, it = null, city = '') {
  const v = it || { title: '', area: '', address: '', type: 'attraction', priority: '', time: '', note: '' };
  openSheet(`${head(it ? '編輯行程' : `新增到第 ${day} 天`)}
    <div class="field"><label for="n-title">名稱</label><input class="input" id="n-title" maxlength="60" placeholder="例如：南禪寺" value="${esc(v.title)}"></div>
    <div class="grid2"><div class="field"><label for="n-type">類型</label><select class="select" id="n-type">${ITEM_TYPES.map(t => `<option value="${t}" ${t === v.type ? 'selected' : ''}>${ITEM_ICON[t]} ${ITEM_LABEL[t]}</option>`).join('')}</select></div>
      <div class="field"><label for="n-pri">優先度</label><select class="select" id="n-pri"><option value="">不設定</option>${PRIORITIES.map(p => `<option value="${p}" ${p === v.priority ? 'selected' : ''}>${PRIORITY_LABEL[p]}</option>`).join('')}</select></div></div>
    <div class="grid2"><div class="field"><label for="n-time">預約時間（有預約才填）</label><input class="input" id="n-time" type="time" value="${esc(v.time)}"></div>
      <div class="field"><label for="n-area">區域</label><input class="input" id="n-area" maxlength="20" placeholder="例如：嵐山" value="${esc(v.area)}"></div></div>
    <div class="field"><label for="n-addr">地址或 Google 地圖連結（選填）</label><input class="input" id="n-addr" maxlength="300" placeholder="沒填就用名稱和區域搜尋" value="${esc(v.address || '')}">
      <a class="linkbtn small" id="n-find" href="#" target="_blank" rel="noopener" style="justify-self:start">🔍 到 Google 地圖找，按「分享」複製連結貼回來</a></div>
    <div class="field"><label for="n-note">備註</label><input class="input" id="n-note" maxlength="200" value="${esc(v.note)}"></div>
    <button type="button" class="btn primary" data-act="saveItem" data-d="${day}" ${it ? `data-id="${esc(it.id)}"` : ''}>${it ? '儲存' : '加入行程'}</button>`);
  // 按下時才用目前填的名稱、區域組搜尋網址
  $('#n-find').addEventListener('click', ev => {
    ev.currentTarget.href = placeUrl(placeQuery({ title: $('#n-title').value.trim(), area: $('#n-area').value.trim() }, city));
  });
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
    address: $('#n-addr').value.trim(),
    note: $('#n-note').value.trim(),
  };
}
