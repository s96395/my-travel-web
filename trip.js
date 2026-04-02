import { db } from './firebase-db.js';
import { 
    doc, getDoc, collection, getDocs, addDoc, deleteDoc, 
    query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserNickname, showToast, formatDate, copyToClipboard } from './utils.js';

// 取得 URL 參數
const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
const shareKey = urlParams.get('key');

// 初始化
if (tripId && shareKey) {
    init();
} else {
    document.getElementById('auth-error').style.display = 'block';
}

async function init() {
    try {
        const tripRef = doc(db, "trips", tripId);
        const tripSnap = await getDoc(tripRef);

        if (tripSnap.exists()) {
            const data = tripSnap.data();
            // 安全驗證
            if (data.shareKey === shareKey) {
                renderTripHeader(data);
                loadAllSubData();
                setupEventListeners(); // 確保在這裡綁定按鈕
                document.getElementById('trip-details').style.display = 'block';
            } else {
                document.getElementById('auth-error').style.display = 'block';
            }
        } else {
            document.getElementById('auth-error').style.display = 'block';
        }
    } catch (err) {
        console.error("初始化失敗:", err);
    }
}

// 渲染標題
function renderTripHeader(data) {
    document.getElementById('trip-title').innerText = data.title;
    document.getElementById('trip-subtitle').innerText = `${data.country} · ${formatDate(data.startDate)} - ${formatDate(data.endDate)}`;
    document.getElementById('trip-cover').src = data.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828';
}

// 綁定所有點擊事件
function setupEventListeners() {
    const modal = document.getElementById('universalModal');
    const modalForm = document.getElementById('modalForm');

    // 輔助函式：開啟 Modal
    const openForm = (title, html, type) => {
        document.getElementById('modalTitle').innerText = title;
        document.getElementById('modalBody').innerHTML = html;
        modalForm.dataset.type = type;
        modal.style.display = 'block';
    };

    // 1. 新增天數行程
    document.getElementById('addDayBtn').onclick = () => {
        openForm("新增行程項目", `
            <div class="form-group"><label>第幾天</label><input type="number" name="day" value="1" required></div>
            <div class="form-group"><label>時間</label><input type="time" name="time"></div>
            <div class="form-group"><label>行程內容</label><input type="text" name="activity" placeholder="例如：首里城巡禮" required></div>
            <div class="form-group"><label>地點</label><input type="text" name="location"></div>
        `, "itinerary");
    };

    // 2. 新增照片 (貼網址模式)
    document.getElementById('addImageBtn').onclick = () => {
        openForm("新增照片連結", `
            <div class="form-group"><label>圖片網址 (URL)</label><input type="url" name="url" placeholder="https://..." required></div>
            <div class="form-group"><label>說明</label><input type="text" name="note"></div>
        `, "images");
    };

    // 3. 新增支出
    document.getElementById('addExpenseBtn').onclick = () => {
        openForm("新增支出", `
            <div class="form-group"><label>項目</label><input type="text" name="name" required></div>
            <div class="form-group"><label>金額</label><input type="number" name="amount" required></div>
            <div class="form-group">
                <label>分類</label>
                <select name="category">
                    <option value="餐飲">餐飲</option><option value="交通">交通</option>
                    <option value="住宿">住宿</option><option value="購物">購物</option>
                    <option value="其他">其他</option>
                </select>
            </div>
        `, "expenses");
    };

    // 4. 新增航班
    document.getElementById('addFlightBtn').onclick = () => {
        openForm("新增航班", `
            <div class="form-group"><label>航班編號</label><input type="text" name="flightNumber" required></div>
            <div class="form-group"><label>機場</label><input type="text" name="route" placeholder="TPE -> NRT"></div>
        `, "flights");
    };

    // 5. 新增住宿
    document.getElementById('addHotelBtn').onclick = () => {
        openForm("新增住宿", `
            <div class="form-group"><label>飯店名稱</label><input type="text" name="hotelName" required></div>
            <div class="form-group"><label>地址</label><input type="text" name="address"></div>
        `, "hotels");
    };

    // 6. 複製連結
    document.getElementById('copyLinkBtn').onclick = () => copyToClipboard(window.location.href);

    // 提交表單
    modalForm.onsubmit = async (e) => {
        e.preventDefault();
        const type = modalForm.dataset.type;
        const formData = new FormData(modalForm);
        const data = Object.fromEntries(formData.entries());
        
        data.createdAt = serverTimestamp();
        data.createdByName = getUserNickname();

        try {
            await addDoc(collection(db, `trips/${tripId}/${type}`), data);
            modal.style.display = 'none';
            showToast("儲存成功！");
            loadAllSubData(); // 重新整理列表
        } catch (err) {
            showToast("儲存失敗", "error");
        }
    };
}

// 載入所有子資料
async function loadAllSubData() {
    loadItinerary();
    loadExpenses();
    loadImages();
    loadFlights();
    loadHotels();
}

async function loadItinerary() {
    const q = query(collection(db, `trips/${tripId}/itinerary`), orderBy("day"), orderBy("time"));
    const snap = await getDocs(q);
    const container = document.getElementById('itinerary-timeline');
    container.innerHTML = "";
    let lastDay = null;

    snap.forEach(d => {
        const item = d.data();
        if (lastDay !== item.day) {
            lastDay = item.day;
            container.innerHTML += `<div class="day-block"><div class="day-dot"></div><h3>Day ${lastDay}</h3></div>`;
        }
        container.innerHTML += `
            <div class="itinerary-item">
                <strong>${item.time || '--:--'}</strong> ${item.activity}
                <div style="font-size:0.8rem; color:gray;">${item.location || ''}</div>
                <button class="delete-btn" onclick="deleteSubItem('itinerary', '${d.id}')">×</button>
            </div>
        `;
    });
}

async function loadExpenses() {
    const snap = await getDocs(collection(db, `trips/${tripId}/expenses`));
    const list = document.getElementById('expense-list');
    const totalEl = document.getElementById('total-expense');
    let total = 0;
    list.innerHTML = "";
    snap.forEach(d => {
        const ex = d.data();
        total += Number(ex.amount);
        list.innerHTML += `<div class="info-mini-card">💸 ${ex.name}: $${ex.amount} <button onclick="deleteSubItem('expenses', '${d.id}')">×</button></div>`;
    });
    totalEl.innerText = `$${total.toLocaleString()}`;
}

async function loadImages() {
    const snap = await getDocs(collection(db, `trips/${tripId}/images`));
    const grid = document.getElementById('photo-grid');
    grid.innerHTML = "";
    snap.forEach(d => {
        grid.innerHTML += `<div style="position:relative"><img src="${d.data().url}" style="width:100%; border-radius:10px;"><button class="delete-btn" onclick="deleteSubItem('images', '${d.id}')">×</button></div>`;
    });
}

async function loadFlights() {
    const snap = await getDocs(collection(db, `trips/${tripId}/flights`));
    const container = document.getElementById('flight-list');
    container.innerHTML = "";
    snap.forEach(d => {
        const f = d.data();
        container.innerHTML += `<div class="info-mini-card">✈️ ${f.flightNumber} (${f.route}) <button onclick="deleteSubItem('flights', '${d.id}')">×</button></div>`;
    });
}

async function loadHotels() {
    const snap = await getDocs(collection(db, `trips/${tripId}/hotels`));
    const container = document.getElementById('hotel-list');
    container.innerHTML = "";
    snap.forEach(d => {
        const h = d.data();
        container.innerHTML += `<div class="info-mini-card">🏨 ${h.hotelName} <button onclick="deleteSubItem('hotels', '${d.id}')">×</button></div>`;
    });
}

// 刪除功能
window.deleteSubItem = async (type, id) => {
    if (!confirm("確定刪除？")) return;
    await deleteDoc(doc(db, `trips/${tripId}/${type}`, id));
    showToast("已刪除");
    loadAllSubData();
};