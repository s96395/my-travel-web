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
    getUserNickname();
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
        tripGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:100px; color:#aaa;">尚未有旅程檔案。</div>`;
        return;
    }
    tripGrid.innerHTML = trips.map(trip => `
        <div class="trip-card" onclick="location.href='trip.html?id=${trip.id}&key=${trip.shareKey}'">
            <div class="trip-cover-wrap">
                <img src="${trip.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828'}" class="trip-cover">
            </div>
            <div class="status-badge">${trip.status}</div>
            <div class="trip-info">
                <h3>${trip.title}</h3>
                <p style="color:var(--accent); font-size:0.9rem;">${trip.country} · ${trip.city || ''}</p>
                <p style="color:var(--text-muted); font-size:0.85rem;">${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</p>
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
    window.onclick = (e) => { if(e.target == addTripModal) addTripModal.style.display = 'none'; }

    addTripForm.onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(addTripForm);
        const user = getUserNickname();
        const key = generateShareKey();
        const newTrip = {
            title: formData.get('title'),
            country: formData.get('country'),
            city: formData.get('city'),
            startDate: formData.get('startDate'),
            endDate: formData.get('endDate'),
            coverImageUrl: formData.get('coverImageUrl'),
            status: formData.get('status'),
            shareKey: key,
            totalExpense: 0,
            createdByName: user,
            createdAt: serverTimestamp()
        };
        try {
            const docRef = await addDoc(collection(db, "trips"), newTrip);
            location.href = `trip.html?id=${docRef.id}&key=${key}`;
        } catch (err) { showToast("建立失敗", "error"); }
    };
}