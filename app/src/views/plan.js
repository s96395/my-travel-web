// 行程分頁：上面一排日期一次看一天，電腦版右邊是想去清單和地圖（規格書 F20–F22、U06）
import { esc, ICON, openSheet, $ } from '../ui/dom.js';
import { parseDate, toDateString, monthDay } from '../lib/dates.js';
import { tripDays } from '../lib/trips.js';
import { ITEM_TYPES, ITEM_LABEL, PRIORITIES, PRIORITY_LABEL, planDays, itemsOfDay, dayAreas, onMap, placeHref, navHref, isMapLink } from '../lib/itinerary.js';
import { nearDay, kmText } from '../lib/places.js';
import { mapsKey } from '../firebase.js';

// 行程類型的線條圖示
const ITEM_ICON = { attraction: ICON.pin, restaurant: ICON.food, cafe: ICON.cafe, shopping: ICON.shop, transport: ICON.train, stay: ICON.bed, other: ICON.note };

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
  return `<div class="item" data-iid="${esc(it.id)}" data-type="${esc(it.type)}">
    <span class="ico" role="img" aria-label="${ITEM_LABEL[it.type]}">${ITEM_ICON[it.type]}</span>
    <div class="grow" style="flex:1">
      <h4>${it.time ? `<span class="data" style="color:var(--accent)">${esc(it.time)}</span> ` : ''}${esc(it.title)}</h4>
      ${it.note ? `<p>${esc(it.note)}</p>` : ''}
      <div class="tags">${it.priority ? `<span class="tag${PRI_TAG[it.priority]}">${PRIORITY_LABEL[it.priority]}</span>` : ''}${onMap(it) && !S.offline ? (sideMap(S) && hasXY(it) ? `<button type="button" class="tag" data-act="mapFocus" data-id="${esc(it.id)}" aria-pressed="${S.mapFocus === it.id}">${ICON.pin}地圖</button>` : S.wide ? `<a class="tag" href="${esc(placeHref(it, trip.city))}" target="_blank" rel="noopener">${ICON.pin}地圖</a>` : `<a class="tag" href="${esc(navHref(it, trip.city))}" target="_blank" rel="noopener">${ICON.map}導航</a>`) : ''}</div>
    </div>
    <span class="grip" title="長按拖曳" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></span>
    <button type="button" class="more" data-act="itemMenu" data-id="${esc(it.id)}" ${S.offline ? 'disabled' : ''} aria-label="移動或編輯">⋯</button>
  </div>`;
}

// 第一次進行程分頁出現一次的小提示，按「知道了」或拖曳過一次就不再出現
const dragTip = S => (S.tipDrag || S.offline || !S.items.length ? '' : `<div class="tip" role="note"><span>長按行程（右邊有 ⋮⋮ 的那一列）就能拖曳，換順序或移到別天。</span><button type="button" class="linkbtn" data-act="tipDrag">知道了</button></div>`);

// 電腦版右半邊：「地圖｜清單」兩個分頁。地圖上想去清單和當天行程（編號）都插針，點針可加到這天或開 Google 地圖
const sideMap = S => S.wide && !S.offline;
const hasXY = p => Number.isFinite(p.lat) && Number.isFinite(p.lng);
const mapBox = (S, d) => {
  const pts = mapData(S, null).points;
  const legend = `<p class="mlegend small muted"><i class="dot day"></i>${d ? `第 ${d} 天行程` : '還沒排天數'}<i class="dot wish"></i>想去清單${pts.length ? '' : '・還沒有可以插針的地點，匯入收藏後就會出現'}</p>`;
  return legend + (mapsKey ? '<div id="mapslot" class="mapslot"></div>' : '<div class="mapslot mapempty">要設定 Google 地圖金鑰才會顯示地圖</div>');
};
function sidePane(S, trip, d) {
  const tab = S.side === 'list' ? 'list' : 'map';
  const tabs = `<div class="seg" role="tablist">${[['map', '地圖'], ['list', `想去清單 ${S.wishDocs.length || ''}`]].map(([v, t]) => `<button type="button" role="tab" data-act="side" data-v="${v}" aria-pressed="${tab === v}">${t.trim()}</button>`).join('')}</div>`;
  return `<aside class="mappane" aria-label="${tab === 'map' ? '地圖' : '想去清單'}"><div class="mapstick${tab === 'list' ? ' liststick' : ''}">
    <div class="maptop">${tabs}<span class="small muted" style="flex:1">${tab === 'list' && d && wishLeft(S, d).length ? '可以長按拖到左邊行程' : ''}</span><button type="button" class="linkbtn" data-act="importSheet">匯入收藏</button></div>
    ${tab === 'map' ? mapBox(S, d) : `<div class="wishpane">${wishPanel(S, trip, d)}</div>`}
  </div></aside>`;
}

// 給 ui/map.js 的插針資料：當天行程有座標的照順序編號，想去清單放還沒排進這天的
export function mapData(S, trip) {
  const days = trip ? dayList(S, trip) : [];
  const d = trip ? (days.includes(S.pday) ? S.pday : days[0]) : S.pday;
  const its = itemsOfDay(S.items, d);
  const points = [
    ...its.map((it, i) => ({ it, n: i + 1 })).filter(x => hasXY(x.it)).map(({ it, n }) => ({ id: it.id, kind: 'day', n, lat: it.lat, lng: it.lng, title: it.title, sub: d ? `第 ${d} 天第 ${n} 個` : '還沒排天數', url: isMapLink(it.address) ? it.address : '' })),
    ...nearDay(wishLeft(S, d), its).filter(hasXY).map(p => ({ id: 'w:' + p.id, kind: 'wish', lat: p.lat, lng: p.lng, title: p.title, sub: [d && p.km !== null ? `離第 ${d} 天行程 ${kmText(p.km)}` : '', p.note].filter(Boolean).join('・'), url: p.url, day: d })),
  ];
  return { points, fit: `${S.tripId}:${d}:${points.length}`, focus: S.mapFocus };
}

function dayItems(S, trip, d) {
  const its = itemsOfDay(S.items, d);
  const none = !S.items.length ? '<div class="empty">還沒有任何行程。可以直接新增，或先把 Google 地圖收藏的地點匯入「想去清單」，再一個個加到每天。</div>' : '<div class="empty">這天還沒有安排</div>';
  return `<div class="items">${d ? `<button type="button" class="btn sm" data-act="addItem" data-d="${d}" style="justify-self:start" ${S.offline ? 'disabled' : ''}>${ICON.plus}新增到第 ${d} 天</button>` : ''}
    ${its.map(it => itemHtml(it, S, trip)).join('') || none}
  </div>${d ? '' : moveToWish(S)}`;
}

// 想去清單：匯入的收藏地點先放這裡；還沒排進行程的依離這天行程的遠近排，按「加到第 N 天」或拖到行程裡才排進去
// 同一個地點可以排進好幾天：只藏起已排在「這一天」的（地圖上已經是行程針），排在別天的標出第幾天
const wishLeft = (S, d) => { const inDay = new Set(itemsOfDay(S.items, d).map(it => it.address).filter(Boolean)); return S.wishDocs.filter(p => !inDay.has(p.url)); };
const usedDays = S => { const m = new Map(); S.items.forEach(it => { if (it.address && it.day) m.set(it.address, [...new Set([...(m.get(it.address) || []), it.day])].sort((a, b) => a - b)); }); return m; };
function wishPanel(S, trip, d) {
  const off = S.offline ? 'disabled' : '';
  const left = wishLeft(S, d), used = usedDays(S);
  if (!S.wishDocs.length) return `<div class="tip"><span>把 Google 地圖收藏的地點匯入這裡，再一個個加到每天，名稱和位置都不會錯。</span><button type="button" class="btn sm" data-act="importSheet" ${off}>匯入 Google 地圖收藏</button></div>`;
  const count = `<p class="small muted num" style="margin:0">共 ${S.wishDocs.length} 個・已排進行程 ${S.wishDocs.filter(p => used.has(p.url)).length} 個${d && left.some(p => Number.isFinite(p.lat)) ? '・依離第 ' + d + ' 天行程的遠近排' : ''}</p>`;
  if (!left.length) return `${count}<p class="small muted" style="margin:0">清單上的地點都排進這一天了。</p>`;
  return `${count}<div class="wishes">${nearDay(left, itemsOfDay(S.items, d)).map(p => `<div class="item wrow" data-iid="w:${esc(p.id)}">
      <div class="grow"><b>${esc(p.title)}</b><span class="small muted">${[used.has(p.url) ? `已排第 ${used.get(p.url).join('、')} 天` : '', p.km !== null ? `相距 ${kmText(p.km)}` : '', p.note].filter(Boolean).map(esc).join('・')}</span></div>
      ${S.offline || !hasXY(p) ? '' : `<button type="button" class="tag" data-act="mapFocus" data-id="w:${esc(p.id)}">${ICON.pin}地圖</button>`}
      ${d ? `<button type="button" class="btn sm" data-act="wishAdd" data-id="${esc(p.id)}" data-d="${d}" ${off}>${ICON.plus}加到第 ${d} 天</button>` : ''}
      <button type="button" class="more" data-act="wishDel" data-id="${esc(p.id)}" ${off} aria-label="從想去清單移除「${esc(p.title)}」">×</button>
    </div>`).join('')}</div>`;
}

// 先前匯入時放在「還沒排天數」的收藏地點，可以一次搬到想去清單
function moveToWish(S) {
  const n = S.items.filter(it => it.day === 0 && isMapLink(it.address)).length;
  return n && !S.offline ? `<div class="tip"><span>這裡有 ${n} 個 Google 地圖地點，可以搬到想去清單，排行程時再一個個加進每天。</span><button type="button" class="btn sm" data-act="wishMove">搬到想去清單</button></div>` : '';
}

// 天數清單：1..N，再加上「還沒排天數」（有這種項目時才出現）
const dayList = (S, trip) => {
  const n = planDays(S.items, tripDays(trip));
  const list = Array.from({ length: n }, (_, i) => i + 1);
  return S.items.some(it => it.day === 0) ? [...list, 0] : list;
};

// 手機：上面一排日期，一次看一天（拖曳行程到日期上可以換天）
const WD = '日一二三四五六';
function dayPill(trip, d) {
  if (!d) return { w: '未排', n: '?' };
  if (!trip.start || d > tripDays(trip)) return { w: '', n: `D${d}` };
  const dt = parseDate(trip.start);
  dt.setDate(dt.getDate() + d - 1);
  return { w: WD[dt.getDay()], n: dt.getDate() };
}

const dayPills = (S, trip, days, sel) => `<div class="dpills" role="group" aria-label="選擇天數">${days.map(d => {
  const p = dayPill(trip, d);
  return `<button type="button" class="dpill" data-act="pday" data-d="${d}" data-dropd="${d}" ${d === sel ? 'aria-current="true"' : ''}><span>${p.w}</span><b class="num">${p.n}</b><span>${esc(d ? dayAreas(S.items, d)[0] || `第 ${d} 天` : '天數')}</span></button>`;
}).join('')}</div>`;

function planNarrow(S, trip) {
  const days = dayList(S, trip);
  const sel = days.includes(S.pday) ? S.pday : days[0];
  const idx = days.indexOf(sel), n = S.items.filter(it => it.day === sel).length;
  const wish = S.mside === 'wish' && !S.offline;
  const seg = S.offline ? '' : `<div class="seg" role="tablist" style="justify-self:start">${[['plan', '行程'], ['wish', `想去清單 ${S.wishDocs.length || ''}`]].map(([v, t]) => `<button type="button" role="tab" data-act="mside" data-v="${v}" aria-pressed="${(wish ? 'wish' : 'plan') === v}">${t.trim()}</button>`).join('')}</div>`;
  if (wish) return `${dayPills(S, trip, days, sel)}${seg}
  <section class="day wishview"><div class="wishhead"><h3>${sel ? `排進第 ${sel} 天` : '想去清單'}</h3><button type="button" class="linkbtn" data-act="importSheet">匯入收藏</button></div>${mapBox(S, sel)}${wishPanel(S, trip, sel)}</section>`;
  return `
  ${dayPills(S, trip, days, sel)}
  ${seg}
  ${dragTip(S)}
  <section class="day" id="day${sel}" data-open="true" data-dropd="${sel}">
    <div class="dayhead big"><span class="daynum">${sel ? 'D' + sel : '?'}</span><div class="grow"><h3>${esc(dayTitle(S.items, sel))}</h3><span class="small muted num">${[dayDate(trip, sel), `${n} 個地方`].filter(Boolean).join('・')}</span></div></div>
    ${dayItems(S, trip, sel)}
    <div class="row" style="justify-content:space-between"><button type="button" class="btn sm" data-act="pday" data-d="${days[idx - 1]}" ${idx <= 0 ? 'disabled' : ''}>‹ 前一天</button><button type="button" class="btn sm" data-act="pday" data-d="${days[idx + 1]}" ${idx >= days.length - 1 ? 'disabled' : ''}>後一天 ›</button></div>
  </section>`;
}

// 電腦：上面一排日期，下面左邊看那一天、右邊是地圖和想去清單
function planWide(S, trip) {
  const days = dayList(S, trip);
  const sel = days.includes(S.pday) ? S.pday : days[0];
  const idx = days.indexOf(sel), n = S.items.filter(it => it.day === sel).length;
  const side = sideMap(S) ? sidePane(S, trip, sel) : '';
  return `${dayPills(S, trip, days, sel)}
  <div class="planwide${side ? ' withmap' : ''}">
    <section class="day" id="day${sel}" data-open="true" data-dropd="${sel}">
      ${dragTip(S)}
      <div class="dayhead"><span class="daynum">${sel ? 'D' + sel : '?'}</span><div class="grow" style="flex:1;min-width:0"><h3>${esc(dayTitle(S.items, sel))}</h3><span class="small muted num">${[dayDate(trip, sel), `${n} 個地方`].filter(Boolean).join('・')}</span></div>
        <span class="row" style="gap:6px"><button type="button" class="btn sm" data-act="pday" data-d="${days[idx - 1]}" ${idx <= 0 ? 'disabled' : ''}>‹ 前一天</button><button type="button" class="btn sm" data-act="pday" data-d="${days[idx + 1]}" ${idx >= days.length - 1 ? 'disabled' : ''}>後一天 ›</button></span></div>
      ${dayItems(S, trip, sel)}
    </section>
    ${side}
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

export function itemFormSheet(day, it = null) {
  const v = it || { title: '', area: '', address: '', type: 'attraction', priority: '', time: '', note: '' };
  openSheet(`${head(it ? '編輯行程' : `新增到第 ${day} 天`)}
    <input class="namein lg" id="n-title" maxlength="60" placeholder="要去哪裡？例如：南禪寺" aria-label="名稱" value="${esc(v.title)}">
    <div class="picks" role="radiogroup" aria-label="類型">${ITEM_TYPES.map(t => `<label class="pick"><input type="radio" name="n-type" value="${t}" ${t === v.type ? 'checked' : ''}><i>${ITEM_ICON[t]}</i><span>${ITEM_LABEL[t]}</span></label>`).join('')}</div>
    <div class="field"><span class="label">優先度</span>
      <div class="chips" role="radiogroup" aria-label="優先度">${[['', '不設定'], ...PRIORITIES.map(p => [p, PRIORITY_LABEL[p]])].map(p => `<label class="chip"><input type="radio" name="n-pri" value="${p[0]}" ${p[0] === (v.priority || '') ? 'checked' : ''}>${p[1]}</label>`).join('')}</div></div>
    <div class="grid2"><div class="field"><label for="n-time">預約時間（有預約才填）</label><input class="input" id="n-time" type="time" value="${esc(v.time)}"></div>
      <div class="field"><label for="n-area">區域</label><input class="input" id="n-area" maxlength="20" placeholder="例如：嵐山" value="${esc(v.area)}"></div></div>
    <div class="field"><label for="n-addr">地址或 Google 地圖連結（選填）</label><input class="input" id="n-addr" maxlength="300" placeholder="可貼 Google 地圖分享連結；沒填就用名稱和區域搜尋" value="${esc(v.address || '')}"></div>
    <div class="field"><label for="n-note">備註</label><input class="input" id="n-note" maxlength="200" value="${esc(v.note)}"></div>
    <button type="button" class="btn primary" data-act="saveItem" data-d="${day}" ${it ? `data-id="${esc(it.id)}"` : ''}>${it ? '儲存' : '加入行程'}</button>`);
}

// 匯入 Google 地圖收藏清單（Google 匯出的「已儲存」CSV）到想去清單：先教怎麼匯出，選檔後勾要的地點
// have：網址 → { label, moveId }；已在清單或已排進某天的不能勾，放在「還沒排天數」的勾了會搬到想去清單
export function importSheet(places = null, have = new Map()) {
  const rows = (places || []).map((p, i) => {
    const h = have.get(p.url);
    return `<label class="todo"><input type="checkbox" data-imp="${i}" ${h && !h.moveId ? 'disabled' : 'checked'}>
      <span class="grow" style="flex:1">${esc(p.title)}${h ? ` <small class="muted">（${esc(h.label)}）</small>` : ''}<br><small class="muted">${esc([p.list, p.note].filter(Boolean).join('・'))}</small></span></label>`;
  }).join('');
  const n = (places || []).filter(p => !have.get(p.url) || have.get(p.url).moveId).length;
  const steps = `<ol class="steps">
      <li>用電腦打開 <a href="https://takeout.google.com/" target="_blank" rel="noopener">takeout.google.com</a>，先按「取消全部選取」，再往下找到「已儲存」打勾。</li>
      <li>拉到最下面按「下一步」，再按「建立匯出作業」。Google 會把下載連結寄到你的信箱，通常幾分鐘就會收到。</li>
      <li>下載後解壓縮，打開「Takeout」裡的「已儲存」資料夾。每個收藏清單是一個 CSV 檔，檔名就是清單名稱。</li>
      <li>按下面的按鈕選檔，可以一次選好幾個。</li>
    </ol>`;
  openSheet(`${head('匯入 Google 地圖收藏')}
    ${places ? '' : steps}
    <label class="btn${places ? '' : ' primary'}"><input type="file" id="imp-file" accept=".csv,text/csv" multiple hidden>${places ? '換其他檔案' : '選擇 CSV 檔'}</label>
    ${places ? (rows ? `<div style="max-height:45vh;overflow:auto">${rows}</div>` : '<div class="empty">檔案裡沒有地點</div>') : ''}
    ${places ? `<button type="button" class="btn primary" data-act="doImport" ${n ? '' : 'disabled'}>加入想去清單</button>` : ''}`);
}

// 讀表單；名稱空白時標示欄位並回傳 null
export function readItemForm() {
  const t = $('#n-title');
  if (!t.value.trim()) { t.classList.add('err'); t.focus(); return null; }
  return {
    title: t.value.trim(),
    type: $('input[name="n-type"]:checked')?.value || 'other',
    priority: $('input[name="n-pri"]:checked')?.value || '',
    reservationTime: $('#n-time').value,
    area: $('#n-area').value.trim(),
    address: $('#n-addr').value.trim(),
    note: $('#n-note').value.trim(),
  };
}
