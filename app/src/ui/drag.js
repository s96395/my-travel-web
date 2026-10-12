// 行程長按拖曳：按住約 0.4 秒後可拖曳，放開時回報放在哪裡（規格書 F21）
// onDrop(id, target)：target = { kind: 'item', id, before } 或 { kind: 'day', d }
const DR = { timer: null, el: null, id: null, sx: 0, sy: 0, active: false, line: null, target: null, raf: null, py: 0 };

export function initDrag({ canEdit, onLocked, onDrop }) {
  document.addEventListener('pointerdown', e => {
    const it = e.target.closest('.item[data-iid]');
    if (!it || e.target.closest('button') || (e.button && e.button !== 0)) return;
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
    e.preventDefault(); DR.py = e.clientY;
    DR.el.style.transform = `translate(${e.clientX - DR.sx}px, ${e.clientY - DR.sy}px) scale(1.02)`;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (!under) return;
    document.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
    const tItem = under.closest('.item[data-iid]');
    if (tItem && tItem !== DR.el) {
      const r = tItem.getBoundingClientRect(), before = e.clientY < r.top + r.height / 2;
      tItem.parentNode.insertBefore(DR.line, before ? tItem : tItem.nextSibling);
      DR.target = { kind: 'item', id: tItem.dataset.iid, before };
      return;
    }
    const dl = under.closest('.dli[data-dropd]');
    if (dl) { DR.line.remove(); dl.classList.add('drop'); DR.target = { kind: 'day', d: +dl.dataset.dropd }; return; }
    const day = under.closest('.day[data-dropd]');
    if (day) {
      const box = day.querySelector('.items');
      if (box) box.insertBefore(DR.line, box.querySelector(':scope > .btn'));
      else day.appendChild(DR.line);
      DR.target = { kind: 'day', d: +day.dataset.dropd };
    }
  }, { passive: false });

  document.addEventListener('touchmove', e => { if (DR.active) e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerup', () => endDrag(onDrop));
  document.addEventListener('pointercancel', () => endDrag(null));
  document.addEventListener('contextmenu', e => { if (e.target.closest('.item[data-iid]')) e.preventDefault(); });
}

// 拖到畫面上下緣時自動捲動
function autoScroll() {
  if (!DR.active) return;
  if (DR.py < 70) window.scrollBy(0, -8); else if (DR.py > window.innerHeight - 110) window.scrollBy(0, 8);
  DR.raf = requestAnimationFrame(autoScroll);
}

function endDrag(onDrop) {
  clearTimeout(DR.timer);
  if (DR.el) DR.el.classList.remove('pressing');
  if (!DR.active) { DR.el = null; return; }
  cancelAnimationFrame(DR.raf);
  const { id, target, el } = DR;
  DR.active = false; DR.el = null; DR.target = null; DR.line?.remove();
  el.classList.remove('lifted'); el.style.transform = '';
  document.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
  if (onDrop && target) onDrop(id, target);
}
