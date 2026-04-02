import { db } from './firebase-db.js';
import { 
    doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc,
    query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserNickname, showToast, formatDate, copyToClipboard } from './utils.js';

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
            if (data.shareKey === shareKey) {
                renderTripHeader(data);
                setupEventListeners(); // 綁定按鈕
                loadAllSubData();      // 載入資料
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

function renderTripHeader(data) {
    document.getElementById('trip-title').innerText = data.title;
    document.getElementById('trip-subtitle').innerText = `${data.country} · ${formatDate(data.startDate)} - ${formatDate(data.endDate)}`;
    document.getElementById('trip-cover').src = data.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828';
}

function setupEventListeners() {
    const modal = document.getElementById('universalModal');
    const modalForm = document.getElementById('modalForm');
    const closeBtn = document.querySelector('.close');

    const openForm = (title, html, type) => {
        document.getElementById('modalTitle').innerText = title;
        document.getElementById('modalBody').innerHTML = html;
        modalForm.dataset.type = type;
        modal.style.display = 'block';
    };

    // 關閉 Modal
    if(closeBtn) closeBtn.onclick = () => modal.style.display = 'none';

    // 行程
    document.getElementById('addDayBtn').onclick = () => {
        openForm("新增行程項目", `
            <div class="form-group"><label>第幾天</label><input type="number" name="day" value="1" required></div>
            <div class="form-group"><label>時間</label><input type="time" name="time"></div>
            <div class="form-group"><label>內容</label><input type="text" name="activity" required></div>
            <div class="form-group"><label>地點</label><input type="text" name="location"></div>
        `, "itinerary");
    };

    // 相簿
    document.getElementById('addImageBtn').onclick = () => {
        openForm("新增照片連結", `
            <div class="form-group"><label>圖片網址</label><input type="url" name="url" placeholder="https://..." required></div>
            <div class="form-group"><label>備註</label><input type="text" name="note"></div>
        `, "images");
    };

    // 支出
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

    // 航班
    document.getElementById('addFlightBtn').onclick = () => {
        openForm("新增航班", `
            <div class="form-group"><label>航班編號</label><input type="text" name="flightNumber" required></div>
            <div class="form-group"><label>航線</label><input type="text" name="route" placeholder="TPE -> OKA"></div>
        `, "flights");
    };

    // 住宿
    document.getElementById('addHotelBtn').onclick = () => {
        openForm("新增住宿", `
            <div class="form-group"><label>飯店名稱</label><input type="text" name="hotelName" required></div>
            <div class="form-group"><label>地址</label><input type="text" name="address"></div>
        `, "hotels");
    };

    document.getElementById('copyLinkBtn').onclick = () => copyToClipboard(window.location.href);

    modalForm.onsubmit = async (e) => {
        e.preventDefault();
        const type = modalForm.dataset.type;
        const formData = new FormData(modalForm);
        const data = Object.fromEntries(formData.entries());
        
        // 關鍵：修正資料類型
        if(data.amount) data.amount = Number(data.amount);
        if(data.day) data.day = Number(data.day);

        data.createdAt = serverTimestamp();
        data.createdByName = getUserNickname();

        try {
            await addDoc(collection(db, `trips/${tripId}/${type}`), data);
            modal.style.display = 'none';
            showToast("已儲存");
            loadAllSubData();
        } catch (err) {
            console.error(err);
            showToast("儲存失敗", "error");
        }
    };
}

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
                <div class="itinerary-content">
                    <strong>${item.time || '--:--'}</strong> ${item.activity}
                    <div class="itinerary-loc">${item.location || ''}</div>
                </div>
                <button class="delete-btn-sub" onclick="deleteSubItem('itinerary', '${d.id}')">×</button>
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
        list.innerHTML += `
            <div class="info-mini-card expense-item">
                <span>💸 ${ex.name}: $${ex.amount}</span>
                <button onclick="deleteSubItem('expenses', '${d.id}')" class="delete-btn-tiny">×</button>
            </div>
        `;
    });
    totalEl.innerText = `$${total.toLocaleString()}`;

    // 同步到父文件以供首頁顯示
    await updateDoc(doc(db, "trips", tripId), { totalExpense: total });
}

async function loadImages() {
    const snap = await getDocs(collection(db, `trips/${tripId}/images`));
    const grid = document.getElementById('photo-grid');
    grid.innerHTML = "";
    snap.forEach(d => {
        grid.innerHTML += `
            <div class="photo-item">
                <img src="${d.data().url}">
                <button class="delete-btn-sub" onclick="deleteSubItem('images', '${d.id}')">×</button>
            </div>
        `;
    });
}

async function loadFlights() {
    const snap = await getDocs(collection(db, `trips/${tripId}/flights`));
    const container = document.getElementById('flight-list');
    container.innerHTML = "";
    snap.forEach(d => {
        const f = d.data();
        container.innerHTML += `<div class="info-mini-card">✈️ ${f.flightNumber} (${f.route}) <button class="delete-btn-tiny" onclick="deleteSubItem('flights', '${d.id}')">×</button></div>`;
    });
}

async function loadHotels() {
    const snap = await getDocs(collection(db, `trips/${tripId}/hotels`));
    const container = document.getElementById('hotel-list');
    container.innerHTML = "";
    snap.forEach(d => {
        const h = d.data();
        container.innerHTML += `<div class="info-mini-card">🏨 ${h.hotelName} <button class="delete-btn-tiny" onclick="deleteSubItem('hotels', '${d.id}')">×</button></div>`;
    });
}

window.deleteSubItem = async (type, id) => {
    if (!confirm("確定要刪除嗎？")) return;
    await deleteDoc(doc(db, `trips/${tripId}/${type}`, id));
    showToast("已刪除");
    loadAllSubData();
};