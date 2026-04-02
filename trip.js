import { db } from './firebase-db.js';
import { doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserNickname, showToast, formatDate, copyToClipboard } from './utils.js';

const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
const shareKey = urlParams.get('key');
let chartInstance = null;

if (tripId && shareKey) { init(); }

async function init() {
    try {
        const tripSnap = await getDoc(doc(db, "trips", tripId));
        if (tripSnap.exists() && tripSnap.data().shareKey === shareKey) {
            renderHeader(tripSnap.data());
            setupEvents();
            loadAllData();
            document.getElementById('trip-details').style.display = 'block';
        } else {
            document.body.innerHTML = "<div style='text-align:center;padding:100px;'><h1>權限錯誤</h1><a href='index.html'>返回首頁</a></div>";
        }
    } catch (err) { console.error(err); }
}

function renderHeader(data) {
    document.getElementById('trip-title').innerText = data.title;
    document.getElementById('trip-subtitle').innerText = `${data.country} · ${formatDate(data.startDate)} — ${formatDate(data.endDate)}`;
    document.getElementById('trip-cover').src = data.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828';
}

function setupEvents() {
    const modal = document.getElementById('universalModal');
    const modalForm = document.getElementById('modalForm');
    const open = (title, body, type) => {
        document.getElementById('modalTitle').innerText = title;
        document.getElementById('modalBody').innerHTML = body;
        modalForm.dataset.type = type;
        modal.style.display = 'block';
    };

    document.getElementById('closeModal').onclick = () => modal.style.display = 'none';

    document.getElementById('addDayBtn').onclick = () => open("新增行程項目", `
        <div class="form-group"><label>第幾天</label><input type="number" name="day" value="1" required></div>
        <div class="form-group"><label>時間</label><input type="time" name="time"></div>
        <div class="form-group"><label>行程活動</label><input type="text" name="activity" required placeholder="例如：精品下午茶"></div>
        <div class="form-group"><label>地點名稱</label><input type="text" name="location"></div>
    `, "itinerary");

    document.getElementById('addExpenseBtn').onclick = () => open("新增支出紀錄", `
        <div class="form-group"><label>項目名稱</label><input type="text" name="name" required></div>
        <div class="form-group"><label>金額 (TWD)</label><input type="number" name="amount" required></div>
        <div class="form-group"><label>分類</label><select name="category"><option value="餐飲">餐飲</option><option value="交通">交通</option><option value="住宿">住宿</option><option value="購物">購物</option><option value="其他">其他</option></select></div>
    `, "expenses");

    document.getElementById('addImageBtn').onclick = () => open("新增旅遊回憶", `<div class="form-group"><label>照片網址</label><input type="url" name="url" required></div>`, "images");

    // 複製連結按鈕
    const copyFn = () => copyToClipboard(window.location.href);
    document.getElementById('copyLinkBtn').onclick = copyFn;
    document.getElementById('sidebarCopyBtn').onclick = copyFn;

    modalForm.onsubmit = async (e) => {
        e.preventDefault();
        const type = modalForm.dataset.type;
        const data = Object.fromEntries(new FormData(modalForm).entries());
        if(data.amount) data.amount = Number(data.amount);
        if(data.day) data.day = Number(data.day);
        data.createdAt = serverTimestamp();
        data.createdByName = getUserNickname();
        try {
            await addDoc(collection(db, `trips/${tripId}/${type}`), data);
            modal.style.display = 'none';
            loadAllData();
        } catch (err) { showToast("儲存失敗", "error"); }
    };
}

async function loadAllData() {
    // 每日行程
    const qI = query(collection(db, `trips/${tripId}/itinerary`), orderBy("day"), orderBy("time"));
    const sI = await getDocs(qI);
    let htmlI = ""; let lastDay = null;
    sI.forEach(d => {
        const item = d.data();
        if(lastDay !== item.day) { lastDay = item.day; htmlI += `<h3 style="font-family:var(--serif-font); margin:40px 0 20px; font-size:1.5rem; color:var(--primary);">Day ${lastDay}</h3>`; }
        htmlI += `<div class="timeline-item">
                    <div style="flex:1;">
                        <span style="font-weight:900; color:var(--accent); margin-right:15px;">${item.time || '--:--'}</span>
                        <strong style="font-size:1.1rem;">${item.activity}</strong>
                        <div style="font-size:0.85rem; color:#95a5a6; margin-top:5px;">${item.location || ''}</div>
                    </div>
                    <button class="delete-btn" onclick="deleteSubItem('itinerary', '${d.id}')">×</button>
                  </div>`;
    });
    document.getElementById('itinerary-timeline').innerHTML = htmlI || "<p style='color:#ccc; padding:40px; text-align:center;'>尚未規劃行程</p>";

    // 支出與圖表
    const sE = await getDocs(collection(db, `trips/${tripId}/expenses`));
    let total = 0; const cats = {}; let htmlE = "";
    sE.forEach(d => {
        const ex = d.data(); const amt = Number(ex.amount) || 0;
        total += amt; cats[ex.category] = (cats[ex.category] || 0) + amt;
        htmlE += `<div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:0.9rem;">
                    <span>${ex.name}</span>
                    <div>
                        <span style="color:var(--text-muted); margin-right:10px;">$${amt.toLocaleString()}</span>
                        <button onclick="deleteSubItem('expenses', '${d.id}')" style="border:none;background:none;color:#ddd;cursor:pointer;">×</button>
                    </div>
                  </div>`;
    });
    document.getElementById('total-expense').innerText = `$${total.toLocaleString()}`;
    document.getElementById('expense-list').innerHTML = htmlE;
    renderChart(cats);
    await updateDoc(doc(db, "trips", tripId), { totalExpense: total });

    // 照片相簿
    const sPh = await getDocs(collection(db, `trips/${tripId}/images`));
    let htmlPh = "";
    sPh.forEach(d => {
        htmlPh += `<div style="position:relative; aspect-ratio:1; overflow:hidden; border-radius:4px; box-shadow:var(--shadow-soft);">
                    <img src="${d.data().url}" style="width:100%; height:100%; object-fit:cover;">
                    <button class="delete-btn" onclick="deleteSubItem('images', '${d.id}')" style="position:absolute; top:10px; right:10px; background:rgba(255,255,255,0.8); width:25px; height:25px; border-radius:50%; display:flex; align-items:center; justify-content:center;">×</button>
                   </div>`;
    });
    document.getElementById('photo-grid').innerHTML = htmlPh;
}

function renderChart(data) {
    const ctx = document.getElementById('expenseChart');
    if(chartInstance) chartInstance.destroy();
    if(Object.keys(data).length === 0) return;
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: ['#1A3A5F', '#E67E22', '#E6D5B8', '#95A5A6', '#2C3E50'], borderWidth: 0 }] },
        options: { cutout: '80%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } } } }
    });
}

// 刪除功能全域掛載
window.deleteSubItem = async (type, id) => {
    if(!confirm("確定要刪除這筆紀錄嗎？")) return;
    try {
        await deleteDoc(doc(db, `trips/${tripId}/${type}`, id));
        showToast("已刪除紀錄");
        loadAllData();
    } catch (err) { console.error(err); }
};