// 潛水分頁（潛旅才有）：累計瓶數、最深、水下時間，日誌依日期分組（規格書 F33）
// 欄位名沿用舊版 diveLogs：diveDate、diveSite、maxDepth、duration、visibility、tanks、note
// divers：有下水的同行者 ID；舊資料沒有這個欄位，只算記錄的人（找不到時算建立者）
import { esc, ICON, openSheet, $ } from '../ui/dom.js';
import { monthDay, parseDate, toDateString, daysBetween } from '../lib/dates.js';
import { participantsOf } from '../lib/trips.js';

const tanksOf = d => Number(d.tanks) || 1;
export const totalTanks = list => list.reduce((a, d) => a + tanksOf(d), 0);
const activePeople = trip => participantsOf(trip.raw).filter(p => p.status !== 'inactive');
const uidPid = (trip, uid) => (uid && participantsOf(trip.raw).find(p => p.uid === uid)?.id) || null;
const dove = (d, pid, trip) => (Array.isArray(d.divers) ? d.divers.includes(pid)
  : pid === (uidPid(trip, d.createdByUid) || uidPid(trip, trip.raw.ownerId)));

// 每位同行者自己下水的瓶數，寫回旅程主檔 tanksBy，首頁的累計氣瓶數只算登入者自己的
// 停用的同行者也要保留，首頁才不會改用整趟的瓶數
export const tanksByPerson = (list, trip) => Object.fromEntries(participantsOf(trip.raw).map(p => [p.id, totalTanks(list.filter(d => dove(d, p.id, trip)))]));

// 依日期排序，同一天依建立時間
const ms = t => (t?.toMillis ? t.toMillis() : Infinity);
export const sortDives = list => [...list].sort((a, b) => (a.diveDate || '').localeCompare(b.diveDate || '') || ms(a.createdAt) - ms(b.createdAt));

const head = title => `<div class="head"><h2>${title}</h2><button type="button" class="iconbtn" data-act="close" aria-label="關閉">×</button></div>`;

export function renderDive(S, trip) {
  if (S.loadingDive) return '<div class="empty">正在讀取潛水紀錄…</div>';
  const dives = sortDives(S.diveDocs), people = activePeople(trip), by = tanksByPerson(dives, trip);
  const names = d => { const who = people.filter(p => dove(d, p.id, trip)); return who.length < people.length ? who.map(p => esc(p.name)).join('、') : ''; };
  const deep = Math.max(0, ...dives.map(d => Number(d.maxDepth) || 0));
  const mins = dives.reduce((a, d) => a + (Number(d.duration) || 0), 0);
  const byDate = {};
  dives.forEach(d => (byDate[d.diveDate || ''] ||= []).push(d));
  let n = 0;
  const add = `<button type="button" class="btn sm primary" data-act="diveForm" ${S.offline ? 'disabled' : ''}>${ICON.plus}記一支</button>`;
  const empty = S.localOnly ? '下載的離線資料不含潛水日誌，連上網路後就看得到' : '還沒有潛水紀錄，按「記一支」開始';
  return `
  <div class="divesum">
    <div class="card"><span class="label">累計瓶數</span><b class="num">🫧 ${totalTanks(dives)} 瓶</b></div>
    <div class="card"><span class="label">最深</span><b class="num">⬇️ ${deep} m</b></div>
    <div class="card"><span class="label">水下時間</span><b class="num">⏱ ${Math.floor(mins / 60)} 時 ${mins % 60} 分</b></div>
  </div>
  ${people.length > 1 && dives.length ? `<p class="small muted num" style="margin:0">${people.map(p => `${esc(p.name)} ${by[p.id]} 瓶`).join('・')}</p>` : ''}
  <div class="sec-h"><h2>🤿 潛水日誌</h2>${add}</div>
  ${dives.length ? Object.entries(byDate).map(([date, ds]) => `
    <section class="divegroup">
      <div class="divehead"><span class="num">${date ? monthDay(date) : '未填日期'}</span><span class="tanktag num">🫧 ${totalTanks(ds)} 瓶</span></div>
      <div class="list">${ds.map(d => `
        <article class="dive">
          <span class="diveno">Dive<br><b class="num">#${++n}</b></span>
          <div class="grow">
            <h4>${esc(d.diveSite || '未填潛點')}</h4>
            <div class="meta num">${d.maxDepth ? `<span>⬇️ ${esc(d.maxDepth)}m</span>` : ''}${d.duration ? `<span>⏱ ${esc(d.duration)} 分</span>` : ''}${d.visibility ? `<span>👁 能見 ${esc(d.visibility)}m</span>` : ''}<span>🫧 ${tanksOf(d)} 瓶</span></div>
            ${names(d) ? `<p>🤿 ${names(d)}</p>` : ''}
            ${d.note ? `<p>📝 ${esc(d.note)}</p>` : ''}
          </div>
          <button type="button" class="more" data-act="diveForm" data-id="${esc(d.id)}" ${S.offline ? 'disabled' : ''} aria-label="編輯這支">✏️</button>
        </article>`).join('')}</div>
    </section>`).join('') : `<div class="empty">${empty}</div>`}
  <p class="small muted" style="margin:0">首頁的「累計氣瓶數」只算你自己有下水的瓶數。</p>`;
}

const fld = (id, label, val, extra = '') => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" type="text" value="${esc(val ?? '')}" ${extra}></div>`;

// 日期從旅程的每一天選；舊資料的日期不在旅程期間內時也列進去
function dayOptions(trip, cur) {
  const days = [];
  if (trip.start) {
    const n = Math.min(60, daysBetween(trip.start, trip.end || trip.start) + 1);
    for (let i = 0; i < n; i++) { const x = parseDate(trip.start); x.setDate(x.getDate() + i); days.push([toDateString(x), `第 ${i + 1} 天・${monthDay(toDateString(x))}`]); }
  }
  if (cur && !days.some(d => d[0] === cur)) days.unshift([cur, monthDay(cur)]);
  return days.map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`).join('');
}

export function diveFormSheet(trip, d, canDel) {
  const people = activePeople(trip);
  const v = d || { diveDate: trip.start || '', diveSite: '', maxDepth: '', duration: '', visibility: '', tanks: 1, note: '' };
  const date = trip.start ? `<select class="select" id="df-date">${dayOptions(trip, v.diveDate)}</select>` : `<input class="input" id="df-date" type="date" value="${esc(v.diveDate)}">`;
  openSheet(`${head(d ? '編輯潛水紀錄' : '記一支潛水')}
    <div class="grid2"><div class="field"><label for="df-date">日期</label>${date}</div>${fld('df-site', '潛點', v.diveSite, 'placeholder="例如：柴口" maxlength="40"')}</div>
    <div class="grid2">${fld('df-depth', '最大深度（m）', v.maxDepth, 'inputmode="decimal"')}${fld('df-min', '潛水時間（分）', v.duration, 'inputmode="numeric"')}</div>
    <div class="grid2">${fld('df-vis', '能見度（m）', v.visibility, 'inputmode="numeric"')}${fld('df-tanks', '瓶數', v.tanks || 1, 'inputmode="numeric"')}</div>
    ${people.length > 1 ? `<div class="field"><span class="label">誰有下水</span><div class="row" id="df-divers" style="flex-wrap:wrap;gap:6px">${people.map(p => `<button type="button" class="chip" data-act="pickDiver" data-pid="${esc(p.id)}" aria-pressed="${d ? dove(d, p.id, trip) : true}">${esc(p.name)}</button>`).join('')}</div></div>` : ''}
    <div class="field"><label for="df-note">心得</label><textarea class="input" id="df-note" rows="2" maxlength="200" placeholder="看到什麼生物、水流狀況">${esc(v.note || '')}</textarea></div>
    <div class="row">${d && canDel ? `<button type="button" class="btn danger" data-act="delDive" data-id="${esc(d.id)}">刪除</button>` : ''}<button type="button" class="btn primary grow" data-act="saveDive" data-id="${esc(d?.id || '')}">儲存</button></div>`);
}

// 讀潛水表單；數字欄位沒填就不存，瓶數至少 1
export function readDiveForm(trip, isNew) {
  const g = id => ($(`#${id}`)?.value || '').trim();
  const num = id => { const x = parseFloat(g(id)); return x >= 0 ? x : null; };
  document.querySelectorAll('#layer .input.err').forEach(i => i.classList.remove('err'));
  const picked = [...document.querySelectorAll('#df-divers [aria-pressed="true"]')].map(b => b.dataset.pid);
  const data = { diveDate: g('df-date'), diveSite: g('df-site'), maxDepth: num('df-depth'), duration: num('df-min'), visibility: num('df-vis'), tanks: Math.max(1, Math.round(num('df-tanks') || 1)), note: g('df-note') };
  if ($('#df-divers')) {
    if (!picked.length) return { error: '請至少選一位有下水的人' };
    data.divers = picked;
  } else if (isNew) {
    // 只有一位同行者時不顯示選項，新增時記下是他，之後加入的人才不會被算進去；編輯時保留原本的潛水者
    data.divers = activePeople(trip).map(p => p.id);
  }
  if (!data.diveDate) { $('#df-date').classList.add('err'); return { error: '請選日期' }; }
  if (!data.diveSite) { $('#df-site').classList.add('err'); $('#df-site').focus(); return { error: '請填潛點' }; }
  return { data };
}
