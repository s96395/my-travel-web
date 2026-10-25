// 行程分頁：上面一排日期一次看一天，電腦版右邊是想去清單和地圖（規格書 F20–F22、U06）
import { esc, ICON, openSheet, $, money } from '../ui/dom.js';
import { parseDate, toDateString, monthDay, todayString } from '../lib/dates.js';
import { amountOf } from '../lib/expenses.js';
import { dayEvents, buildDay, nowIndex, hmOf } from '../lib/timeline.js';
import { allFlights, allStays } from './move.js';
import { tripDays } from '../lib/trips.js';
import { ITEM_TYPES, ITEM_LABEL, PRIORITIES, PRIORITY_LABEL, planDays, itemsOfDay, dayAreas, onMap, placeHref, navHref, isMapLink, groupByArea, areaColors, NO_AREA_COLOR, STAY_MINS, stayText } from '../lib/itinerary.js';
import { nearDay, kmText } from '../lib/places.js';
import { mapsKey } from '../firebase.js';

// 行程類型的線條圖示
const ITEM_ICON = { attraction: ICON.pin, restaurant: ICON.food, cafe: ICON.cafe, shopping: ICON.shop, transport: ICON.train, stay: ICON.bed, other: ICON.note };

const head = title => `<div class="head"><h2>${title}</h2><button type="button" class="iconbtn" data-act="close" aria-label="關閉">×</button></div>`;
const PRI_TAG = { must: ' bad', want: ' accent', optional: '' };

// 第 d 天的日期字串（2026-11-20）；超出旅程日期或沒設日期時是空的
function dayIso(trip, d) {
  if (!d || !trip.start || d > tripDays(trip)) return '';
  const dt = parseDate(trip.start);
  dt.setDate(dt.getDate() + d - 1);
  return toDateString(dt);
}
function dayDate(trip, d) {
  if (!d || !trip.start || d > tripDays(trip)) return '';
  const dt = parseDate(trip.start);
  dt.setDate(dt.getDate() + d - 1);
  return monthDay(toDateString(dt));
}
// 加到第幾天的下拉選單：預設選目前看的那天（看「還沒排天數」時預設第 1 天）
export const dayOpts = (S, trip, sel) => dayList(S, trip).filter(Boolean).map(n => `<option value="${n}" ${n === (sel || 1) ? 'selected' : ''}>第 ${n} 天${dayDate(trip, n) ? ' ' + dayDate(trip, n).replace(/（.*）/, '') : ''}</option>`).join('');
const daySel = (S, trip, d, off) => `<select class="daysel" aria-label="加到第幾天" ${off}>${dayOpts(S, trip, d)}</select>`;
const dayTitle = (items, d) => (d === 0 ? '還沒排天數' : dayAreas(items, d).join('・') || `第 ${d} 天`);

// 時間軸上的一站：類型圓形圖示、時間、名稱，下面是停留多久與備註
function itemHtml(it, S, trip, r = {}) {
  const when = it.time ? `<span class="data" style="color:var(--accent)">${esc(it.time)}</span> ` : r.est ? `<span class="data est" title="依前一站時間加停留推算">約 ${hmOf(r.at)}</span> ` : '';
  const sub = [it.stay ? `停留 ${stayText(it.stay)}` : '', it.note].filter(Boolean).map(esc).join('・');
  return `<div class="item" data-iid="${esc(it.id)}" data-type="${esc(it.type)}">
    <span class="ico" role="img" aria-label="${ITEM_LABEL[it.type]}">${ITEM_ICON[it.type]}</span>
    <div class="grow" style="flex:1">
      <h4>${when}${esc(it.title)}</h4>
      ${sub ? `<p>${sub}</p>` : ''}
      <div class="tags">${r.late ? '<span class="tag bad">前面排太滿，可能來不及</span>' : ''}${it.priority ? `<span class="tag${PRI_TAG[it.priority]}">${PRIORITY_LABEL[it.priority]}</span>` : ''}${onMap(it) && !S.offline ? (sideMap(S) && hasXY(it) ? `<button type="button" class="tag" data-act="mapFocus" data-id="${esc(it.id)}" aria-pressed="${S.mapFocus === it.id}">${ICON.pin}地圖</button>` : S.wide ? `<a class="tag" href="${esc(placeHref(it, trip.city))}" target="_blank" rel="noopener">${ICON.pin}地圖</a>` : `<a class="tag" href="${esc(navHref(it, trip.city))}" target="_blank" rel="noopener">${ICON.map}導航</a>`) : ''}</div>
    </div>
    <span class="grip" title="長按拖曳" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></span>
    <button type="button" class="more" data-act="itemMenu" data-id="${esc(it.id)}" ${S.offline ? 'disabled' : ''} aria-label="移動或編輯">⋯</button>
  </div>`;
}

// 電腦版右半邊：「地圖｜清單」兩個分頁。地圖上想去清單和當天行程（編號）都插針，點針可加到這天或開 Google 地圖
const sideMap = S => S.wide && !S.offline;
const hasXY = p => Number.isFinite(p.lat) && Number.isFinite(p.lng);
const mapBox = (S, d) => {
  const pts = mapData(S, null).points;
  const none = !S.wishDocs.length;
  const colors = areaColors(S.wishDocs);
  const shown = [...new Set(pts.filter(p => p.kind === 'wish').map(p => p.area))];
  // 有分區域時，說明列出地圖上每個區域的顏色
  const wishKey = colors.size ? shown.sort((a, b) => !a - !b).map(a => `<i class="dot wish" style="background:${a ? colors.get(a) : NO_AREA_COLOR}"></i>${a ? esc(a) : '還沒分區域'}`).join('') : '<i class="dot wish"></i>想去清單';
  const only = S.mapArea ? `・只看「${esc(S.mapArea)}」<button type="button" class="linkbtn" data-act="mapArea" data-area="">看全部</button>` : '';
  const legend = `<p class="mlegend small muted"><i class="dot day"></i>${d ? `第 ${d} 天行程` : '還沒排天數'}${wishKey}${only}${pts.length || none ? '' : '・還沒有可以插針的地點'}</p>`;
  // 還沒匯入過收藏時，地圖上直接放一張說明卡，一眼就知道可以先匯入再排；已有行程針時移到下方，不擋住針
  const cta = none && !S.offline ? `<div class="mapcta${pts.length ? ' low' : ''}"><b>先把 Google 地圖收藏匯進來</b><span class="small">收藏的地點會插在地圖上，看得出彼此多遠，點一下就能排進行程。</span><button type="button" class="btn primary" data-act="importSheet">${ICON.plus}匯入 Google 地圖收藏</button></div>` : '';
  return legend + `<div class="mapwrap">${mapsKey ? '<div id="mapslot" class="mapslot"></div>' : '<div class="mapslot mapempty">要設定 Google 地圖金鑰才會顯示地圖</div>'}${cta}</div>`;
};
function sidePane(S, trip, d) {
  const tab = S.side === 'list' ? 'list' : 'map';
  const tabs = `<div class="seg" role="tablist">${[['map', '地圖'], ['list', `想去清單 ${S.wishDocs.length || ''}`]].map(([v, t]) => `<button type="button" role="tab" data-act="side" data-v="${v}" aria-pressed="${tab === v}">${t.trim()}</button>`).join('')}</div>`;
  return `<aside class="mappane" aria-label="${tab === 'map' ? '地圖' : '想去清單'}"><div class="mapstick${tab === 'list' ? ' liststick' : ''}">
    <div class="maptop">${tabs}<span class="small muted" style="flex:1">${tab === 'list' && d && wishLeft(S, d).length ? '可以長按拖到左邊行程' : ''}</span><button type="button" class="btn sm" data-act="importSheet">${ICON.plus}匯入收藏</button></div>
    ${tab === 'map' ? mapBox(S, d) : `<div class="wishpane">${wishPanel(S, trip, d)}</div>`}
  </div></aside>`;
}

// 給 ui/map.js 的插針資料：當天行程有座標的照順序編號，想去清單放還沒排進這天的
export function mapData(S, trip) {
  const colors = areaColors(S.wishDocs);
  const days = trip ? dayList(S, trip) : [];
  const d = trip ? (days.includes(S.pday) ? S.pday : days[0]) : S.pday;
  const its = itemsOfDay(S.items, d);
  const points = [
    ...its.map((it, i) => ({ it, n: i + 1 })).filter(x => hasXY(x.it)).map(({ it, n }) => ({ id: it.id, kind: 'day', n, lat: it.lat, lng: it.lng, title: it.title, sub: d ? `第 ${d} 天第 ${n} 個` : '還沒排天數', url: isMapLink(it.address) ? it.address : '' })),
    ...nearDay(wishLeft(S, d).filter(p => !S.mapArea || p.area === S.mapArea), its).filter(hasXY).map(p => ({ id: 'w:' + p.id, kind: 'wish', lat: p.lat, lng: p.lng, title: p.title, sub: [d && p.km !== null ? `離第 ${d} 天行程 ${kmText(p.km)}` : '', p.note].filter(Boolean).join('・'), url: p.url, opts: trip ? dayOpts(S, trip, d) : '', area: p.area || '', color: colors.get(p.area) || NO_AREA_COLOR })),
  ];
  return { points, fit: `${S.tripId}:${d}:${S.mapArea}:${points.length}`, focus: S.mapFocus };
}

// 交通住宿分頁的班機、交通、入住退房，自動排進時間軸；點了到交通住宿分頁看詳細
const EV_ICON = { flight: ICON.plane, transit: ICON.train, in: ICON.bed, out: ICON.bed };
const eventHtml = r => `<button type="button" class="item auto" data-act="tab" data-v="move" data-type="${r.kind === 'in' || r.kind === 'out' ? 'stay' : 'transport'}">
    <span class="ico" aria-hidden="true">${EV_ICON[r.kind]}</span>
    <div class="grow" style="flex:1"><h4>${r.at !== null ? `<span class="data" style="color:var(--accent)">${hmOf(r.at)}</span> ` : ''}${esc(r.title)}</h4>${r.sub ? `<p>${esc(r.sub)}</p>` : ''}</div>
    <span class="tag">交通住宿</span>
  </button>`;
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

function dayItems(S, trip, d) {
  const its = itemsOfDay(S.items, d), date = dayIso(trip, d);
  const rows = d ? buildDay(its, dayEvents(date, { flights: allFlights(S, trip), transits: S.transitDocs, stays: allStays(S, trip) }, its)) : its.map(it => ({ kind: 'item', it, at: null }));
  // 旅途中看今天：在時間已經過了的最後一站後面畫一條「現在」
  const now = date && date === todayString() ? nowIndex(rows, nowMin()) : -1;
  const nowLine = `<div class="nowline" role="note"><span class="data">現在 ${hmOf(nowMin())}</span></div>`;
  const none = !S.items.length ? '<div class="empty">還沒有行程，按右下角 ＋ 新增</div>' : '<div class="empty">這天還沒有安排</div>';
  let n = -1;
  const html = rows.map((r, k) => (k === now ? nowLine : '') + (r.kind === 'item' ? (n++, (d && areaLine(S, its, n) || '') + itemHtml(r.it, S, trip, r)) : eventHtml(r))).join('');
  return `<div class="items">
    ${html ? html + (now === rows.length ? nowLine : '') : none}
  </div>${d ? '' : moveToWish(S)}`;
}

// 天數標題下面那行：日期、幾個地方、那天記了多少錢；出發前在第 1 天提醒還有幾件待辦
function dayMeta(S, trip, d, n) {
  const date = dayIso(trip, d);
  const spent = date ? (S.expenses.get(S.tripId) || []).filter(e => e.createdAt?.toDate && todayString(e.createdAt.toDate()) === date).reduce((s, e) => s + amountOf(e), 0) : 0;
  const left = d === 1 && trip.start && todayString() < trip.start ? S.todoDocs.filter(t => !t.done).length : 0;
  return [dayDate(trip, d), `${n} 個地方`, spent ? `花費 NT$${money(spent)}` : ''].filter(Boolean).join('・')
    + (left ? `・<button type="button" class="linkbtn" data-act="tab" data-v="todo">待辦還有 ${left} 件</button>` : '');
}

// 一天跑好幾個區域時，在每段區域前面標出區域名稱，可以整區移到別天
function areaLine(S, its, i) {
  const a = its[i].area;
  if (!a || its[i - 1]?.area === a || new Set(its.map(x => x.area).filter(Boolean)).size < 2) return '';
  return `<div class="arealine"><b>${esc(a)}</b>${S.offline ? '' : `<button type="button" class="linkbtn" data-act="areaMove" data-area="${esc(a)}" data-d="${its[i].day}">整區移到別天</button>`}</div>`;
}

// 想去清單：匯入的收藏地點先放這裡；還沒排進行程的依離這天行程的遠近排，按「加到第 N 天」或拖到行程裡才排進去
// 同一個地點可以排進好幾天：只藏起已排在「這一天」的（地圖上已經是行程針），排在別天的標出第幾天
export const wishLeft = (S, d) => { const inDay = new Set(itemsOfDay(S.items, d).map(it => it.address).filter(Boolean)); return S.wishDocs.filter(p => !inDay.has(p.url)); };
const usedDays = S => { const m = new Map(); S.items.forEach(it => { if (it.address && it.day) m.set(it.address, [...new Set([...(m.get(it.address) || []), it.day])].sort((a, b) => a - b)); }); return m; };
function wishPanel(S, trip, d) {
  const off = S.offline ? 'disabled' : '';
  const left = wishLeft(S, d), used = usedDays(S);
  if (!S.wishDocs.length) return `<div class="tip"><span>把 Google 地圖收藏的地點匯入這裡，再一個個加到每天，名稱和位置都不會錯。</span><button type="button" class="btn sm" data-act="importSheet" ${off}>匯入 Google 地圖收藏</button></div>`;
  const count = `<p class="small muted num" style="margin:0">共 ${S.wishDocs.length} 個・已排進行程 ${S.wishDocs.filter(p => used.has(p.url)).length} 個${d && left.some(p => Number.isFinite(p.lat)) ? '・依離第 ' + d + ' 天行程的遠近排' : ''}</p>`;
  if (!left.length) return `${count}<p class="small muted" style="margin:0">清單上的地點都排進這一天了。</p>`;
  const groups = groupByArea(nearDay(left, itemsOfDay(S.items, d))), colors = areaColors(S.wishDocs);
  const named = groups.some(g => g.area);
  const row = p => `<div class="item wrow" data-iid="w:${esc(p.id)}">
      <div class="grow"><b>${esc(p.title)}</b><span class="small muted">${[used.has(p.url) ? `已排第 ${used.get(p.url).join('、')} 天` : '', p.km !== null ? `相距 ${kmText(p.km)}` : '', p.note].filter(Boolean).map(esc).join('・')}</span></div>
      ${S.offline || !hasXY(p) ? '' : `<button type="button" class="tag" data-act="mapFocus" data-id="w:${esc(p.id)}">${ICON.pin}地圖</button>`}
      <span class="addto">${daySel(S, trip, d, off)}<button type="button" class="btn sm" data-act="wishAdd" data-id="${esc(p.id)}" ${off}>${ICON.plus}加入</button></span>
      <button type="button" class="more" data-act="wishDel" data-id="${esc(p.id)}" ${off} aria-label="從想去清單移除「${esc(p.title)}」">×</button>
    </div>`;
  const addArea = `<span class="row" style="gap:6px;flex:none">${groups.some(g => !g.area && g.places.length > 1) ? `<button type="button" class="btn sm" data-act="areaNear" ${off}>依距離分組</button>` : ''}<button type="button" class="btn sm" data-act="areaSheet" data-area="" ${off}>${ICON.plus}新增區域</button></span>`;
  if (!named) return `${count}<div class="tip"><span>可以把附近的地點分成一個區域（例如地鐵站「尖沙咀」），之後整區一次排進某一天。也可以按「依距離分組」，把 1 公里內的地點自動放在一起。</span>${addArea}</div><div class="wishes">${left.length ? groups[0].places.map(row).join('') : ''}</div>`;
  return `<div class="wishtop">${count}${addArea}</div>${groups.map(g => {
    const a = esc(g.area);
    return `<section class="wgroup${g.area ? '' : ' none'}"><div class="wghead">
      <div class="grow"><i class="dot" style="background:${colors.get(g.area) || NO_AREA_COLOR}" aria-hidden="true"></i><b>${g.area ? a : '還沒分區域'}</b><span class="small muted num">${g.places.length} 個地點</span></div>
      ${g.area && !S.offline && g.places.some(hasXY) ? `<button type="button" class="tag" data-act="mapArea" data-area="${a}" aria-pressed="${S.mapArea === g.area}">${ICON.pin}地圖看這區</button>` : ''}
      ${g.area ? `<span class="addto">${daySel(S, trip, d, off)}<button type="button" class="btn sm primary" data-act="areaAdd" data-area="${a}" ${off}>${ICON.plus}整區加入</button></span>` : ''}
      ${g.area ? `<button type="button" class="more" data-act="areaSheet" data-area="${a}" ${off} aria-label="編輯區域「${a}」">⋯</button>` : ''}
    </div><div class="wishes">${g.places.map(row).join('')}</div></section>`;
  }).join('')}`;
}

// 先前匯入時放在「還沒排天數」的收藏地點，可以一次搬到想去清單
function moveToWish(S) {
  const n = S.items.filter(it => it.day === 0 && isMapLink(it.address)).length;
  return n && !S.offline ? `<div class="tip"><span>這裡有 ${n} 個 Google 地圖地點，可以搬到想去清單，排行程時再一個個加進每天。</span><button type="button" class="btn sm" data-act="wishMove">搬到想去清單</button></div>` : '';
}

// 右下角的「＋」：點開選自己輸入、從想去清單挑、或匯入 Google 地圖收藏
function addFab(S, d) {
  if (S.offline) return '';
  const wish = S.wide ? 'data-act="side" data-v="list"' : 'data-act="mside" data-v="wish"';
  return `<details class="addfab"><summary aria-label="新增景點">${ICON.plus}</summary><div class="fabmenu">
    <button type="button" data-act="addItem" data-d="${d || 1}">${ICON.note}自己輸入</button>
    <button type="button" ${wish}>${ICON.pin}從想去清單選</button>
    <button type="button" data-act="importSheet">${ICON.map}匯入 Google 地圖收藏</button>
  </div></details>`;
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
  <section class="day wishview"><div class="wishhead"><h3>${sel ? `排進第 ${sel} 天` : '想去清單'}</h3><button type="button" class="btn sm" data-act="importSheet">${ICON.plus}匯入收藏</button></div>${mapBox(S, sel)}${S.wishDocs.length ? wishPanel(S, trip, sel) : ''}</section>`;
  return `
  ${dayPills(S, trip, days, sel)}
  ${seg}
  <section class="day" id="day${sel}" data-open="true" data-dropd="${sel}">
    <div class="dayhead big"><span class="daynum">${sel ? 'D' + sel : '?'}</span><div class="grow"><h3>${esc(dayTitle(S.items, sel))}</h3><span class="small muted num">${dayMeta(S, trip, sel, n)}</span></div></div>
    ${dayItems(S, trip, sel)}
    <div class="row" style="justify-content:space-between"><button type="button" class="btn sm" data-act="pday" data-d="${days[idx - 1]}" ${idx <= 0 ? 'disabled' : ''}>‹ 前一天</button><button type="button" class="btn sm" data-act="pday" data-d="${days[idx + 1]}" ${idx >= days.length - 1 ? 'disabled' : ''}>後一天 ›</button></div>
  </section>
  ${addFab(S, sel)}`;
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
      <div class="dayhead"><span class="daynum">${sel ? 'D' + sel : '?'}</span><div class="grow" style="flex:1;min-width:0"><h3>${esc(dayTitle(S.items, sel))}</h3><span class="small muted num">${dayMeta(S, trip, sel, n)}</span></div>
        <span class="row" style="gap:6px"><button type="button" class="btn sm" data-act="pday" data-d="${days[idx - 1]}" ${idx <= 0 ? 'disabled' : ''}>‹ 前一天</button><button type="button" class="btn sm" data-act="pday" data-d="${days[idx + 1]}" ${idx >= days.length - 1 ? 'disabled' : ''}>後一天 ›</button></span></div>
      ${dayItems(S, trip, sel)}
    </section>
    ${side}
  </div>
  ${addFab(S, sel)}`;
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
    ${areaChips(S, days, it)}
    <div class="row">${canDel ? `<button type="button" class="btn danger" data-act="delItem" data-id="${esc(it.id)}">刪除</button>` : ''}<button type="button" class="btn grow" data-act="editItem" data-id="${esc(it.id)}">編輯內容</button></div>`);
}

// 同一天有其他同區域的行程時，可以整個區域一起移
function areaChips(S, days, it) {
  const n = it.area ? S.items.filter(x => x.day === it.day && x.area === it.area).length : 0;
  if (n < 2) return '';
  return `<p class="label">整個「${esc(it.area)}」${n} 個一起移</p>
    <div class="chips" style="flex-wrap:wrap">${days.map(d => `<button type="button" class="chip" data-act="moveArea" data-area="${esc(it.area)}" data-from="${it.day}" data-d="${d}" aria-pressed="${it.day === d}">第 ${d} 天</button>`).join('')}</div>`;
}
export function areaMoveSheet(S, trip, area, from) {
  const days = dayList(S, trip).filter(Boolean), n = S.items.filter(x => x.day === from && x.area === area).length;
  openSheet(`${head(`「${esc(area)}」移到第幾天`)}
    <p class="small muted" style="margin:0">這天「${esc(area)}」的 ${n} 個行程會照原本順序，一起排到那一天的最後。</p>
    <div class="chips" style="flex-wrap:wrap">${days.map(d => `<button type="button" class="chip" data-act="moveArea" data-area="${esc(area)}" data-from="${from}" data-d="${d}" aria-pressed="${from === d}">第 ${d} 天</button>`).join('')}</div>`);
}

// 新增或編輯區域：取名字，再勾哪些想去清單的地點放在這區；已在這區的排最前面，其次是還沒分區域的
export function areaSheet(S, area = '') {
  const rank = p => (area && p.area === area ? 0 : p.area ? 2 : 1);
  const list = S.wishDocs.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(x => x.p);
  openSheet(`${head(area ? '編輯區域' : '新增區域')}
    <input class="namein lg" id="a-name" maxlength="20" placeholder="區域名稱，例如：尖沙咀" aria-label="區域名稱" value="${esc(area)}">
    <p class="label">勾選放在這區的地點</p>
    <div style="max-height:45vh;overflow:auto">${list.map(p => `<label class="todo"><input type="checkbox" data-apick="${esc(p.id)}" ${area && p.area === area ? 'checked' : ''}>
      <span class="grow" style="flex:1">${esc(p.title)}${p.area && p.area !== area ? ` <small class="muted">（目前在「${esc(p.area)}」）</small>` : ''}</span></label>`).join('')}</div>
    <div class="row">${area ? `<button type="button" class="btn" data-act="areaSave" data-area="${esc(area)}" data-drop="1">取消這個區域</button>` : ''}<button type="button" class="btn primary grow" data-act="areaSave" data-area="${esc(area)}">儲存</button></div>`);
}

export function itemFormSheet(day, it = null) {
  const v = it || { title: '', area: '', address: '', type: 'attraction', priority: '', time: '', stay: 0, note: '' };
  openSheet(`${head(it ? '編輯行程' : `新增到第 ${day} 天`)}
    <input class="namein lg" id="n-title" maxlength="60" placeholder="要去哪裡？例如：南禪寺" aria-label="名稱" value="${esc(v.title)}">
    <div class="picks" role="radiogroup" aria-label="類型">${ITEM_TYPES.map(t => `<label class="pick"><input type="radio" name="n-type" value="${t}" ${t === v.type ? 'checked' : ''}><i>${ITEM_ICON[t]}</i><span>${ITEM_LABEL[t]}</span></label>`).join('')}</div>
    <div class="field"><span class="label">優先度</span>
      <div class="chips" role="radiogroup" aria-label="優先度">${[['', '不設定'], ...PRIORITIES.map(p => [p, PRIORITY_LABEL[p]])].map(p => `<label class="chip"><input type="radio" name="n-pri" value="${p[0]}" ${p[0] === (v.priority || '') ? 'checked' : ''}>${p[1]}</label>`).join('')}</div></div>
    <div class="grid2"><div class="field"><label for="n-time">幾點到</label><input class="input" id="n-time" type="time" value="${esc(v.time)}"></div>
      <div class="field"><label for="n-stay">停留多久</label><select class="input" id="n-stay"><option value="0">不設定</option>${STAY_MINS.map(m => `<option value="${m}" ${m === v.stay ? 'selected' : ''}>${stayText(m)}</option>`).join('')}</select></div></div>
    <div class="field"><label for="n-area">區域</label><input class="input" id="n-area" maxlength="20" placeholder="例如：嵐山" value="${esc(v.area)}"></div>
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
    ${places && n ? areaPick(places) : ''}
    ${places ? `<button type="button" class="btn primary" data-act="doImport" ${n ? '' : 'disabled'}>加入想去清單</button>` : ''}`);
}

// 匯入時順便分區域：用收藏清單的名稱（一個 CSV 一區），或依距離自動分組
function areaPick(places) {
  const lists = [...new Set(places.map(p => p.list).filter(Boolean))];
  const opts = [['', '先不分'], ['list', '用清單名稱'], ['near', '依距離分組']];
  const def = lists.length ? 'list' : '';
  return `<div class="field"><span class="label">放進區域</span>
    <div class="chips" role="radiogroup" aria-label="放進區域" style="flex-wrap:wrap">${opts.map(([v, t]) => `<label class="chip"><input type="radio" name="imp-area" value="${v}" ${v === def ? 'checked' : ''}>${t}</label>`).join('')}</div>
    <span class="small muted">用清單名稱：${lists.length ? lists.map(l => `「${esc(l)}」`).join('、') + ' 各成一區' : '這批檔案沒有清單名稱'}。依距離分組：查好位置後，把 1 公里內的地點放在一起，名稱之後可以改。</span></div>`;
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
    stay: +$('#n-stay').value || 0,
    area: $('#n-area').value.trim(),
    address: $('#n-addr').value.trim(),
    note: $('#n-note').value.trim(),
  };
}
