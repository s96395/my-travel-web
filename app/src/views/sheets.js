// 底部彈出的選單與表單：帳號、加到主畫面、新增與編輯旅程
import { esc, openSheet, $ } from '../ui/dom.js';
import { TRIP_TYPES, TRIP_STATUSES, TYPE_ICON } from '../lib/trips.js';

const head = title => `<div class="head"><h2>${title}</h2><button type="button" class="iconbtn" data-act="close" aria-label="關閉">×</button></div>`;

export function accountSheet(S) {
  const name = S.nickname || S.user.displayName || '旅人';
  openSheet(`${head('帳號')}
    <div class="row"><span class="avatar" data-c="0">${esc(name.slice(0, 1))}</span><div class="grow"><b>${esc(name)}</b><div class="small muted">${esc(S.user.email || 'Google 帳號登入')}</div></div></div>
    <button type="button" class="btn" data-act="install">📲 加到手機主畫面</button>
    ${S.env !== 'production' ? `<button type="button" class="btn" data-act="sample" ${S.offline ? 'disabled' : ''}>載入範例旅程</button>
      <p class="small muted" style="margin:0">範例旅程只會出現在測試環境，方便檢查畫面。</p>` : ''}
    <button type="button" class="btn danger" data-act="signOut">登出</button>`);
}

export function installSheet() {
  openSheet(`${head('加到手機主畫面')}
    <p class="label">iPhone（Safari）</p>
    <ol class="steps"><li>點畫面下方的「分享」按鈕（方框加向上箭頭）</li><li>往下找到「加入主畫面」</li><li>點右上角「新增」，主畫面就會出現沈迷旅行</li></ol>
    <p class="label">Android（Chrome）</p>
    <ol class="steps"><li>點網址列右邊的「⋮」</li><li>選「安裝應用程式」或「加到主畫面」</li></ol>
    <p class="small muted" style="margin:0">Android 會自動跳出安裝提示；iPhone 不會，所以由網站顯示這份說明。</p>`);
}

// 新增旅程；傳入旅程時改成編輯（多了狀態可選）
export function newTripSheet(trip) {
  const r = trip?.raw || {}, type = trip?.type || TRIP_TYPES[0];
  openSheet(`${head(trip ? '編輯旅程' : '新增旅程')}
    <div class="field"><span class="label">類型</span><div class="seg" style="justify-self:start" id="ntType">${TRIP_TYPES.map(t => `<button type="button" data-act="ntType" data-t="${t}" aria-pressed="${t === type}">${TYPE_ICON[t]} ${t}</button>`).join('')}</div></div>
    ${trip ? `<div class="field"><span class="label">狀態</span><div class="seg" style="justify-self:start;max-width:100%;overflow-x:auto" id="ntStatus">${TRIP_STATUSES.map(t => `<button type="button" data-act="ntType" data-t="${t}" aria-pressed="${t === trip.status}">${t}</button>`).join('')}</div></div>` : ''}
    <div class="field"><label for="nt-title">旅程名稱</label><input class="input" id="nt-title" maxlength="40" placeholder="例如：京都賞楓" value="${esc(r.title || '')}"></div>
    <div class="grid2"><div class="field"><label for="nt-start">開始</label><input class="input" id="nt-start" type="date" value="${esc(r.startDate || '')}"></div>
      <div class="field"><label for="nt-end">結束</label><input class="input" id="nt-end" type="date" value="${esc(r.endDate || '')}"></div></div>
    <div class="grid2"><div class="field"><label for="nt-country">國家</label><input class="input" id="nt-country" maxlength="20" placeholder="日本" value="${esc(r.country || '')}"></div>
      <div class="field"><label for="nt-city">城市</label><input class="input" id="nt-city" maxlength="20" placeholder="京都" value="${esc(r.city || '')}"></div></div>
    <p class="small err-text" id="nt-err" role="alert" hidden></p>
    <button type="button" class="btn primary" data-act="${trip ? 'saveTripEdit' : 'saveTrip'}">${trip ? '儲存' : '建立旅程'}</button>`);
}

// 讀取並檢查新增旅程表單；有錯時標示欄位並回傳 null
export function readTripForm() {
  const v = id => ($(`#${id}`)?.value || '').trim();
  const form = {
    tripType: $('#ntType [aria-pressed="true"]')?.dataset.t || '自由行',
    title: v('nt-title'), startDate: v('nt-start'), endDate: v('nt-end'), country: v('nt-country'), city: v('nt-city'),
  };
  if (!form.endDate) form.endDate = form.startDate;
  const fail = (id, msg) => {
    $(`#${id}`).classList.add('err'); $(`#${id}`).focus();
    const box = $('#nt-err'); box.textContent = msg; box.hidden = false;
    return null;
  };
  document.querySelectorAll('#layer .input.err').forEach(el => el.classList.remove('err'));
  if (!form.title) return fail('nt-title', '請填旅程名稱');
  if (!form.startDate) return fail('nt-start', '請選開始日期');
  if (form.endDate < form.startDate) return fail('nt-end', '結束日期不能早於開始日期');
  form.status = $('#ntStatus [aria-pressed="true"]')?.dataset.t || '規劃中';
  return form;
}
