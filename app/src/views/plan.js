// 行程分頁：上面一排日期一次看一天，電腦版右邊是想去清單和地圖（規格書 F20–F22、U06）
import { esc, ICON, openSheet, $, money } from '../ui/dom.js';
import { normTime } from '../lib/time24.js';
import { parseDate, toDateString, monthDay, todayString } from '../lib/dates.js';
import { amountOf } from '../lib/expenses.js';
import { dayEvents, buildDay, nowIndex, hmOf } from '../lib/timeline.js';
import { allFlights, allStays } from './move.js';
import { tripDays } from '../lib/trips.js';
import { ITEM_TYPES, ITEM_LABEL, PRIORITIES, PRIORITY_LABEL, planDays, itemsOfDay, dayAreas, onMap, placeHref, navHref, isMapLink, inKorea, naverHref, mapName, groupByArea, sameName, STAY_MINS, stayText, rankDays, backupsOf } from '../lib/itinerary.js';
import { nearDay, kmText, distanceKm, farOff } from '../lib/places.js';
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
const dayTitle = (items, d) => (d === 0 ? '還沒排天數' : dayAreas(items, d).join('・') || `第 ${d} 天`);
// 「幾個地方」只算真的要去的站：區域卡片是分組標題、備案掛在別站下面，都不算
const stopCount = (S, d) => itemsOfDay(S.items, d).filter(it => it.kind !== 'area').length;

// 時間：填了幾點就顯示幾點；沒有時顯示自己寫的時段（午餐、看完夕陽後）；都沒有才用推算的大約時間
const whenOf = (it, r) => (it.time ? `<span class="data" style="color:var(--accent)">${esc(it.time)}</span> `
  : it.timeText ? `<span class="whentxt">${esc(it.timeText)}</span> `
    : r.est ? `<span class="data est" title="依前一站時間加停留推算">約 ${hmOf(r.at)}</span> ` : '');

// 掛在這站下面的備案：不排進時間軸，寫什麼時候要改去
function backupRows(S, trip, it) {
  const list = backupsOf(S.items, it.id);
  if (!list.length) return '';
  return `<div class="bkbox">${list.map(b => `<div class="bkrow">
      <span class="grow"><b><span class="tag warn">備案</span> ${esc(b.title)}</b>${[b.backupWhen, b.tip].filter(Boolean).length ? `<small class="muted">${[b.backupWhen, b.tip].filter(Boolean).map(esc).join('・')}</small>` : ''}</span>
      ${onMap(b) && !S.offline && !S.wide ? `<a class="tag" href="${esc(navHref(b, trip.city, trip.country))}" target="_blank" rel="noopener">${ICON.map}導航</a>` : ''}
      <button type="button" class="more" data-act="itemMenu" data-id="${esc(b.id)}" ${S.offline ? 'disabled' : ''} aria-label="編輯備案「${esc(b.title)}」">⋯</button>
    </div>`).join('')}</div>`;
}

// 備註和名稱是同一個地方（匯入時把原本的店名存進備註）就不再顯示一次
const noteOf = p => (p.note && !sameName(p.note, p.title) && !String(p.title).includes(p.note) ? p.note : '');

// 時間軸上的一站：類型圓形圖示、時間、名稱，下面是停留多久與備註
function itemHtml(it, S, trip, r = {}) {
  if (it.kind === 'area') return areaCard(it, S, trip, r);
  const when = whenOf(it, r), note = noteOf(it);
  const sub = it.stay ? `停留 ${stayText(it.stay)}` : '';
  return `<div class="item" data-iid="${esc(it.id)}" data-type="${esc(it.type)}">
    ${r.pin ? `<button type="button" class="ico pinno" data-act="mapFocus" data-id="${esc(it.id)}" aria-pressed="${S.mapFocus === it.id}" aria-label="地圖上第 ${r.pin} 個，按一下在地圖上看">${r.pin}</button>` : `<span class="ico" role="img" aria-label="${ITEM_LABEL[it.type]}">${ITEM_ICON[it.type]}</span>`}
    <div class="grow" style="flex:1">
      <h4>${when}${sideMap(S) && hasXY(it) && !S.offline ? `<button type="button" class="wname" data-act="mapFocus" data-id="${esc(it.id)}" title="在地圖上看">${esc(it.title)}</button>` : esc(it.title)}</h4>
      ${it.tip ? `<p class="itip">${esc(it.tip)}</p>` : ''}
      ${sub ? `<p>${esc(sub)}</p>` : ''}
      ${note ? `<details class="inote"><summary>備註</summary><p>${esc(note)}</p></details>` : ''}
      <div class="tags">${r.late ? '<span class="tag bad">前面排太滿，可能來不及</span>' : ''}${it.priority === 'must' ? `<span class="tag${PRI_TAG.must}">${PRIORITY_LABEL.must}</span>` : ''}${onMap(it) && !S.offline ? (S.wide && sideMap(S) && hasXY(it) ? '' : S.wide ? `<a class="tag" href="${esc(placeHref(it, trip.city, trip.country))}" target="_blank" rel="noopener">${ICON.pin}地圖</a>` : `<a class="tag" href="${esc(navHref(it, trip.city, trip.country))}" target="_blank" rel="noopener">${ICON.map}導航</a>`) : S.offline ? drvLink('day', it.id, 'tag') : ''}</div>
      ${backupRows(S, trip, it)}
    </div>
    <span class="grip" title="長按拖曳" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></span>
    <button type="button" class="more" data-act="itemMenu" data-id="${esc(it.id)}" ${S.offline ? 'disabled' : ''} aria-label="移動或編輯">⋯</button>
  </div>`;
}

// 區域卡片：一個區域在時間軸上只佔一張卡，展開看這區想去清單的地點，按「加入」才排進時間軸
const GRIP = '<span class="grip" title="長按拖曳" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></span>';
const inDayOf = (S, d, p) => S.items.some(it => it.day === d && it.kind !== 'area' && ((p.url && it.address === p.url) || sameName(it.title, p.title)));
// 步行時間用直線距離粗估：路會繞，乘 1.3；每小時走 4.5 公里
const walkMin = km => Math.max(1, Math.round(km * 1.3 / 4.5 * 60));
const NEAR_KM = 20;
const OPEN_TAG = { true: '<span class="tag good">營業中</span>', false: '<span class="tag">已打烊</span>', gone: '<span class="tag bad">已歇業</span>' };
function areaCard(it, S, trip, r) {
  const d = it.day, here = S.here;
  let places = it.area ? S.wishDocs.filter(p => p.area === it.area) : [];
  const must = places.filter(p => inDayOf(S, d, p)).length;
  const open = !!S.areaOpen?.[it.id], off = S.offline ? 'disabled' : '';
  // 附近模式：照離我多遠排，逛過的放最後
  // 人不在當地（離這個點超過 20 公里）時，距離和步行時間沒有意義，不顯示也不拿來排
  const km = p => { const k = here && hasXY(p) ? distanceKm(here, p) : null; return k !== null && k <= NEAR_KM ? k : null; };
  const away = here && places.some(hasXY) && !places.some(p => km(p) !== null);
  if (here) places = [...places].sort((a, b) => !!a.visited - !!b.visited || (km(a) ?? Infinity) - (km(b) ?? Infinity));
  const when = whenOf(it, r);
  const seen = places.filter(p => p.visited).length;
  const sub = [places.length ? `${places.length} 個點` : '這區還沒有地點', must ? `${must} 個排進時間軸` : '', seen ? `逛過 ${seen} 個` : '', it.note].filter(Boolean).map(esc).join('・');
  const row = p => {
    const done = inDayOf(S, d, p), k = km(p), h = here ? S.hours?.get(p.id) : undefined;
    const info = [k !== null ? `${kmText(k)}・步行約 ${walkMin(k)} 分` : '', noteOf(p)].filter(Boolean).map(esc).join('・');
    return `<li class="aplace${done ? ' done' : ''}${p.visited ? ' seen' : ''}">
      <button type="button" class="seenbox" data-act="wishSeen" data-id="${esc(p.id)}" aria-pressed="${!!p.visited}" ${off} aria-label="${p.visited ? '取消逛過' : '標成逛過'}「${esc(p.title)}」">${p.visited ? '✓' : ''}</button>
      <span class="grow">${sideMap(S) && hasXY(p) ? `<button type="button" class="wname" data-act="mapFocus" data-id="w:${esc(p.id)}" title="在地圖上看">${esc(p.title)}</button>` : esc(p.title)}${info || OPEN_TAG[h] ? `<small class="muted">${info}${OPEN_TAG[h] ? ' ' + OPEN_TAG[h] : ''}</small>` : ''}</span>
      ${!S.wide && k !== null ? `<a class="tag" href="${esc(inKorea(p) ? naverHref(p, p.title, 'walk') : `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${p.lat},${p.lng}`)}" target="_blank" rel="noopener">${ICON.map}導航</a>` : ''}
      ${done ? '<span class="tag accent">已加入</span>' : `<button type="button" class="tag" data-act="areaMust" data-id="${esc(it.id)}" data-wid="${esc(p.id)}" ${off}>${ICON.plus}加入</button>`}</li>`;
  };
  const nearBtn = S.offline || !places.some(hasXY) ? '' : `<button type="button" class="tag${here ? ' accent' : ''}" data-act="nearMe" aria-pressed="${!!here}">${ICON.pin}${here ? '附近模式（按一下關閉）' : '我在附近'}</button>`;
  const nearNote = here ? `<p class="small muted" style="margin:6px 0 0">${away ? '你現在不在這一帶。' : '依直線距離排，逛過的排最後。'}<button type="button" class="linkbtn" data-act="nearMe" data-again="1">重新定位</button></p>` : '';
  // 區域在時間軸上是分組標題（不是一站、不編號），下面接著排這區真的要去的地方
  return `<div class="item areacard" data-iid="${esc(it.id)}" data-type="area" role="group" aria-label="區域：${esc(it.title)}">
    <div class="grow" style="flex:1">
      <h4><span class="arealabel">區域</span>${when}${sideMap(S) && places.some(hasXY) && !S.offline ? `<button type="button" class="wname" data-act="areaMap" data-area="${esc(it.area)}" aria-pressed="${S.mapArea === it.area}" title="地圖只看這區">${esc(it.title)}</button>` : esc(it.title)}</h4>
      <p>${sub}</p>
      <div class="tags">${places.length ? `<button type="button" class="tag accent" data-act="areaOpen" data-id="${esc(it.id)}" aria-expanded="${open}">${open ? '收起清單' : '展開清單'}</button>` : ''}${places.some(hasXY) && !S.offline && !sideMap(S) ? `<button type="button" class="tag" data-act="areaMap" data-area="${esc(it.area)}" aria-pressed="${S.mapArea === it.area}">${ICON.pin}地圖看這區</button>` : ''}${open ? nearBtn : ''}</div>
    </div>
    ${GRIP}
    <button type="button" class="more" data-act="itemMenu" data-id="${esc(it.id)}" ${off} aria-label="移動或編輯">⋯</button>
    ${open && places.length ? `<div class="aplacebox"><ul class="aplaces">${places.map(row).join('')}</ul>${nearNote}</div>` : ''}
  </div>`;
}

// 電腦版右半邊：「地圖｜清單」兩個分頁。地圖上想去清單和當天行程（編號）都插針，點針可加到這天或開 Google 地圖
// 地圖和行程同時看得到（電腦版在右邊，手機版在上方）
const sideMap = S => !S.offline && !!mapsKey;
const hasXY = p => Number.isFinite(p.lat) && Number.isFinite(p.lng);
// 搜尋此區域：收藏在不在按下時的地圖範圍內（b 是 { s, w, n, e }）
const inBox = (b, p) => hasXY(p) && p.lat >= b.s && p.lat <= b.n && (b.w <= b.e ? p.lng >= b.w && p.lng <= b.e : p.lng >= b.w || p.lng <= b.e);
const mapBox = (S, d, trip, bare) => {
  const pts = mapData(S, null).points;
  const none = !S.wishDocs.length;
  // 當天有地點還查不到位置、或收藏位置有誤時，才放一行小字說明
  const far = farOf(S), lost = itemsOfDay(S.items, d).filter(it => onMap(it) && (!hasXY(it) || far.has(it.id))).length;
  const odd = S.wishDocs.filter(p => far.has(p.id)).length;
  const note = [lost ? `第 ${d} 天有 ${lost} 個地點還找不到位置` : '', odd ? `${odd} 個收藏位置有誤，正在重查` : ''].filter(Boolean).join('・');
  // 電腦版想去清單蓋在地圖上；手機底部面板自己有「行程｜想去清單」切換，地圖上方就不再放按鈕
  // 地圖上方不放區域標籤；要只看某區，從想去清單的區域名稱或時間軸的區域卡片點
  const wishOn = S.wide ? !!S.wishOpen : S.mside === 'wish';
  const wishBtn = trip && (S.wide || !sideMap(S)) ? `<button type="button" class="mwishbtn" ${S.wide ? 'data-act="wishOpen"' : `data-act="mside" data-v="${wishOn ? 'plan' : 'wish'}"`} aria-pressed="${wishOn}">想去清單 <span class="num">${S.wishDocs.length}</span></button>` : '';
  const bar = wishBtn ? `<div class="mbar"><div class="grow"></div>${wishBtn}</div>` : '';
  // 還沒匯入過收藏時，地圖下方放一張說明卡；放在下方才不會擋住左上角的搜尋框
  const cta = none && !S.offline && !pts.length ? `<div class="mapcta low"><b>在左上角搜尋，或點地圖上的店家、景點</b><span class="small">選好就能直接加到某一天。也可以把 Google 地圖收藏一次匯進來。</span><button type="button" class="btn" data-act="importSheet">${ICON.plus}匯入 Google 地圖收藏</button></div>` : '';
  return (bare ? '' : bar) + (note && !bare ? `<p class="mlegend small muted">${note}</p>` : '') + `<div class="mapwrap">${mapsKey ? '<div id="mapslot" class="mapslot"></div>' : '<div class="mapslot mapempty">要設定 Google 地圖金鑰才會顯示地圖</div>'}${cta}</div>`;
};

// 當天有座標的行程照順序編 1、2、3…，左邊時間軸和地圖上的針用同一個號碼
const pinsOf = its => its.filter(hasXY);
// 位置明顯有誤（離整趟旅程其他地點太遠）的先不插針、不編號，免得整張地圖被拉到世界地圖；地圖載入後會重查
const farOf = S => farOff([...S.wishDocs, ...S.items]);

// 給 ui/map.js 的插針資料：當天行程有座標的照順序編號，想去清單放還沒排進這天的
export function mapData(S, trip) {
  const days = trip ? dayList(S, trip) : [];
  const d = trip ? (days.includes(S.pday) ? S.pday : days[0]) : S.pday;
  const far = farOf(S);
  const its = itemsOfDay(S.items, d), pins = pinsOf(its).filter(it => !far.has(it.id));
  // 想去清單裡和當天行程同一個地方的（名稱一樣或幾乎同一點）不再插一次，免得一個地方兩根針
  const dup = p => its.some(it => sameName(it.title, p.title)) || pins.some(it => distanceKm(it, p) < 0.05);
  // 地圖平常只放當天行程；打開想去清單（或點某個區域名稱）要安排時，才把想去的地點放上去
  // 從區域卡片點某個收藏的名稱時，只把那一個放上去
  // 按了「搜尋此區域」也把收藏放上去：範圍內的照常，範圍外的變淡
  const wishOn = (S.wide ? !!S.wishOpen : S.mside === 'wish') || !!S.mapArea;
  const box = S.wbox;
  const shown = p => wishOn || !!box || 'w:' + p.id === S.mapFocus;
  const points = [
    ...pins.map((it, i) => ({ id: it.id, kind: 'day', n: i + 1, lat: it.lat, lng: it.lng, title: it.title, sub: d ? `第 ${d} 天第 ${i + 1} 站` : '還沒排天數', url: isMapLink(it.address) ? it.address : '' })),
    ...nearDay(wishLeft(S, d).filter(p => shown(p) && (!S.mapArea || p.area === S.mapArea)), its).filter(hasXY).filter(p => !dup(p) && !far.has(p.id)).map(p => ({ id: 'w:' + p.id, kind: 'wish', lat: p.lat, lng: p.lng, title: p.title, sub: [p.area, d && p.km !== null && p.km >= 1 ? `離第 ${d} 天行程 ${kmText(p.km)}` : '', noteOf(p)].filter(Boolean).join('・'), url: p.url, d, area: p.area || '', ...(box ? { dim: !inBox(box, p) } : {}) })),
  ];
  // 有行程針時只在行程針數量變了才重新框，放一個想去清單的地點不會讓地圖跳走
  // 結果條：範圍內亮著的收藏數、這天還沒排又沒有位置的收藏數（有區域篩選時只算那一區）
  const stat = box && { ...box, area: S.mapArea, cnt: points.filter(p => p.kind === 'wish' && !p.dim).length, noxy: wishLeft(S, d).filter(p => !hasXY(p) && (!S.mapArea || p.area === S.mapArea)).length };
  return { points, fit: `${S.tripId}:${d}:${S.mapArea}:${S.mapArea || !pins.length ? 'all' + points.length : 'day' + pins.length}`, fitAll: !!S.mapArea, focus: S.mapFocus, opts: trip ? dayOpts(S, trip, d) : '', card: !!S.wide || !S.mapFull, box: stat || null, wishN: S.wishDocs.some(hasXY) };
}

// 交通住宿分頁的班機、交通、入住退房，自動排進時間軸；點了到交通住宿分頁看詳細
const EV_ICON = { flight: ICON.plane, transit: ICON.train, in: ICON.bed, out: ICON.bed };
const eventHtml = r => `<button type="button" class="item auto" data-act="tab" data-v="move" data-type="${r.kind === 'in' || r.kind === 'out' ? 'stay' : 'transport'}">
    <span class="ico" aria-hidden="true">${EV_ICON[r.kind]}</span>
    <div class="grow" style="flex:1"><h4>${r.at !== null ? `<span class="data" style="color:var(--accent)">${hmOf(r.at)}</span> ` : ''}${esc(r.title)}</h4>${r.sub ? `<p>${esc(r.sub)}</p>` : ''}</div>
    <span class="tag">交通住宿</span>
  </button>`;
// 站與站之間的交通時間畫在虛線上，點了開 Google 地圖路線
function legHtml(r) {
  const l = r.leg;
  if (!l?.min) return '';
  const walk = l.mode === 'WALKING', xy = p => `${p.lat},${p.lng}`;
  const kr = inKorea(r.it), naver = kr && naverHref(r.it, r.it.title, true);
  // 韓國：手機開 Naver 地圖 App 的兩站路線，電腦開 Naver 地圖網頁
  const href = !kr ? `https://www.google.com/maps/dir/?api=1&origin=${xy(l.from)}&destination=${xy(r.it)}&travelmode=${walk ? 'walking' : 'transit'}`
    : naver.startsWith('nmap:') ? `nmap://route/${walk ? 'walk' : 'public'}?${new URLSearchParams({ slat: l.from.lat, slng: l.from.lng, sname: l.from.title || '出發', dlat: r.it.lat, dlng: r.it.lng, dname: r.it.title || '', appname: location.origin })}` : naver;
  return `<a class="legline" href="${esc(href)}" target="_blank" rel="noopener" title="開 ${kr ? 'Naver' : 'Google'} 地圖看路線">${walk ? '步行' : '搭車'} ${stayText(l.min)}</a>`;
}
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

function dayItems(S, trip, d) {
  const its = itemsOfDay(S.items, d), date = dayIso(trip, d);
  const rows = d ? buildDay(its, dayEvents(date, { flights: allFlights(S, trip), transits: S.transitDocs, stays: allStays(S, trip) }, its), S.legs) : its.map(it => ({ kind: 'item', it, at: null }));
  // 旅途中看今天：在時間已經過了的最後一站後面畫一條「現在」
  const now = date && date === todayString() ? nowIndex(rows, nowMin()) : -1;
  const nowLine = `<div class="nowline" role="note"><span class="data">現在 ${hmOf(nowMin())}</span></div>`;
  const none = !S.items.length ? '<div class="empty">還沒有行程，按右下角 ＋ 新增</div>' : '<div class="empty">這天還沒有安排</div>';
  // 有右邊地圖時，時間軸上的圓圈換成和地圖針一樣的號碼
  const far = farOf(S), pinNo = sideMap(S) ? new Map(pinsOf(its).filter(it => !far.has(it.id)).map((it, i) => [it.id, i + 1])) : new Map();
  rows.forEach(r => { if (r.kind === 'item') r.pin = pinNo.get(r.it.id) || 0; });
  let n = -1;
  const html = rows.map((r, k) => (k === now ? nowLine : '') + (r.kind === 'item' ? (n++, (d && areaLine(S, its, n) || '') + legHtml(r) + itemHtml(r.it, S, trip, r)) : eventHtml(r))).join('');
  return `<div class="items">
    ${html ? html + (now === rows.length ? nowLine : '') : none}
  </div>${d ? '' : moveToWish(S)}`;
}

// 天數標題下面那行：日期、幾個地方、那天記了多少錢；出發前在第 1 天提醒還有幾件待辦
function dayMeta(S, trip, d, n) {
  const date = dayIso(trip, d);
  const spent = date ? (S.expenses.get(S.tripId) || []).filter(e => e.createdAt?.toDate && todayString(e.createdAt.toDate()) === date).reduce((s, e) => s + amountOf(e), 0) : 0;
  const left = d === 1 && trip.start && todayString() < trip.start ? S.todoDocs.filter(t => !t.done).length : 0;
  return [dayDate(trip, d), n ? `${n} 個地方` : '', spent ? `花費 NT$${money(spent)}` : ''].filter(Boolean).join('・')
    + (left ? `・<button type="button" class="linkbtn" data-act="tab" data-v="todo">待辦還有 ${left} 件</button>` : '');
}

// 一天跑好幾個區域時，在每段區域前面標出區域名稱，可以整區移到別天
function areaLine(S, its, i) {
  const a = its[i].area;
  // 前一段有區域、這站沒有：標出來，免得看起來像是前一區的
  if (!a && its[i - 1]?.area && !['transport', 'stay'].includes(its[i].type) && new Set(its.map(x => x.area).filter(Boolean)).size >= 2) return '<div class="arealine"><b class="muted">還沒分區域</b></div>';
  if (!a || its[i].kind === 'area' || its[i - 1]?.area === a || new Set(its.map(x => x.area).filter(Boolean)).size < 2) return '';
  // 這天已有這區的區域卡片，卡片就是這區的標題，不再多標一次
  if (its.some(x => x.kind === 'area' && x.area === a)) return '';
  return `<div class="arealine"><b>${esc(a)}</b>${S.offline ? '' : `<button type="button" class="linkbtn" data-act="areaMove" data-area="${esc(a)}" data-d="${its[i].day}">整區移動或移除</button>`}</div>`;
}

// 想去清單：匯入的收藏地點先放這裡；還沒排進行程的依離這天行程的遠近排，按「加到第 N 天」或拖到行程裡才排進去
// 同一個地點可以排進好幾天：只藏起已排在「這一天」的（地圖上已經是行程針），排在別天的標出第幾天
export const wishLeft = (S, d) => { const inDay = new Set(itemsOfDay(S.items, d).map(it => it.address).filter(Boolean)); return S.wishDocs.filter(p => !inDay.has(p.url)); };
const usedDays = S => { const m = new Map(); S.items.forEach(it => { if (it.address && it.day) m.set(it.address, [...new Set([...(m.get(it.address) || []), it.day])].sort((a, b) => a - b)); }); return m; };
function wishPanel(S, trip, d) {
  const off = S.offline ? 'disabled' : '';
  const used = usedDays(S);
  // 從「搜尋此區域」的結果條按「看清單」：只列地圖上亮著的收藏，或只列沒有位置的
  const only = S.wbox && S.wboxList;
  const lit = only === 'in' && new Set(mapData(S, null).points.filter(p => p.kind === 'wish' && !p.dim).map(p => p.id.slice(2)));
  const left = wishLeft(S, d).filter(p => !only || (only === 'in' ? lit.has(p.id) : !hasXY(p) && (!S.mapArea || p.area === S.mapArea)));
  const onlyTip = only ? `<div class="tip"><span><b>${only === 'in' ? '只顯示這一帶' : '只顯示沒有位置的收藏'}</b>${S.mapArea ? `（${esc(S.mapArea)}）` : ''}・${left.length} 個</span><button type="button" class="btn sm" data-act="wboxList" data-v="">顯示全部</button></div>` : '';
  if (!S.wishDocs.length) return `<div class="tip"><span>把 Google 地圖收藏的地點匯入這裡，再一個個加到每天，名稱和位置都不會錯。</span><button type="button" class="btn sm" data-act="importSheet" ${off}>匯入 Google 地圖收藏</button></div>`;
  const count = `<p class="small muted num" style="margin:0">共 ${S.wishDocs.length} 個・已排進行程 ${S.wishDocs.filter(p => used.has(p.url)).length} 個</p>`;
  if (!left.length) return `${onlyTip}${count}<p class="small muted" style="margin:0">${only ? '這一帶沒有收藏。' : '清單上的地點都排進這一天了。'}</p>`;
  const groups = groupByArea(nearDay(left, itemsOfDay(S.items, d)));
  const named = groups.some(g => g.area);
  // 每列只有一顆「加入」：加到目前看的那一天；點名稱在地圖上標出來
  const name = p => (S.offline || !hasXY(p) ? `<b>${esc(p.title)}</b>` : `<button type="button" class="wname" data-act="mapFocus" data-id="w:${esc(p.id)}" title="在地圖上看">${esc(p.title)}</button>`);
  const row = p => `<div class="item wrow" data-iid="w:${esc(p.id)}">
      ${S.wide ? GRIP : ''}<div class="grow">${name(p)}${(m => m ? `<span class="small muted">${m}</span>` : '')([used.has(p.url) ? `已排第 ${used.get(p.url).join('、')} 天` : '', p.km !== null && p.km >= 1 ? `離這天 ${kmText(p.km)}` : '', noteOf(p)].filter(Boolean).map(esc).join('・'))}</div>
      <button type="button" class="wadd" data-act="wishAdd" data-id="${esc(p.id)}" ${off} aria-label="加入「${esc(p.title)}」" title="加入行程">${ICON.plus}</button>
      <button type="button" class="more" data-act="wishDel" data-id="${esc(p.id)}" ${off} aria-label="從想去清單移除「${esc(p.title)}」">×</button>
    </div>`;
  const geo = mapsKey && S.wishDocs.some(p => p.area && /一帶$|^新區域( \d+)?$/.test(p.area)) ? `<button type="button" class="btn sm" data-act="areaGeo" ${off}>區域改用地名</button>` : '';
  const addArea = `<span class="row" style="gap:6px;flex:none">${geo}${groups.some(g => !g.area && g.places.length > 1) ? `<button type="button" class="btn sm" data-act="areaNear" ${off}>依距離分組</button>` : ''}<button type="button" class="btn sm" data-act="areaSheet" data-area="" ${off}>${ICON.plus}新增區域</button></span>`;
  if (!named) return `${onlyTip}<div class="tip"><span>把附近的地點分成區域，到時候整區排進某一天。</span>${addArea}</div><div class="wishes">${left.length ? groups[0].places.map(row).join('') : ''}</div>`;
  return `${onlyTip}<div class="wishtop">${addArea}</div>${groups.map(g => {
    const a = esc(g.area);
    return `<section class="wgroup${g.area ? '' : ' none'}"><div class="wghead">
      <div class="grow">${g.area && !S.offline && g.places.some(hasXY) ? `<button type="button" class="wgname" data-act="mapArea" data-area="${a}" aria-pressed="${S.mapArea === g.area}" title="${S.mapArea === g.area ? '地圖改回看全部' : '地圖只看這區'}">${a}</button>` : `<b>${g.area ? a : '還沒分區域'}</b>`}<span class="small muted num">${g.places.length} 個${cardDays(S, g.area)}</span></div>
      <span class="wgact">${g.area ? addTo(S, trip, d, off, `class="btn sm" data-act="areaAdd" data-area="${a}"`, '排進這天') : ''}
      ${g.area ? `<button type="button" class="more" data-act="areaSheet" data-area="${a}" ${off} aria-label="編輯區域「${a}」">⋯</button>` : ''}</span>
    </div><div class="wishes">${g.places.map(row).join('')}</div></section>`;
  }).join('')}`;
}

// 「加入」都先跳出「要加在哪一天」，選好天數自動放在最順路的位置
const addTo = (S, trip, d, off, attrs, text) => `<span class="addto"><button type="button" ${attrs} ${off}>${ICON.plus}${text}</button></span>`;

// 要加在哪一天：最順路的那天排第一個並標出來；kind 'place' 是地圖上搜到的點，可以改加入想去清單
export function daySheet(S, trip, p, kind) {
  const rows = rankDays(S.items, dayList(S, trip).filter(Boolean), p);
  const tag = r => (r.has ? '<span class="tag">已經排了</span>'
    : r.best ? '<span class="tag best">最順路</span>'
      : r.same ? `<span class="tag good">也有「${esc(p.area)}」的點</span>`
        : r.km !== null ? `<span class="tag">離最近 ${kmText(r.km)}</span>` : '');
  const sub = r => (r.n ? [dayAreas(S.items, r.day).join('・'), `${r.n} 個地方`].filter(Boolean).join('・') : '還沒安排');
  openSheet(`${head(`${esc(p.title)}要加在哪一天？`)}
    <p class="small muted" style="margin:0">${kind === 'area' ? '區域卡片會放在那天離它最近的站旁邊' : '會自動放在那天最順路的位置'}</p>
    <div class="daypick">${rows.map(r => `<button type="button" class="dayopt${r.best ? ' best' : ''}" data-act="dayPick" data-d="${r.day}" ${r.has ? 'disabled' : ''}>
      <span class="grow"><b>第 ${r.day} 天${dayDate(trip, r.day) ? `　${dayDate(trip, r.day)}` : ''}</b><small class="muted">${esc(sub(r))}</small></span>${tag(r)}</button>`).join('')}</div>
    ${kind === 'place' ? '<button type="button" class="linkbtn" data-act="pickWish">改加入想去清單</button>' : '<button type="button" class="linkbtn" data-act="close">先不排，留在想去清單</button>'}`);
}

// 這個區域的卡片排在哪幾天
const cardDays = (S, area) => { const ds = [...new Set(S.items.filter(it => it.kind === 'area' && it.area === area && it.day).map(it => it.day))].sort((a, b) => a - b); return area && ds.length ? `・已排第 ${ds.join('、')} 天` : ''; };

// 先前匯入時放在「還沒排天數」的收藏地點，可以一次搬到想去清單
function moveToWish(S) {
  const n = S.items.filter(it => it.day === 0 && isMapLink(it.address)).length;
  return n && !S.offline ? `<div class="tip"><span>這裡有 ${n} 個 Google 地圖地點，可以搬到想去清單，排行程時再一個個加進每天。</span><button type="button" class="btn sm" data-act="wishMove">搬到想去清單</button></div>` : '';
}

// 右下角的「＋」：有地圖時直接打開地圖（搜尋或點地圖加地點）；沒有地圖金鑰時才跳選單
function addFab(S, d) {
  if (S.offline) return '';
  if (mapsKey) return `<div class="addfab"><button type="button" class="fabbtn" data-act="mapSearch" aria-label="從地圖加地點">${ICON.plus}</button></div>`;
  const wish = S.wide ? 'data-act="side" data-v="list"' : 'data-act="mside" data-v="wish"';
  return `<details class="addfab"><summary aria-label="新增景點">${ICON.plus}</summary><div class="fabmenu">
    <button type="button" ${wish}>${ICON.pin}從想去清單選</button>
    <button type="button" data-act="importSheet">${ICON.map}匯入 Google 地圖收藏</button>
    <button type="button" data-act="addItem" data-d="${d || 1}">${ICON.note}自己輸入</button>
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

// short：電腦版三欄左邊窄，直接寫「第 N 天」和日期，不放區域名稱
const dayPills = (S, trip, days, sel, short) => `<div class="dpills${short ? ' short' : ''}" role="group" aria-label="選擇天數">${days.map(d => {
  const p = dayPill(trip, d);
  const cur = d === sel ? 'aria-current="true"' : '';
  if (short) return `<button type="button" class="dpill" data-act="pday" data-d="${d}" data-dropd="${d}" ${cur}><b>${d ? `第 ${d} 天` : '未排'}</b><span class="num">${d && p.w ? `${p.n} 日（${p.w}）` : ''}</span></button>`;
  return `<button type="button" class="dpill" data-act="pday" data-d="${d}" data-dropd="${d}" ${cur}><span>${p.w}</span><b class="num">${p.n}</b><span>${esc(d ? dayAreas(S.items, d)[0] || `第 ${d} 天` : '天數')}</span></button>`;
}).join('')}</div>`;

// 手機按「＋」：整個畫面都是地圖，上面只有搜尋框和關閉鈕
const fullMap = (S, d) => `<div class="mapfull" role="dialog" aria-label="地圖">${mapBox(S, d, null, true)}<button type="button" class="mapclose" data-act="mapClose" aria-label="關閉地圖">×</button></div>`;

// 手機底部面板收合時的兩行：第幾天幾站＋前後一天；旅行當天是「下一站」（現在之後第一站），其他日子是「第一站」
function peekHtml(S, trip, days, sel) {
  const idx = days.indexOf(sel), n = stopCount(S, sel), date = dayIso(trip, sel);
  const today = !!date && date === todayString();
  const its = itemsOfDay(S.items, sel);
  const rows = sel ? buildDay(its, dayEvents(date, { flights: allFlights(S, trip), transits: S.transitDocs, stays: allStays(S, trip) }, its), S.legs) : its.map(it => ({ kind: 'item', it, at: null }));
  const at = today ? Math.max(nowIndex(rows, nowMin()), 0) : 0;
  const next = rows.slice(at).find(r => r.kind === 'item' && r.it.kind !== 'area' && !r.it.backupOf);
  const it = next?.it;
  const line2 = it ? `<span class="tag accent">${today ? '下一站' : '第一站'}</span><b class="grow">${next.at !== null ? `<span class="num">${hmOf(next.at)}</span> ` : ''}${esc(it.title)}</b>${onMap(it) && !S.offline ? `<a class="linkbtn" href="${esc(navHref(it, trip.city, trip.country))}" target="_blank" rel="noopener">導航</a>` : ''}`
    : `<span class="muted grow">${today && rows.some(r => r.kind === 'item') ? '今天的行程都走完了' : '這天還沒安排'}</span>`;
  return `<div class="mpeek">
    <div class="row"><b class="daynum">${sel ? 'D' + sel : '?'}</b><b>${today ? '今天' : '這天'} ${n} 站</b><span class="small muted grow">${esc([dayDate(trip, sel), sel ? dayAreas(S.items, sel)[0] : ''].filter(Boolean).join(' '))}</span>
      <button type="button" class="iconbtn" data-act="pday" data-d="${days[idx - 1]}" ${idx <= 0 ? 'disabled' : ''} aria-label="前一天">‹</button><button type="button" class="iconbtn" data-act="pday" data-d="${days[idx + 1]}" ${idx >= days.length - 1 ? 'disabled' : ''} aria-label="後一天">›</button></div>
    <div class="row">${line2}</div>
  </div>`;
}

// 手機有地圖時：地圖鋪滿，行程放在底部面板。面板三段高度（收合、半展開、完整展開），只有頂端把手可以拖；
// 點地圖標記時面板換成資訊卡（同一層，不疊第二張），面板高度不變；收合時只顯示名稱和主要按鈕
const SHEET_H = ['peek', 'half', 'full'];
function planSheet(S, trip, days, sel) {
  const h = SHEET_H.includes(S.sheet) ? S.sheet : 'half';
  const card = infoCard(S, trip, sel, h === 'peek');
  const wish = S.mside === 'wish';
  const seg = `<div class="mseg" role="group" aria-label="行程或想去清單"><button type="button" data-act="mside" data-v="plan" aria-pressed="${!wish}">行程</button><button type="button" data-act="mside" data-v="wish" aria-pressed="${wish}">想去清單 <span class="num">${S.wishDocs.length || ''}</span></button></div>`;
  const n = stopCount(S, sel);
  const list = wish
    ? `<section class="day wishview"><div class="wishhead"><h3>想去清單 <span class="muted num">${S.wishDocs.length || ''}</span></h3><button type="button" class="btn sm" data-act="importSheet">${ICON.plus}匯入收藏</button></div>${S.wishDocs.length ? wishPanel(S, trip, sel) : ''}</section>`
    : `<section class="day" id="day${sel}" data-open="true" data-dropd="${sel}">
      <div class="dayhead big"><span class="daynum">${sel ? 'D' + sel : '?'}</span><div class="grow"><h3>${esc(dayTitle(S.items, sel))}</h3><span class="small muted num">${dayMeta(S, trip, sel, n)}</span></div></div>
      ${dayItems(S, trip, sel)}
    </section>`;
  const body = card || (h === 'peek' ? peekHtml(S, trip, days, sel) : `${seg}${wish ? '' : dayPills(S, trip, days, sel)}${list}`);
  return `<div class="mplan" data-h="${h}">
    <div class="mmap">${mapBox(S, sel, trip)}</div>
    <section class="msheet" aria-label="行程面板">
      <div class="mgrip" data-grip role="slider" aria-label="拖曳調整面板高度" aria-valuetext="${{ peek: '收合', half: '半展開', full: '完整展開' }[h]}" tabindex="0"><span></span></div>
      <div class="mbody" id="mbody-${card ? 'card' : h + (wish ? 'w' : sel)}">${body}</div>
    </section>
    ${card ? '' : addFab(S, sel)}
  </div>`;
}

// 手機：上面地圖（約半個畫面，固定在上方）、下面當天行程；想去清單從地圖上方的按鈕切換
function planNarrow(S, trip) {
  const days = dayList(S, trip);
  const sel = days.includes(S.pday) ? S.pday : days[0];
  const idx = days.indexOf(sel), n = stopCount(S, sel);
  const full = S.mapFull && mapsKey && !S.offline;
  if (sideMap(S) && !full) return planSheet(S, trip, days, sel);
  const top = !S.offline && !full ? `<div class="mtop">${mapBox(S, sel, trip)}</div>` : '';
  const wish = S.mside === 'wish' && !S.offline && !full;
  if (wish) return `${dayPills(S, trip, days, sel)}${top}
  <section class="day wishview"><div class="wishhead"><h3>想去清單 <span class="muted num">${S.wishDocs.length || ''}</span></h3><button type="button" class="btn sm" data-act="importSheet">${ICON.plus}匯入收藏</button></div>${S.wishDocs.length ? wishPanel(S, trip, sel) : ''}</section>`;
  return `
  ${dayPills(S, trip, days, sel)}
  ${top}
  <section class="day" id="day${sel}" data-open="true" data-dropd="${sel}">
    <div class="dayhead big"><span class="daynum">${sel ? 'D' + sel : '?'}</span><div class="grow"><h3>${esc(dayTitle(S.items, sel))}</h3><span class="small muted num">${dayMeta(S, trip, sel, n)}</span></div></div>
    ${dayItems(S, trip, sel)}
    <div class="row" style="justify-content:space-between"><button type="button" class="btn sm" data-act="pday" data-d="${days[idx - 1]}" ${idx <= 0 ? 'disabled' : ''}>‹ 前一天</button><button type="button" class="btn sm" data-act="pday" data-d="${days[idx + 1]}" ${idx >= days.length - 1 ? 'disabled' : ''}>後一天 ›</button></div>
  </section>
  ${full ? fullMap(S, sel) : addFab(S, sel)}`;
}

// 電腦版資訊卡：點地圖標記、行程或清單名稱時，蓋在左欄的位置。主要按鈕只放兩顆，依地點來源不同；其他放文字連結和「更多」
// S.card：{ kind: 'day'|'wish'|'place', id（行程或收藏）, p（Google 地點）, canDel }
const MENU = 'position:absolute;left:0;top:calc(100% + 6px);z-index:5;min-width:220px;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--sh-pop)';
const cardMore = btns => (btns.length ? `<div class="menulist" style="display:inline-block;padding:0;position:relative"><details><summary style="padding:0;color:var(--accent);font-size:13px">更多 ⋯</summary><div class="menulist" style="${MENU}">${btns.join('')}</div></details></div>` : '');
const cardLinks = (links, more = '') => `<div class="row" style="gap:16px;flex-wrap:wrap">${links.filter(Boolean).join('')}${more}</div>`;
const extLink = (href, text) => (href ? `<a class="linkbtn" href="${esc(href)}" target="_blank" rel="noopener">${text}</a>` : '');
const navTo = (p, c = '') => (inKorea(p, c) ? naverHref(p, p.title, true) : hasXY(p) ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}` : '');
// 收藏、Google 地點的「在地圖開啟」：韓國改開 Naver 地圖，其他照原本的 Google 地圖連結
const openTo = (p, c = '') => (inKorea(p, c) ? naverHref(p, p.title) : p.url || '');
// 給司機看的入口：資訊卡放在文字連結列；離線時資訊卡打不開，改在時間軸那一站下面放一個標籤
const drvLink = (k, id, cls = 'linkbtn') => `<button type="button" class="${cls}" data-act="driver" data-k="${k}" data-id="${esc(id || '')}">給司機看</button>`;
const facts = rows => (rows.some(r => r[1]) ? `<details open><summary class="label" style="cursor:pointer">詳細資訊</summary><dl style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:8px 0 0">${rows.filter(r => r[1]).map(([k, v]) => `<dt class="muted small">${k}</dt><dd style="margin:0">${v}</dd>`).join('')}</dl></details>` : '');
// 手機面板收合時（mini）不把面板撐高，只放名稱和兩顆主要按鈕；要看更多就把面板往上拉
const miniCard = (title, btns) => `<section class="day icard mini" id="icard" aria-label="地點資訊"><div class="row"><h3 class="grow">${esc(title)}</h3><button type="button" class="iconbtn" data-act="cardClose" aria-label="關閉資訊卡">×</button></div><div class="row">${btns}</div></section>`;
function infoCard(S, trip, d, mini = false) {
  const c = S.card;
  if (!c || c.tid !== S.tripId) return '';
  const top = `<div class="row" style="justify-content:space-between"><button type="button" class="linkbtn" data-act="cardClose">‹ 回${d ? `第 ${d} 天` : ''}行程</button><button type="button" class="iconbtn" data-act="cardClose" aria-label="關閉資訊卡">×</button></div>`;
  const wrap = body => `<section class="day icard" id="icard" aria-label="地點資訊">${top}${body}</section>`;
  if (c.kind === 'day') {
    const it = S.items.find(x => x.id === c.id);
    if (!it) return '';
    if (mini) return miniCard(it.title, `${onMap(it) ? `<a class="btn sm primary grow" href="${esc(navHref(it, trip.city, trip.country))}" target="_blank" rel="noopener">${ICON.map}導航</a>` : ''}<button type="button" class="btn sm grow" data-act="${it.kind === 'area' ? 'areaSheet' : 'editItem'}" ${it.kind === 'area' ? `data-area="${esc(it.area)}"` : `data-id="${esc(it.id)}"`}>編輯</button>`);
    const its = itemsOfDay(S.items, it.day), far = farOf(S);
    const no = pinsOf(its).filter(x => !far.has(x.id)).findIndex(x => x.id === it.id) + 1;
    const rows = it.day ? buildDay(its, dayEvents(dayIso(trip, it.day), { flights: allFlights(S, trip), transits: S.transitDocs, stays: allStays(S, trip) }, its), S.legs) : [];
    const r = rows.find(x => x.kind === 'item' && x.it.id === it.id) || {};
    const when = [whenOf(it, r).trim(), it.stay ? `停留 ${esc(stayText(it.stay))}` : ''].filter(Boolean).join('・');
    const id = esc(it.id), main = it.backupOf && S.items.find(x => x.id === it.backupOf);
    const areaN = it.area ? its.filter(x => x.area === it.area).length : 0;
    const more = [
      main ? '' : `<button type="button" data-act="itemMenu" data-id="${id}">移到其他日期</button>`,
      areaN >= 2 ? `<button type="button" data-act="areaMove" data-area="${esc(it.area)}" data-d="${it.day}">整個「${esc(it.area)}」移到別天或移除</button>` : '',
      it.kind === 'area' ? '' : main ? `<button type="button" data-act="backupOff" data-id="${id}">改回正式行程</button>` : `<button type="button" data-act="itemMenu" data-id="${id}">改成別站的備案</button>`,
      c.canDel ? `<button type="button" data-act="delItem" data-id="${id}" style="color:var(--bad)">刪除</button>` : '',
    ].filter(Boolean);
    const addr = it.address && !isMapLink(it.address) ? esc(it.address) : '';
    const bk = backupsOf(S.items, it.id).map(b => esc(b.title)).join('、');
    return wrap(`<div class="tags"><span class="tag accent">${it.day ? `第 ${it.day} 天${no ? `第 ${no} 站` : ''}` : '還沒排天數'}</span>${it.kind === 'area' ? '<span class="tag">區域</span>' : `<span class="tag">${ITEM_LABEL[it.type] || ''}</span>`}${it.area && it.kind !== 'area' ? `<span class="tag">${esc(it.area)}</span>` : ''}</div>
      <h3 style="margin:0;flex:none">${esc(it.title)}</h3>
      ${when ? `<p style="margin:0">${when}</p>` : ''}${it.tip ? `<p class="small muted" style="margin:0">一句提示：${esc(it.tip)}</p>` : ''}
      <div class="row">${onMap(it) ? `<a class="btn primary grow" href="${esc(navHref(it, trip.city, trip.country))}" target="_blank" rel="noopener">${ICON.map}導航</a>` : ''}<button type="button" class="btn grow" data-act="${it.kind === 'area' ? 'areaSheet' : 'editItem'}" ${it.kind === 'area' ? `data-area="${esc(it.area)}"` : `data-id="${id}"`}>編輯</button></div>
      ${cardLinks([onMap(it) ? extLink(placeHref(it, trip.city, trip.country), `在 ${mapName(it, trip.country)} 地圖開啟`) : '', it.kind !== 'area' && onMap(it) ? drvLink('day', it.id) : ''], cardMore(more))}
      ${facts([['地址', addr], ['備註', esc(noteOf(it))], ['備案', bk]])}`);
  }
  if (c.kind === 'wish') {
    const p = S.wishDocs.find(x => x.id === c.id);
    if (!p) return '';
    const days = usedDays(S).get(p.url), off = S.offline ? 'disabled' : '', id = esc(p.id);
    if (mini) return miniCard(p.title, `<button type="button" class="btn sm primary grow" data-act="wishAdd" data-id="${id}" ${off}>${ICON.plus}加入行程</button>${navTo(p, trip.country) ? `<a class="btn sm grow" href="${esc(navTo(p, trip.country))}" target="_blank" rel="noopener">${ICON.map}導航</a>` : ''}`);
    return wrap(`<div class="tags"><span class="tag accent">收藏</span>${p.area ? `<span class="tag">${esc(p.area)}</span>` : ''}${days ? `<span class="tag">已排第 ${days.join('、')} 天</span>` : ''}</div>
      <div class="row" style="gap:10px;align-items:flex-start"><button type="button" class="seenbox" style="margin-top:4px" data-act="wishSeen" data-id="${id}" aria-pressed="${!!p.visited}" ${off} aria-label="${p.visited ? '取消逛過' : '標成逛過'}「${esc(p.title)}」">${p.visited ? '✓' : ''}</button><h3 style="margin:0">${esc(p.title)}</h3></div>
      <div class="row"><button type="button" class="btn primary grow" data-act="wishAdd" data-id="${id}" ${off}>${ICON.plus}加入行程</button>${navTo(p, trip.country) ? `<a class="btn grow" href="${esc(navTo(p, trip.country))}" target="_blank" rel="noopener">${ICON.map}導航</a>` : ''}</div>
      ${cardLinks([extLink(openTo(p, trip.country), `在 ${mapName(p, trip.country)} 地圖開啟`), drvLink('wish', p.id)], cardMore([p.area ? `<button type="button" data-act="areaSheet" data-area="${esc(p.area)}">編輯「${esc(p.area)}」區域</button>` : `<button type="button" data-act="areaSheet" data-area="" data-wid="${id}">放進新的區域</button>`, `<button type="button" data-act="wishDel" data-id="${id}" style="color:var(--bad)">刪除收藏</button>`]))}
      ${facts([['備註', esc(noteOf(p))]])}`);
  }
  const p = c.p;
  if (!p) return '';
  if (mini) return miniCard(p.title, `<button type="button" class="btn sm primary grow" data-act="cardPlace" data-k="placeAdd">${ICON.plus}加入行程</button><button type="button" class="btn sm grow" data-act="cardPlace" data-k="placeWish">加入想去清單</button>`);
  // 營業時間照當地的星期幾（和「營業中」標籤用同一個時區），不是看的人所在地的星期幾
  const local = Number.isFinite(p.off) ? new Date(Date.now() + p.off * 60000).getUTCDay() : new Date().getDay();
  const today = p.hours?.[(local + 6) % 7];
  const rate = Number.isFinite(p.rating) ? `★ ${p.rating.toFixed(1)}${p.ratingN ? `（${p.ratingN.toLocaleString()} 則評論）` : ''}` : '';
  return wrap(`${p.photo ? `<img src="${esc(p.photo)}" alt="" onerror="this.remove()" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px;display:block;flex:none">` : ''}
    <div class="tags"><span class="tag accent">Google 地點</span>${ITEM_LABEL[p.type] ? `<span class="tag">${ITEM_LABEL[p.type]}</span>` : ''}</div>
    <h3 style="margin:0;flex:none">${esc(p.title)}</h3>
    ${p.more ? '' : '<p class="small muted" style="margin:0">正在讀取評分與營業時間…</p>'}
    <div class="row"><button type="button" class="btn primary grow" data-act="cardPlace" data-k="placeAdd">${ICON.plus}加入行程</button><button type="button" class="btn grow" data-act="cardPlace" data-k="placeWish">加入想去清單</button></div>
    ${cardLinks([extLink(navTo(p, trip.country), '導航'), extLink(openTo(p, trip.country), `在 ${mapName(p, trip.country)} 地圖開啟`), drvLink('place', ''), p.phone ? `<a class="linkbtn" href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">電話</a>` : '', extLink(p.web, '網站')])}
    ${facts([['地址', esc(p.addr || '')], ['評分', rate], ['營業', [OPEN_TAG[p.open] || '', esc(today || '')].filter(Boolean).join(' ')], ['電話', esc(p.phone || '')]])}`);
}

// 給司機看：只用網站上已經有的資料（名稱、自己輸入的地址、座標），不查 Google 地點資料
// k：'day' 行程、'wish' 收藏、'place' 資訊卡上的 Google 地點（名稱、地址是 Google 回傳的，只在畫面上顯示，要標資料來源）
export function driverData(S, trip, k, id) {
  if (k === 'day') {
    const it = S.items.find(x => x.id === id);
    if (!it) return null;
    return { name: it.title, addr: it.address && !isMapLink(it.address) ? it.address : '', lat: it.lat, lng: it.lng, nav: onMap(it) ? navHref(it, trip.city, trip.country) : '', open: onMap(it) ? placeHref(it, trip.city, trip.country) : '', map: mapName(it, trip.country), google: false };
  }
  if (k === 'wish') {
    const p = S.wishDocs.find(x => x.id === id);
    if (!p) return null;
    return { name: p.title, addr: '', lat: p.lat, lng: p.lng, nav: navTo(p, trip.country) || p.url || '', open: openTo(p, trip.country), map: mapName(p, trip.country), google: false };
  }
  const p = S.card?.kind === 'place' ? S.card.p : null;
  if (!p) return null;
  return { name: p.title, addr: p.addr || '', lat: p.lat, lng: p.lng, nav: navTo(p, trip.country) || p.url || '', open: openTo(p, trip.country), map: mapName(p, trip.country), google: true };
}
export const driverText = d => [d.name, d.addr].filter(Boolean).join('\n');
// 名稱大字、地址次大字；有座標又有網路時放小地圖（#drvmap，由 ui/map.js 放進同一張地圖），沒有就給「在 Google 地圖開啟」
export function driverSheet(d, offline) {
  const map = hasXY(d) && !offline && mapsKey;
  const go = (href, text, cls) => (href && !offline ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${text}</a>` : '');
  openSheet(`<div class="row" style="justify-content:space-between"><span class="label" style="margin:0">給司機看</span><button type="button" class="iconbtn" data-act="close" aria-label="關閉">×</button></div>
    <p class="drvname" style="margin:0;font-size:clamp(30px,8.5vw,44px);font-weight:800;line-height:1.25;color:var(--fg);overflow-wrap:anywhere;user-select:text;-webkit-user-select:text">${esc(d.name)}</p>
    ${d.addr ? `<p style="margin:0;font-size:clamp(18px,5vw,22px);line-height:1.45;color:var(--fg);overflow-wrap:anywhere;user-select:text;-webkit-user-select:text">${esc(d.addr)}</p>` : ''}
    ${map ? '<div id="drvmap" style="height:min(36vh,280px);min-height:180px;border-radius:12px;overflow:hidden;background:var(--surface2)" aria-label="目的地地圖"></div>' : go(d.open, `${ICON.pin}在 ${d.map || 'Google'} 地圖開啟`, 'btn')}
    <div class="row"><button type="button" class="btn grow" data-act="drvCopy">複製名稱${d.addr ? '和地址' : ''}</button>${go(d.nav, `${ICON.map}導航`, 'btn primary grow')}</div>
    ${map && d.open ? `<div class="row" style="gap:16px">${go(d.open, `在 ${d.map || 'Google'} 地圖開啟`, 'linkbtn')}</div>` : ''}
    ${offline ? '<p class="small muted" style="margin:0">離線中：只顯示已存在這趟旅程的名稱和地址。</p>' : ''}
    ${d.google ? '<p class="small muted" style="margin:0">資料來源：Google Maps</p>' : ''}`);
}

// 電腦：上面一排日期，下面左邊看那一天、右邊是地圖和想去清單
function planWide(S, trip) {
  const days = dayList(S, trip);
  const sel = days.includes(S.pday) ? S.pday : days[0];
  const n = stopCount(S, sel);
  const card = sideMap(S) ? infoCard(S, trip, sel) : '';
  const day = card || `<section class="day" id="day${sel}" data-open="true" data-dropd="${sel}">
      ${sideMap(S) ? dayPills(S, trip, days, sel, true) : ''}
      <div class="dayhead"><span class="daynum">${sel ? 'D' + sel : '?'}</span><div class="grow" style="flex:1;min-width:0"><h3>${esc(dayTitle(S.items, sel))}</h3><span class="small muted num">${dayMeta(S, trip, sel, n)}</span></div></div>
      ${dayItems(S, trip, sel)}
    </section>`;
  // 沒有地圖（離線、沒金鑰）時維持一欄
  if (!sideMap(S)) return `${dayPills(S, trip, days, sel)}<div class="planwide">${day}</div>${addFab(S, sel)}`;
  // 電腦版兩欄：左邊當天行程、右邊地圖；按「想去清單」才在行程旁多開一欄（視窗較窄時改成浮在地圖上），可直接拖到左邊行程
  const wish = S.wishOpen ? `<aside class="wishover" aria-label="想去清單">
      <div class="wishcolhead"><b>想去清單 <span class="muted num">${S.wishDocs.length || ''}</span></b><span class="row" style="gap:6px"><button type="button" class="btn sm" data-act="importSheet">${ICON.plus}匯入收藏</button><button type="button" class="iconbtn" data-act="wishOpen" aria-label="關閉想去清單">×</button></span></div>
      <p class="small muted" style="margin:0">長按地點拖到左邊行程，放在想去的位置</p>
      <div class="wishpane">${wishPanel(S, trip, sel)}</div>
    </aside>` : '';
  return `<div class="planwide two${wish ? ' wish' : ''}">
    ${day}${wish}
    <section class="mapcol" aria-label="地圖">${mapBox(S, sel, trip)}</section>
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
  const main = it.backupOf && S.items.find(x => x.id === it.backupOf);
  openSheet(`${head(esc(it.title))}
    ${main ? '' : `<p class="label">移到第幾天</p>
    <div class="chips" style="flex-wrap:wrap">${days.map(d => `<button type="button" class="chip" data-act="moveTo" data-id="${esc(it.id)}" data-d="${d}" aria-pressed="${it.day === d}">第 ${d} 天</button>`).join('')}</div>
    ${areaChips(S, days, it)}`}
    ${backupPart(S, it, main)}
    <div class="row">${canDel ? `<button type="button" class="btn danger" data-act="delItem" data-id="${esc(it.id)}">刪除</button>` : ''}${it.kind === 'area' ? `<button type="button" class="btn grow" data-act="areaSheet" data-area="${esc(it.area)}">編輯區域</button>` : `<button type="button" class="btn grow" data-act="editItem" data-id="${esc(it.id)}">編輯內容</button>`}</div>`);
}

// 備案：掛在同一天的另一站下面，寫什麼時候改去；已經是備案的可以改條件或改回正式行程
const WHEN_PH = '什麼時候改去？例如：排隊超過 30 分鐘就改去';
function backupPart(S, it, main) {
  if (it.kind === 'area') return '';
  if (main) return `<p class="label">這是「${esc(main.title)}」的備案</p>
    <input class="input" id="bk-when" maxlength="30" placeholder="${WHEN_PH}" value="${esc(it.backupWhen)}">
    <div class="row"><button type="button" class="btn" data-act="backupOff" data-id="${esc(it.id)}">改回正式行程</button><button type="button" class="btn primary grow" data-act="backupSet" data-id="${esc(it.id)}" data-of="${esc(main.id)}">儲存</button></div>`;
  if (backupsOf(S.items, it.id).length) return '';
  const list = itemsOfDay(S.items, it.day), i = list.findIndex(x => x.id === it.id);
  const others = list.filter(x => x.id !== it.id && x.kind !== 'area');
  if (!others.length) return '';
  // 預設掛在前一站（「晚餐備選」通常就排在正式晚餐後面）
  const def = list.slice(0, Math.max(i, 0)).reverse().find(x => x.kind !== 'area') || others[0];
  return `<details class="bkset"><summary>改成別站的備案</summary>
    <div class="field"><label for="bk-of">掛在哪一站下面</label><select class="input" id="bk-of">${others.map(x => `<option value="${esc(x.id)}" ${x.id === def.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></div>
    <input class="input" id="bk-when" maxlength="30" placeholder="${WHEN_PH}">
    <button type="button" class="btn primary" data-act="backupSet" data-id="${esc(it.id)}">設成備案</button>
    <p class="small muted" style="margin:0">備案不排進時間軸，只掛在那一站下面。</p></details>`;
}

// 同一天有其他同區域的行程時，可以整個區域一起移
function areaChips(S, days, it) {
  const n = it.area ? S.items.filter(x => x.day === it.day && x.area === it.area).length : 0;
  if (n < 2) return '';
  return `<p class="label">整個「${esc(it.area)}」${n} 個一起移</p>
    <div class="chips" style="flex-wrap:wrap">${days.map(d => `<button type="button" class="chip" data-act="moveArea" data-area="${esc(it.area)}" data-from="${it.day}" data-d="${d}" aria-pressed="${it.day === d}">第 ${d} 天</button>`).join('')}</div>
    <button type="button" class="linkbtn" style="justify-self:start" data-act="areaMove" data-area="${esc(it.area)}" data-d="${it.day}">整個「${esc(it.area)}」從這天移除…</button>`;
}
export function areaMoveSheet(S, trip, area, from) {
  const days = dayList(S, trip).filter(Boolean), n = S.items.filter(x => x.day === from && x.area === area).length;
  openSheet(`${head(`「${esc(area)}」移到第幾天`)}
    <p class="small muted" style="margin:0">這天「${esc(area)}」的 ${n} 個行程會照原本順序，一起排到那一天的最後。</p>
    <div class="chips" style="flex-wrap:wrap">${days.map(d => `<button type="button" class="chip" data-act="moveArea" data-area="${esc(area)}" data-from="${from}" data-d="${d}" aria-pressed="${from === d}">第 ${d} 天</button>`).join('')}</div>
    <p class="label">或從這天拿掉</p>
    <button type="button" class="btn danger" data-act="areaDrop" data-area="${esc(area)}" data-d="${from}">從第 ${from} 天移除這 ${n} 個行程</button>
    <p class="small muted" style="margin:0">地點還留在想去清單，移除後也可以按「復原」。</p>`);
}

// 新增或編輯區域：取名字，再勾哪些想去清單的地點放在這區；已在這區的排最前面，其次是還沒分區域的
// wid：從資訊卡「放進新的區域」打開時，先勾好那個收藏並排在最前面
export function areaSheet(S, area = '', wid = '') {
  const rank = p => (p.id === wid || (area && p.area === area) ? 0 : p.area ? 2 : 1);
  const list = S.wishDocs.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(x => x.p);
  openSheet(`${head(area ? '編輯區域' : '新增區域')}
    <input class="namein lg" id="a-name" maxlength="20" placeholder="區域名稱，例如：尖沙咀" aria-label="區域名稱" value="${esc(area)}">
    <p class="label">勾選放在這區的地點</p>
    <div style="max-height:45vh;overflow:auto">${list.map(p => `<label class="todo"><input type="checkbox" data-apick="${esc(p.id)}" ${p.id === wid || (area && p.area === area) ? 'checked' : ''}>
      <span class="grow" style="flex:1">${esc(p.title)}${p.area && p.area !== area ? ` <small class="muted">（目前在「${esc(p.area)}」）</small>` : ''}</span></label>`).join('')}</div>
    <div class="row">${area ? `<button type="button" class="btn" data-act="areaSave" data-area="${esc(area)}" data-drop="1">取消這個區域</button>` : ''}<button type="button" class="btn primary grow" data-act="areaSave" data-area="${esc(area)}">儲存</button></div>`);
}

// 時間欄可以直接填幾點，也可以寫時段
const TIME_WORDS = ['早上', '午餐', '下午', '晚餐', '看完夕陽後', '有空再去'];
const isClock = v => /^[\d:：.\s]+$/.test(v);

// near：行程大約位置（Google 候選地點優先找這附近），沒有就是 null
export function itemFormSheet(day, it = null, near = null) {
  const v = it || { title: '', area: '', address: '', type: 'attraction', priority: '', time: '', timeText: '', stay: 0, note: '', tip: '' };
  openSheet(`${head(it ? '編輯行程' : `新增到第 ${day} 天`)}
    <div class="suggwrap"><input class="namein lg" id="n-title" maxlength="60" placeholder="要去哪裡？例如：南禪寺" aria-label="名稱" value="${esc(v.title)}"></div>
    <input class="input" id="n-tip" maxlength="20" placeholder="一句提示（20 字內），例如：先抽號碼牌再去逛" aria-label="一句提示" value="${esc(v.tip || '')}">
    <div class="picks" role="radiogroup" aria-label="類型">${ITEM_TYPES.map(t => `<label class="pick"><input type="radio" name="n-type" value="${t}" ${t === v.type ? 'checked' : ''}><i>${ITEM_ICON[t]}</i><span>${ITEM_LABEL[t]}</span></label>`).join('')}</div>
    <div class="field"><span class="label">優先度</span>
      <div class="chips" role="radiogroup" aria-label="優先度">${[['', '不設定'], ...PRIORITIES.map(p => [p, PRIORITY_LABEL[p]])].map(p => `<label class="chip"><input type="radio" name="n-pri" value="${p[0]}" ${p[0] === (v.priority || '') ? 'checked' : ''}>${p[1]}</label>`).join('')}</div></div>
    <div class="grid2"><div class="field"><label for="n-time">什麼時候</label><input class="input tany" id="n-time" type="text" autocomplete="off" maxlength="20" placeholder="14:30 或 午餐" value="${esc(v.time || v.timeText || '')}"></div>
      <div class="field"><label for="n-stay">停留多久</label><select class="input" id="n-stay"><option value="0">不設定</option>${STAY_MINS.map(m => `<option value="${m}" ${m === v.stay ? 'selected' : ''}>${stayText(m)}</option>`).join('')}</select></div></div>
    <div class="chips twords" style="flex-wrap:wrap" aria-label="常用時段">${TIME_WORDS.map(w => `<button type="button" class="chip" data-act="timeWord" data-v="${w}">${w}</button>`).join('')}</div>
    <div class="field"><label for="n-area">區域</label><input class="input" id="n-area" maxlength="20" placeholder="例如：嵐山" value="${esc(v.area)}"></div>
    <div class="field"><label for="n-addr">地址或 Google 地圖連結（選填）</label><input class="input" id="n-addr" maxlength="300" placeholder="可貼 Google 地圖分享連結；沒填就用名稱和區域搜尋" value="${esc(v.address || '')}"></div>
    <div class="field"><label for="n-note">備註</label><input class="input" id="n-note" maxlength="200" value="${esc(v.note)}"></div>
    <button type="button" class="btn primary" data-act="saveItem" data-d="${day}" ${it ? `data-id="${esc(it.id)}"` : ''}>${it ? '儲存' : '加入行程'}</button>`);
  // 打名稱時跳出 Google 候選地點，選了自動帶入名稱、類型、地圖連結和位置
  const t = $('#n-title');
  if (mapsKey && t) {
    import('../ui/map.js').then(m => m.attachSuggest(t, () => near, p => {
      t.value = p.title; t.classList.remove('err');
      t.dataset.place = JSON.stringify({ url: p.url, lat: p.lat, lng: p.lng });
      $('#n-addr').value = p.url;
      const r = document.querySelector(`input[name="n-type"][value="${p.type}"]`);
      if (r && !it) r.checked = true;
    })).catch(console.error);
  }
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
  const tm = $('#n-time'), tv = tm.value.trim();
  if (isClock(tv) && normTime(tv) === null) { tm.classList.add('err'); tm.focus(); return null; }
  // 從候選地點選的：地址欄還是那個連結，就連同位置一起存
  let xy = {};
  try { const p = JSON.parse(t.dataset.place || 'null'); if (p && p.url === $('#n-addr').value.trim()) xy = { lat: p.lat, lng: p.lng, exact: true }; } catch { /* 沒選過 */ }
  return {
    ...xy,
    title: t.value.trim(),
    type: $('input[name="n-type"]:checked')?.value || 'other',
    priority: $('input[name="n-pri"]:checked')?.value || '',
    reservationTime: isClock(tv) ? normTime(tv) : '',
    timeText: isClock(tv) ? '' : tv,
    tip: $('#n-tip').value.trim(),
    stay: +$('#n-stay').value || 0,
    area: $('#n-area').value.trim(),
    address: $('#n-addr').value.trim(),
    note: $('#n-note').value.trim(),
  };
}
