// 交通住宿分頁：班機與住宿都可以多筆（規格書 F30–F32）
import { esc, ICON, openSheet, $ } from '../ui/dom.js';
import { monthDay } from '../lib/dates.js';
import { AIRPORTS, TIMEZONES, LEGS, flightMinutes, durationText, sortFlights, sortStays, nights, toInstant, legacyFlights, legacyStays, withLegacy } from '../lib/flights.js';

// 新資料加上還沒轉過的舊版單筆資料
export const allFlights = (S, trip) => withLegacy(S.flightDocs, legacyFlights(trip.raw.flight));
export const allStays = (S, trip) => withLegacy(S.stayDocs, legacyStays(trip.raw.hotel, trip.raw));

const head = title => `<div class="head"><h2>${title}</h2><button type="button" class="iconbtn" data-act="close" aria-label="關閉">×</button></div>`;
const EYE = {
  on: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  off: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7c2 0 3.7.7 5.1 1.6M22 12s-3.6 7-10 7c-2 0-3.7-.7-5.1-1.6"/><path d="M3 3l18 18"/></svg>',
};
// 訂位代碼、確認碼、PIN 碼預設遮蔽，點一下才顯示
const secret = (S, k, v) => (!v ? '<span class="data">—</span>'
  : `<button type="button" class="secret" data-act="reveal" data-k="${esc(k)}" aria-label="${S.reveal[k] ? '再次遮蔽' : '點一下顯示'}">${S.reveal[k] ? `<span class="data">${esc(v)}</span>${EYE.off}` : `<span class="data">••••••</span>${EYE.on}`}</button>`);
const editBtn = (S, act, id, label) => `<button type="button" class="more" data-act="${act}" data-id="${esc(id)}" ${S.offline ? 'disabled' : ''} aria-label="${label}">✏️</button>`;
const addBtn = (S, act, label) => `<button type="button" class="btn sm" data-act="${act}" ${S.offline ? 'disabled' : ''}>${ICON.plus}${label}</button>`;
const hm = s => (s ? s.slice(11) : '—');
const legacyTag = r => (r.legacy ? '<span class="tag">舊版資料</span>' : '');

function flightCard(S, f) {
  const m = flightMinutes(f);
  const port = (code, t, city, term, tz, right) => `<div class="port${right ? ' r' : ''}"><b>${esc(code || '—')}</b><span class="t">${hm(t)}</span><div class="tz">${esc(city)}<br>${term ? esc(term) + '・' : ''}UTC${esc(tz)}</div></div>`;
  return `<article class="flight">
    <div class="top"><span><b>${esc(f.leg)}</b>・${esc(f.airline || '未填航空公司')} <span class="data">${esc(f.flightNo)}</span> ${legacyTag(f)}</span><span class="row" style="gap:6px"><span class="num muted">${f.dep ? monthDay(f.dep.slice(0, 10)) : ''}</span>${editBtn(S, 'flightForm', f.id, '編輯航段')}</span></div>
    <div class="route">
      ${port(f.from, f.dep, f.fromCity, f.fromTerminal, f.fromTz)}
      <div class="mid"><span>${m ? durationText(m) : '—'}</span><span class="line"></span><span>${f.leg === '轉機' ? '轉機航段' : '直飛'}</span></div>
      ${port(f.to, f.arr, f.toCity, f.toTerminal, f.toTz, true)}
    </div>
    <div class="foot"><span class="muted">訂位代碼</span>${secret(S, f.id + '-pnr', f.pnr)}${f.note ? `<span class="muted">${esc(f.note)}</span>` : ''}</div>
  </article>`;
}

function stayCard(S, s) {
  const n = nights(s);
  const md = d => (d ? d.slice(5).replace('-', '/') : '—');
  return `<article class="card stay">
    <div class="dates"><span>${md(s.checkInDate)}</span><span class="muted">→</span><span>${md(s.checkOutDate)}</span>${n > 0 ? `<span class="tag">${n} 晚</span>` : ''}${legacyTag(s)}<span style="margin-left:auto">${editBtn(S, 'stayForm', s.id, '編輯住宿')}</span></div>
    <h3 style="font-size:16px">${esc(s.name)}</h3>
    ${s.address ? `<div class="small muted">${esc(s.address)}</div>` : ''}
    <div class="codes small"><span class="muted">確認碼</span>${secret(S, s.id + '-code', s.confirmCode)}${s.pin ? `<span class="muted">PIN 碼</span>${secret(S, s.id + '-pin', s.pin)}` : ''}</div>
    ${s.note ? `<div class="small muted">${esc(s.note)}</div>` : ''}
    ${s.address ? `<a class="btn sm" style="justify-self:start;text-decoration:none" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}" target="_blank" rel="noopener">開啟地圖</a>` : ''}
  </article>`;
}

export function renderMove(S, trip) {
  if (S.loadingMove) return '<div class="empty">正在讀取班機與住宿…</div>';
  const flights = sortFlights(allFlights(S, trip)), stays = sortStays(allStays(S, trip));
  return `
  <div class="sec-h"><h2>班機</h2>${addBtn(S, 'flightForm', '新增航段')}</div>
  <div class="list two">${flights.map(f => flightCard(S, f)).join('') || `<div class="empty">還沒有班機${trip.type === '潛旅' ? '，搭船的話可以不用填' : ''}</div>`}</div>
  <p class="small muted" style="margin:-8px 0 0">轉機請分成兩個航段輸入，會依實際起飛時間排序。</p>
  <div class="sec-h"><h2>住宿</h2>${addBtn(S, 'stayForm', '新增住宿')}</div>
  <div class="list two">${stays.map(s => stayCard(S, s)).join('') || '<div class="empty">還沒有住宿</div>'}</div>`;
}

/* ---------- 表單 ---------- */
const fld = (id, label, val, type = 'text', extra = '') => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" type="${type}" value="${esc(val ?? '')}" ${extra}></div>`;
const tzSel = (id, v) => `<select class="select" id="${id}">${TIMEZONES.map(z => `<option value="${z}" ${z === v ? 'selected' : ''}>UTC${z === '0' ? '' : z}</option>`).join('')}</select>`;
const delBtn = (r, act, isOwner) => (r && !r.legacy && isOwner ? `<button type="button" class="btn danger" data-act="${act}" data-id="${esc(r.id)}">刪除</button>` : '');
const legacyNote = r => (r?.legacy ? '<p class="small muted" style="margin:0">這筆是舊版的資料，儲存後會轉成新格式，舊版網站的內容不會被改動。</p>' : '');

export function flightFormSheet(trip, f, isOwner) {
  const start = trip.start || '';
  const v = f || { leg: '去程', airline: '', flightNo: '', from: '', fromCity: '', fromTerminal: '', fromTz: '+8', dep: start ? `${start} 08:00` : '', to: '', toCity: '', toTerminal: '', toTz: '+8', arr: start ? `${start} 12:00` : '', pnr: '', note: '' };
  openSheet(`${head(f ? '編輯航段' : '新增航段')}
    <div class="seg" id="ff-leg" style="justify-self:start">${LEGS.map(l => `<button type="button" data-act="pickSeg" data-v="${l}" aria-pressed="${v.leg === l}">${l}</button>`).join('')}</div>
    <div class="grid2">${fld('ff-airline', '航空公司', v.airline, 'text', 'placeholder="例如：中華航空" maxlength="30"')}${fld('ff-flightNo', '航班編號', v.flightNo, 'text', 'placeholder="CI152" maxlength="10"')}</div>
    <fieldset class="leg"><legend>出發</legend>
      <div class="grid2">${fld('ff-from', '機場代碼', v.from, 'text', 'placeholder="TPE" maxlength="3" data-ap="from"')}${fld('ff-fromCity', '城市', v.fromCity, 'text', 'maxlength="20"')}</div>
      ${fld('ff-fromTerminal', '航廈', v.fromTerminal, 'text', 'placeholder="例如：第 2 航廈、國際航廈" maxlength="20"')}
      <div class="grid2">${fld('ff-dep', '起飛（當地時間）', (v.dep || '').replace(' ', 'T'), 'datetime-local')}<div class="field"><label for="ff-fromTz">時區</label>${tzSel('ff-fromTz', v.fromTz)}</div></div>
    </fieldset>
    <fieldset class="leg"><legend>抵達</legend>
      <div class="grid2">${fld('ff-to', '機場代碼', v.to, 'text', 'placeholder="KIX" maxlength="3" data-ap="to"')}${fld('ff-toCity', '城市', v.toCity, 'text', 'maxlength="20"')}</div>
      ${fld('ff-toTerminal', '航廈', v.toTerminal, 'text', 'placeholder="例如：第 1 航廈" maxlength="20"')}
      <div class="grid2">${fld('ff-arr', '抵達（當地時間）', (v.arr || '').replace(' ', 'T'), 'datetime-local')}<div class="field"><label for="ff-toTz">時區</label>${tzSel('ff-toTz', v.toTz)}</div></div>
    </fieldset>
    <div class="check" id="ff-dur"></div>
    <div class="grid2">${fld('ff-pnr', '訂位代碼', v.pnr, 'text', 'placeholder="例如：F8FMCW" maxlength="20"')}${fld('ff-note', '備註', v.note, 'text', 'placeholder="例如：託運 23 公斤" maxlength="100"')}</div>
    <p class="small muted" style="margin:0">輸入機場代碼會自動帶入城市和時區。轉機請把每一段分開輸入。</p>
    ${legacyNote(f)}
    <div class="row">${delBtn(f, 'delFlight', isOwner)}<button type="button" class="btn primary grow" data-act="saveFlight" data-id="${esc(f?.id || '')}">儲存</button></div>`);
  updateDuration();
}

const val = id => ($(`#${id}`)?.value || '').trim();
const formFlight = () => ({
  leg: $('#ff-leg [aria-pressed="true"]')?.dataset.v || '去程',
  airline: val('ff-airline'), flightNo: val('ff-flightNo').toUpperCase(),
  from: val('ff-from').toUpperCase(), fromCity: val('ff-fromCity'), fromTerminal: val('ff-fromTerminal'), fromTz: val('ff-fromTz'), dep: val('ff-dep').replace('T', ' '),
  to: val('ff-to').toUpperCase(), toCity: val('ff-toCity'), toTerminal: val('ff-toTerminal'), toTz: val('ff-toTz'), arr: val('ff-arr').replace('T', ' '),
  pnr: val('ff-pnr'), note: val('ff-note'),
});

export function updateDuration() {
  const el = $('#ff-dur');
  if (!el) return;
  const f = formFlight();
  if (Number.isNaN(toInstant(f.dep, f.fromTz)) || Number.isNaN(toInstant(f.arr, f.toTz))) { el.className = 'check'; el.textContent = '填好起飛和抵達時間後，會自動算出飛行時間'; return; }
  const m = flightMinutes(f);
  el.className = 'check ' + (m ? 'good' : 'bad');
  el.textContent = m ? `飛行時間 ${durationText(m)}` : '抵達時間早於起飛時間，請檢查日期或時區';
}

// 輸入機場代碼後自動帶入城市與時區（城市已手動填過就不覆蓋）
export function fillAirport(input) {
  const a = AIRPORTS[input.value.trim().toUpperCase()], side = input.dataset.ap;
  if (!a) return;
  const city = $(`#ff-${side}City`);
  if (!city.value || city.dataset.auto) { city.value = a[0]; city.dataset.auto = '1'; }
  $(`#ff-${side}Tz`).value = a[1];
  updateDuration();
}

// 讀航段表單；有錯時標紅並回傳錯誤訊息
export function readFlightForm() {
  const f = formFlight();
  document.querySelectorAll('#layer .input.err').forEach(i => i.classList.remove('err'));
  const need = ['flightNo', 'from', 'to', 'dep', 'arr'].filter(k => !f[k]);
  if (need.length) { need.forEach(k => $(`#ff-${k}`).classList.add('err')); return { error: '請把紅框的欄位填好' }; }
  if (!flightMinutes(f)) { $('#ff-arr').classList.add('err'); return { error: '抵達時間早於起飛時間，請檢查' }; }
  return { data: f };
}

export function stayFormSheet(trip, s, isOwner) {
  const v = s || { name: '', address: '', checkInDate: trip.start || '', checkOutDate: trip.end || '', confirmCode: '', pin: '', note: '' };
  openSheet(`${head(s ? '編輯住宿' : '新增住宿')}
    ${fld('sf-name', '名稱', v.name, 'text', 'placeholder="飯店或民宿名稱" maxlength="60"')}
    ${fld('sf-address', '地址', v.address, 'text', 'placeholder="可以直接貼上地圖上的地址" maxlength="150"')}
    <div class="grid2">${fld('sf-in', '入住', v.checkInDate, 'date')}${fld('sf-out', '退房', v.checkOutDate, 'date')}</div>
    <div class="check" id="sf-n"></div>
    <div class="grid2">${fld('sf-code', '預訂確認碼', v.confirmCode, 'text', 'maxlength="30"')}${fld('sf-pin', 'PIN 碼', v.pin, 'text', 'placeholder="沒有可不填" maxlength="20"')}</div>
    ${fld('sf-note', '備註', v.note, 'text', 'placeholder="例如：含早餐" maxlength="100"')}
    <p class="small muted" style="margin:0">確認碼和 PIN 碼平常會遮起來，點一下才會顯示。</p>
    ${legacyNote(s)}
    <div class="row">${delBtn(s, 'delStay', isOwner)}<button type="button" class="btn primary grow" data-act="saveStay" data-id="${esc(s?.id || '')}">儲存</button></div>`);
  updateNights();
}

export function updateNights() {
  const el = $('#sf-n');
  if (!el) return;
  const n = nights({ checkInDate: val('sf-in'), checkOutDate: val('sf-out') });
  el.className = 'check ' + (n > 0 ? 'good' : 'bad');
  el.textContent = n > 0 ? `共 ${n} 晚` : '退房日要晚於入住日';
}

export function readStayForm() {
  document.querySelectorAll('#layer .input.err').forEach(i => i.classList.remove('err'));
  const s = { name: val('sf-name'), address: val('sf-address'), checkInDate: val('sf-in'), checkOutDate: val('sf-out'), confirmCode: val('sf-code'), pin: val('sf-pin'), note: val('sf-note') };
  if (!s.name) { $('#sf-name').classList.add('err'); $('#sf-name').focus(); return { error: '請填住宿名稱' }; }
  if (!(nights(s) > 0)) { $('#sf-out').classList.add('err'); return { error: '退房日要晚於入住日' }; }
  return { data: s };
}
