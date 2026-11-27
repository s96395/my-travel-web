// 「更多」分頁：同行者、共編成員與邀請連結、旅程設定（規格書 F05、F10–F14）
// 管理同行者、邀請與移除成員、編輯與刪除旅程只有建立者能做；共編成員可以自己退出
import { esc, ICON, openSheet } from '../ui/dom.js';
import { participantsOf } from '../lib/trips.js';
import { memberUids, boundTo } from '../lib/people.js';
import { COPY_PARTS, NOT_COPIED, copyEnd } from '../lib/copy.js';
import { monthDay } from '../lib/dates.js';

const head = title => `<div class="head"><h2>${title}</h2><button type="button" class="iconbtn" data-act="close" aria-label="關閉">×</button></div>`;
const avatar = (p, i) => `<span class="avatar${p?.uid ? '' : ' unbound'}" data-c="${i % 3}">${esc((p?.name || '?').slice(0, 1))}</span>`;

// 常用旅伴：其他旅程裡綁定過帳號的人（不含自己，也不含這趟已經綁定的），名字用最近一趟的
export function companionsOf(S, trip) {
  const here = new Set(participantsOf(trip.raw).map(p => p.uid).filter(Boolean)), seen = new Map();
  [...S.trips].sort((a, b) => (b.raw.startDate || '').localeCompare(a.raw.startDate || '')).forEach(t => participantsOf(t.raw).forEach(p => {
    if (p.uid && p.uid !== S.user.uid && !here.has(p.uid) && !seen.has(p.uid)) seen.set(p.uid, { uid: p.uid, name: p.name || '未命名' });
  }));
  return [...seen.values()];
}

export const inviteUrl = trip => `${location.origin}${location.pathname}#/join/${trip.id}/${trip.raw.shareKey || ''}`;

export function renderMore(S, trip) {
  const t = trip.raw, uid = S.user.uid, owner = t.ownerId === uid, off = S.offline ? 'disabled' : '';
  const people = participantsOf(t);
  const ownerHasP = people.some(p => p.uid && p.uid === t.ownerId);
  const nameOf = u => boundTo(t, u)?.name || S.userNames[u] || '讀取中…';
  return `<div class="moregrid"><div class="morecol">
  <section class="card">
    <div class="sec-h"><h2>同行者</h2></div>
    <div class="crew">${people.map((p, i) => {
      const tag = p.status === 'inactive' ? '已停用' : p.uid && p.uid === t.ownerId ? '建立者' : '';
      const inner = `${avatar(p, i)}<span class="nm">${esc(p.name || '未命名')}</span>${tag ? `<span class="sub">${tag}</span>` : ''}`;
      return owner ? `<button type="button" class="mate${p.status === 'inactive' ? ' off' : ''}" data-act="renameP" data-id="${esc(p.id)}" ${off}>${inner}</button>`
        : `<span class="mate${p.status === 'inactive' ? ' off' : ''}">${inner}</span>`;
    }).join('')}${owner ? `<button type="button" class="mate add" data-act="addPerson" ${off}><span class="avatar">＋</span><span class="nm">新增</span></button>` : ''}</div>
    <p class="small muted" style="margin:8px 0 0">虛線圈＝沒有帳號的人</p>
    ${owner && !ownerHasP ? `<button type="button" class="btn sm" data-act="createOwnerP" ${off} style="margin-top:8px">建立我的同行者</button>` : ''}
  </section>
  <section class="card menulist">
    ${owner ? `<button type="button" data-act="editTrip" ${off}><span>${ICON.edit}</span><span class="grow"><b>編輯旅程名稱與日期</b></span>${ICON.chev}</button>` : ''}
    <button type="button" data-act="copyTrip" ${off}><span>${ICON.copy}</span><span class="grow"><b>複製成新的旅程</b><span class="small muted">換個日期再去一次，或拿來當範本</span></span>${ICON.chev}</button>
    ${owner ? `<button type="button" class="danger" data-act="delTrip" ${off}><span>${ICON.trash}</span><span class="grow"><b>刪除這趟旅程</b></span>${ICON.chev}</button>` : ''}
  </section>
  </div>
  <section class="card">
    <div class="sec-h"><h2>共編成員</h2></div>
    <div class="pertable divide" style="margin-top:6px">${memberUids(t).map((u, i) => `
      <div class="r"><span class="who">${avatar(boundTo(t, u) || { name: nameOf(u), uid: u }, i)}<span>${esc(nameOf(u))}</span>${u === uid ? '<span class="tag accent">我</span>' : ''}<span class="tag">${u === t.ownerId ? '建立者' : '共編成員'}</span></span>
        ${owner && u !== t.ownerId ? `<button type="button" class="btn sm danger" data-act="rmMember" data-id="${esc(u)}" ${off}>移除</button>` : ''}
        ${!owner && u === uid ? `<button type="button" class="btn sm danger" data-act="leaveTrip" ${off}>退出</button>` : ''}
      </div>`).join('')}</div>
    ${owner ? `<div class="field" style="margin-top:10px">
      <button type="button" class="btn primary" data-act="copyInvite">${ICON.link}複製邀請連結</button>
      <input class="input data small" id="invite" readonly value="${esc(inviteUrl(trip))}" aria-label="邀請連結"></div>` : ''}
  </section>
  </div>`;
}

// 標題列的快速選單：外觀、複製行程文字、加到手機行事曆、操作導覽、使用小技巧，在旅程的哪個分頁都能打開
export function quickSheet(S) {
  openSheet(`${head('快速選單')}
    <div class="field"><span class="label">外觀</span><div class="row" style="flex-wrap:wrap;gap:6px">${[['', '跟著系統'], ['light', '淺色'], ['dark', '深色']].map(([v, t]) => `<button type="button" class="chip" data-act="theme" data-v="${v}" aria-pressed="${(S.theme || '') === v}">${t}</button>`).join('')}</div></div>
    <div class="menulist">
      <button type="button" data-act="exportText"><span>${ICON.copy}</span><span class="grow"><b>複製行程文字</b><span class="small muted">整趟行程變成文字，可以貼給 ChatGPT 討論；訂位代號不會放進去</span></span>${ICON.chev}</button>
      <button type="button" data-act="exportIcs"><span>${ICON.cal}</span><span class="grow"><b>加到手機行事曆</b><span class="small muted">下載行事曆檔，訂位代號不會放進去；行程有改要再匯出</span></span>${ICON.chev}</button>
      <button type="button" data-act="tourTrip"><span>${ICON.help}</span><span class="grow"><b>操作導覽</b><span class="small muted">一步一步說明這趟旅程每一頁怎麼用</span></span>${ICON.chev}</button>
      <details>
        <summary><span>${ICON.bulb}</span><span class="grow"><b>使用小技巧</b></span>${ICON.chev}</summary>
        <div class="tips">
          <p><b>拖曳行程</b>：在行程分頁長按一筆行程（右邊有 ⋮⋮），拖到想放的位置；拖到別天的日期上，會放在那天最後。</p>
          <p><b>整天對調</b>：長按上面的日期按鈕，拖到另一天的日期上放開，兩天的行程會整天交換，按「復原」可以換回來。</p>
          <p><b>離線查看</b>：按旅程標題右邊的下載鈕（離線行程），把這趟存到${S.wide ? '這台電腦' : '這支手機'}，沒有網路也能看行程、班機、住宿、待辦、支出。下載好會變成打勾。</p>
          <p><b>換封面</b>：${S.wide ? '' : '在「更多」分頁，'}按封面右下角的相機鈕，選好照片可以拖曳調整位置。</p>
          ${S.standalone ? '' : `<p><b>加到手機主畫面</b>：像 App 一樣從主畫面打開。</p>
          <button type="button" class="btn sm" data-act="install" style="justify-self:start">${ICON.phone}怎麼加到主畫面</button>`}
        </div>
      </details>
    </div>`);
}

// companions：常用旅伴；新增時可以直接選，沒有帳號的同行者可以綁到其中一位
// t：旅程資料，有傳就在下面放「往前排」「停用／啟用」
export function personSheet(p, companions = [], t = null) {
  const act = p ? 'bindCompanion' : 'addCompanion';
  const pick = companions.length && !p?.uid ? `<div class="field"><span class="label">${p ? '綁定到常用旅伴' : '從常用旅伴加入'}</span>
    <div class="row" style="flex-wrap:wrap;gap:6px">${companions.map(c => `<button type="button" class="chip" data-act="${act}" data-id="${esc(p?.id || '')}" data-uid="${esc(c.uid)}">${esc(c.name)}</button>`).join('')}</div>
    <span class="small muted">${p ? `綁定後「${esc(p.name)}」會改成對方的名字，` : ''}對方不用打開邀請連結，就會成為共編成員。</span></div>` : '';
  openSheet(`${head(p ? (p.uid ? '修改同行者名字' : '編輯同行者') : '新增同行者')}
    ${pick}
    <div class="field"><label for="pp-name">${pick && !p ? '或只填名字' : '名字'}</label><input class="input" id="pp-name" maxlength="40" value="${esc(p?.name || '')}" placeholder="例如：媽媽"></div>
    <button type="button" class="btn primary" data-act="savePerson" data-id="${esc(p?.id || '')}">${p ? '儲存名字' : '新增'}</button>
    ${p && t ? `<div class="row">
      ${participantsOf(t)[0]?.id !== p.id ? `<button type="button" class="btn grow" data-act="moveP" data-id="${esc(p.id)}">往前排</button>` : ''}
      ${p.uid && p.uid === t.ownerId ? '' : `<button type="button" class="btn grow" data-act="toggleP" data-id="${esc(p.id)}">${p.status === 'inactive' ? '重新啟用' : '停用'}</button>`}
    </div>
    ${p.uid && p.uid === t.ownerId ? '' : '<p class="small muted" style="margin:0">停用的人不會出現在新支出的分攤名單，舊支出的金額保留。</p>'}` : ''}`);
}

export function confirmSheet(title, body, act, label, id = '') {
  openSheet(`${head(title)}<p style="margin:0">${body}</p>
    <div class="row"><button type="button" class="btn grow" data-act="close">取消</button><button type="button" class="btn danger grow" data-act="${act}" data-id="${esc(id)}">${label}</button></div>`);
}

// 複製旅程：選新的出發日與要帶過去的資料；counts 是每種資料目前有幾筆，0 筆的不列
export function copyTripSheet(trip, counts, hasCover) {
  const r = trip.raw, len = r.startDate && r.endDate ? Math.round((new Date(r.endDate) - new Date(r.startDate)) / 86400000) + 1 : 1;
  const people = participantsOf(r).filter(p => p.status !== 'inactive').length;
  const rows = [...COPY_PARTS.filter(([k]) => counts[k] > 0).map(([k, label]) => [k, `${label}（${counts[k]} 筆）`]),
    ...(people > 1 ? [['people', `同行者名單（${people} 人）`]] : []), ...(hasCover ? [['cover', '封面照']] : [])];
  openSheet(`${head('複製成新的旅程')}
    <div class="field"><label for="cp-title">新旅程名稱</label><input class="input" id="cp-title" maxlength="40" value="${esc(`${r.title || ''}（複製）`.slice(0, 40))}"></div>
    <div class="field"><label for="cp-start">新的出發日</label><input class="input" id="cp-start" type="date" value="${esc(r.startDate || '')}">
      <span class="small muted" id="cp-end">${copyEndText(r, r.startDate)}</span></div>
    ${rows.length ? `<p class="label" style="margin:4px 0 0">要一起帶過去的資料</p>
    <div class="divide">${rows.map(([k, label]) => `<label class="todo"><input type="checkbox" data-cp="${k}" checked><span class="grow">${label}</span></label>`).join('')}</div>` : ''}
    <p class="small muted" style="margin:0">共 ${len} 天，班機、住宿、交通的日期會跟著新的出發日往後挪。待辦和行李會變回沒打勾，「已預約」改回「要預約」。${NOT_COPIED}不會帶過去；${people > 1 ? '其他同行者只帶名字，要一起編輯請再從常用旅伴綁定。' : ''}原本這趟不會有任何改變。</p>
    <p class="small err-text" id="cp-err" role="alert" hidden></p>
    <button type="button" class="btn primary" data-act="yesCopyTrip">建立新的旅程</button>`);
}
export function copyEndText(r, start) {
  return start ? `回程日：${monthDay(copyEnd(r, start))}` : '';
}

export function delTripSheet(trip) {
  openSheet(`${head(`刪除「${esc(trip.name)}」？`)}
    <p style="margin:0">行程、班機、住宿、待辦、支出會一起刪除，無法復原。如果有部分資料刪不掉，會列出是哪些。</p>
    <div class="field"><label for="delname">請輸入旅程名稱「${esc(trip.name)}」確認</label><input class="input" id="delname" autocomplete="off"></div>
    <p class="small err-text" id="del-err" role="alert" hidden></p>
    <div class="row"><button type="button" class="btn grow" data-act="close">取消</button><button type="button" class="btn danger grow" data-act="yesDelTrip">刪除旅程</button></div>`);
}

// 沒辦法自動複製時（有些瀏覽器擋剪貼簿），把文字放在框裡讓使用者自己全選複製
export function tripTextSheet(text) {
  openSheet(`${head('行程文字')}
    <p class="small muted" style="margin:0">沒辦法自動複製，請長按下面的文字，選「全選」後複製。</p>
    <textarea class="input" id="trip-text" readonly rows="14" style="font-size:13px;line-height:1.5">${esc(text)}</textarea>`);
}
