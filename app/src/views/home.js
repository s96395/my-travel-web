// 首頁：下一趟登機證、四張統計、搜尋與類型篩選、依年度分組的旅程卡
import { esc, money, ICON, TYPE_ICO, themeBtn } from '../ui/dom.js';
import { scene, art, coverHtml } from '../ui/scene.js';
import { pickNextTrip, countdown, tripDays } from '../lib/trips.js';
import { computeStats } from '../lib/stats.js';
import { slashDate, todayString } from '../lib/dates.js';
import { worldFootprint, footprintTimeline, countryInfo, SHAPES, DOTS } from '../lib/world.js';

const ti = t => `${TYPE_ICO[t] || ''}${t}`;

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

// 足跡地圖：登機證下方（電腦版在右邊並排）的地圖卡，本身就能拖曳、縮放，點國家看去過幾趟
// 地圖左右相連，一直往同一方向拖會繞地球一圈；放手會順勢滑一段
// 按「看明細」才展開各洲進度和國家清單；國家照地圖的對法合併（台灣、臺灣算同一國），依洲別排成小標籤，數字是去過幾趟
const MW = 1000, MH = 501, TW = [836, 251]; // 地圖寬高；台灣的位置
let cam = { x: TW[0], y: MH / 2, z: 0 }; // 目前看的中心點與放大倍數（0＝剛好看到整個世界）；重畫畫面時保留

const contBar = c => `<span class="bar"><i style="width:${Math.round(c.got / c.total * 100)}%"></i></span><span class="num muted">${c.got} / ${c.total}</span>`;

const openConts = new Set(); // 手機版展開中的洲，重畫畫面時保留

// withBar：手機版把各洲進度條和國家標籤放在一起，洲名只出現一次；標籤預設收起，點洲名才展開
function worldList(w, withBar) {
  const chips = list => `<span class="wchips">${list.map(([id, n]) => `<span class="wchip">${esc(countryInfo(id).name)}<small class="num">${n}</small></span>`).join('')}</span>`;
  return `${w.unmatched.length ? `<p class="small muted worldnote">地圖上找不到：${w.unmatched.map(esc).join('、')}。把旅程的國家改成正式國名，就會亮起來。</p>` : ''}
    ${w.continents.map(c => {
      const list = [...w.visited].filter(([id]) => countryInfo(id).cont === c.key).sort((a, b) => b[1] - a[1]);
      if (!withBar) return list.length ? `<div class="wgroup k-${c.key}"><b>${c.name}</b>${chips(list)}</div>` : '';
      const row = `<span>${c.name}</span>${contBar(c)}`;
      return list.length
        ? `<details class="wgroup k-${c.key}" data-cont="${c.key}"${openConts.has(c.key) ? ' open' : ''}><summary class="cont">${row}<span class="chev">${ICON.chev}</span></summary>${chips(list)}</details>`
        : `<div class="wgroup k-${c.key}"><div class="cont">${row}<span></span></div></div>`;
    }).join('')}`;
}

// 同一份世界畫三份（左、中、右）接在一起，拖到邊緣也看不出接縫
// 去過的國家畫成浮出海面的島：底下一圈浪花、往下錯開一點的深色當厚度，最上面才是洲別顏色
function mapShapes(w) {
  const island = (id, shape) => {
    const c = countryInfo(id);
    return `<g class="isl k-${c.cont}${hidden?.has(id) ? ' down' : ''}" data-wid="${id}"><title>${esc(c.name)}・${w.visited.get(id)} 趟</title>${shape('foam')}${shape('side')}${shape('on')}</g>`;
  };
  const sea = SHAPES.filter(([id]) => !(w.visited.has(id) && countryInfo(id))).map(([, d]) => `<path d="${d}"/>`).join('');
  const isles = SHAPES.filter(([id]) => w.visited.has(id) && countryInfo(id)).map(([id, d]) => island(id, k => `<path class="${k}" d="${d}"/>`)).join('')
    + DOTS.filter(([id]) => w.visited.has(id)).map(([id, x, y]) => island(id, k => `<circle class="${k}" cx="${x}" cy="${y}" r="7"/>`)).join('');
  return [-1, 0, 1].map(k => `<g transform="translate(${k * MW} 0)">${sea}${isles}</g>`).join('');
}

// 足跡播放：照出發日期，一趟一趟讓第一次去的國家浮出來
// 每次打開網站自動播一次（同一個分頁內回首頁不再播），系統設定「減少動態效果」就不自動播；點地圖直接跳到結果
let hidden = null, playTimer = 0, playSteps = [], playTotal = 0, lastPlay = [[], []];
const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function playedOnce() {
  try { if (sessionStorage.getItem('fpPlayed')) return true; sessionStorage.setItem('fpPlayed', '1'); } catch { /* 無痕模式等讀不到時照樣播一次 */ }
  return false;
}
const playInfo = () => document.querySelector('.worldmap .winfo');
function showIsles(ids) {
  ids.forEach(id => { hidden?.delete(id); document.querySelectorAll(`.worldmap [data-wid="${id}"]`).forEach(g => g.classList.remove('down')); });
}
function endPlay(skip) {
  clearInterval(playTimer); playTimer = 0;
  if (!hidden) return;
  hidden = null; document.querySelectorAll('.worldmap .isl.down').forEach(g => g.classList.remove('down'));
  const info = playInfo(); if (!info) return;
  info.hidden = false; info.textContent = `一共去過 ${playTotal} 個國家`;
  setTimeout(() => { if (!hidden && info.textContent.startsWith('一共')) info.hidden = true; }, skip ? 1200 : 2500);
}
// 只藏時間軸上的國家；沒填出發日期的旅程排不進時間軸，那些國家一直顯示
function startPlay(steps, ids, total) {
  endPlay(true);
  playSteps = steps; playTotal = total; hidden = new Set(ids);
  ids.forEach(id => document.querySelectorAll(`.worldmap [data-wid="${id}"]`).forEach(g => g.classList.add('down')));
  let i = 0;
  const gap = Math.max(250, Math.min(700, 4500 / steps.length)); // 全部大約 4～5 秒播完
  playTimer = setInterval(() => {
    const st = playSteps[i++], info = playInfo();
    if (!st || !info) return endPlay();
    showIsles(st.fresh);
    info.hidden = false;
    info.textContent = `${st.start.slice(0, 7).replace('-', '.')} ${st.name}・${st.fresh.map(id => countryInfo(id).name).join('、')}`;
  }, gap);
}
const playSet = S => {
  const steps = footprintTimeline(S.trips).filter(st => st.fresh.length);
  return [steps, steps.flatMap(st => st.fresh)];
};

function worldStrip(S, w, hero) {
  const has = w.visited.size || w.unmatched.length;
  if (!has) return hero;
  const conts = w.continents.filter(c => c.got).length;
  const open = !!S.stats.country;
  const title = `<h3>🌍 足跡地圖</h3><span class="small muted">去過 ${w.visited.size + w.unmatched.length} 個國家・${conts} 大洲</span>`;
  const [steps, ids] = lastPlay = [...playSet(S), w.visited.size + w.unmatched.length];
  const auto = steps.length > 1 && !hidden && !playTimer && !reduceMotion() && !playedOnce();
  if (auto) hidden = new Set(ids); // 先藏起來再畫，避免島先出現又消失
  const card = `<section class="wcard" aria-label="足跡地圖">
    <div class="wp-head">${title}
      <button type="button" class="linkbtn" data-act="stat" data-k="country" aria-expanded="${open}">${open ? '收起明細' : '看明細'}</button></div>
    <div class="worldmap"><svg viewBox="0 0 ${MW} ${MH}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="去過的國家地圖，可拖曳、放大縮小">${mapShapes(w)}</svg>
      <div class="wz"><button type="button" data-wz="in" aria-label="放大">＋</button><button type="button" data-wz="out" aria-label="縮小">－</button><button type="button" data-wz="reset" aria-label="回到台灣、看整個世界">⟲</button>${steps.length > 1 ? '<button type="button" data-wplay aria-label="照時間播放去過的國家" title="照時間播放">▶</button>' : ''}</div>
      <span class="winfo" role="status" hidden></span>
    </div>
    ${open && !S.wide ? `<div class="wdetail">${worldList(w, true)}</div>` : ''}
  </section>`;
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => { const svg = mapSvg(); if (svg) applyCam(svg); });
  if (auto) setTimeout(() => startPlay(...lastPlay), 600);
  if (!S.wide) return hero + card;
  return `<div class="toprow">${hero}${card}</div>${open ? `<section class="worldpanel wide" aria-label="去過的國家">
    <div class="wp-head">${title}<button type="button" class="linkbtn" data-act="stat" data-k="country" aria-expanded="true">收起</button></div>
    <div class="conts">${w.continents.map(c => `<div class="cont k-${c.key}"><span>${c.name}</span>${contBar(c)}</div>`).join('')}</div>
    <div class="wlist">${worldList(w)}</div></section>` : ''}`;
}

// 拖曳、縮放直接改 SVG 的 viewBox，不重畫整頁
const mapSvg = () => document.querySelector('.worldmap svg');
// 最小倍數：上下剛好看到整個世界，左右不超過一圈
const minZ = b => Math.max(1, MH * b.width / b.height / MW);
function applyCam(svg) {
  const b = svg.getBoundingClientRect(); if (!b.width || !b.height) return;
  const z0 = minZ(b);
  cam.z = Math.min(z0 * 16, Math.max(z0, cam.z || z0));
  const h = MH / cam.z, w = h * b.width / b.height;
  cam.y = Math.min(MH - h / 2, Math.max(h / 2, cam.y));
  cam.x = ((cam.x % MW) + MW) % MW;
  svg.setAttribute('viewBox', `${(cam.x - w / 2).toFixed(1)} ${(cam.y - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const r = (7 / cam.z).toFixed(2);
  svg.querySelectorAll('circle').forEach(c => c.setAttribute('r', r));
  svg.style.setProperty('--lift', (2.5 * h / b.height).toFixed(2) + 'px'); // 島的厚度固定約 2.5 個像素，放大縮小都一樣
  svg.parentNode.classList.toggle('zoomed', cam.z > z0 * 1.01); // 放大時手機上下拖動給地圖用，沒放大時讓頁面捲動
}
const unit = svg => MH / cam.z / svg.getBoundingClientRect().height; // 一個像素等於地圖幾單位
// 以畫面上的某一點為中心縮放（k > 1 放大）
function zoomAt(svg, k, px, py) {
  const b = svg.getBoundingClientRect(), u = unit(svg);
  const mx = cam.x + (px - b.left - b.width / 2) * u, my = cam.y + (py - b.top - b.height / 2) * u;
  const z0 = cam.z; cam.z *= k; applyCam(svg);
  const f = z0 / cam.z;
  cam.x = mx + (cam.x - mx) * f; cam.y = my + (cam.y - my) * f; applyCam(svg);
}
let anim = 0;
const stopAnim = () => { if (anim) cancelAnimationFrame(anim); anim = 0; };
// 滑到某個位置與倍數（按鈕用），有過場動畫
function flyTo(x, y, z, ms = 350) {
  stopAnim();
  const s = { ...cam }; let dx = x - s.x; dx -= Math.round(dx / MW) * MW;
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
    cam = { x: s.x + dx * e, y: s.y + (y - s.y) * e, z: Math.exp(Math.log(s.z) + (Math.log(z) - Math.log(s.z)) * e) };
    const cur = mapSvg(); if (!cur) { anim = 0; return; } // 畫面重畫後改用新的地圖
    applyCam(cur); anim = k < 1 ? requestAnimationFrame(step) : 0;
  };
  anim = requestAnimationFrame(step);
}

if (typeof document !== 'undefined') {
  document.addEventListener('toggle', e => {
    const k = e.target.dataset?.cont;
    if (k) e.target.open ? openConts.add(k) : openConts.delete(k);
  }, true);
  addEventListener('resize', () => { const svg = mapSvg(); if (svg) applyCam(svg); });
  const pts = new Map();
  let moved = false, pinch = 0, vel = [0, 0], last = 0;
  const svgOf = e => e.target.closest?.('.worldmap svg');
  document.addEventListener('pointerdown', e => {
    const svg = svgOf(e); if (!svg) return;
    stopAnim();
    pts.set(e.pointerId, [e.clientX, e.clientY]); moved = false; vel = [0, 0]; last = performance.now();
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  document.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const svg = mapSvg(); if (!svg) return;
    const [ox, oy] = pts.get(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) {
      const dx = e.clientX - ox, dy = e.clientY - oy, u = unit(svg), now = performance.now(), dt = Math.max(1, now - last);
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      last = now;
      vel = [0.8 * (-dx * u / dt) + 0.2 * vel[0], 0.8 * (-dy * u / dt) + 0.2 * vel[1]];
      cam.x -= dx * u; cam.y -= dy * u; applyCam(svg);
    } else if (pts.size === 2) {
      const [p, q] = [...pts.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (pinch) zoomAt(svg, d / pinch, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      pinch = d; moved = true; vel = [0, 0];
    }
  });
  // 放手時如果還在動，就順勢滑一段再慢慢停下
  const up = e => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size < 2) pinch = 0;
    const svg = mapSvg();
    if (pts.size || !svg || e.type === 'pointercancel' || performance.now() - last > 80) return;
    let v = [...vel], t0 = performance.now();
    const glide = t => {
      const dt = t - t0; t0 = t;
      v = v.map(n => n * 0.995 ** dt);
      cam.x += v[0] * dt; cam.y += v[1] * dt;
      const cur = mapSvg(); if (!cur) { anim = 0; return; } // 畫面重畫後改用新的地圖
      applyCam(cur);
      anim = Math.hypot(...v) / unit(cur) > 0.02 ? requestAnimationFrame(glide) : 0;
    };
    anim = requestAnimationFrame(glide);
  };
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
  // 滾輪要按住 Ctrl 才縮放（觸控板兩指縮放也算），不然會擋到捲動首頁
  document.addEventListener('wheel', e => {
    const svg = svgOf(e); if (!svg) return;
    const info = svg.parentNode.querySelector('.winfo');
    if (!e.ctrlKey && !e.metaKey) { info.hidden = false; info.textContent = '按住 Ctrl 再滾動滑鼠可以縮放'; return; }
    e.preventDefault(); stopAnim();
    zoomAt(svg, Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
  }, { passive: false });
  document.addEventListener('click', e => {
    if (e.target.closest?.('[data-wplay]')) { const [steps, ids, total] = lastPlay; if (steps.length) startPlay(steps, ids, total); return; }
    const btn = e.target.closest?.('[data-wz]');
    const map = e.target.closest?.('.worldmap'); if (!map) return;
    const svg = map.querySelector('svg'), info = map.querySelector('.winfo');
    if (btn) {
      const z = btn.dataset.wz;
      if (z === 'reset') flyTo(TW[0], MH / 2, minZ(svg.getBoundingClientRect()));
      else flyTo(cam.x, cam.y, cam.z * (z === 'in' ? 1.6 : 1 / 1.6));
      return;
    }
    if (moved) return; // 拖曳結束不算點擊
    if (hidden) return endPlay(true); // 播放中點地圖：直接看結果
    const t = e.target.closest('[data-wid]');
    info.hidden = !t;
    if (t) info.textContent = t.querySelector('title')?.textContent || '';
  });
}

const line = (l, r, extra = '') => `<div class="sr"><span>${l}</span><span class="num">${r}</span>${extra}</div>`;

function statsHtml(S, st) {
  const thisYear = todayString().slice(0, 4);
  const y0 = st.yearly.find(y => y.year === thisYear) || { mine: 0, unconfirmed: 0 };
  return `<section class="stats" aria-label="統計">
    ${statCard(S, 'year', '', 'NT$ ' + money(y0.mine), `${thisYear} 我的旅行支出`, y0.unconfirmed ? `尚有 ${y0.unconfirmed} 筆費用未確認` : '',
      st.yearly.map(y => line(`${esc(y.year)} 年`, 'NT$ ' + money(y.mine), y.unconfirmed ? `<span class="note">尚有 ${y.unconfirmed} 筆費用未確認</span>` : '')).join('')
      + `<div class="sr total"><span>全部合計</span><span class="num">NT$ ${money(st.mineTotal)}</span></div>`)}
    ${!S.trips.some(t => t.type === '潛旅') ? '' : statCard(S, 'tank', '🤿', st.tankTotal, '累計氣瓶數', '',
      st.tanks.length ? st.tanks.map(t => line('📍 ' + esc(t[0]), '🫧 ' + t[1] + ' 瓶')).join('') + `<div class="sr total"><span>累計總瓶數</span><span class="num">🤿 ${st.tankTotal} 瓶</span></div>` : '<p class="small muted" style="margin:6px 0">還沒有潛旅紀錄</p>')}
  </section>
`;
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
    ${themeBtn()}
    <button type="button" class="iconbtn" data-act="account" aria-label="帳號">${ICON.user}</button>
  </header>
  <div class="wrap">
    <p class="slogan">把嚮往的地方，都變成走過的路 💫🌊🫧✨</p>
    ${loading ? '<div class="empty">正在讀取你的旅程…</div>' : worldStrip(S, worldFootprint(trips), hero(pickNextTrip(trips), S))}
    ${loading ? '' : statsHtml(S, st)}
    <p class="eyebrow">我的旅程</p>
    <div class="tools"><div class="search">${ICON.search}<input id="q" type="search" placeholder="搜尋旅程或地點" value="${esc(S.q)}" aria-label="搜尋旅程"></div>
    <div class="chips" role="group" aria-label="類型篩選">${['全部', '自由行', '跟團', '潛旅'].map(f => `<button type="button" class="chip" data-act="filter" data-v="${f}" aria-pressed="${S.filter === f}">${f === '全部' ? f : ti(f)}</button>`).join('')}</div></div>
    ${S.localOnly && !trips.length ? '<div class="empty">這支手機還沒有下載任何旅程。連上網路後，進入旅程按標題右邊的下載鈕（離線行程）。</div>' : ''}
    ${!S.localOnly && !loading && !trips.length ? `<div class="empty">還沒有旅程。按「新增旅程」建立第一趟，或先看一趟填好的示範旅程。<br><button type="button" class="btn sm" data-act="demoTrip" style="margin-top:8px" ${S.offline ? 'disabled' : ''}>載入示範旅程</button></div>` : ''}
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
    ${S.hideInstall || S.standalone || S.visits < 2 ? '' : `<div class="install" role="note">${ICON.phone}<span class="grow">可以加到手機主畫面，像 App 一樣開啟</span><button type="button" class="linkbtn" data-act="install">怎麼加</button><button type="button" class="x" data-act="hideInstall" aria-label="不再顯示">×</button></div>`}
  </div>`;
}
