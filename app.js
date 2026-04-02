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
    getUserNickname(); // 要求輸入暱稱
    await fetchTrips();
    setupEventListeners();
}

async function fetchTrips() {
    try {
        const q = query(collection(db, "trips"), orderBy("startDate", "desc"));
        const snap = await getDocs(q);
        const trips = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTrips(trips);
        updateStats(trips);
    } catch (err) { console.error(err); }
}

function renderTrips(trips) {
    if (trips.length === 0) {
        tripGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 100px; color: var(--text-muted); font-weight:300; letter-spacing:2px;">NO ARCHIVES YET.</div>`;
        return;
    }
    tripGrid.innerHTML = trips.map(trip => `
        <article class="trip-card" onclick="location.href='trip.html?id=${trip.id}&key=${trip.shareKey}'">
            <div class="trip-image-wrap">
                <img src="${trip.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828'}" class="trip-cover">
            </div>
            <div class="trip-info">
                <span class="trip-meta">${trip.country} · ${trip.status}</span>
                <h3>${trip.title}</h3>
                <p class="trip-date">${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}</p>
            </div>
        </article>
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
    openAddModalBtn.onclick = (e) => { e.preventDefault(); addTripModal.style.display = 'block'; };
    closeAddModalBtn.onclick = () => addTripModal.style.display = 'none';
    window.onclick = (e) => { if(e.target == addTripModal) addTripModal.style.display = 'none'; }

    addTripForm.onsubmit = async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(addTripForm).entries());
        const user = getUserNickname();
        try {
            const docRef = await addDoc(collection(db, "trips"), {
                ...data,
                shareKey: generateShareKey(),
                totalExpense: 0,
                createdByName: user,
                createdAt: serverTimestamp()
            });
            showToast("JOURNEY ARCHIVED.");
            location.href = `trip.html?id=${docRef.id}&key=${data.shareKey}`;
        } catch (err) { showToast("FAILED", "error"); }
    };
}