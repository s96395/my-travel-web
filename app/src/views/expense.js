// 支出分頁：明細、分攤、結算、公費（規格書 F50–F56、S06、S07）
// 手機用分段切換；電腦左邊明細、右邊切換分攤或結算，公費另一頁
import { esc, ICON, TYPE_ICO, money, openSheet, $ } from '../ui/dom.js';
import { participantsOf, myParticipantId } from '../lib/trips.js';
import { isMember } from '../lib/people.js';
import {
  CATS, PAYS, FUND, MULTI, paidOf, amountOf, payMethodOf, equalSplit, sharesOf, isSplit, modeOf, perPerson, byCategory,
  fundOf, fundIn, fundOut, settlement, repaidKey,
} from '../lib/expenses.js';

const head = title => `<div class="head"><h2>${title}</h2><button type="button" class="iconbtn" data-act="close" aria-label="關閉">×</button></div>`;
const avatar = (p, i) => `<span class="avatar${p?.uid ? '' : ' unbound'}" data-c="${i % 3}">${esc((p?.name || '?').slice(0, 1))}</span>`;
const ms = t => (t && typeof t.toMillis === 'function' ? t.toMillis() : Infinity); // 剛新增還沒寫進伺服器的排最前面
const md = t => (t && typeof t.toDate === 'function' ? `${t.toDate().getMonth() + 1}/${t.toDate().getDate()}` : '');
const off = S => (S.offline ? 'disabled' : '');

// 這趟旅程的同行者、名字與顏色
export function ctxOf(S, trip) {
  const people = participantsOf(trip.raw);
  const idx = new Map(people.map((p, i) => [p.id, i]));
  return {
    trip, people, idx,
    active: people.filter(p => p.status !== 'inactive'),
    me: myParticipantId(trip.raw, S.user.uid),
    fund: fundOf(trip.raw),
    expenses: S.expenses.get(trip.id),
    deposits: S.depositDocs,
    name: id => (id === FUND ? '公費' : id === MULTI ? '多人' :people.find(p => p.id === id)?.name || '已離開的成員'),
    av: id => avatar(people.find(p => p.id === id), idx.get(id) ?? 0),
  };
}
// 共編成員都可以修改、刪除
export const canEdit = (S, trip) => isMember(trip.raw, S.user.uid);

export function renderExp(S, trip) {
  const c = ctxOf(S, trip);
  if (!c.expenses) return '<div class="empty">正在讀取支出…</div>';
  // 電腦：左邊固定是明細，右邊一次只看「分攤」或「結算」，和手機的分頁一致
  if (S.wide) {
    const seg = ['settle', 'fund'].includes(S.expSeg) ? S.expSeg : 'share';
    return `${segs(S, [['share', '分攤'], ['settle', '結算'], ['fund', '公費']], seg)}
    ${seg === 'fund' ? `<div class="narrowcol">${expFund(S, c)}</div>`
      : `<div class="split2"><div class="col">${expList(S, c)}</div><div class="col side">${seg === 'settle' ? expSettle(S, c) : expShare(S, c)}</div></div>`}`;
  }
  const seg = ['list', 'share', 'settle', 'fund'].includes(S.expSeg) ? S.expSeg : 'list';
  return `${segs(S, [['list', '明細'], ['share', '分攤'], ['settle', '結算'], ['fund', '公費']], seg)}
  ${{ list: expList, share: expShare, settle: expSettle, fund: expFund }[seg](S, c)}`;
}

const segs = (S, list, cur) => `<div class="seg" style="justify-self:start;max-width:100%;overflow-x:auto">${list.map(s => `<button type="button" data-act="expSeg" data-v="${s[0]}" aria-pressed="${cur === s[0]}">${s[1]}</button>`).join('')}</div>`;

function expList(S, c) {
  const all = [...c.expenses].sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  const total = all.reduce((a, e) => a + amountOf(e), 0);
  const notSplit = all.filter(e => !isSplit(e, c.people)).length;
  const list = S.expFilter === 'none' ? all.filter(e => !isSplit(e, c.people)) : all;
  const mine = c.me ? perPerson(all, c.people)[c.me] : null;
  return `
  <div class="summary">
    <div class="card"><span class="label">這趟總支出</span><b class="num">${money(total)}</b><span class="small muted">${all.length} 筆</span></div>
    <div class="card"><span class="label">我的負擔</span><b class="num">${mine === null ? '—' : money(mine)}</b><span class="small muted">${mine === null ? '你還不在同行者名單裡' : esc(c.name(c.me))}</span></div>
  </div>
  <div class="row">
    <div class="chips grow">
      <button type="button" class="chip" data-act="expFilter" data-v="all" aria-pressed="${S.expFilter !== 'none'}">全部</button>
      <button type="button" class="chip" data-act="expFilter" data-v="none" aria-pressed="${S.expFilter === 'none'}">尚未分攤 ${notSplit}</button>
    </div>
    <button type="button" class="btn sm primary" data-act="newExp" ${off(S)}>${ICON.plus}記一筆</button>
  </div>
  ${catStrip(all)}
  <div class="list exprows">${groups(list).map(g => `<div class="dgroup"><span>${esc(g.day || '沒有日期')}</span><span class="num">${money(g.sum)}</span></div>${g.list.map(e => expRow(c, e)).join('')}`).join('') || `<div class="empty">${S.expFilter === 'none' ? '沒有尚未分攤的支出' : '還沒有支出，按「記一筆」開始記帳'}</div>`}</div>`;
}

// 依新增日期分組（列表已經是新的在前）
function groups(list) {
  const out = [];
  for (const e of list) {
    const day = md(e.createdAt), g = out[out.length - 1];
    if (g && g.day === day) { g.list.push(e); g.sum += amountOf(e); } else out.push({ day, list: [e], sum: amountOf(e) });
  }
  return out;
}

// 一條色條看錢花在哪一類，下面列出前四類的比例
function catStrip(all) {
  const cats = byCategory(all), total = cats.reduce((a, x) => a + x[1], 0);
  if (!total) return '';
  const pct = v => Math.round(v / total * 100);
  return `<div class="catstrip"><div class="bar" role="img" aria-label="${esc(cats.map(x => `${x[0]} ${pct(x[1])}%`).join('、'))}">${cats.map(x => `<i style="flex:${x[1]};--k:${CAT_COLOR[x[0]] || CAT_COLOR.其他}"></i>`).join('')}</div>
    <div class="legend small">${cats.slice(0, 4).map(x => `<span><i style="--k:${CAT_COLOR[x[0]] || CAT_COLOR.其他}"></i>${esc(x[0])} ${pct(x[1])}%</span>`).join('')}</div></div>`;
}

function expRow(c, e) {
  const s = sharesOf(e, c.people), split = isSplit(e, c.people), mode = modeOf(e, c.people);
  const cat = e.category || '其他';
  const payIds = e.payerId === MULTI ? Object.keys(paidOf(e)) : e.payerId ? [e.payerId] : [];
  const payAv = id => (id === FUND ? '<span class="avatar sym">公</span>' : c.av(id));
  const shareIds = split ? Object.keys(s).filter(id => !payIds.includes(id)) : [];
  const note = !e.payerId ? '<span class="flag">還沒填誰付的</span>' : !split ? '<span class="flag bad">還沒分攤</span>'
    : [e.payerId === FUND ? '公費付' : '', mode === 'equal' ? '平均' : '自訂金額', payMethodOf(e)].filter(Boolean).map(esc).join('・');
  return `<button type="button" class="exprow" data-act="editExp" data-id="${esc(e.id)}" style="--k:${CAT_COLOR[cat] || CAT_COLOR.其他}">
    <span class="cat" role="img" aria-label="${esc(cat)}">${CAT_ICON[cat] || ICON.box}</span>
    <span class="grow"><b>${esc(e.name)}</b><span class="small muted">${note}</span></span>
    <span class="right"><b class="amt num">${money(amountOf(e))}</b>
      ${payIds.length || shareIds.length ? `<span class="people" aria-label="${esc(payIds.map(c.name).join('、'))}付款${shareIds.length ? `，${esc(shareIds.map(c.name).join('、'))}分攤` : ''}">${payIds.map(id => `<span class="paid">${payAv(id)}</span>`).join('')}${shareIds.slice(0, 4).map(c.av).join('')}${shareIds.length > 4 ? `<span class="avatar sym">+${shareIds.length - 4}</span>` : ''}</span>` : ''}
    </span>
  </button>`;
}

function expShare(S, c) {
  const t = perPerson(c.expenses, c.people);
  const total = c.expenses.filter(e => isSplit(e, c.people)).reduce((a, e) => a + amountOf(e), 0);
  const ids = [...c.people.filter(p => p.status !== 'inactive' || t[p.id]).map(p => p.id), ...Object.keys(t).filter(k => t[k] && !c.idx.has(k))];
  const cats = byCategory(c.expenses), max = Math.max(1, ...cats.map(x => x[1]));
  const unbound = c.people.filter(p => !p.uid && p.status !== 'inactive').map(p => p.name);
  return `
  <section class="card">
    <div class="sec-h"><h2>每人負擔</h2><span class="small muted num">已分攤 ${money(total)}</span></div>
    <div class="pertable divide" style="margin-top:6px">${ids.map(id => {
      const p = c.people.find(x => x.id === id);
      return `<div class="r"><span class="who">${c.av(id)}<span>${esc(c.name(id))}</span>${id === c.me ? '<span class="tag accent">我</span>' : ''}${p && !p.uid ? '<span class="tag">沒有帳號</span>' : ''}</span><b class="num">${money(t[id])}</b></div>`;
    }).join('') || '<p class="small muted">還沒有同行者</p>'}</div>
    ${unbound.length ? `<p class="small muted" style="margin:6px 0 0">${esc(unbound.join('、'))}沒有帳號，這裡看得到該負擔多少，但不會有個人首頁統計。</p>` : ''}
  </section>
  <section class="card">
    <div class="sec-h"><h2>依分類</h2></div>
    <div class="catbars" style="margin-top:10px">${cats.map(x => `<div class="r"><span>${esc(x[0])}</span><div class="bar"><i style="width:${x[1] / max * 100}%"></i></div><span class="num">${money(x[1])}</span></div>`).join('') || '<p class="small muted">還沒有支出</p>'}</div>
  </section>`;
}

function expSettle(S, c) {
  const s = settlement(c.expenses, c.people, c.fund, c.deposits);
  const repaid = c.trip.raw.repaid || {};
  const warn = [s.noPayer && `${s.noPayer} 筆沒填付款人`, s.notSplit && `${s.notSplit} 筆尚未分攤`, s.fundOff && `${s.fundOff} 筆公費支付（公費已關閉）`].filter(Boolean);
  const rowIds = [...c.active.map(p => p.id), ...Object.keys(s.rows).filter(k => !c.active.some(p => p.id === k) && (s.rows[k].paid || s.rows[k].owe))];
  return `
  <section class="card">
    <div class="sec-h"><h2>誰該給誰</h2><span class="small muted">旅途中隨時可看</span></div>
    <div class="settle divide" style="margin-top:4px">${s.tx.map(x => {
      const key = repaidKey(x), paid = !!repaid[key];
      return `<div class="r${paid ? ' paid' : ''}">
        <div class="flow">${c.av(x.from)}<span>${esc(c.name(x.from))}</span><span class="muted">給</span>${c.av(x.to)}<span>${esc(c.name(x.to))}</span></div>
        <div style="display:grid;justify-items:end;gap:6px"><b class="num" style="font-family:var(--font-data)">${money(x.v)}</b>${paid ? '<span class="tag good">已還款</span>' : ''}
        <button type="button" class="btn sm" data-act="repaid" data-k="${esc(key)}" ${off(S)}>${paid ? '取消標記' : '標記已還款'}</button></div>
      </div>`;
    }).join('') || '<div class="empty">目前大家都不欠錢</div>'}</div>
    ${warn.length ? `<div class="check" style="margin-top:8px;background:color-mix(in srgb,var(--warn) 12%,var(--surface));color:var(--warn)">還有 ${warn.join('、')}，這些沒有算進來</div>` : ''}
  </section>
  <section class="card">
    <div class="sec-h"><h2>每人差額</h2><span class="small muted">已付 − 應負擔</span></div>
    <div class="diff divide" style="margin-top:6px">
      <div class="r h"><span>同行者</span><span>已付</span><span>應負擔</span><span>差額</span></div>
      ${rowIds.map(id => {
        const r = s.rows[id] || { paid: 0, owe: 0 }, d = Math.round((s.diff[id] || 0) * 100) / 100;
        return `<div class="r"><span>${esc(c.name(id))}${c.fund.on && c.fund.keeper === id ? ' <span class="tag accent">保管公費</span>' : ''}</span><span class="num">${money(r.paid)}</span><span class="num">${money(r.owe)}</span><span class="num ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}">${d > 0 ? '+' : ''}${money(d)}</span></div>`;
      }).join('')}
    </div>
    <p class="small muted" style="margin:8px 0 0">${c.fund.on ? `已付包含放進公費的錢。公費還剩 ${money(s.balance)}，在保管人${esc(c.name(c.fund.keeper))}手上，所以從保管人的差額扣掉。` : '這趟沒有開公費。'}</p>
  </section>`;
}

function expFund(S, c) {
  if (!c.fund.on) {
    return `
  <section class="card" style="display:grid;gap:10px">
    <h2 style="font-size:17px">這趟沒有開公費</h2>
    <p class="small muted" style="margin:0">開了以後，大家先把錢交給一位保管人，車票、門票等共同花費可以直接記成「公費支付」，結算時會一起算。</p>
    <button type="button" class="btn primary" data-act="fundOn" ${off(S)}>開啟公費</button>
  </section>`;
  }
  const bal = fundIn(c.deposits) - fundOut(c.expenses), used = c.expenses.filter(e => e.payerId === FUND);
  const keepers = c.active.some(p => p.id === c.fund.keeper) ? c.active : [...c.active, { id: c.fund.keeper, name: c.name(c.fund.keeper) }];
  return `
  <section class="card" style="display:grid;gap:12px">
    <div class="fundbal"><div><span class="label">公費餘額</span><br><b class="num ${bal < 0 ? 'neg' : ''}">${money(bal)}</b></div>
      <div class="small muted" style="text-align:right">收入 ${money(fundIn(c.deposits))}<br>支出 ${money(fundOut(c.expenses))}</div></div>
    ${bal < 0 ? `<div class="check bad">公費不夠，保管人先墊了 ${money(-bal)}，結算時會算回保管人</div>` : ''}
    <div class="field"><label for="keeper">保管人</label>
      <select class="select" id="keeper" ${off(S)}>${keepers.map(p => `<option value="${esc(p.id)}" ${c.fund.keeper === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
  </section>
  <section class="card">
    <div class="sec-h"><h2>放入紀錄</h2><button type="button" class="btn sm" data-act="addDeposit" ${off(S)}>${ICON.plus}放入</button></div>
    <div class="pertable divide" style="margin-top:6px">${c.deposits.map(d => `<div class="r"><span class="who">${c.av(d.pid)}${esc(c.name(d.pid))}</span><span class="row" style="gap:6px"><b class="num">${money(d.amount)}</b>${canEdit(S, c.trip, d) ? `<button type="button" class="more" data-act="delDeposit" data-id="${esc(d.id)}" ${off(S)} aria-label="刪除這筆放入紀錄">×</button>` : ''}</span></div>`).join('') || '<p class="small muted">還沒有人放錢</p>'}</div>
  </section>
  <section class="card">
    <div class="sec-h"><h2>公費支付的支出</h2></div>
    <div class="pertable divide" style="margin-top:6px">${used.map(e => `<div class="r"><span>${esc(e.name)}</span><b class="num">${money(amountOf(e))}</b></div>`).join('') || '<p class="small muted">還沒有</p>'}</div>
  </section>
  <button type="button" class="btn danger" data-act="fundOff" ${off(S)}>關閉公費</button>`;
}

/* ---------- 記一筆／編輯支出 ---------- */
// 表單的暫存內容；改了任何欄位 dirty 就變成 true，關閉時會提醒
export function expDraft(S, trip, e) {
  const c = ctxOf(S, trip), active = c.active.map(p => p.id);
  if (!e) return { id: null, name: '', amt: '', cat: '餐飲', pay: '現金', payer: c.me || '', paid: {}, mode: 'equal', sel: new Set(active), custom: {}, note: '', by: '', edit: true, dirty: false };
  const s = sharesOf(e, c.people) || {}, mode = modeOf(e, c.people);
  const custom = {}, paid = {};
  for (const k in s) custom[k] = String(s[k]);
  if (e.payerId === MULTI) { const pd = paidOf(e); for (const k in pd) paid[k] = String(pd[k]); }
  return {
    id: e.id, name: e.name || '', amt: String(amountOf(e) || ''), cat: e.category || '其他', pay: payMethodOf(e) || '其他',
    payer: e.payerId || '', paid, mode, sel: new Set(mode === 'none' ? active : Object.keys(s)), custom, note: e.note || '',
    by: e.createdByName || '', edit: canEdit(S, trip, e), dirty: false,
  };
}

const num = v => Number(v) || 0;
const round2 = v => Math.round(v * 100) / 100;
// 依名單順序列出勾選的人（平均分攤的餘數照這個順序分）
const selected = (list, d) => list.filter(p => d.sel.has(p.id)).map(p => p.id);

// 多人一起付：每人付的金額加總要等於總金額
export function payerCheck(d) {
  if (d.payer !== MULTI) return { ok: true, html: '' };
  const amt = num(d.amt), paid = Object.values(d.paid || {}).map(num).filter(v => v > 0);
  const sum = round2(paid.reduce((a, v) => a + v, 0)), gap = round2(amt - sum);
  if (paid.length < 2) return { ok: false, html: '<div class="check bad">請填至少兩位付款人的金額</div>' };
  return gap === 0 ? { ok: true, html: `<div class="check good"><span>${paid.length} 人付款，加總等於總金額</span><b class="num">${money(amt)}</b></div>` }
    : { ok: false, html: `<div class="check bad"><span>付款${gap > 0 ? '還差' : '多了'} ${Math.abs(gap).toLocaleString('zh-TW')}，對齊後才能儲存</span><b class="num">${sum.toLocaleString('zh-TW')} / ${amt.toLocaleString('zh-TW')}</b></div>` };
}

export function draftCheck(d, list) {
  const amt = num(d.amt), ids = selected(list, d);
  const sum = round2(ids.reduce((a, k) => a + num(d.custom[k]), 0)), gap = round2(amt - sum);
  let ok = !!d.name.trim() && amt > 0 && payerCheck(d).ok, html = '';
  if (d.mode === 'equal') {
    ok = ok && ids.length > 0;
    html = ids.length ? `<div class="check good"><span>${ids.length} 人平均，加總等於總金額</span><b class="num">${money(amt)}</b></div>` : '<div class="check bad">請至少勾選一位分攤對象</div>';
  } else if (d.mode === 'custom') {
    ok = ok && ids.length > 0 && gap === 0;
    html = !ids.length ? '<div class="check bad">請至少勾選一位分攤對象</div>'
      : gap === 0 ? `<div class="check good"><span>加總等於總金額</span><b class="num">${money(amt)}</b></div>`
        : `<div class="check bad"><span>${gap > 0 ? '還差' : '多了'} ${Math.abs(gap).toLocaleString('zh-TW')}，對齊後才能儲存</span><b class="num">${sum.toLocaleString('zh-TW')} / ${amt.toLocaleString('zh-TW')}</b></div>`;
  }
  return { ok, html };
}

// 分攤名單：目前的同行者，加上這筆原本就有分攤、但已停用或已離開的人
export function shareList(c, d) {
  const extra = [...d.sel].filter(id => !c.active.some(p => p.id === id))
    .map(id => c.people.find(p => p.id === id) || { id, name: c.name(id), uid: 'gone', status: 'gone' });
  return [...c.active, ...extra];
}

// 點選用的圓形按鈕（裡面是隱藏的單選或核取方塊，沿用原本的 data-f 輸入事件）
const CAT_COLOR = { 交通: '#2f80c9', 住宿: '#7a5bc7', 餐飲: '#e8792b', 景點: '#2a9d6e', 購物: '#d1477a', '保險/簽證': '#5b6b80', 潛水費用: '#1f8fb3', 電信費: '#9a7b2f', 其他: '#7b8794' };
const CAT_ICON = { 交通: ICON.train, 住宿: ICON.bed, 餐飲: ICON.food, 景點: ICON.ticket, 購物: ICON.shop, '保險/簽證': ICON.passport, 潛水費用: TYPE_ICO['潛旅'], 電信費: ICON.signal, 其他: ICON.box };
const pick = (f, i, v, on, dis, icon, text) => `<label class="pick"><input type="radio" name="x-${f}" id="x-${f}-${i}" data-f="${f}" value="${esc(v)}" ${on ? 'checked' : ''} ${dis}>${icon}<span>${esc(text)}</span></label>`;
function payerAv(c, id) {
  if (id === FUND) return '<span class="avatar sym">公</span>';
  if (id === MULTI) return '<span class="avatar sym">多</span>';
  if (!id) return '<span class="avatar sym">?</span>';
  return c.av(id);
}

export function expSheetHtml(S, trip, d) {
  const c = ctxOf(S, trip), list = shareList(c, d), dis = d.edit && !S.offline ? '' : 'disabled';
  const eq = equalSplit(num(d.amt), selected(list, d)), chk = draftCheck(d, list);
  const payers = c.active.map(p => [p.id, p.name]);
  if (c.active.length > 1 || d.payer === MULTI) payers.push([MULTI, '多人']);
  const payIds = d.payer === MULTI ? [...c.active.map(p => p.id), ...Object.keys(d.paid).filter(k => !c.active.some(p => p.id === k))] : [];
  if (c.fund.on || d.payer === FUND) payers.push([FUND, c.fund.on ? '公費' : '公費（已關閉）']);
  if (d.payer && !payers.some(o => o[0] === d.payer)) payers.push([d.payer, c.name(d.payer)]);
  payers.push(['', '還不確定']);
  const cats = CATS.includes(d.cat) ? CATS : [...CATS, d.cat], pays = PAYS.includes(d.pay) ? PAYS : [...PAYS, d.pay];
  const inactive = c.people.filter(p => p.status === 'inactive').map(p => p.name);
  return `
    ${head(d.id ? (d.edit ? '編輯支出' : '支出內容') : '記一筆支出')}
    ${d.askClose ? '<div class="confirm"><span>剛剛的修改還沒儲存，確定要離開嗎？</span><div class="row"><button type="button" class="btn sm" data-act="stayExp">繼續編輯</button><button type="button" class="btn sm danger" data-act="discardExp">不儲存，離開</button></div></div>' : ''}
    <div class="amtbox">
      <label class="label" for="x-amt">金額（新台幣）</label>
      <input class="amtin data" id="x-amt" data-f="amt" inputmode="decimal" value="${esc(d.amt)}" placeholder="0" ${dis}>
      <input class="namein" id="x-name" data-f="name" maxlength="100" value="${esc(d.name)}" placeholder="這筆是什麼？例如：錦市場午餐" aria-label="名稱" ${dis}>
    </div>
    <div class="picks" role="radiogroup" aria-label="分類">${cats.map((x, i) => pick('cat', i, x, d.cat === x, dis, `<i>${CAT_ICON[x] || ICON.box}</i>`, x)).join('')}</div>
    <div class="field"><span class="label">誰付的錢</span>
      <div class="picks who" role="radiogroup" aria-label="誰付的錢">${payers.map((o, i) => pick('payer', i, o[0], d.payer === o[0], dis, payerAv(c, o[0]), o[1])).join('')}</div>
      ${d.payer ? '' : '<p class="small muted" style="margin:0">還不確定誰付的，這筆先不算進結算。</p>'}
    </div>
    ${d.payer === MULTI ? `<div class="field"><span class="label">每人付了多少</span>
      <div class="split-who divide">${payIds.map(id => `<label class="r"><span class="grow">${esc(c.name(id))}</span>
        <input class="input" data-paid="${esc(id)}" inputmode="decimal" value="${esc(d.paid[id] ?? '')}" placeholder="0" ${dis} aria-label="${esc(c.name(id))} 付的金額"></label>`).join('')}</div>
      ${payerCheck(d).html}</div>` : ''}
    <div class="field"><span class="label">付款方式</span>
      <div class="chips" role="radiogroup" aria-label="付款方式">${pays.map((x, i) => `<label class="chip"><input type="radio" name="x-pay" id="x-pay-${i}" data-f="pay" value="${esc(x)}" ${d.pay === x ? 'checked' : ''} ${dis}>${esc(x)}</label>`).join('')}</div>
    </div>
    <div class="field"><span class="label">費用分攤</span>
      <div class="seg" style="justify-self:start">${[['equal', '平均'], ['custom', '自訂金額'], ['none', '先不分攤']].map(m => `<button type="button" data-act="expMode" data-v="${m[0]}" aria-pressed="${d.mode === m[0]}" ${dis}>${m[1]}</button>`).join('')}</div>
    </div>
    ${d.mode === 'none' ? '<p class="small muted" style="margin:0">這筆會標成「尚未分攤」，之後再回來補。</p>' : d.mode === 'equal' ? `
    <div class="picks who share" aria-label="誰要分攤">${list.map((p, i) => `
      <label class="pick"><input type="checkbox" id="x-sel-${i}" data-sel="${esc(p.id)}" ${d.sel.has(p.id) ? 'checked' : ''} ${dis}>
        ${avatar(p, c.idx.get(p.id) ?? 0)}<span>${esc(p.name)}${p.status === 'inactive' ? '（已停用）' : p.status === 'gone' ? '（已離開）' : ''}</span>
        <b class="num small">${d.sel.has(p.id) ? money(eq[p.id] || 0) : '不分'}</b></label>`).join('')}</div>
    ${chk.html}` : `
    <div class="split-who divide">${list.map(p => `
      <label class="r">
        <input type="checkbox" data-sel="${esc(p.id)}" ${d.sel.has(p.id) ? 'checked' : ''} ${dis}>
        <span class="grow">${esc(p.name)}${p.uid ? '' : '<span class="tag">沒有帳號</span>'}${p.status === 'inactive' ? '<span class="tag warn">已停用</span>' : p.status === 'gone' ? '<span class="tag warn">已離開</span>' : ''}</span>
        <input class="input" data-cust="${esc(p.id)}" inputmode="decimal" value="${d.sel.has(p.id) ? esc(d.custom[p.id] ?? '') : ''}" ${d.sel.has(p.id) && !dis ? '' : 'disabled'} aria-label="${esc(p.name)} 的金額">
      </label>`).join('')}</div>
    ${chk.html}`}
    ${d.mode !== 'none' && inactive.length ? `<p class="small muted" style="margin:0">${esc(inactive.join('、'))}已停用，不列入新支出。</p>` : ''}
    <div class="field"><label for="x-note">備註</label><input class="input" id="x-note" data-f="note" maxlength="200" value="${esc(d.note)}" ${dis}></div>
    ${d.confirmDel ? `<div class="confirm"><span>確定刪除「${esc(d.name)}」？刪除後無法復原。</span><div class="row"><button type="button" class="btn sm" data-act="noDelExp">取消</button><button type="button" class="btn sm danger" data-act="yesDelExp">刪除</button></div></div>` : ''}
    ${d.edit ? `<div class="row">
      ${d.id && !S.offline ? '<button type="button" class="btn danger" data-act="askDelExp">刪除</button>' : ''}
      <button type="button" class="btn primary grow" data-act="saveExp" ${chk.ok && !d.saving && !S.offline ? '' : 'disabled'}>${d.saving ? '儲存中…' : S.offline ? '離線中無法儲存' : '儲存'}</button>
    </div>` : ''}
    ${d.by ? `<p class="small muted" style="margin:0;text-align:center">${esc(d.by)} 新增</p>` : ''}`;
}

// 重畫表單內容，保留游標位置
export function renderExpSheet(S, trip, d) {
  const html = expSheetHtml(S, trip, d), sheet = $('#layer .sheet');
  if (!sheet) { openSheet(html); return; }
  const a = document.activeElement, id = a?.id, dc = a?.dataset?.cust, dp = a?.dataset?.paid, pos = a?.selectionStart;
  sheet.innerHTML = '<div class="grab"></div>' + html;
  const back = id ? document.getElementById(id) : dc ? sheet.querySelector(`[data-cust="${CSS.escape(dc)}"]`)
    : dp ? sheet.querySelector(`[data-paid="${CSS.escape(dp)}"]`) : null;
  if (back) { back.focus(); try { back.setSelectionRange(pos, pos); } catch { /* select 沒有游標 */ } }
}

// 從暫存內容整理成要寫進資料庫的欄位
export function draftFields(S, trip, d) {
  const c = ctxOf(S, trip), ids = selected(shareList(c, d), d), amount = num(d.amt);
  const shares = d.mode === 'equal' ? equalSplit(amount, ids)
    : d.mode === 'custom' ? Object.fromEntries(ids.map(k => [k, num(d.custom[k])])) : null;
  return {
    name: d.name.trim(), amount, category: d.cat, payMethod: d.pay, note: d.note.trim(), payerId: d.payer,
    payers: d.payer === MULTI ? Object.fromEntries(Object.entries(d.paid).map(([k, v]) => [k, num(v)]).filter(x => x[1] > 0)) : null,
    splitMode: shares ? d.mode : null, personalShares: shares,
  };
}

export function depositSheet(S, trip) {
  const c = ctxOf(S, trip);
  openSheet(`${head('放入公費')}
    <div class="grid2"><div class="field"><label for="dp-who">誰放的</label><select class="select" id="dp-who">${c.active.map(p => `<option value="${esc(p.id)}" ${p.id === c.me ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="dp-amt">金額</label><input class="input data" id="dp-amt" inputmode="numeric" placeholder="1000"></div></div>
    <button type="button" class="btn primary" data-act="saveDeposit">放入</button>`);
}
