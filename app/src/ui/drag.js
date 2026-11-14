// 行程長按拖曳：按住約 0.4 秒後可拖曳，放開時回報放在哪裡（規格書 F21）
// onDrop(id, target)：target = { kind: 'item', id, before } 或 { kind: 'day', d }；放在不能放的地方是 null（不移動）
const DR = { timer: null, el: null, id: null, sx: 0, sy: 0, active: false, line: null, target: null, raf: null, px: 0, py: 0, pill: null, pillTimer: null };
// 長按時不能開始拖的地方：⋯ 選單、連結、輸入欄位（站名、號碼這些按鈕可以長按拖，短按還是照常打開）
const NO_DRAG = '.more, a, input, select, textarea, summary, label';
// 拖到日期按鈕上要停一下才算換天，避免往上找位置時經過就被搬到別天
const PILL_WAIT = 600;

export function initDrag({ canEdit, onLocked, onDrop }) {
  document.addEventListener('pointerdown', e => {
    const it = e.target.closest('.item[data-iid]');
    if (!it || e.target.closest(NO_DRAG) || (e.button && e.button !== 0)) return;
    DR.el = it; DR.id = it.dataset.iid; DR.sx = e.clientX; DR.sy = e.clientY; DR.py = e.clientY;
    it.classList.add('pressing');
    DR.timer = setTimeout(() => {
      if (!canEdit()) { it.classList.remove('pressing'); onLocked(); DR.el = null; return; }
      DR.active = true; it.classList.remove('pressing'); it.classList.add('lifted');
      try { it.setPointerCapture(e.pointerId); } catch { /* 有些瀏覽器不支援 */ }
      if (navigator.vibrate) try { navigator.vibrate(15); } catch { /* 忽略 */ }
      DR.line = document.createElement('div'); DR.line.className = 'dropline';
      autoScroll();
    }, 400);
  });

  document.addEventListener('pointermove', e => {
    if (!DR.el) return;
    if (!DR.active) {
      // 還沒到長按時間就移動，視為捲動畫面
      if (Math.hypot(e.clientX - DR.sx, e.clientY - DR.sy) > 8) { clearTimeout(DR.timer); DR.el.classList.remove('pressing'); DR.el = null; }
      return;
    }
    e.preventDefault(); DR.px = e.clientX; DR.py = e.clientY;
    DR.el.style.transform = `translate(${e.clientX - DR.sx}px, ${e.clientY - DR.sy}px) scale(1.02)`;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (!under) return;
    document.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
    const dl = under.closest('.dli[data-dropd], .dpill[data-dropd]');
    if (dl) { DR.line.remove(); waitPill(dl); return; }
    clearPill();
    const tItem = under.closest('.item[data-iid]');
    if (tItem && tItem !== DR.el) { lineAt(tItem, e.clientY); return; }
    const day = under.closest('.day[data-dropd]');
    if (day) {
      // 在兩站中間的空隙、或剛好壓在橘線上：排到最近的那一站旁邊，不會跑到這天最後
      const box = day.querySelector('.items'), near = box && nearest(box, e.clientY);
      if (near) { lineAt(near, e.clientY); return; }
      // 這天還沒有行程：放進去
      if (box) box.insertBefore(DR.line, box.querySelector(':scope > .btn'));
      else day.appendChild(DR.line);
      DR.target = { kind: 'day', d: +day.dataset.dropd };
      return;
    }
    // 不在可放的位置：取消目前的目標，放開時不會移動
    DR.line.remove(); DR.target = null;
  }, { passive: false });

  document.addEventListener('touchmove', e => { if (DR.active) e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerup', () => endDrag(onDrop));
  document.addEventListener('pointercancel', () => endDrag(null));
  // 長按拖曳後放開，不要再觸發站名按鈕的點擊
  document.addEventListener('click', e => { if (DR.eat && e.target.closest('.item[data-iid]')) { e.preventDefault(); e.stopPropagation(); } DR.eat = false; }, true);
  document.addEventListener('contextmenu', e => { if (e.target.closest('.item[data-iid]')) e.preventDefault(); });
}

// 拖到畫面上下緣時自動捲動；電腦版地圖旁的行程欄、手機底部面板的列表有自己的捲軸，拖到它的上下緣就捲它
function autoScroll() {
  if (!DR.active) return;
  const box = document.querySelector('.withmap > .day, .two > .day, .msheet .mbody');
  const r = box?.getBoundingClientRect();
  if (r && DR.px >= r.left && DR.px <= r.right) {
    // 欄位比畫面高時，只用看得到的上下緣；欄位自己捲到底了就改捲整頁
    const top = Math.max(r.top, 0), bot = Math.min(r.bottom, window.innerHeight);
    const end = box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
    if (DR.py < top + 50) (box.scrollTop > 0 ? box : window).scrollBy(0, -8);
    else if (DR.py > bot - 50) (end ? window : box).scrollBy(0, 8);
  }
  else if (DR.py < 70) window.scrollBy(0, -8); else if (DR.py > window.innerHeight - 110) window.scrollBy(0, 8);
  DR.raf = requestAnimationFrame(autoScroll);
}

// 橘線放在某一站的上面或下面
function lineAt(tItem, y) {
  const r = tItem.getBoundingClientRect(), before = y < r.top + r.height / 2;
  tItem.parentNode.insertBefore(DR.line, before ? tItem : tItem.nextSibling);
  DR.target = { kind: 'item', id: tItem.dataset.iid, before };
}

// 同一個清單裡離手指最近的一站（不算正在拖的那站）
function nearest(box, y) {
  let best = null, bd = Infinity;
  box.querySelectorAll(':scope > .item[data-iid]').forEach(x => {
    if (x === DR.el) return;
    const r = x.getBoundingClientRect(), d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (d < bd) { bd = d; best = x; }
  });
  return best;
}

function waitPill(dl) {
  if (DR.pill === dl) return;
  clearPill();
  DR.pill = dl; DR.target = null; dl.classList.add('drophint');
  DR.pillTimer = setTimeout(() => {
    if (DR.pill !== dl || !DR.active) return;
    dl.classList.remove('drophint'); dl.classList.add('drop');
    DR.target = { kind: 'day', d: +dl.dataset.dropd };
  }, PILL_WAIT);
}
function clearPill() {
  clearTimeout(DR.pillTimer);
  DR.pill?.classList.remove('drophint', 'drop');
  DR.pill = null;
}

function endDrag(onDrop) {
  clearTimeout(DR.timer);
  if (DR.el) DR.el.classList.remove('pressing');
  if (!DR.active) { DR.el = null; return; }
  cancelAnimationFrame(DR.raf);
  const { id, target, el } = DR;
  DR.active = false; DR.el = null; DR.target = null; DR.line?.remove();
  DR.eat = true; setTimeout(() => { DR.eat = false; }, 400);
  clearPill();
  el.classList.remove('lifted'); el.style.transform = '';
  document.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
  if (onDrop) onDrop(id, target);
}
