import { db } from './firebase-db.js';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { generateShareKey, getUserNickname, showToast, formatDate } from './utils.js';

const tripGrid = document.getElementById('tripGrid');
const addTripForm = document.getElementById('addTripForm');
const addTripModal = document.getElementById('addTripModal');
const openAddModalBtn = document.getElementById('openAddModal');
const closeAddModalBtn = document.getElementById('closeAddModal');

init();

async function init() {
    await fetchTrips();
    setupEventListeners();
}

async function fetchTrips() {
    try {
        const q = query(collection(db, "trips"), orderBy("startDate", "desc"));
        const snap = await getDocs(q);
        renderTrips(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) { console.error(err); }
}

function renderTrips(trips) {
    if (trips.length === 0) {
        tripGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 100px; color: var(--text-muted);">尚未有旅程檔案。</div>`;
        return;
    }
    tripGrid.innerHTML = trips.map(trip => `
        <div class="trip-card" onclick="location.href='trip.html?id=${trip.id}&key=${trip.shareKey}'" style="cursor:pointer; transition:0.4s;">
            <div style="width:100%; aspect-ratio: 4/5; border-radius:15px; overflow:hidden; margin-bottom:15px; box-shadow:0 10px 30px rgba(0,0,0,0.05);">
                <img src="${trip.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828'}" style="width:100%; height:100%; object-fit:cover;">
            </div>
            <div class="trip-info">
                <div style="color:var(--accent); font-size:0.75rem; font-weight:700; text-transform:uppercase;">${trip.country} · ${trip.status}</div>
                <h3 style="font-family:var(--serif-font); font-size:1.4rem; margin: 5px 0;">${trip.title}</h3>
                <p style="color:var(--text-muted); font-size:0.8rem;">${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}</p>
            </div>
        </div>
    `).join('');
}

function setupEventListeners() {
    openAddModalBtn.onclick = () => addTripModal.style.display = 'block';
    closeAddModalBtn.onclick = () => addTripModal.style.display = 'none';
    window.onclick = (e) => { if(e.target == addTripModal) addTripModal.style.display = 'none'; }

    addTripForm.onsubmit = async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(addTripForm).entries());
        try {
            const docRef = await addDoc(collection(db, "trips"), {
                ...data, shareKey: generateShareKey(), totalExpense: 0, createdAt: serverTimestamp()
            });
            location.href = `trip.html?id=${docRef.id}&key=${docRef.id}`; // 簡化處理
        } catch (err) { showToast("建立失敗", "error"); }
    };
}