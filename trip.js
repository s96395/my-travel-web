import { db } from './firebase-db.js';
import { doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserNickname, showToast, formatDate, copyToClipboard } from './utils.js';

const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
const shareKey = urlParams.get('key');
let chartInstance = null;

if (tripId) { init(); }

async function init() {
    try {
        const tripSnap = await getDoc(doc(db, "trips", tripId));
        if (tripSnap.exists()) {
            const data = tripSnap.data();
            renderHeader(data);
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
    
    document.getElementById('addDayBtn').onclick = () => open("New Itinerary Item", `
        <div class="form-group"><label>Day</label><input type="number" name="day" value="1" required></div>
        <div class="form-group"><label>Time</label><input type="time" name="time"></div>
        <div class="form-group"><label>Activity</label><input type="text" name="activity" required placeholder="例如：精品下午茶"></div>
        <div class="form-group"><label>Location</label><input type="text" name="location" placeholder="地點名稱"></div>
    `, "itinerary");

    document.getElementById('addExpenseBtn').onclick = () => open("New Expense", `
        <div class="form-group"><label>Item</label><input type="text" name="name" required></div>
        <div class="form-group"><label>Amount (TWD)</label><input type="number" name="amount" required></div>
        <div class="form-group"><label>Category</label><select name="category"><option value="餐飲">餐飲</option><option value="交通">交通</option><option value="住宿">住宿</option><option value="購物">購物</option><option value="其他">其他</option></select></div>
    `, "expenses");

    document.getElementById('addImageBtn').onclick = () => open("New Memory", `<div class="form-group"><label>Photo URL</label><input type="url" name="url" required></div>`, "images");
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
            loadAllData();
        } catch (err) { showToast("FAILED", "error"); }
    };
}

async function loadAllData() {
    // 時間軸行程
    const qI = query(collection(db, `trips/${tripId}/itinerary`), orderBy("day"), orderBy("time"));
    const sI = await getDocs(qI);
    let htmlI = ""; let lastDay = null;
    sI.forEach(d => {
        const item = d.data();
        if(lastDay !== item.day) { lastDay = item.day; htmlI += `<h3 style="font-family:var(--serif-font); margin:40px 0 20px; font-size:1.5rem; border-left:4px solid var(--primary); padding-left:15px;">Day ${lastDay}</h3>`; }
        htmlI += `<div class="timeline-item">
                    <div class="time-tag">${item.time || '--:--'}</div>
                    <div class="activity-info" style="flex:1;"><h4>${item.activity}</h4><p>${item.location || ''}</p></div>
                    <button onclick="deleteSubItem('itinerary', '${d.id}')" style="background:none; border:none; color:#eee; cursor:pointer;">×</button>
                  </div>`;
    });
    document.getElementById('itinerary-timeline').innerHTML = htmlI || "<p style='color:#ccc; padding:40px; text-align:center;'>NO ITEMS YET.</p>";

    // 支出分析
    const sE = await getDocs(collection(db, `trips/${tripId}/expenses`));
    let total = 0; const cats = {}; let htmlE = "";
    sE.forEach(d => {
        const ex = d.data(); const amt = Number(ex.amount) || 0;
        total += amt; cats[ex.category] = (cats[ex.category] || 0) + amt;
        htmlE += `<div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:0.9rem;">
                    <span>${ex.name}</span><span style="color:var(--text-muted);">$${amt.toLocaleString()}</span>
                  </div>`;
    });
    document.getElementById('total-expense').innerText = `$${total.toLocaleString()}`;
    document.getElementById('expense-list').innerHTML = htmlE;
    renderChart(cats);
    await updateDoc(doc(db, "trips", tripId), { totalExpense: total });

    // 照片回憶
    const sPh = await getDocs(collection(db, `trips/${tripId}/images`));
    let htmlPh = "";
    sPh.forEach(d => {
        htmlPh += `<div style="position:relative; aspect-ratio:1; overflow:hidden; border-radius:4px; box-shadow:var(--shadow-soft);">
                    <img src="${d.data().url}" style="width:100%; height:100%; object-fit:cover;">
                    <button onclick="deleteSubItem('images', '${d.id}')" style="position:absolute; top:10px; right:10px; background:rgba(255,255,255,0.8); border:none; width:25px; height:25px; border-radius:50%; cursor:pointer;">×</button>
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

window.deleteSubItem = async (type, id) => {
    if(!confirm("DELETE?")) return;
    await deleteDoc(doc(db, `trips/${tripId}/${type}`, id));
    loadAllData();
};