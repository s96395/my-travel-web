// 旅程內頁：第一批只放基本資訊，各分頁在下一批加入
import { esc, ICON } from '../ui/dom.js';
import { coverHtml } from '../ui/scene.js';
import { slashDate } from '../lib/dates.js';
import { tripDays } from '../lib/trips.js';

export function renderTrip(S) {
  const t = S.trips.find(x => x.id === S.tripId);
  const head = title => `<header class="appbar" id="appbar"><button type="button" class="iconbtn" data-act="home" aria-label="回首頁">${ICON.back}</button><h1>${esc(title)}</h1></header>`;
  if (!t) {
    return head('旅程') + `<div class="wrap narrow"><div class="empty">${S.loadingTrips ? '正在讀取旅程…' : '找不到這趟旅程，可能已被刪除，或你不是這趟旅程的成員。'}</div></div>`;
  }
  return head(t.name) + `<div class="wrap narrow">
    ${coverHtml(t, true)}
    <div class="card"><h2>${esc(t.name)}</h2>
      <p class="small muted num" style="margin:4px 0 0">${slashDate(t.start)} – ${slashDate(t.end)}・${tripDays(t)} 天・${esc(t.place || '未填地點')}</p>
      <p class="small muted" style="margin:4px 0 0">${esc(t.type)}・${esc(t.status)}・${t.people || 1} 位同行者</p></div>
    <div class="empty">行程、班機住宿、待辦和支出分頁會在下一批加入。</div>
  </div>`;
}
