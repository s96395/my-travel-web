import { db } from './firebase-db.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    orderBy, 
    serverTimestamp,
    where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { generateShareKey, getUserNickname, showToast, formatDate } from './utils.js';

// DOM 元素
const tripGrid = document.getElementById('tripGrid');
const addTripForm = document.getElementById('addTripForm');
const addTripModal = document.getElementById('addTripModal');
const openAddModalBtn = document.getElementById('openAddModal');
const closeModalBtn = document.querySelector('.close');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');

let allTrips = []; // 存儲原始資料供篩選使用

/**
 * 初始化載入資料
 */
async function init() {
    getUserNickname(); // 確保有暱稱
    await fetchTrips();
    setupEventListeners();
}

/**
 * 從 Firestore 抓取旅程
 */
async function fetchTrips() {
    try {
        const q = query(collection(db, "trips"), orderBy("startDate", "desc"));
        const querySnapshot = await getDocs(q);
        
        allTrips = [];
        querySnapshot.forEach((doc) => {
            allTrips.push({ id: doc.id, ...doc.data() });
        });
        
        renderTrips(allTrips);
        updateStats(allTrips);
    } catch (error) {
        console.error("Error fetching trips:", error);
        showToast("無法載入旅程資料", "error");
    }
}

/**
 * 渲染旅程卡片
 */
function renderTrips(trips) {
    if (trips.length === 0) {
        tripGrid.innerHTML = `<div class="empty-state">目前還沒有旅程，點擊右上角新增第一筆吧！</div>`;
        return;
    }

    tripGrid.innerHTML = trips.map(trip => `
        <div class="trip-card" onclick="window.location.href='trip.html?id=${trip.id}&key=${trip.shareKey}'">
            <img src="${trip.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800'}" class="trip-cover" alt="封面">
            <div class="status-badge">${trip.status}</div>
            <div class="trip-info">
                <h3>${trip.title}</h3>
                <p class="trip-meta">${trip.country} · ${trip.city || ''}</p>
                <p class="trip-date">${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</p>
            </div>
        </div>
    `).join('');
}

/**
 * 更新統計數據
 */
function updateStats(trips) {
    document.getElementById('stat-total').innerText = trips.length;
    document.getElementById('stat-planning').innerText = trips.filter(t => t.status === '規劃中').length;
    document.getElementById('stat-completed').innerText = trips.filter(t => t.status === '已完成').length;
    
    // 支出統計通常在子集合中，這裡先預留介面，第一版顯示總數
    // 之後可透過迴圈加總各 Trip 的 totalExpense 欄位
}

/**
 * 事件監聽
 */
function setupEventListeners() {
    // 開關 Modal
    openAddModalBtn.onclick = () => addTripModal.style.display = "block";
    closeModalBtn.onclick = () => addTripModal.style.display = "none";
    window.onclick = (e) => { if (e.target == addTripModal) addTripModal.style.display = "none"; }

    // 新增旅程
    addTripForm.onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(addTripForm);
        const user = getUserNickname();
        
        const newTrip = {
            title: formData.get('title'),
            country: formData.get('country'),
            city: formData.get('city'),
            startDate: formData.get('startDate'),
            endDate: formData.get('endDate'),
            coverImageUrl: formData.get('coverImageUrl'),
            status: formData.get('status'),
            shareKey: generateShareKey(),
            createdByName: user,
            updatedByName: user,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        try {
            const docRef = await addDoc(collection(db, "trips"), newTrip);
            showToast("旅程建立成功！");
            window.location.href = `trip.html?id=${docRef.id}&key=${newTrip.shareKey}`;
        } catch (error) {
            console.error("Error adding trip:", error);
            showToast("建立失敗", "error");
        }
    };

    // 搜尋功能
    searchInput.oninput = filterTrips;
    statusFilter.onchange = filterTrips;
}

function filterTrips() {
    const term = searchInput.value.toLowerCase();
    const status = statusFilter.value;

    const filtered = allTrips.filter(trip => {
        const matchTerm = trip.title.toLowerCase().includes(term) || 
                          trip.country.toLowerCase().includes(term) || 
                          (trip.city && trip.city.toLowerCase().includes(term));
        const matchStatus = status === 'all' || trip.status === status;
        return matchTerm && matchStatus;
    });

    renderTrips(filtered);
}

init();