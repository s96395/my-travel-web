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
    document.getElementById('inner-hero').style.backgroundImage = `linear-gradient(rgba(26,58,95,0.7), rgba(26,58,95,0.7)), url('${data.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828'}')`;
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

    document.getElementById('addDayBtn').onclick = () => open("新增行程", `
        <div class="form-group"><label>第幾天</label><input type="number" name="day" value="1" required></div>
        <div class="form-group"><label>時間</label><input type="time" name="time"></div>
        <div class="form-group"><label>活動內容</label><input type="text" name="activity" required placeholder="例如：參觀首里城"></div>
        <div class="form-group"><label>地點</label><input type="text" name="location"></div>
    `, "itinerary");

    document.getElementById('addExpenseBtn').onclick = () => open("紀錄支出", `
        <div class="form-group"><label>項目名稱</label><input type="text" name="name" required></div>
        <div class="form-group"><label>金額 (TWD)</label><input type="number" name="amount" required></div>
        <div class="form-group"><label>分類</label><select name="category"><option value="餐飲">餐飲</option><option value="交通">交通</option><option value="住宿">住宿</option><option value="購物">購物</option><option value="其他">其他</option></select></div>
    `, "expenses");

    document.getElementById('addImageBtn').onclick = () => open("新增相片", `<div class="form-group"><label>圖片網址 (URL)</label><input type="url" name="url" required></div>`, "images");

    document.getElementById('copyLinkBtn').onclick = () => copyToClipboard(window.location.href);

    document.getElementById('deleteTripBtn').onclick = async () => {
        if (confirm("⚠️ 確定要刪除整趟旅程嗎？此操作無法復原。")) {
            await deleteDoc(doc(db, "trips", tripId));
            window.location.href = 'index.html';
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
    const qI = query(collection(db, `trips/${tripId}/itinerary`), orderBy("day"), orderBy("time"));
    const sI = await getDocs(qI);
    let htmlI = ""; let lastDay = null;
    sI.forEach(d => {
        const item = d.data();
        if(lastDay !== item.day) { lastDay = item.day; htmlI += `<h3 style="margin-top:25px; margin-bottom:10px; border-left:6px solid var(--primary); padding-left:15px;">Day ${lastDay}</h3>`; }
        htmlI += `<div class="itinerary-item">
                    <div><span style="color:var(--accent);">${item.time || '--:--'}</span> <strong>${item.activity}</strong></div>
                    <button class="delete-btn-sub" onclick="deleteSubItem('itinerary', '${d.id}')">×</button>
                  </div>`;
    });
    document.getElementById('itinerary-timeline').innerHTML = htmlI || "<p style='color:#ccc; text-align:center;'>尚未建立行程</p>";

    const sE = await getDocs(collection(db, `trips/${tripId}/expenses`));
    let total = 0; const cats = {}; let htmlE = "";
    sE.forEach(d => {
        const ex = d.data(); const amt = Number(ex.amount) || 0;
        total += amt; cats[ex.category] = (cats[ex.category] || 0) + amt;
        htmlE += `<div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span>💸 ${ex.name}</span>
                    <span>$${amt.toLocaleString()} <button onclick="deleteSubItem('expenses', '${d.id}')" style="border:none;background:none;color:#ddd;cursor:pointer;">×</button></span>
                  </div>`;
    });
    document.getElementById('total-expense').innerText = `$${total.toLocaleString()}`;
    document.getElementById('expense-list').innerHTML = htmlE;
    renderChart(cats);
    await updateDoc(doc(db, "trips", tripId), { totalExpense: total });

    const sPh = await getDocs(collection(db, `trips/${tripId}/images`));
    let htmlPh = "";
    sPh.forEach(d => {
        htmlPh += `<div style="position:relative; aspect-ratio:1; border-radius:15px; overflow:hidden;">
                    <img src="${d.data().url}" style="width:100%;height:100%;object-fit:cover;">
                    <button class="delete-btn-sub" onclick="deleteSubItem('images', '${d.id}')" style="position:absolute; top:8px; right:8px; background:rgba(255,255,255,0.8); border-radius:50%; width:24px; height:24px;">×</button>
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
        options: { cutout: '75%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } }
    });
}

window.deleteSubItem = async (type, id) => {
    if(confirm("確定要刪除這筆紀錄嗎？")) {
        await deleteDoc(doc(db, `trips/${tripId}/${type}`, id));
        loadAllData();
    }
};