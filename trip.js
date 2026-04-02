import { db } from './firebase-db.js';
import { doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserNickname, showToast, formatDate, copyToClipboard } from './utils.js';

const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
const shareKey = urlParams.get('key');
let chartInstance = null;

if (tripId && shareKey) {
    init();
} else {
    document.body.innerHTML = `<div style="text-align:center; padding:100px;"><h1>無權存取</h1><p>請檢查分享連結是否正確。</p><a href="index.html">回到首頁</a></div>`;
}

async function init() {
    try {
        const tripSnap = await getDoc(doc(db, "trips", tripId));
        if (tripSnap.exists() && tripSnap.data().shareKey === shareKey) {
            renderHeader(tripSnap.data());
            setupEvents();
            loadData();
            document.getElementById('trip-details').style.display = 'block';
        }
    } catch (err) { console.error("Initialization error:", err); }
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

    document.getElementById('addDayBtn').onclick = () => open("New Itinerary Item", `
        <div style="margin-bottom:15px;"><label>天數</label><input type="number" name="day" value="1" required style="width:100%;padding:10px;border:1px solid #eee;border-radius:5px;"></div>
        <div style="margin-bottom:15px;"><label>時間</label><input type="time" name="time" style="width:100%;padding:10px;border:1px solid #eee;border-radius:5px;"></div>
        <div style="margin-bottom:15px;"><label>地點/活動</label><input type="text" name="activity" required style="width:100%;padding:10px;border:1px solid #eee;border-radius:5px;"></div>
    `, "itinerary");

    document.getElementById('addExpenseBtn').onclick = () => open("New Expense", `
        <div style="margin-bottom:15px;"><label>項目名稱</label><input type="text" name="name" required style="width:100%;padding:10px;border:1px solid #eee;border-radius:5px;"></div>
        <div style="margin-bottom:15px;"><label>金額 (TWD)</label><input type="number" name="amount" required style="width:100%;padding:10px;border:1px solid #eee;border-radius:5px;"></div>
        <div style="margin-bottom:15px;"><label>分類</label><select name="category" style="width:100%;padding:10px;border:1px solid #eee;border-radius:5px;">
            <option value="餐飲">餐飲</option><option value="交通">交通</option><option value="住宿">住宿</option><option value="購物">購物</option><option value="其他">其他</option>
        </select></div>
    `, "expenses");

    document.getElementById('addImageBtn').onclick = () => open("New Memory Link", `
        <div><label>照片網址</label><input type="url" name="url" required placeholder="貼上圖片網址" style="width:100%;padding:10px;border:1px solid #eee;border-radius:5px;"></div>
    `, "images");

    document.getElementById('copyLinkBtn').onclick = () => copyToClipboard(window.location.href);

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
            loadData();
        } catch (err) { console.error("Save error:", err); }
    };
}

async function loadData() {
    // 載入行程
    const qI = query(collection(db, `trips/${tripId}/itinerary`), orderBy("day"), orderBy("time"));
    const sI = await getDocs(qI);
    let htmlI = ""; let lastDay = null;
    sI.forEach(d => {
        const item = d.data();
        if(lastDay !== item.day) { lastDay = item.day; htmlI += `<h3 style="margin: 30px 0 15px; font-family: var(--serif-font); border-bottom: 1px solid #eee; padding-bottom: 5px;">Day ${lastDay}</h3>`; }
        htmlI += `<div style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:#fafafa; border-radius:12px; margin-bottom:12px; border-left: 4px solid var(--primary);">
                    <div><span style="font-weight:700; color:var(--primary); margin-right:15px;">${item.time || '--:--'}</span> ${item.activity}</div>
                    <button onclick="deleteSubItem('itinerary', '${d.id}')" style="background:none; border:none; color:#ddd; cursor:pointer; font-size:1.2rem;">×</button>
                  </div>`;
    });
    document.getElementById('itinerary-timeline').innerHTML = htmlI || "<p style='color:#ccc;'>點擊右上方新增第一筆行程</p>";

    // 載入支出
    const sE = await getDocs(collection(db, `trips/${tripId}/expenses`));
    let total = 0; const cats = {}; let htmlE = "";
    sE.forEach(d => {
        const ex = d.data(); const amt = Number(ex.amount) || 0;
        total += amt; cats[ex.category] = (cats[ex.category] || 0) + amt;
        htmlE += `<div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:10px; border-bottom: 1px dashed #eee; padding-bottom: 5px;">
                    <span>💸 ${ex.name}: $${amt.toLocaleString()}</span>
                    <button onclick="deleteSubItem('expenses', '${d.id}')" style="border:none; background:none; color:#ddd; cursor:pointer;">×</button>
                  </div>`;
    });
    document.getElementById('total-expense').innerText = `$${total.toLocaleString()}`;
    document.getElementById('expense-list').innerHTML = htmlE;
    renderChart(cats);
    await updateDoc(doc(db, "trips", tripId), { totalExpense: total });

    // 載入照片
    const sPh = await getDocs(collection(db, `trips/${tripId}/images`));
    let htmlPh = "";
    sPh.forEach(d => {
        htmlPh += `<div style="position:relative; aspect-ratio:1; overflow:hidden; border-radius:12px; box-shadow: var(--shadow-soft);">
                    <img src="${d.data().url}" style="width:100%; height:100%; object-fit:cover;">
                    <button onclick="deleteSubItem('images', '${d.id}')" style="position:absolute; top:8px; right:8px; background:rgba(255,255,255,0.8); border:none; border-radius:50%; width:24px; height:24px; cursor:pointer; display:flex; align-items:center; justify-content:center;">×</button>
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
        data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: ['#1A3A5F', '#E67E22', '#E6D5B8', '#2C3E50', '#7F8C8D'], borderWidth: 2, borderColor: '#fff' }] },
        options: { cutout: '75%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
    });
}

window.deleteSubItem = async (type, id) => {
    if(!confirm("確定要刪除這筆紀錄嗎？")) return;
    try {
        await deleteDoc(doc(db, `trips/${tripId}/${type}`, id));
        loadData();
    } catch (err) { console.error("Delete error:", err); }
};