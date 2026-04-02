import { db } from './firebase-db.js';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { generateShareKey, getUserNickname, showToast, formatDate } from './utils.js';

const tripGrid = document.getElementById('tripGrid');
const addTripForm = document.getElementById('addTripForm');
const addTripModal = document.getElementById('addTripModal');
const openAddModalBtn = document.getElementById('openAddModal');
const closeAddModalBtn = document.getElementById('closeAddModal');
const searchInput = document.getElementById('searchInput');

let allTrips = [];

init();

async function init() {
    await fetchTrips();
    setupEventListeners();
}

async function fetchTrips() {
    try {
        const q = query(collection(db, "trips"), orderBy("startDate", "desc"));
        const snap = await getDocs(q);
        allTrips = [];
        snap.forEach(doc => allTrips.push({ id: doc.id, ...doc.data() }));
        renderTrips(allTrips);
        updateStats(allTrips);
    } catch (err) { console.error("Error fetching trips:", err); }
}

function renderTrips(trips) {
    if (trips.length === 0) {
        tripGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 100px; color: var(--text-muted); font-weight: 300;">尚未有已建立的旅程檔案。</div>`;
        return;
    }
    tripGrid.innerHTML = trips.map(trip => `
        <div class="trip-card" onclick="location.href='trip.html?id=${trip.id}&key=${trip.shareKey}'">
            <div class="trip-image-wrap">
                <img src="${trip.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828'}" class="trip-cover" alt="${trip.title}">
            </div>
            <div class="trip-info">
                <div class="trip-meta">${trip.country} · ${trip.status}</div>
                <h3>${trip.title}</h3>
                <p class="trip-date">${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}</p>
            </div>
        </div>
    `).join('');
}

function updateStats(trips) {
    document.getElementById('stat-total').innerText = trips.length;
    document.getElementById('stat-planning').innerText = trips.filter(t => t.status === '規劃中').length;
    document.getElementById('stat-completed').innerText = trips.filter(t => t.status === '已完成').length;
    const grandTotal = trips.reduce((sum, t) => sum + (Number(t.totalExpense) || 0), 0);
    document.getElementById('stat-expense').innerText = `$${grandTotal.toLocaleString()}`;
}

function setupEventListeners() {
    openAddModalBtn.onclick = () => addTripModal.style.display = 'block';
    closeAddModalBtn.onclick = () => addTripModal.style.display = 'none';
    window.onclick = (e) => { if(e.target == addTripModal) addTripModal.style.display = 'none'; }

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
            totalExpense: 0,
            createdAt: serverTimestamp()
        };
        try {
            const docRef = await addDoc(collection(db, "trips"), newTrip);
            location.href = `trip.html?id=${docRef.id}&key=${newTrip.shareKey}`;
        } catch (err) { showToast("建立失敗", "error"); }
    };

    searchInput.oninput = () => {
        const term = searchInput.value.toLowerCase();
        const filtered = allTrips.filter(t => t.title.toLowerCase().includes(term) || t.country.toLowerCase().includes(term));
        renderTrips(filtered);
    };
}