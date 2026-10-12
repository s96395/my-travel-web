// 加入旅程頁（規格書 F15）：打開邀請連結 → Google 登入 → 選自己或「我不在名單上」→ 確認 → 完成
import { esc, ICON, money } from '../ui/dom.js';
import { monthDay } from '../lib/dates.js';
import { participantsOf } from '../lib/trips.js';
import { renderLogin } from './login.js';

const OK = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
const avatar = (p, i) => `<span class="avatar${p.uid ? '' : ' unbound'}" data-c="${i % 3}">${esc((p.name || '?').slice(0, 1))}</span>`;

export function renderJoin(S) {
  const J = S.join;
  const step = !S.user ? 1 : J.step === 'confirm' ? 3 : J.step === 'done' ? 4 : 2;
  const bar = `<div class="jsteps">${['登入', '選擇自己', '確認'].map((x, i) => `<span class="${step > i + 1 ? 'done' : step === i + 1 ? 'now' : ''}"><i>${i + 1}</i>${x}</span>`).join('')}</div>`;
  const head = `<header class="appbar" id="appbar"><button type="button" class="iconbtn" data-act="home" aria-label="離開">${ICON.back}</button><h1>加入旅程</h1></header>`;
  if (!S.user) {
    return `${head}<div class="wrap narrow">${bar}
      <p style="margin:0">有人邀請你一起編輯旅程。登入後就能一起看行程、記支出；如果你已經在同行者名單上，下一步可以選擇自己，之前分給你的費用會一起帶過來。</p></div>
      ${renderLogin(S)}`;
  }
  const page = body => `${head}<div class="wrap narrow">${bar}${body}</div>`;
  if (J.step === 'load') return page('<div class="empty">正在讀取邀請內容…</div>');
  if (J.step === 'error') return page(`<div class="card" style="display:grid;gap:10px"><h2 style="font-size:19px">無法加入旅程</h2><p class="small muted" style="margin:0">${esc(J.error)}</p></div><button type="button" class="btn primary block" data-act="home">回首頁</button>`);
  const t = J.trip, people = participantsOf(t).filter(p => p.status !== 'inactive');
  const range = t.startDate ? `${monthDay(t.startDate)} – ${monthDay(t.endDate || t.startDate)}` : '還沒設定日期';
  const tripBox = `<div class="card jtrip"><span class="label">${esc(t.ownerName || '旅程建立者')} 邀請你一起編輯</span><h2>${esc(t.title || '未命名旅程')}</h2>
    <span class="small muted num">${range}・${esc([t.country, t.city].filter(Boolean).join('・') || '未填地點')}</span>
    <div class="row"><div class="people">${people.map(avatar).join('')}</div><span class="small muted">${people.length} 位同行者</span></div></div>`;
  if (J.step === 'already') {
    return page(`${tripBox}<p style="margin:0">你已經加入這趟旅程${J.boundName ? `，帳號綁定為「${esc(J.boundName)}」` : ''}。</p>
      <button type="button" class="btn primary block" data-act="joinEnter">進入旅程</button>`);
  }
  if (J.step === 'pick') {
    return page(`${tripBox}
      <div><h2 style="font-size:19px">你是名單上的哪一位？</h2><p class="small muted" style="margin:4px 0 0">已經有帳號的人不能再選。一個帳號在這趟旅程只能綁一位。</p></div>
      <div class="list">${people.map((p, i) => `<button type="button" class="jpick" data-act="joinPick" data-id="${esc(p.id)}" ${p.uid ? 'disabled' : ''} aria-pressed="${J.pick === p.id}">
          ${avatar(p, i)}<span class="grow"><b>${esc(p.name)}</b><span class="small muted">${p.uid ? '已綁定帳號' : '還沒有帳號'}</span></span><span class="radio"></span></button>`).join('')}
        <button type="button" class="jpick" data-act="joinPick" data-id="new" aria-pressed="${J.pick === 'new'}"><span class="avatar unbound">＋</span><span class="grow"><b>我不在名單上</b><span class="small muted">幫你新增一位同行者</span></span><span class="radio"></span></button>
        ${J.pick === 'new' ? `<div class="field"><label for="joinName">你的名字</label><input class="input" id="joinName" maxlength="40" value="${esc(J.newName)}" placeholder="其他人會看到這個名字"></div>` : ''}
      </div>
      <button type="button" class="btn primary block" data-act="joinNext" ${J.pick && !J.busy ? '' : 'disabled'}>${J.busy ? '處理中…' : '下一步'}</button>`);
  }
  const isNew = J.pick === 'new', name = isNew ? J.newName : people.find(p => p.id === J.pick)?.name || '';
  if (J.step === 'confirm') {
    return page(`<div class="card" style="display:grid;gap:12px">
        <h2 style="font-size:19px">確認綁定為「${esc(name)}」</h2>
        <ul class="steps">
          ${isNew ? `<li>會在同行者名單新增「${esc(name)}」</li>` : `<li>之前分給${esc(name)}的 ${money(J.amount)} 元，會算進你首頁的「我的旅行支出」</li>`}
          <li>你會成為共編成員，可以一起編輯行程、記支出</li>
          <li>綁定後要改，請找建立者${esc(t.ownerName || '')}處理</li>
        </ul>
      </div>
      <div class="row"><button type="button" class="btn grow" data-act="joinBack">上一步</button><button type="button" class="btn primary grow" data-act="joinConfirm" ${J.busy ? 'disabled' : ''}>${J.busy ? '處理中…' : '確認加入'}</button></div>`);
  }
  return page(`<div class="card" style="display:grid;gap:10px;justify-items:center;text-align:center;padding:24px 16px">
      <span style="color:var(--good)">${OK}</span>
      <h2 style="font-size:20px">已加入「${esc(t.title || '')}」</h2>
      <p class="small muted" style="margin:0">你的帳號已綁定為「${esc(name)}」。</p>
    </div>
    <button type="button" class="btn primary block" data-act="joinEnter">進入旅程</button>`);
}
