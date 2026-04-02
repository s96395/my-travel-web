import { db } from './firebase-db.js';
import { 
    doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, 
    query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserNickname, showToast, formatDate, copyToClipboard } from './utils.js';

const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
const shareKey = urlParams.get('key');
let chartInstance = null;

if (tripId && shareKey) {
    init();
} else {
    document.body.innerHTML = "<div style='text-align:center;padding:100px;'><h1>權限錯誤</h1><a href='index.html'>返回首頁</a></div>";
}

async function init() {
    try {
        const tripRef = doc(db, "trips", tripId);
        const tripSnap = await getDoc(tripRef);
        if (tripSnap.exists() && tripSnap.data().shareKey === shareKey) {
            renderHeader(tripSnap.data());
            setupEvents();
            loadAllData();
            document.getElementById('trip-details').style.display = 'block';
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
    
    // 新增按鈕們
    document.getElementById('addDayBtn').onclick = () => open("新增行程項目", `
        <div class="form-group"><label>第幾天</label><input type="number" name="day" value="1" required></div>
        <div class="form-group"><label>時間</label><input type="time" name="time"></div>
        <div class="form-group"><label>行程活動</label><input type="text" name="activity" required placeholder="例如：精品下午茶"></div>
        <div class="form-group"><label>地點</label><input type="text" name="location"></div>
    `, "itinerary");

    document.getElementById('addExpenseBtn').onclick = () => open("新增支出紀錄", `
        <div class="form-group"><label>項目名稱</label><input type="text" name="name" required></div>
        <div class="form-group"><label>金額 (TWD)</label><input type="number" name="amount" required></div>
        <div class="form-group"><label>分類</label><select name="category"><option value="餐飲">餐飲</option><option value="交通">交通</option><option value="住宿">住宿</option><option value="購物">購物</option><option value="其他">其他</option></select></div>
    `, "expenses");

    document.getElementById('addImageBtn').onclick = () => open("新增旅遊記憶", `<div class="form-group"><label>照片網址 (URL)</label><input type="url" name="url" required></div>`, "images");

    document.getElementById('copyLinkBtn').onclick = () => copyToClipboard(window.location.href);

    // 【新增關鍵程式碼：刪除整趟旅程】
    document.getElementById('deleteTripBtn').onclick = async () => {
        if (!confirm("⚠️ 確定要刪除整趟旅程嗎？\n這將會移除所有行程、支出與相簿紀錄，且無法復原。")) return;
        
        try {
            await deleteDoc(doc(db, "trips", tripId));
            showToast("旅程已成功移除");
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } catch (err) {
            console.error(err);
            showToast("刪除失敗，請檢查權限", "error");
        }
    };

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
    // 載入行程
    const qI = query(collection(db, `trips/${tripId}/itinerary`), orderBy("day"), orderBy("time"));
    const sI = await getDocs(qI);
    let htmlI = ""; let lastDay = null;
    sI.forEach(d => {
        const item = d.data();
        if(lastDay !== item.day) { lastDay = item.day; htmlI += `<h3 style="margin-top:25px; margin-bottom:10px; border-left: 5px solid var(--primary); padding-left:10px;">Day ${lastDay}</h3>`; }
        htmlI += `<div class="itinerary-item">
                    <div><span style="color:var(--accent);">${item.time || '--:--'}</span> <strong>${item.activity}</strong></div>
                    <button class="delete-btn-sub" onclick="deleteSubItem('itinerary', '${d.id}')">×</button>
                  </div>`;
    });
    document.getElementById('itinerary-timeline').innerHTML = htmlI || "<p style='color:#ccc; padding:20px; text-align:center;'>尚未規劃任何行程</p>";

    // 載入支出
    const sE = await getDocs(collection(db, `trips/${tripId}/expenses`));
    let total = 0; const cats = {}; let htmlE = "";
    sE.forEach(d => {
        const ex = d.data(); const amt = Number(ex.amount) || 0;
        total += amt; cats[ex.category] = (cats[ex.category] || 0) + amt;
        htmlE += `<div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.9rem;">
                    <span>💸 ${ex.name}</span>
                    <span>$${amt.toLocaleString()} <button onclick="deleteSubItem('expenses', '${d.id}')" style="border:none;background:none;color:#ddd;cursor:pointer;">×</button></span>
                  </div>`;
    });
    document.getElementById('total-expense').innerText = `$${total.toLocaleString()}`;
    document.getElementById('expense-list').innerHTML = htmlE;
    renderChart(cats);
    await updateDoc(doc(db, "trips", tripId), { totalExpense: total });

    // 載入相簿
    const sPh = await getDocs(collection(db, `trips/${tripId}/images`));
    let htmlPh = "";
    sPh.forEach(d => {
        htmlPh += `<div style="position:relative; aspect-ratio:1; border-radius:10px; overflow:hidden;">
                    <img src="${d.data().url}" style="width:100%;height:100%;object-fit:cover;">
                    <button class="delete-btn-sub" onclick="deleteSubItem('images', '${d.id}')" style="position:absolute; top:5px; right:5px; background:rgba(255,255,255,0.7); border-radius:50%; width:24px; height:24px;">×</button>
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
        data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: ['#1A3A5F', '#E67E22', '#E6D5B8', '#95A5A6', '#2C3E50'], borderWidth: 2, borderColor: '#fff' }] },
        options: { cutout: '75%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
    });
}

window.deleteSubItem = async (type, id) => {
    if(!confirm("確定要刪除這筆紀錄嗎？")) return;
    try {
        await deleteDoc(doc(db, `trips/${tripId}/${type}`, id));
        showToast("已刪除紀錄");
        loadAllData();
    } catch (err) { console.error(err); }
};