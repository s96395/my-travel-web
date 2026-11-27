// 操作導覽：畫面變暗、框住按鈕，一步一步說明（Driver.js）
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { ICON } from './dom.js';

let cur = null;
export const touring = () => !!cur?.isActive();

export const stopTour = () => cur?.destroy();
// 畫面重畫後框住的按鈕被換掉了，重新框一次目前這步
export function refreshTour() { if (touring() && cur.getActiveElement()?.isConnected === false) cur.moveTo(cur.getActiveIndex()); }

function run(steps, last) {
  // 找不到要框的按鈕就跳過這步；soft 的步驟改成置中顯示（例如新旅程還沒有任何一站）
  const list = steps.filter(s => !s.element || s.soft || document.querySelector(s.element))
    .map(s => (s.soft && !document.querySelector(s.element) ? { title: s.title, text: s.text } : s));
  if (!list.length) return;
  cur?.destroy();
  cur = driver({
    steps: list.map(({ element, title, text, align }) => ({ element, popover: { title, description: text, ...(align && element ? { align } : {}) } })),
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
    // 手機的地圖和日期列固定在上面、分頁列固定在下面，框住的按鈕被蓋住時，先捲到兩者之間
    onHighlightStarted(el) {
      if (!el) return;
      // 本身就固定在畫面上的（分頁列、日期列、＋）不用捲
      for (let p = el; p && p !== document.body; p = p.parentElement) if (['fixed', 'sticky'].includes(getComputedStyle(p).position)) return;
      const top = Math.max(0, ...['.appbar', '.mtop'].map(q => document.querySelector(q)?.getBoundingClientRect().bottom || 0));
      const bottom = document.querySelector('.tabbar')?.getBoundingClientRect().top || innerHeight;
      const r = el.getBoundingClientRect();
      if (r.height < bottom - top && (r.top < top + 8 || r.bottom > bottom - 8)) window.scrollBy({ top: r.top - top - 24, behavior: 'instant' });
    },
    onDestroyed() { cur = null; },
  });
  cur.drive();
}

// 首頁：第一次登入時出現，也可以從帳號選單重看
// 還沒有旅程時，最後一步放「新增旅程」；已經有旅程時，放「看旅程頁說明」，打開一趟旅程接著看旅程頁那一段
export function homeTour(wide, empty) {
  run([
    { title: '歡迎來到沈迷旅行', text: '每趟旅程的行程、班機、住宿、待辦和支出都整理在這裡，也能和旅伴一起編輯。先花半分鐘看看怎麼用。' },
    { element: wide ? '.appbar [data-act="newTrip"]' : '.fab', title: '新增旅程', text: '填好目的地和日期，就會建立一趟旅程。一起去的人之後再加就好。' },
    { element: '[data-act="account"]', title: '帳號選單', text: '切換深色模式、加到手機主畫面，也可以在這裡重看這段導覽。' },
    { element: '.tools', title: '找旅程', text: '旅程多了以後，用搜尋或類型篩選找到想看的那一趟。' },
    empty
      ? { title: '建立第一趟旅程', text: '按下面的「新增旅程」開始。建立好打開旅程時，會再一步一步說明每個分頁。' }
      : { title: '接著看旅程頁', text: '按下面的「看旅程頁說明」，會打開一趟旅程，一頁一頁說明行程、交通住宿、待辦和支出怎麼用。' },
  ], empty ? { act: 'newTrip', text: '新增旅程' } : { act: 'tourTripFromHome', text: '看旅程頁說明' });
}

// 旅程頁：第一次打開旅程時出現；照實際使用的順序一頁一頁說明，新旅程還沒有資料也看得懂
export function tripTour(wide) {
  const tabs = wide ? '.toptabs' : '.tabbar';
  run([
    { element: tabs, title: '旅程分頁', text: '一趟旅程分成行程、交通住宿、待辦、支出和更多幾頁。接下來照出發前到回國的順序，一頁一頁說明。' },
    { element: '.dpills', title: '每一天', text: '上面一排是每一天，點一下切換。長按日期拖到另一天，兩天的行程會整天對調。' },
    { element: '.addfab', title: '新增景點', text: '按右下角的 ＋ 會打開地圖，搜尋地名或點地圖上的地點，就能加進正在看的那天。' },
    wide
      ? { element: '.mapcol', title: '收藏', text: '按地圖左上的「收藏」，可以把 Google 地圖收藏的地點一次匯進來，再一個個排進每一天，名稱和位置都不會錯。' }
      : { element: '[data-act="mside"][data-v="wish"]', title: '收藏', text: '可以把 Google 地圖收藏的地點一次匯進來，再一個個排進每一天，名稱和位置都不會錯。' },
    { element: '.item.slim .wname', soft: true, title: '排好之後', text: wide
      ? '點站名會展開地址、評分和今天營業時間，可以編輯或刪除，刪除的站會移回收藏。編輯時可以勾 ⭐ 重點；按住右邊的點點拖曳，可以換順序或拖到別天。'
      : '點站名會展開地址、評分和今天營業時間，可以編輯或刪除，刪除的站會移回收藏。編輯時可以勾 ⭐ 重點；按住右邊的點點拖曳，可以換順序或拖到別天。' },
    // 旅途中最常用的兩個按鈕，獨立一步說明；手機框住每站右邊的按鈕，電腦版放在點站名打開的資訊卡裡
    { ...(wide ? {} : { element: '.item.slim .qbtns', soft: true, align: 'end' }), title: '導航和給司機看', text: `${wide ? '點站名打開的資訊卡裡' : '每站右邊'}有兩個按鈕，住宿卡也有：<br>${ICON.map}<b>導航</b>：直接打開 Google 地圖帶路，在韓國會改開 Naver 地圖。<br>${ICON.car}<b>給司機看</b>：把店名和地址用當地文字放大，搭計程車時把手機拿給司機看就好。` },
    { element: `${tabs} [data-v="move"]`, title: '交通住宿', text: '填班機、住宿和其他交通。班機會顯示成登機證，住宿一樣可以導航和給司機看。' },
    { element: `${tabs} [data-v="todo"]`, title: '待辦', text: '列出出發前要做的事，例如換匯、買網卡、訂門票，做完就打勾。' },
    { element: `${tabs} [data-v="exp"]`, title: '支出', text: '按「記一筆」填金額、誰付、怎麼分和哪天花的，沒有帳號的同行者也能一起分。「分攤」「結算」會算好誰該給誰多少。' },
    { element: `${tabs} [data-v="more"]`, title: '更多', text: '新增同行者、傳邀請連結給旅伴一起編輯、修改旅程名稱與日期，也能把這趟複製成新的旅程。' },
    { element: '.dlbtn', title: '離線行程', text: '出國前按一下，把這趟存到裝置上，沒有網路也能看。' },
    { element: '[data-act="quick"]', title: '快速選單', text: '切換外觀、複製行程文字、把行程加到手機行事曆。想再看一次這段說明，按這裡的「操作導覽」。' },
  ]);
}
