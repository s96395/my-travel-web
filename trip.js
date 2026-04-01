import { db } from './firebase-db.js';
import { 
    doc, getDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, 
    query, orderBy, serverTimestamp, where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserNickname, showToast, formatDate, copyToClipboard } from './utils.js';

// 取得網址參數
const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
const shareKey = urlParams.get('key');

// 全域狀態
let currentTripData = null;
const modal = document.getElementById('universalModal');
const modalForm = document.getElementById('modalForm');
const modalBody = document.getElementById('modalBody');
const modalTitle = document.getElementById('modalTitle');

/**
 * 1. 權限檢查與初始化
 */
async function init() {
    if (!tripId || !shareKey) {
        showAuthError();
        return;
    }

    try {
        const tripRef = doc(db, "trips", tripId);
        const tripSnap = await getDoc(tripRef);

        if (tripSnap.exists()) {
            const data = tripSnap.data();
            // 安全驗證：比對 shareKey
            if (data.shareKey === shareKey) {
                currentTripData = data;
                document.getElementById('trip-details').style.display = 'block';
                renderTripHeader(data);
                loadAllSubData();
                setupEventListeners();
            } else {
                showAuthError();
            }
        } else {
            showAuthError();
        }
    } catch (error) {
        console.error("Auth error:", error);
        showAuthError();
    }
}

function showAuthError() {
    document.getElementById('auth-error').style.display = 'block';
}

/**
 * 2. 渲染頁面標題與 Hero
 */
function renderTripHeader(data) {
    document.title = `${data.title} | VoyageArchive`;
    document.getElementById('trip-title').innerText = data.title;
    document.getElementById('trip-cover').src = data.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200';
    document.getElementById('trip-subtitle').innerText = `${data.country} · ${data.city} | ${formatDate(data.startDate)} - ${formatDate(data.endDate)}`;
}

/**
 * 3. 載入所有子資料 (行程、支出、航班等)
 */
async function loadAllSubData() {
    loadItinerary();
    loadExpenses();
    loadFlights();
    loadHotels();
    loadPhotos();
}

// --- 每日行程處理 ---
async function loadItinerary() {
    const q = query(collection(db, `trips/${tripId}/itinerary`), orderBy("dayNumber", "asc"), orderBy("order", "asc"));
    const snap = await getDocs(q);
    const container = document.getElementById('itinerary-timeline');
    container.innerHTML = "";

    let currentDay = -1;
    let dayDiv = null;

    snap.forEach(docSnap => {
        const item = docSnap.data();
        const itemId = docSnap.id;

        if (item.dayNumber !== currentDay) {
            currentDay = item.dayNumber;
            dayDiv = document.createElement('div');
            dayDiv.className = 'day-block';
            dayDiv.innerHTML = `<div class="day-dot"></div><h3>Day ${currentDay}</h3><div class="day-items" data-day="${currentDay}"></div>`;
            container.appendChild(dayDiv);
        }

        const itemEl = document.createElement('div');
        itemEl.className = 'itinerary-item';
        itemEl.draggable = true;
        itemEl.innerHTML = `
            <strong>${item.time || '--:--'}</strong> ${item.title}
            <div style="font-size:0.8rem; color:#666;">${item.location || ''}</div>
            <button class="delete-btn" onclick="deleteSubItem('itinerary', '${itemId}')">×</button>
        `;
        // 拖曳事件處理
        itemEl.addEventListener('dragstart', () => itemEl.classList.add('dragging'));
        itemEl.addEventListener('dragend', () => itemEl.classList.remove('dragging'));

        dayDiv.querySelector('.day-items').appendChild(itemEl);
    });
}

// --- 支出統計與 Canvas 圓餅圖 ---
async function loadExpenses() {
    const snap = await getDocs(collection(db, `trips/${tripId}/expenses`));
    const list = document.getElementById('expense-list');
    const totalEl = document.getElementById('total-expense');
    let total = 0;
    const categories = {};

    list.innerHTML = "";
    snap.forEach(docSnap => {
        const exp = docSnap.data();
        total += Number(exp.amount);
        categories[exp.category] = (categories[exp.category] || 0) + Number(exp.amount);
        
        list.innerHTML += `
            <div class="expense-item" style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:5px;">
                <span>${exp.name} (${exp.category})</span>
                <span>$${exp.amount}</span>
            </div>
        `;
    });

    totalEl.innerText = `$${total.toLocaleString()}`;
    drawExpenseChart(categories);
}

function drawExpenseChart(data) {
    const canvas = document.getElementById('expenseChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const colors = ['#1A3A5F', '#E67E22', '#E6D5B8', '#2ECC71', '#9B59B6', '#34495E'];
    let total = Object.values(data).reduce((a, b) => a + b, 0);
    let startAngle = 0;

    Object.keys(data).forEach((key, i) => {
        const sliceAngle = (data[key] / total) * 2 * Math.PI;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.moveTo(100, 100);
        ctx.arc(100, 100, 80, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();
        startAngle += sliceAngle;
    });
}

// --- 航班、住宿、相簿簡化渲染 ---
async function loadFlights() {
    const snap = await getDocs(collection(db, `trips/${tripId}/flights`));
    const container = document.getElementById('flight-list');
    container.innerHTML = "";
    snap.forEach(d => {
        const f = d.data();
        container.innerHTML += `<div class="info-mini-card">✈️ <strong>${f.flightNumber}</strong><br>${f.departAirport} ➔ ${f.arriveAirport}</div>`;
    });
}

async function loadHotels() {
    const snap = await getDocs(collection(db, `trips/${tripId}/hotels`));
    const container = document.getElementById('hotel-list');
    container.innerHTML = "";
    snap.forEach(d => {
        const h = d.data();
        container.innerHTML += `<div class="info-mini-card">🏨 <strong>${h.name}</strong><br>${h.address}</div>`;
    });
}

async function loadPhotos() {
    const snap = await getDocs(collection(db, `trips/${tripId}/photos`));
    const container = document.getElementById('photo-grid');
    container.innerHTML = "";
    snap.forEach(d => {
        const p = d.data();
        container.innerHTML += `<img src="${p.url}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:10px;">`;
    });
}

/**
 * 4. 事件監聽與通用 Modal 控制
 */
function setupEventListeners() {
    document.getElementById('copyLinkBtn').onclick = () => copyToClipboard(window.location.href);

    // 新增天數行程
    document.getElementById('addDayBtn').onclick = () => {
        openModal("新增行程項目", `
            <div class="form-group"><label>第幾天</label><input type="number" name="dayNumber" value="1" required></div>
            <div class="form-group"><label>時間</label><input type="time" name="time"></div>
            <div class="form-group"><label>行程名稱</label><input type="text" name="title" required></div>
            <div class="form-group"><label>地點</label><input type="text" name="location"></div>
        `, "itinerary");
    };

    // 新增支出
    document.getElementById('addExpenseBtn').onclick = () => {
        openModal("新增支出", `
            <div class="form-group"><label>名稱</label><input type="text" name="name" required></div>
            <div class="form-group"><label>金額</label><input type="number" name="amount" required></div>
            <div class="form-group">
                <label>分類</label>
                <select name="category">
                    <option value="餐飲">餐飲</option><option value="交通">交通</option>
                    <option value="住宿">住宿</option><option value="購物">購物</option>
                    <option value="門票">門票</option><option value="其他">其他</option>
                </select>
            </div>
        `, "expenses");
    };

    // 新增航班
    document.getElementById('addFlightBtn').onclick = () => {
        openModal("新增航班", `
            <div class="form-group"><label>航班編號</label><input type="text" name="flightNumber" required></div>
            <div class="form-group"><label>出發機場</label><input type="text" name="departAirport" required></div>
            <div class="form-group"><label>抵達機場</label><input type="text" name="arriveAirport" required></div>
        `, "flights");
    };

    // 表單提交處理
    modalForm.onsubmit = async (e) => {
        e.preventDefault();
        const type = modalForm.dataset.type;
        const formData = new FormData(modalForm);
        const data = Object.fromEntries(formData.entries());
        const user = getUserNickname();

        data.createdAt = serverTimestamp();
        data.createdByName = user;

        try {
            await addDoc(collection(db, `trips/${tripId}/${type}`), data);
            modal.style.display = 'none';
            showToast("新增成功！");
            loadAllSubData();
        } catch (err) {
            showToast("新增失敗", "error");
        }
    };
}

function openModal(title, html, type) {
    modalTitle.innerText = title;
    modalBody.innerHTML = html;
    modalForm.dataset.type = type;
    modal.style.display = 'block';
}

// 供 HTML 內聯調用的刪除函數
window.deleteSubItem = async (collectionName, itemId) => {
    if (!confirm("確定要刪除嗎？")) return;
    try {
        await deleteDoc(doc(db, `trips/${tripId}/${collectionName}`, itemId));
        showToast("已刪除");
        loadAllSubData();
    } catch (err) {
        showToast("刪除失敗", "error");
    }
};

init();