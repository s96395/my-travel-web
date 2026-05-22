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
let activeTypeFilter = 'all';

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

const TYPE_ICON = { '自由行': '🎒', '跟團': '🚌', '潛旅': '🤿' };

function renderTrips(trips) {
    if (trips.length === 0) {
        tripGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:100px; color:#aaa;">尚未有旅程檔案，點擊右上角新增吧。</div>`;
        return;
    }
    tripGrid.innerHTML = trips.map(trip => {
        const typeIcon = TYPE_ICON[trip.tripType] || '';
        const typeBadge = trip.tripType
            ? `<span class="trip-card-tag trip-type-badge--${trip.tripType}">${typeIcon} ${trip.tripType}</span>`
            : '';
        const tankBadge = (trip.tripType === '潛旅' && trip.totalTanks)
            ? `<span class="trip-card-tag" style="background:rgba(0,150,199,0.12); color:#0096C7;">🫧 ${trip.totalTanks} 瓶</span>`
            : '';

        return `
        <div class="trip-card" onclick="location.href='trip.html?id=${trip.id}&key=${trip.shareKey}'">
            <div class="trip-cover-wrap">
                <img src="${trip.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828'}" class="trip-cover" onerror="this.src='https://images.unsplash.com/photo-1488646953014-85cb44e25828'">
            </div>
            <div class="status-badge">${trip.status}</div>
            <div class="trip-info">
                <h3>${trip.title}</h3>
                <p style="color:var(--accent); font-size:0.9rem;">${trip.country} · ${trip.city || ''}</p>
                <p style="color:var(--text-muted); font-size:0.85rem; font-weight:400;">${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</p>
                <div class="trip-card-tags">${typeBadge}${tankBadge}</div>
            </div>
        </div>
    `;
    }).join('');
}

function updateStats(trips) {
    document.getElementById('stat-total').innerText = trips.length;
    document.getElementById('stat-planning').innerText = trips.filter(t => t.status === '規劃中').length;

    // === 年度支出 ===
    const byYear = {};
    trips.forEach(t => {
        const year = t.startDate ? t.startDate.substring(0, 4) : '未知';
        byYear[year] = (byYear[year] || 0) + (Number(t.totalExpense) || 0);
    });
    const years = Object.keys(byYear).sort((a, b) => b - a);
    const latestYear = years[0];
    const latestTotal = latestYear ? byYear[latestYear] : 0;
    document.getElementById('stat-expense').innerText = `$${latestTotal.toLocaleString()}`;
    const expLabel = document.querySelector('#stat-expense-card .stat-label');
    if (expLabel) expLabel.innerHTML = `${latestYear || ''} 支出 <span style="font-size:0.7em; opacity:0.6;">▼</span>`;
    const breakdown = document.getElementById('stat-expense-breakdown');
    if (breakdown) {
        breakdown.innerHTML = years.map(y => `
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px; color:var(--text-main);">
                <span style="font-weight:500;">${y} 年</span>
                <span style="font-weight:600;">$${byYear[y].toLocaleString()}</span>
            </div>
        `).join('') + `
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-top:6px; padding-top:6px; border-top:1px solid rgba(26,58,95,0.15); color:var(--primary);">
                <span style="font-weight:600;">全部合計</span>
                <span style="font-weight:700;">$${trips.reduce((s, t) => s + (Number(t.totalExpense)||0), 0).toLocaleString()}</span>
            </div>
        `;
    }

    // === 累計氣瓶數（依地點分類） ===
    const diveTrips = trips.filter(t => t.tripType === '潛旅');
    const totalTanks = diveTrips.reduce((s, t) => s + (Number(t.totalTanks) || 0), 0);
    document.getElementById('stat-tanks').innerText = `🤿 ${totalTanks}`;

    // 依地點（city）分組
    const tankByLocation = {};
    diveTrips.forEach(t => {
        const loc = t.city || t.country || '未知';
        tankByLocation[loc] = (tankByLocation[loc] || 0) + (Number(t.totalTanks) || 0);
    });
    const tankBreakdown = document.getElementById('stat-tank-breakdown');
    if (tankBreakdown) {
        const sorted = Object.entries(tankByLocation).sort((a, b) => b[1] - a[1]);
        tankBreakdown.innerHTML = sorted.map(([loc, cnt]) => `
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px; color:var(--text-main);">
                <span style="font-weight:500;">📍 ${loc}</span>
                <span style="font-weight:600;">🫧 ${cnt} 瓶</span>
            </div>
        `).join('') + (sorted.length > 0 ? `
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-top:6px; padding-top:6px; border-top:1px solid rgba(26,58,95,0.15); color:var(--primary);">
                <span style="font-weight:600;">累計總瓶數</span>
                <span style="font-weight:700;">🤿 ${totalTanks} 瓶</span>
            </div>
        ` : '<p style="font-size:0.82rem; color:var(--text-muted);">尚無潛旅紀錄</p>');
    }
}

window.toggleExpenseBreakdown = function() {
    const bd = document.getElementById('stat-expense-breakdown');
    if (!bd) return;
    bd.style.display = bd.style.display === 'none' ? 'block' : 'none';
}

window.toggleTankBreakdown = function() {
    const bd = document.getElementById('stat-tank-breakdown');
    if (!bd) return;
    bd.style.display = bd.style.display === 'none' ? 'block' : 'none';
}

function applyFilters() {
    const term = searchInput.value.toLowerCase().trim();
    let filtered = allTrips;
    if (activeTypeFilter !== 'all') {
        filtered = filtered.filter(t => t.tripType === activeTypeFilter);
    }
    if (term) {
        filtered = filtered.filter(t =>
            (t.title || '').toLowerCase().includes(term) ||
            (t.country || '').toLowerCase().includes(term) ||
            (t.city || '').toLowerCase().includes(term)
        );
    }
    renderTrips(filtered);
}

function setupEventListeners() {
    openAddModalBtn.onclick = () => addTripModal.style.display = 'block';
    closeAddModalBtn.onclick = () => addTripModal.style.display = 'none';
    window.onclick = (e) => { if (e.target == addTripModal) addTripModal.style.display = 'none'; };

    // 類型篩選 tabs
    document.getElementById('typeFilterTabs').addEventListener('click', (e) => {
        const tab = e.target.closest('[data-type]');
        if (!tab) return;
        document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTypeFilter = tab.dataset.type;
        applyFilters();
    });

    addTripForm.onsubmit = async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(addTripForm).entries());
        const key = generateShareKey();
        try {
            const docRef = await addDoc(collection(db, "trips"), {
                ...data, shareKey: key, totalExpense: 0, totalTanks: 0,
                createdByName: getUserNickname(), createdAt: serverTimestamp()
            });
            location.href = `trip.html?id=${docRef.id}&key=${key}`;
        } catch (err) {
            showToast("建立失敗，請稍後再試", "error");
        }
    };

    searchInput.oninput = applyFilters;
}
