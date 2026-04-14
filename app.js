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
        const q = query(collection(db, "trips"), orderBy("startDate", "asc"));
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
    tripGrid.innerHTML = trips.map(trip => {
        const tags = Array.isArray(trip.tags) ? trip.tags
            : (trip.tags ? trip.tags.split(',').map(t => t.trim()).filter(Boolean) : []);
        const tagsHtml = tags.length > 0
            ? `<div class="trip-card-tags">${tags.map(t => `<span class="trip-card-tag">${t}</span>`).join('')}</div>`
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
                ${tagsHtml}
            </div>
        </div>
    `;
    }).join('');
}

function updateStats(trips) {
    document.getElementById('stat-total').innerText = trips.length;
    document.getElementById('stat-planning').innerText = trips.filter(t => t.status === '規劃中').length;
    document.getElementById('stat-completed').innerText = trips.filter(t => t.status === '已完成').length;

    // 按年度累計支出
    const byYear = {};
    trips.forEach(t => {
        const year = t.startDate ? t.startDate.substring(0, 4) : '未知';
        byYear[year] = (byYear[year] || 0) + (Number(t.totalExpense) || 0);
    });

    const years = Object.keys(byYear).sort((a, b) => b - a); // 新到舊
    const latestYear = years[0];
    const latestTotal = latestYear ? byYear[latestYear] : 0;

    document.getElementById('stat-expense').innerText = `$${latestTotal.toLocaleString()}`;

    // 更新小標顯示最新年度
    const label = document.querySelector('#stat-expense-card .stat-label');
    if (label) label.innerHTML = `${latestYear || ''} 支出 <span style="font-size:0.7em; opacity:0.6;">▼</span>`;

    // 年度明細
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
}

function toggleExpenseBreakdown() {
    const bd = document.getElementById('stat-expense-breakdown');
    if (!bd) return;
    bd.style.display = bd.style.display === 'none' ? 'block' : 'none';
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
