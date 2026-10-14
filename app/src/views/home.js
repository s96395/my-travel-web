// 首頁：下一趟登機證、四張統計、搜尋與類型篩選、依年度分組的旅程卡
import { esc, money, ICON } from '../ui/dom.js';
import { scene, art, coverHtml } from '../ui/scene.js';
import { TYPE_ICON, pickNextTrip, countdown, tripDays } from '../lib/trips.js';
import { computeStats } from '../lib/stats.js';
import { slashDate, todayString } from '../lib/dates.js';
import { worldFootprint, countryInfo, SHAPES, DOTS } from '../lib/world.js';

const ti = t => `${TYPE_ICON[t] || ''} ${t}`;

function hero(next, S) {
  if (!next) {
    return `<div class="hero bpi empty-hero">${scene({ type: '自由行', place: '', name: '', start: todayString() })}<span class="bpi-shade"></span>
      <span class="bp-top"><span>BOARDING PASS</span><span>下一趟旅行</span></span>
      <span class="bp-body"><h2>開始規劃下一趟旅行吧！</h2>
        <span><button type="button" class="btn sm" data-act="newTrip" ${S.offline ? 'disabled' : ''}>${ICON.plus}新增旅程</button></span></span></div>`;
  }
  const c = countdown(next);
  const count = c.ongoing
    ? `<span class="count"><span>旅行中</span><b class="num">Day ${c.day}</b><span>/ ${c.days}</span></span>`
    : `<span class="count"><span>還有</span><b class="num">${c.left}</b><span>天出發</span></span>`;
  const route = next.code
    ? `<span class="bp-route"><span><b>TPE</b><small>台灣</small></span><span class="bp-plane">${ICON.plane}</span><span class="r"><b>${esc(next.code)}</b><small>${esc(next.city || next.country)}</small></span></span>`
    : `<span class="bp-route"><span><b>${esc(next.city || next.country || '目的地')}</b><small>${esc(next.country)}</small></span><span class="bp-plane">${ICON.plane}</span><span></span></span>`;
  return `<button type="button" class="hero bpi" data-act="open" data-id="${esc(next.id)}">
    ${art(next, S.covers[next.id])}<span class="bpi-shade"></span>
    <span class="bp-top"><span>BOARDING PASS</span><span>下一趟旅行</span></span>
    <span class="bp-body">
      ${route}
      <h2>${esc(next.name)}</h2>
      <span class="bp-fields"><span><small>出發</small><b class="num">${esc(next.start.slice(5).replace('-', '/'))}</b></span><span><small>天數</small><b>${tripDays(next)} 天</b></span><span><small>同行</small><b>${next.people || 1} 人</b></span><span><small>類型</small><b>${esc(next.type)}</b></span></span>
    </span>
    <span class="perf"></span>
    <span class="bp-stub">${count}<span class="barcode" aria-hidden="true"></span></span>
  </button>`;
}

function statCard(S, k, ico, big, label, sub, detail) {
  const open = S.stats[k] ?? false; // 預設收合，按標題展開
  return `<div class="stat" data-open="${open}">
    <button type="button" class="stat-h" data-act="stat" data-k="${k}" aria-expanded="${open}">
      <span class="label">${label} <span class="chev">${ICON.chev}</span></span>
      <span class="big">${ico ? `<span class="ico" aria-hidden="true">${ico}</span>` : ''}<b class="num">${big}</b></span>
      ${sub ? `<span class="small muted">${sub}</span>` : ''}
    </button>
    ${open ? `<div class="stat-d">${detail}</div>` : ''}
  </div>`;
}

// 足跡地圖：去過的國家依洲別上色，下面是各洲收集進度；國家清單也照地圖的對法合併（台灣、臺灣算同一國）
function worldHtml(w) {
  const lit = id => { const c = w.visited.has(id) && countryInfo(id); return c ? ` class="on k-${c.cont}"` : ''; };
  const title = id => (w.visited.has(id) ? `<title>${esc(countryInfo(id).name)}・${w.visited.get(id)} 趟</title>` : '');
  const paths = SHAPES.map(([id, d]) => `<path d="${d}"${lit(id)}>${title(id)}</path>`).join('');
  const dots = DOTS.filter(([id]) => w.visited.has(id)).map(([id, x, y]) => `<circle cx="${x}" cy="${y}" r="7"${lit(id)}>${title(id)}</circle>`).join('');
  return `<div class="worldmap"><svg viewBox="0 4 1000 440" role="img" aria-label="去過的國家地圖">${paths}${dots}</svg></div>
    <div class="conts">${w.continents.map(c => `<div class="cont k-${c.key}"><span>${c.name}</span><span class="bar"><i style="width:${Math.round(c.got / c.total * 100)}%"></i></span><span class="num muted">${c.got} / ${c.total}</span></div>`).join('')}</div>
    ${w.unmatched.length ? `<p class="small muted worldnote">地圖上找不到：${w.unmatched.map(esc).join('、')}。把旅程的國家改成正式國名，就會亮起來。</p>` : ''}
    ${[...w.visited].sort((a, b) => b[1] - a[1]).map(([id, n]) => line('🗺️ ' + esc(countryInfo(id).name), n + ' 趟')).join('')}`;
}

const line = (l, r, extra = '') => `<div class="sr"><span>${l}</span><span class="num">${r}</span>${extra}</div>`;
const TYPE_COLOR = { '自由行': 'var(--accent)', '潛旅': 'var(--good)', '跟團': 'var(--warm)' };

function statsHtml(S, st) {
  const w = worldFootprint(S.trips);
  const thisYear = todayString().slice(0, 4);
  const y0 = st.yearly.find(y => y.year === thisYear) || { mine: 0, unconfirmed: 0 };
  const pct = v => (st.typeTotal ? Math.round(v / st.typeTotal * 100) : 0);
  // 大字顯示花最多的類型，總金額放在展開後的合計
  const top = st.types.reduce((a, b) => (b[1] > a[1] ? b : a), ['', 0]);
  return `<section class="stats" aria-label="統計">
    ${statCard(S, 'country', '🌍', w.visited.size + w.unmatched.length, '去過的國家', '',
      st.countries.length ? worldHtml(w) : '<p class="small muted" style="margin:6px 0">還沒有已完成的旅程</p>')}
    ${statCard(S, 'year', '', 'NT$ ' + money(y0.mine), `${thisYear} 我的旅行支出`, y0.unconfirmed ? `尚有 ${y0.unconfirmed} 筆費用未確認` : '',
      st.yearly.map(y => line(`${esc(y.year)} 年`, 'NT$ ' + money(y.mine), y.unconfirmed ? `<span class="note">尚有 ${y.unconfirmed} 筆費用未確認</span>` : '')).join('')
      + `<div class="sr total"><span>全部合計</span><span class="num">NT$ ${money(st.mineTotal)}</span></div>`)}
    ${statCard(S, 'type', top[1] ? TYPE_ICON[top[0]] : '🎒', top[1] ? `${esc(top[0])} ${pct(top[1])}%` : '$0', '旅程總支出（依類型）', top[1] ? `全部合計 $${money(st.typeTotal)}` : '',
      st.types.map(([t, v]) => `<div class="sr"><span>${ti(t)}</span><span class="num"><b style="color:${TYPE_COLOR[t]}">$${money(v)}</b> <span class="muted">${pct(v)}%</span></span><span class="bar"><i style="width:${pct(v)}%;background:${TYPE_COLOR[t]}"></i></span></div>`).join('')
      + `<div class="sr total"><span>全部合計</span><span class="num">$${money(st.typeTotal)}</span></div>`)}
    ${!S.trips.some(t => t.type === '潛旅') ? '' : statCard(S, 'tank', '🤿', st.tankTotal, '累計氣瓶數', '',
      st.tanks.length ? st.tanks.map(t => line('📍 ' + esc(t[0]), '🫧 ' + t[1] + ' 瓶')).join('') + `<div class="sr total"><span>累計總瓶數</span><span class="num">🤿 ${st.tankTotal} 瓶</span></div>` : '<p class="small muted" style="margin:6px 0">還沒有潛旅紀錄</p>')}
  </section>`;
}

function tripCard(t, S) {
  return `<button type="button" class="tripcard" data-act="open" data-id="${esc(t.id)}" data-done="${t.status === '已完成' || t.status === '已封存'}">
    ${coverHtml(t, false, S.covers[t.id])}
    <span class="tc-body">
      <span class="grow"><h3>${esc(t.name)}</h3><span class="place">${esc(t.place)}</span><span class="small muted num">${esc(slashDate(t.start))} – ${esc(slashDate(t.end))}</span>
        <span class="tagrow"><span class="tag${t.type === '自由行' ? ' accent' : ''}">${ti(t.type)}</span>${t.type === '潛旅' && t.tanks ? `<span class="tanktag num">🫧 ${t.tanks} 瓶</span>` : ''}</span></span>
      <span class="stub"><b>${esc(t.code || (t.city || t.country || '').slice(0, 3))}</b><small>${ti(t.type)}</small></span>
    </span>
  </button>`;
}

export function renderHome(S) {
  const trips = S.trips;
  const st = computeStats(trips, S.expenses, S.user.uid);
  const q = S.q.trim().toLowerCase();
  const list = trips.filter(t => (S.filter === '全部' || t.type === S.filter) && (!q || `${t.name}${t.place}`.toLowerCase().includes(q)));
  const years = [...new Set(trips.map(t => (t.start || '未知').slice(0, 4)))].sort().reverse();
  const loading = S.loadingTrips;
  return `
  ${S.offline ? `<div class="banner" role="status"><b>離線中</b><span>${S.localOnly ? `只顯示下載到${S.wide ? '這台電腦' : '這支手機'}的旅程，只能查看。` : '只能查看，暫時不能修改。'}</span></div>` : ''}
  <header class="appbar" id="appbar">
    <div class="brand" style="flex:1">沈迷旅行<small>ADDICTED TO YSHEN TRAVEL</small></div>
    ${S.wide ? `<button type="button" class="btn primary" data-act="newTrip" ${S.offline ? 'disabled' : ''}>${ICON.plus}新增旅程</button>` : ''}
    <button type="button" class="iconbtn" data-act="account" aria-label="帳號">${ICON.user}</button>
  </header>
  <div class="wrap">
    <p class="slogan">把嚮往的地方，都變成走過的路 💫🌊🫧✨</p>
    ${loading ? '<div class="empty">正在讀取你的旅程…</div>' : hero(pickNextTrip(trips), S)}
    ${loading ? '' : statsHtml(S, st)}
    <div class="tools"><div class="search">${ICON.search}<input id="q" type="search" placeholder="搜尋旅程或地點" value="${esc(S.q)}" aria-label="搜尋旅程"></div>
    <div class="chips" role="group" aria-label="類型篩選">${['全部', '自由行', '跟團', '潛旅'].map(f => `<button type="button" class="chip" data-act="filter" data-v="${f}" aria-pressed="${S.filter === f}">${f === '全部' ? f : ti(f)}</button>`).join('')}</div></div>
    ${S.localOnly && !trips.length ? '<div class="empty">這支手機還沒有下載任何旅程。連上網路後，進入旅程按標題右邊的「離線行程」。</div>' : ''}
    ${!S.localOnly && !loading && !trips.length ? `<div class="empty">還沒有旅程。按「新增旅程」建立第一趟${S.env !== 'production' ? '，或在帳號選單載入範例旅程' : ''}。</div>` : ''}
    ${years.map(y => {
      const ts = list.filter(t => (t.start || '未知').startsWith(y));
      const open = q || S.filter !== '全部' ? true : (S.years[y] ?? (S.wide || y === years[0]));
      const ytot = st.yearTotals[y] || 0;
      return `<section class="year" data-open="${open}">
        <button type="button" data-act="year" data-y="${esc(y)}" aria-expanded="${open}"><span class="chev">${ICON.chev}</span><h3>${esc(y)}</h3><span class="tag">${ts.length} 趟</span><span class="ytotal">年度旅程總支出 <b class="num">$${money(ytot)}</b></span></button>
        ${open ? (ts.length ? `<div class="list">${ts.map(t => tripCard(t, S)).join('')}</div>` : '<div class="empty">沒有符合的旅程</div>') : ''}
      </section>`;
    }).join('')}
    ${trips.length ? '<p class="small muted" style="text-align:center;margin:0">篩選只影響列表，上方統計不變</p>' : ''}
    ${S.hideInstall || S.standalone || S.visits < 2 ? '' : `<div class="install" role="note"><span aria-hidden="true">📲</span><span class="grow">可以加到手機主畫面，像 App 一樣開啟</span><button type="button" class="linkbtn" data-act="install">怎麼加</button><button type="button" class="x" data-act="hideInstall" aria-label="不再顯示">×</button></div>`}
  </div>`;
}
