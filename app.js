import { db } from './firebase-db.js';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { generateShareKey, getUserNickname, showToast, formatDate } from './utils.js';

const tripGrid = document.getElementById('tripGrid');
const addTripForm = document.getElementById('addTripForm');
const addTripModal = document.getElementById('addTripModal');
const openAddModalBtn = document.getElementById('openAddModal');
const closeAddModalBtn = document.getElementById('closeAddModal');
const searchInput = document.getElementById('searchInput');

// 資料存在記憶體，搜尋不用重打 API
let allTrips = [];

init();

async function init() {
    getUserNickname();
    await fetchTrips();
    setupEventListeners();
}

async function fetchTrips() {
    try {
        const q = query(collection(db, "trips"), orderBy("startDate", "desc"));
        const snap = await getDocs(q);
        allTrips = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTrips(allTrips);
        updateStats(allTrips);
    } catch (err) {
        console.error(err);
        showToast("載入失敗，請重新整理", "error");
    }
}

function renderTrips(trips) {
    if (trips.length === 0) {
        tripGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:100px; color:#aaa;">尚未有旅程檔案，點擊右上角新增吧。</div>`;
        return;
    }
    tripGrid.innerHTML = trips.map(trip => `
        <div class="trip-card" onclick="location.href='trip.html?id=${trip.id}&key=${trip.shareKey}'">
            <div class="trip-cover-wrap">
                <img src="${trip.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828'}" class="trip-cover" onerror="this.src='https://images.unsplash.com/photo-1488646953014-85cb44e25828'">
            </div>
            <div class="status-badge">${trip.status}</div>
            <div class="trip-info">
                <h3>${trip.title}</h3>
                <p style="color:var(--accent); font-size:0.9rem;">${trip.country} · ${trip.city || ''}</p>
                <p style="color:var(--text-muted); font-size:0.85rem; font-weight:400;">${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</p>
            </div>
        </div>
    `).join('');
}

function updateStats(trips) {
    document.getElementById('stat-total').innerText = trips.length;
    document.getElementById('stat-planning').innerText = trips.filter(t => t.status === '規劃中').length;
    document.getElementById('stat-completed').innerText = trips.filter(t => t.status === '已完成').length;
    const total = trips.reduce((sum, t) => sum + (Number(t.totalExpense) || 0), 0);
    document.getElementById('stat-expense').innerText = `$${total.toLocaleString()}`;
}

function setupEventListeners() {
    openAddModalBtn.onclick = () => addTripModal.style.display = 'block';
    closeAddModalBtn.onclick = () => addTripModal.style.display = 'none';
    window.onclick = (e) => { if (e.target == addTripModal) addTripModal.style.display = 'none'; };

    addTripForm.onsubmit = async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(addTripForm).entries());
        const key = generateShareKey();
        try {
            const docRef = await addDoc(collection(db, "trips"), {
                ...data, shareKey: key, totalExpense: 0,
                createdByName: getUserNickname(), createdAt: serverTimestamp()
            });
            location.href = `trip.html?id=${docRef.id}&key=${key}`;
        } catch (err) {
            showToast("建立失敗，請稍後再試", "error");
        }
    };

    // 搜尋：前端 filter，不重打 API
    searchInput.oninput = () => {
        const term = searchInput.value.toLowerCase().trim();
        if (!term) {
            renderTrips(allTrips);
            return;
        }
        const filtered = allTrips.filter(t =>
            (t.title || '').toLowerCase().includes(term) ||
            (t.country || '').toLowerCase().includes(term) ||
            (t.city || '').toLowerCase().includes(term)
        );
        renderTrips(filtered);
    };
}
