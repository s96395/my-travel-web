import { db } from './firebase-db.js';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    generateShareKey, getCurrentUserProfile, getUserNickname, initAuthUI, showToast, showErrorToast, formatDate,
    normalizeFormData, validateFormData, TRIP_TYPE_OPTIONS, TRIP_STATUS_OPTIONS,
    escapeHtml, safeUrl
} from './utils.js';

const tripGrid = document.getElementById('tripGrid');
const addTripForm = document.getElementById('addTripForm');
const addTripModal = document.getElementById('addTripModal');
const openAddModalBtn = document.getElementById('openAddModal');
const closeAddModalBtn = document.getElementById('closeAddModal');
const searchInput = document.getElementById('searchInput');
const DEFAULT_COVER_IMAGE = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828';

let allTrips = [];
let activeTypeFilter = 'all';

init();

async function init() {
    initAuthUI();
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
        showErrorToast('loadTrips', err);
    }
}

const TYPE_ICON = { '自由行': '🎒', '跟團': '🚌', '潛旅': '🤿' };

// ===== 依年份分組渲染 =====
function renderTrips(trips) {
    if (trips.length === 0) {
        tripGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:100px; color:#aaa;">尚未有旅程檔案，點擊右上角新增吧。</div>`;
        return;
    }

    const byYear = {};
    trips.forEach(trip => {
        const year = trip.startDate ? trip.startDate.substring(0, 4) : '未知';
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(trip);
    });

    const years = Object.keys(byYear).sort((a, b) => b - a);

    tripGrid.innerHTML = years.map(year => {
        const yearTrips = byYear[year];
        const yearExpense = yearTrips.reduce((s, t) => s + (Number(t.totalExpense) || 0), 0);

        const cards = yearTrips.map(trip => {
            const typeIcon = TYPE_ICON[trip.tripType] || '';
            const typeClass = TRIP_TYPE_OPTIONS.includes(trip.tripType) ? trip.tripType : '';
            const typeBadge = trip.tripType
                ? `<span class="trip-card-tag trip-type-badge--${typeClass}">${typeIcon} ${escapeHtml(trip.tripType)}</span>`
                : '';
            const tankBadge = (trip.tripType === '潛旅' && trip.totalTanks)
                ? `<span class="trip-card-tag" style="background:rgba(0,150,199,0.12); color:#0096C7;">🫧 ${trip.totalTanks} 瓶</span>`
                : '';
            const tripUrl = `trip.html?id=${encodeURIComponent(trip.id)}&key=${encodeURIComponent(trip.shareKey || '')}`;
            const coverImageUrl = escapeHtml(safeUrl(trip.coverImageUrl, DEFAULT_COVER_IMAGE));
            return `
            <div class="trip-card" onclick="location.href='${tripUrl}'">
                <div class="trip-cover-wrap">
                    <img src="${coverImageUrl}" class="trip-cover" onerror="this.src='${DEFAULT_COVER_IMAGE}'">
                </div>
                <div class="status-badge">${escapeHtml(trip.status)}</div>
                <div class="trip-info">
                    <h3>${escapeHtml(trip.title)}</h3>
                    <p style="color:var(--accent); font-size:0.9rem;">${escapeHtml(trip.country)} · ${escapeHtml(trip.city || '')}</p>
                    <p style="color:var(--text-muted); font-size:0.85rem; font-weight:400;">${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</p>
                    <div class="trip-card-tags">${typeBadge}${tankBadge}</div>
                </div>
            </div>`;
        }).join('');

        return `
        <div class="year-group">
            <div class="year-group-header">
                <span class="year-group-title">${year}</span>
                <span class="year-group-count">${yearTrips.length} 趟</span>
                ${yearExpense > 0 ? `<span class="year-group-expense">$${yearExpense.toLocaleString()}</span>` : ''}
            </div>
            <div class="year-group-grid">${cards}</div>
        </div>`;
    }).join('');
}

// ===== 統計卡 =====
function updateStats(trips) {

    // === 🌍 去過的國家（只計已完成/已封存）===
    const donedTrips = trips.filter(t => t.status === '已完成' || t.status === '已封存');
    const countries = [...new Set(donedTrips.map(t => t.country).filter(Boolean))];
    document.getElementById('stat-countries').innerText = `🌍 ${countries.length}`;
    const countByCountry = {};
    donedTrips.forEach(t => {
        if (t.country) countByCountry[t.country] = (countByCountry[t.country] || 0) + 1;
    });
    const countryBreakdown = document.getElementById('stat-country-breakdown');
    if (countryBreakdown) {
        const sorted = Object.entries(countByCountry).sort((a, b) => b[1] - a[1]);
        countryBreakdown.innerHTML = sorted.map(([country, cnt]) => `
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px; color:var(--text-main);">
                <span style="font-weight:500;">🗺️ ${escapeHtml(country)}</span>
                <span style="font-weight:600;">${cnt} 趟</span>
            </div>
        `).join('') || '<p style="font-size:0.82rem; color:var(--text-muted);">尚無已完成的旅程</p>';
    }

    // === 💰 年度支出 ===
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
    if (expLabel) expLabel.innerHTML = `${escapeHtml(latestYear || '')} 支出 <span style="font-size:0.7em; opacity:0.6;">▼</span>`;
    const expBreakdown = document.getElementById('stat-expense-breakdown');
    if (expBreakdown) {
        const allTotal = trips.reduce((s, t) => s + (Number(t.totalExpense) || 0), 0);
        expBreakdown.innerHTML = years.map(y => `
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px; color:var(--text-main);">
                <span style="font-weight:500;">${escapeHtml(y)} 年</span>
                <span style="font-weight:600;">$${byYear[y].toLocaleString()}</span>
            </div>
        `).join('') + `
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-top:6px; padding-top:6px; border-top:1px solid rgba(26,58,95,0.15); color:var(--primary);">
                <span style="font-weight:600;">全部合計</span>
                <span style="font-weight:700;">$${allTotal.toLocaleString()}</span>
            </div>
        `;
    }

    // === 📊 旅遊類別支出 ===
    const typeExpense = { '自由行': 0, '跟團': 0, '潛旅': 0 };
    trips.forEach(t => {
        const type = t.tripType || '自由行';
        if (typeExpense[type] !== undefined) typeExpense[type] += (Number(t.totalExpense) || 0);
    });
    const typeTotal = Object.values(typeExpense).reduce((a, b) => a + b, 0);
    const topType = Object.entries(typeExpense).sort((a, b) => b[1] - a[1])[0];
    const topIcon = topType ? TYPE_ICON[topType[0]] : '📊';
    document.getElementById('stat-type-icon').innerText = topIcon || '📊';
    const typeBreakdown = document.getElementById('stat-type-breakdown');
    if (typeBreakdown) {
        const typeColors = { '自由行': 'var(--primary)', '跟團': '#E67E22', '潛旅': '#0096C7' };
        typeBreakdown.innerHTML = Object.entries(typeExpense)
            .sort((a, b) => b[1] - a[1])
            .map(([type, exp]) => {
                const pct = typeTotal > 0 ? Math.round(exp / typeTotal * 100) : 0;
                return `
                <div style="margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px;">
                        <span style="font-weight:600;">${TYPE_ICON[type]} ${type}</span>
                        <span style="font-weight:600; color:${typeColors[type]};">$${exp.toLocaleString()} <span style="font-weight:400; color:var(--text-muted); font-size:0.78rem;">${pct}%</span></span>
                    </div>
                    <div style="width:100%; height:6px; background:#f0f0f0; border-radius:99px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:${typeColors[type]}; border-radius:99px;"></div>
                    </div>
                </div>`;
            }).join('') + `
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-top:6px; padding-top:6px; border-top:1px solid rgba(26,58,95,0.15); color:var(--primary);">
                <span style="font-weight:600;">全部合計</span>
                <span style="font-weight:700;">$${typeTotal.toLocaleString()}</span>
            </div>`;
    }

    // === 🤿 累計氣瓶數（依地點分類） ===
    const diveTrips = trips.filter(t => t.tripType === '潛旅');
    const totalTanks = diveTrips.reduce((s, t) => s + (Number(t.totalTanks) || 0), 0);
    document.getElementById('stat-tanks').innerText = `🤿 ${totalTanks}`;
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
                <span style="font-weight:500;">📍 ${escapeHtml(loc)}</span>
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

window.toggleCountryBreakdown = () => toggle('stat-country-breakdown');
window.toggleExpenseBreakdown = () => toggle('stat-expense-breakdown');
window.toggleTypeBreakdown    = () => toggle('stat-type-breakdown');
window.toggleTankBreakdown    = () => toggle('stat-tank-breakdown');

function toggle(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
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
    window.addEventListener('click', (e) => {
        if (e.target === addTripModal) addTripModal.style.display = 'none';
    });

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
        if (!getCurrentUserProfile()) {
            showToast('請先使用 Google 登入後再建立旅程。', 'error');
            return;
        }

        const data = normalizeFormData(Object.fromEntries(new FormData(addTripForm).entries()));
        const validationError = validateFormData(data, {
            dateRange: true,
            enumFields: {
                tripType: TRIP_TYPE_OPTIONS,
                status: TRIP_STATUS_OPTIONS,
            },
            urlFields: ['coverImageUrl'],
        });
        if (validationError) {
            showToast(validationError, 'error');
            return;
        }

        const key = generateShareKey();
        try {
            const docRef = await addDoc(collection(db, "trips"), {
                ...data, shareKey: key, totalExpense: 0, totalTanks: 0,
                createdByName: getUserNickname(), createdAt: serverTimestamp()
            });
            location.href = `trip.html?id=${encodeURIComponent(docRef.id)}&key=${encodeURIComponent(key)}`;
        } catch (err) {
            showErrorToast('createTrip', err);
        }
    };

    searchInput.oninput = applyFilters;
}
