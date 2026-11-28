// 底部彈出的選單與表單：帳號、加到主畫面、新增與編輯旅程
import { esc, openSheet, $ } from '../ui/dom.js';
import { TRIP_TYPES, TRIP_STATUSES, TYPE_ICON } from '../lib/trips.js';
import { countryNames, matchPlaces } from '../lib/world.js';

const head = title => `<div class="head"><h2>${title}</h2><button type="button" class="iconbtn" data-act="close" aria-label="關閉">×</button></div>`;

export function accountSheet(S) {
  const name = S.nickname || S.user.displayName || '旅人';
  openSheet(`${head('帳號')}
    <div class="row"><span class="avatar" data-c="0">${esc(name.slice(0, 1))}</span><div class="grow"><b>${esc(name)}</b><div class="small muted">${esc(S.user.email || 'Google 帳號登入')}</div></div></div>
    <div class="field"><span class="label">外觀</span><div class="row" style="flex-wrap:wrap;gap:6px">${[['', '跟著系統'], ['light', '淺色'], ['dark', '深色']].map(([v, t]) => `<button type="button" class="chip" data-act="theme" data-v="${v}" aria-pressed="${(S.theme || '') === v}">${t}</button>`).join('')}</div></div>
    <button type="button" class="btn" data-act="install">📲 加到手機主畫面</button>
    <button type="button" class="btn" data-act="tourHome">💡 重看操作導覽</button>
    ${S.env !== 'production' ? `<button type="button" class="btn" data-act="sample" ${S.offline ? 'disabled' : ''}>載入範例旅程</button>
      <p class="small muted" style="margin:0">範例旅程只會出現在測試環境，方便檢查畫面。</p>` : ''}
    <button type="button" class="btn" data-act="privacy">隱私權說明</button>
    <button type="button" class="btn danger" data-act="signOut">登出</button>
    <button type="button" class="linkbtn" style="justify-self:center" data-act="delAccount" ${S.offline ? 'disabled' : ''}>刪除帳號</button>`);
}

export function delAccountSheet() {
  openSheet(`${head('刪除帳號？')}
    <ol class="steps"><li>你自己建立、沒有其他成員的旅程會整趟刪除。</li>
      <li>還有其他成員的旅程會轉給最早加入的成員，你會退出。</li>
      <li>你在旅程裡的名字和分攤金額會保留，改成沒有帳號的同行者。</li></ol>
    <p style="margin:0">刪除後無法復原。Google 可能會請你再登入一次確認身分。</p>
    <div class="field"><label for="delacc">請輸入「刪除」確認</label><input class="input" id="delacc" autocomplete="off"></div>
    <p class="small err-text" id="del-err" role="alert" hidden></p>
    <div class="row"><button type="button" class="btn grow" data-act="close">取消</button><button type="button" class="btn danger grow" data-act="yesDelAccount">刪除帳號</button></div>`);
}

export function privacySheet() {
  openSheet(`${head('隱私權說明')}
    <p class="label">我們會存哪些資料</p>
    <ol class="steps"><li>登入用的 Google 帳號名稱與 Email，由 Google 的 Firebase 負責驗證與保存。</li>
      <li>你和旅伴輸入的旅程內容：行程、班機、住宿（含訂位代號）、待辦、支出、同行者名字與封面照。</li></ol>
    <p class="label">用在哪裡、誰看得到</p>
    <ol class="steps"><li>只用來提供網站功能，不會賣給別人，也不會拿來打廣告。</li>
      <li>旅程內容只有同一趟的成員看得到；網站管理者只在處理問題時查看。</li>
      <li>下載供離線使用的旅程存在你的裝置上，登出時會清除。</li></ol>
    <p class="label">幫沒有帳號的旅伴建名字</p>
    <p class="small" style="margin:0">對方沒有參與同意，建議填暱稱就好，不要填全名或其他個人資料。</p>
    <p class="label">查詢、更正或刪除</p>
    <p class="small" style="margin:0">旅程內容可以自己修改或刪除。要刪除整個帳號，可以在帳號選單按「刪除帳號」；其他問題請寄信到 s96395@gmail.com。</p>`);
}

// 加到主畫面：依手機種類只顯示該看的說明；在 LINE、FB、IG 裡開啟時要先改用瀏覽器
const shareIc = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M7 10H5.5v10.5h13V10H17"/></svg>';
const plusIc = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" style="vertical-align:-3px"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8.5v7M8.5 12h7"/></svg>';
export function installSheet({ ios = false, android = false, inApp = '', canInstall = false, standalone = false } = {}) {
  const iosSteps = `<ol class="steps"><li>點 Safari 下方的分享按鈕 ${shareIc}（沒看到的話，先點右下角的「⋯」）</li>
      <li>往下滑，點「加入主畫面」${plusIc}</li><li>點右上角「新增」，主畫面就會出現沈迷旅行</li></ol>`;
  const androidSteps = '<ol class="steps"><li>點 Chrome 網址列右邊的「⋮」</li><li>選「安裝應用程式」或「加到主畫面」</li></ol>';
  let body;
  if (standalone) body = '<p style="margin:0">已經是從主畫面開啟，不用再加一次。</p>';
  else if (inApp) body = `<p style="margin:0"><b>請先改用 ${ios ? 'Safari' : 'Chrome'} 開啟</b></p>
    <p class="small muted" style="margin:0">你現在是在 ${inApp} 裡開啟，這裡沒辦法加到主畫面。請點畫面角落的「⋯」選「用瀏覽器開啟」，或複製網址貼到 ${ios ? 'Safari' : 'Chrome'}，再照說明加入。</p>
    <button type="button" class="btn block" data-act="copyPageUrl">複製網址</button>`;
  else if (ios) body = `${iosSteps}<p class="small muted" style="margin:0">iPhone 沒有一鍵安裝，要從分享選單加入。</p>`;
  else if (canInstall) body = `<p style="margin:0">按下面的按鈕，再按「安裝」，主畫面就會出現沈迷旅行。</p>
    <button type="button" class="btn primary" data-act="installNow">安裝到主畫面</button>`;
  else if (android) body = androidSteps;
  else body = `<p class="label">iPhone（Safari）</p>${iosSteps}<p class="label">Android（Chrome）</p>${androidSteps}`;
  openSheet(`${head('加到手機主畫面')}${body}`);
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
    <div class="grid2"><div class="field"><label for="nt-country">國家</label><input class="input" id="nt-country" list="nt-countries" maxlength="40" autocomplete="off" placeholder="輸入關鍵字，例如：日" value="${esc(r.country || '')}" data-old="${esc(r.country || '')}">
        <datalist id="nt-countries"></datalist></div>
      <div class="field"><label for="nt-city">城市</label><input class="input" id="nt-city" maxlength="20" placeholder="京都" value="${esc(r.city || '')}"></div></div>
    <p class="small muted" style="margin:0">國家要從選單挑，首頁足跡地圖才會算進去；去好幾國用頓號分開，例如：泰國、越南。${trip && !r.country ? '這趟旅程還沒填國家。' : ''}</p>
    <p class="small err-text" id="nt-err" role="alert" hidden></p>
    <button type="button" class="btn primary" data-act="${trip ? 'saveTripEdit' : 'saveTrip'}">${trip ? '儲存' : '建立旅程'}</button>`);
  // 選單候選前面帶上已填的國家，去多國時打「泰國、越」也會跳出「泰國、越南」
  const box = $('#nt-country'), list = $('#nt-countries');
  const fill = () => {
    const pre = box.value.replace(/[^、,，/／;；&＋+]*$/, '');
    list.innerHTML = countryNames().map(n => `<option value="${esc(pre + n)}">`).join('');
  };
  box.addEventListener('input', fill);
  fill();
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
  // 新旅程國家必填；舊旅程沒填或沒改過就不擋，改了才要對得到選單上的國家
  const editing = !!$('#ntStatus');
  if (!form.country && !editing) return fail('nt-country', '請選國家');
  if (form.country && !(editing && form.country === $('#nt-country').dataset.old)) {
    const m = matchPlaces(form.country);
    if (!m.ids.length || m.unmatched.length) return fail('nt-country', `找不到「${m.unmatched[0] || form.country}」，請從選單挑國家`);
  }
  form.status = $('#ntStatus [aria-pressed="true"]')?.dataset.t || '規劃中';
  return form;
}
