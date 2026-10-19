// 操作導覽：畫面變暗、框住按鈕，一步一步說明（Driver.js）
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

let cur = null;
export const touring = () => !!cur?.isActive();

export const stopTour = () => cur?.destroy();
// 畫面重畫後框住的按鈕被換掉了，重新框一次目前這步
export function refreshTour() { if (touring() && cur.getActiveElement()?.isConnected === false) cur.moveTo(cur.getActiveIndex()); }

function run(steps, last) {
  const list = steps.filter(s => !s.element || document.querySelector(s.element));
  if (!list.length) return;
  cur?.destroy();
  cur = driver({
    steps: list.map(({ element, title, text }) => ({ element, popover: { title, description: text } })),
    showProgress: true, progressText: '{{current}} / {{total}}',
    nextBtnText: '下一步', prevBtnText: '上一步', doneBtnText: '開始使用',
    popoverClass: 'tour', stagePadding: 6, stageRadius: 12,
    disableActiveInteraction: true, smoothScroll: true,
    // 最後一步可以多放一個按鈕，例如「載入示範旅程」；按鈕帶 data-act，交給主程式處理
    onPopoverRender(pop, { state }) {
      if (!last || state.activeIndex !== list.length - 1) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tour-extra'; b.dataset.act = last.act; b.textContent = last.text;
      b.addEventListener('click', () => cur?.destroy());
      pop.footer.append(b);
    },
    onDestroyed() { cur = null; },
  });
  cur.drive();
}

// 首頁：第一次登入時出現；沒有旅程時最後一步多一個「載入示範旅程」
export function homeTour(wide, empty) {
  run([
    { title: '歡迎來到沈迷旅行', text: '每趟旅程的行程、班機、住宿、待辦和支出都整理在這裡，也能和旅伴一起編輯。先花半分鐘看看怎麼用。' },
    { element: wide ? '.appbar [data-act="newTrip"]' : '.fab', title: '新增旅程', text: '填好目的地和日期，就會建立一趟旅程。' },
    { element: '[data-act="account"]', title: '帳號選單', text: '可以載入示範旅程、切換深色模式，也可以在這裡重看這段導覽。' },
    { element: '.tools', title: '找旅程', text: '旅程多了以後，用搜尋或類型篩選找到想看的那一趟。' },
    empty
      ? { title: '先看一趟示範旅程？', text: '示範旅程是京都 6 天，行程、班機、住宿、支出都已經填好，可以直接點著試。看完在「更多」就能刪掉。' }
      : { title: '準備好了', text: '點開任何一趟旅程，第一次進去時會再說明裡面的分頁。' },
  ], empty ? { act: 'demoTrip', text: '載入示範旅程' } : null);
}

// 旅程頁：第一次打開旅程時出現
export function tripTour(wide) {
  const tabs = wide ? '.toptabs' : '.tabbar';
  run([
    { element: tabs, title: '旅程分頁', text: '一趟旅程分成行程、交通住宿、待辦、支出和更多，點一下就能切換。' },
    wide
      ? { element: '.mappane', title: '地圖和想去清單', text: '右邊的地圖會插上每天的行程。按「匯入收藏」可以把 Google 地圖收藏的地點匯進想去清單，再排進每一天。' }
      : { element: '.dpills', title: '每一天', text: '上面一排是每一天，點一下切換。長按行程右邊的 ⋮⋮ 可以換順序，或拖到別天。' },
    ...(wide ? [] : [{ element: '[data-act="mside"][data-v="wish"]', title: '想去清單', text: '把 Google 地圖收藏的地點匯進來，再一個個排進每一天，名稱和位置都不會錯。' }]),
    { element: '.dlbtn', title: '離線行程', text: '出國前按一下，把這趟存到裝置上，沒有網路也能看。' },
    { element: `${tabs} [data-v="exp"]`, title: '支出', text: '記下每筆花費，選誰付、怎麼分。沒有帳號的同行者也能一起分攤。' },
    { element: `${tabs} [data-v="more"]`, title: '更多', text: '邀請旅伴一起編輯、匯出行事曆，也可以在「使用小技巧」重看這段導覽。' },
  ]);
}
