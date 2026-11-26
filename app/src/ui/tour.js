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
    // 最後一步可以多放一個按鈕，例如「新增旅程」；按鈕帶 data-act，交給主程式處理
    // 還沒到最後一步時，左下角放「跳過」，一次關掉整段導覽
    onPopoverRender(pop, { state }) {
      if (state.activeIndex < list.length - 1) {
        const s = document.createElement('button');
        s.type = 'button'; s.className = 'tour-skip'; s.textContent = '跳過';
        s.addEventListener('click', () => cur?.destroy());
        pop.footer.prepend(s);
      }
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

// 首頁：第一次登入時出現；還沒有旅程時，最後一步直接放「新增旅程」按鈕
export function homeTour(wide, empty) {
  run([
    { title: '歡迎來到沈迷旅行', text: '每趟旅程的行程、班機、住宿、待辦和支出都整理在這裡，也能和旅伴一起編輯。先花半分鐘看看怎麼用。' },
    { element: wide ? '.appbar [data-act="newTrip"]' : '.fab', title: '新增旅程', text: '填好目的地和日期，就會建立一趟旅程。一起去的人之後再加就好。' },
    { element: '[data-act="account"]', title: '帳號選單', text: '切換深色模式、加到手機主畫面，也可以在這裡重看這段導覽。' },
    { element: '.tools', title: '找旅程', text: '旅程多了以後，用搜尋或類型篩選找到想看的那一趟。' },
    empty
      ? { title: '建立第一趟旅程', text: '按下面的「新增旅程」開始。建立好打開旅程時，會再一步一步說明每個分頁。' }
      : { title: '準備好了', text: '點開任何一趟旅程，第一次進去時會再說明裡面的分頁。' },
  ], empty ? { act: 'newTrip', text: '新增旅程' } : null);
}

// 旅程頁：第一次打開旅程時出現
export function tripTour(wide) {
  const tabs = wide ? '.toptabs' : '.tabbar';
  run([
    { element: tabs, title: '旅程分頁', text: '一趟旅程分成行程、交通住宿、待辦、支出和更多，點一下就能切換。' },
    wide
      ? { element: '.mapcol', title: '地圖和收藏', text: '地圖會插上每天的行程。按地圖左上的「收藏」打開收藏，可以匯入 Google 地圖收藏的地點，再排進每一天。' }
      : { element: '.dpills', title: '每一天', text: '上面一排是每一天，點一下切換。長按日期拖到另一天，兩天的行程會整天對調。' },
    { element: '.item.slim .wname', title: '點一站看詳細', text: wide
      ? '點站名會在下方展開地址、評分、今天營業時間，可以編輯或刪除，刪除的站會移回收藏。長按右邊的點點可以換順序，或拖到別天。'
      : '點站名會在下方展開地址、評分、今天營業時間，可以編輯或刪除，刪除的站會移回收藏。右邊可以導航、給司機看，長按點點能換順序或拖到別天。' },
    { element: '.addfab', title: '新增景點', text: '按右下角的 ＋ 會打開地圖，搜尋地名或點地圖上的地點，就能加進這天。編輯時可以勾 ⭐ 重點。' },
    ...(wide ? [] : [{ element: '[data-act="mside"][data-v="wish"]', title: '收藏', text: '把 Google 地圖收藏的地點匯進來，再一個個排進每一天，名稱和位置都不會錯。' }]),
    { element: '.dlbtn', title: '離線行程', text: '出國前按一下，把這趟存到裝置上，沒有網路也能看。' },
    { element: `${tabs} [data-v="exp"]`, title: '支出', text: '記下每筆花費，選誰付、怎麼分。沒有帳號的同行者也能一起分攤。' },
    { element: '[data-act="quick"]', title: '快速選單', text: '切換外觀、複製行程文字、把行程加到手機行事曆，也可以在「使用小技巧」重看這段導覽。旁邊的月亮（太陽）按一下就能直接換外觀。' },
    { element: `${tabs} [data-v="more"]`, title: '更多', text: '管理同行者、邀請旅伴一起編輯、修改旅程名稱與日期，也能把這趟複製成新的旅程。' },
  ]);
}
