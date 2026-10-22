// 「更多」分頁：同行者、共編成員與邀請連結、旅程設定（規格書 F05、F10–F14）
// 管理同行者、邀請與移除成員、編輯與刪除旅程只有建立者能做；共編成員可以自己退出
import { esc, ICON, openSheet } from '../ui/dom.js';
import { participantsOf } from '../lib/trips.js';
import { memberUids, boundTo } from '../lib/people.js';

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
    <p class="small muted" style="margin:8px 0 0">虛線圈是沒有帳號的人，也能被分攤費用${owner ? '。點頭像可以改名、停用或調整順序' : ''}。</p>
    ${owner && !ownerHasP ? `<button type="button" class="btn sm" data-act="createOwnerP" ${off} style="margin-top:8px">建立我的同行者</button>` : ''}
  </section>
  ${owner ? `<section class="card menulist">
    <button type="button" data-act="editTrip" ${off}><span>✏️</span><span class="grow"><b>編輯旅程名稱與日期</b></span>${ICON.chev}</button>
    <button type="button" class="danger" data-act="delTrip" ${off}><span>🗑️</span><span class="grow"><b>刪除這趟旅程</b></span>${ICON.chev}</button>
  </section>` : ''}
  </div>
  <section class="card">
    <div class="sec-h"><h2>共編成員</h2></div>
    <div class="pertable divide" style="margin-top:6px">${memberUids(t).map((u, i) => `
      <div class="r"><span class="who">${avatar(boundTo(t, u) || { name: nameOf(u), uid: u }, i)}<span>${esc(nameOf(u))}</span>${u === uid ? '<span class="tag accent">我</span>' : ''}<span class="tag">${u === t.ownerId ? '建立者' : '共編成員'}</span></span>
        ${owner && u !== t.ownerId ? `<button type="button" class="btn sm danger" data-act="rmMember" data-id="${esc(u)}" ${off}>移除</button>` : ''}
        ${!owner && u === uid ? `<button type="button" class="btn sm danger" data-act="leaveTrip" ${off}>退出</button>` : ''}
      </div>`).join('')}</div>
    ${owner ? `<div class="field" style="margin-top:10px">
      <button type="button" class="btn primary" data-act="copyInvite">🔗 複製邀請連結</button>
      <input class="input data small" id="invite" readonly value="${esc(inviteUrl(trip))}" aria-label="邀請連結">
      <span class="small muted">傳給朋友，對方登入後選自己是名單上的哪一位，之前分給那個人的費用會算進他的帳號。</span></div>` : ''}
  </section>
  </div>`;
}

// 標題列的快速選單：外觀、加到手機行事曆、使用小技巧，在旅程的哪個分頁都能打開
export function quickSheet(S) {
  openSheet(`${head('快速選單')}
    <div class="field"><span class="label">外觀</span><div class="row" style="flex-wrap:wrap;gap:6px">${[['', '跟著系統'], ['light', '淺色'], ['dark', '深色']].map(([v, t]) => `<button type="button" class="chip" data-act="theme" data-v="${v}" aria-pressed="${(S.theme || '') === v}">${t}</button>`).join('')}</div></div>
    <div class="menulist">
      <button type="button" data-act="exportIcs"><span>📅</span><span class="grow"><b>加到手機行事曆</b><span class="small muted">下載行事曆檔，訂位代號不會放進去；行程有改要再匯出</span></span>${ICON.chev}</button>
      <details>
        <summary><span>💡</span><span class="grow"><b>使用小技巧</b></span>${ICON.chev}</summary>
        <div class="tips">
          <button type="button" class="btn sm" data-act="tourTrip" style="justify-self:start">重看操作導覽</button>
          <p><b>拖曳行程</b>：在行程分頁長按一筆行程（右邊有 ⋮⋮），拖到想放的位置；拖到別天的日期上，會放在那天最後。</p>
          <p><b>離線查看</b>：按旅程標題右邊的下載鈕（離線行程），把這趟存到${S.wide ? '這台電腦' : '這支手機'}，沒有網路也能看行程、班機、住宿、待辦、支出。下載好會變成打勾。</p>
          <p><b>換封面</b>：在行程分頁按封面左下角的「更換封面」，選好照片可以拖曳調整位置。</p>
          ${S.standalone ? '' : `<p><b>加到手機主畫面</b>：像 App 一樣從主畫面打開。</p>
          <button type="button" class="btn sm" data-act="install" style="justify-self:start">📲 怎麼加到主畫面</button>`}
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

export function delTripSheet(trip) {
  openSheet(`${head(`刪除「${esc(trip.name)}」？`)}
    <p style="margin:0">行程、班機、住宿、待辦、支出會一起刪除，無法復原。如果有部分資料刪不掉，會列出是哪些。</p>
    <div class="field"><label for="delname">請輸入旅程名稱「${esc(trip.name)}」確認</label><input class="input" id="delname" autocomplete="off"></div>
    <p class="small err-text" id="del-err" role="alert" hidden></p>
    <div class="row"><button type="button" class="btn grow" data-act="close">取消</button><button type="button" class="btn danger grow" data-act="yesDelTrip">刪除旅程</button></div>`);
}
