import { db } from './firebase-db.js';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    generateShareKey, getUserNickname, showToast, showErrorToast, formatDate,
    normalizeFormData, validateFormData, TRIP_TYPE_OPTIONS, TRIP_STATUS_OPTIONS,
    escapeHtml, safeUrl, requireLoginBeforeLoad
} from './utils.js';

const tripGrid = document.getElementById('tripGrid');
const addTripForm = document.getElementById('addTripForm');
const addTripModal = document.getElementById('addTripModal');
const openAddModalBtn = document.getElementById('openAddModal');
const closeAddModalBtn = document.getElementById('closeAddModal');
const searchInput = document.getElementById('searchInput');
const statsGrid = document.querySelector('.stats-grid');
const DEFAULT_COVER_IMAGE = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828';
const EMPTY_TRIPS_MESSAGE = '目前沒有共編旅程，請等待旅程建立者邀請。';

let allTrips = [];
let personalExpenseByTrip = new Map();
let activeTypeFilter = 'all';
let currentUser = null;
const yearExpansionState = new Map();

if (openAddModalBtn) openAddModalBtn.hidden = true;

init();

async function init() {
    currentUser = await requireLoginBeforeLoad();
    openAddModalBtn.hidden = false;
    await fetchTrips();
    setupEventListeners();
}

async function fetchTrips() {
    try {
        allTrips = await fetchAccessibleTrips();
        personalExpenseByTrip = await fetchPersonalExpenseSummaries(allTrips);
        const visibleTrips = getVisibleTrips();
        renderHeroCard(visibleTrips);
        renderTrips(visibleTrips);
        updateStats(allTrips);
    } catch (err) {
        showErrorToast('loadTrips', err);
        allTrips = [];
        renderHeroCard([]);
    }
}

function summarizePersonalExpenses(expenses, uid) {
    const summary = {
        personalExpenseTotal: 0,
        confirmedCount: 0,
        unconfirmedCount: 0,
        missingCurrentUserShareCount: 0,
        totalExpenseCount: expenses.length,
    };

    expenses.forEach(expense => {
        const hasPersonalShares = expense.personalShares
            && typeof expense.personalShares === 'object'
            && !Array.isArray(expense.personalShares);
        if (!hasPersonalShares) {
            summary.unconfirmedCount += 1;
        } else if (!Object.hasOwn(expense.personalShares, uid)) {
            summary.missingCurrentUserShareCount += 1;
        } else {
            summary.confirmedCount += 1;
            summary.personalExpenseTotal += Number(expense.personalShares[uid]) || 0;
        }
    });

    return summary;
}

async function fetchPersonalExpenseSummaries(trips) {
    const entries = await Promise.all(trips.map(async trip => {
        const snapshot = await getDocs(collection(db, `trips/${trip.id}/expenses`));
        return [trip.id, summarizePersonalExpenses(snapshot.docs.map(doc => doc.data()), currentUser.uid)];
    }));
    return new Map(entries);
}

async function fetchAccessibleTrips() {
    const tripsRef = collection(db, "trips");

    const uid = currentUser?.uid;
    if (!uid) return [];

    const [ownedSnap, memberSnap] = await Promise.all([
        getDocs(query(tripsRef, where("ownerId", "==", uid))),
        getDocs(query(tripsRef, where("memberIds", "array-contains", uid))),
    ]);

    const tripsById = new Map();
    [...ownedSnap.docs, ...memberSnap.docs].forEach(doc => {
        tripsById.set(doc.id, { id: doc.id, ...doc.data() });
    });

    return [...tripsById.values()].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
}

const TYPE_ICON = { '自由行': '🎒', '跟團': '🚌', '潛旅': '🤿' };

// ===== 首頁 Hero Card =====
function renderHeroCard(trips) {
    if (!statsGrid) return;

    let heroSection = document.getElementById('homeHeroCard');
    if (!heroSection) {
        statsGrid.insertAdjacentHTML('beforebegin', '<section class="home-hero-card" id="homeHeroCard"></section>');
        heroSection = document.getElementById('homeHeroCard');
    }

    const today = getTodayDateString();
    const activeTrip = trips
        .filter(t => t.startDate && t.endDate && t.startDate <= today && today <= t.endDate)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    const upcomingTrip = trips
        .filter(t => t.startDate && t.startDate >= today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    const heroTrip = activeTrip || upcomingTrip;

    if (!heroTrip) {
        heroSection.innerHTML = `
            <div class="home-hero-card__content">
                <span class="home-hero-card__eyebrow">下一趟旅行</span>
                <h2>開始規劃下一趟旅行吧！</h2>
            </div>
            <button type="button" class="btn btn-primary home-hero-card__button" id="heroAddTripBtn">新增旅程</button>
        `;
        document.getElementById('heroAddTripBtn').onclick = () => openAddModalBtn.click();
        return;
    }

    const tripUrl = `trip.html?id=${encodeURIComponent(heroTrip.id)}&key=${encodeURIComponent(heroTrip.shareKey || '')}`;
    const locationText = [heroTrip.country, heroTrip.city].filter(Boolean).join(' / ') || '尚未設定地點';

    heroSection.innerHTML = `
        <div class="home-hero-card__content">
            <span class="home-hero-card__eyebrow">下一趟旅行</span>
            <h2>${escapeHtml(heroTrip.title || '未命名旅程')}</h2>
            <p class="home-hero-card__location">${escapeHtml(locationText)}</p>
            <p class="home-hero-card__date">${formatDate(heroTrip.startDate)} - ${formatDate(heroTrip.endDate)}</p>
            <p class="home-hero-card__status">${escapeHtml(getHeroTripStatusText(heroTrip, today))}</p>
        </div>
        <a class="btn btn-primary home-hero-card__button" href="${tripUrl}">查看旅程</a>
    `;
}

function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDateDiffInDays(fromDate, toDate) {
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T00:00:00`);
    return Math.round((end - start) / 86400000);
}

function getHeroTripStatusText(trip, today) {
    if (trip.startDate <= today && today <= trip.endDate) {
        const currentDay = getDateDiffInDays(trip.startDate, today) + 1;
        const totalDays = getDateDiffInDays(trip.startDate, trip.endDate) + 1;
        return `旅行中 Day ${currentDay} / ${totalDays}`;
    }

    return `距離出發還有 ${getDateDiffInDays(today, trip.startDate)} 天`;
}

// ===== 依年份分組渲染 =====
function renderTrips(trips) {
    if (trips.length === 0) {
        tripGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:100px; color:#aaa;">${EMPTY_TRIPS_MESSAGE}</div>`;
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
        const isExpanded = yearExpansionState.has(year)
            ? yearExpansionState.get(year)
            : year === String(new Date().getFullYear());

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
        <div class="year-group${isExpanded ? ' is-expanded' : ''}" data-year="${escapeHtml(year)}">
            <button type="button" class="year-group-header" aria-expanded="${isExpanded}" aria-controls="year-content-${escapeHtml(year)}">
                <span class="year-group-arrow" aria-hidden="true"></span>
                <span class="year-group-title">${year}</span>
                <span class="year-group-count">${yearTrips.length} 趟</span>
                ${yearExpense > 0 ? `<span class="year-group-expense" aria-label="${escapeHtml(year)} 年度旅程總支出 $${yearExpense.toLocaleString()}">$${yearExpense.toLocaleString()}</span>` : ''}
            </button>
            <div class="year-group-content" id="year-content-${escapeHtml(year)}">
                <div class="year-group-grid">${cards}</div>
            </div>
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

    // === 💰 我的旅行支出（僅計入有目前使用者 uid key 的 personalShares）===
    const personalByYear = {};
    trips.forEach(trip => {
        const year = trip.startDate ? trip.startDate.substring(0, 4) : '未知';
        if (!personalByYear[year]) {
            personalByYear[year] = {
                personalExpenseTotal: 0,
                confirmedCount: 0,
                unconfirmedCount: 0,
                missingCurrentUserShareCount: 0,
                totalExpenseCount: 0,
            };
        }
        const tripSummary = personalExpenseByTrip.get(trip.id);
        if (!tripSummary) return;
        Object.keys(personalByYear[year]).forEach(key => {
            personalByYear[year][key] += tripSummary[key];
        });
    });
    const years = Object.keys(personalByYear).sort((a, b) => b - a);
    const currentYear = String(new Date().getFullYear());
    const currentPersonal = personalByYear[currentYear] || {
        personalExpenseTotal: 0,
        confirmedCount: 0,
        unconfirmedCount: 0,
        missingCurrentUserShareCount: 0,
        totalExpenseCount: 0,
    };
    const currentNeedsConfirmation = currentPersonal.unconfirmedCount + currentPersonal.missingCurrentUserShareCount;
    document.getElementById('stat-expense').innerText = currentPersonal.totalExpenseCount > 0 && currentPersonal.confirmedCount === 0
        ? '尚未有足夠的個人支出資料'
        : `NT$ ${currentPersonal.personalExpenseTotal.toLocaleString()}`;
    const expLabel = document.querySelector('#stat-expense-card .stat-label');
    if (expLabel) expLabel.innerHTML = `${escapeHtml(currentYear)} 我的旅行支出 <span style="font-size:0.7em; opacity:0.6;">▼</span>`;
    const expHint = document.getElementById('stat-expense-hint');
    expHint.innerText = currentNeedsConfirmation > 0
        ? `尚有 ${currentNeedsConfirmation} 筆費用未確認`
        : '';
    const expBreakdown = document.getElementById('stat-expense-breakdown');
    if (expBreakdown) {
        const allTotal = Object.values(personalByYear)
            .reduce((sum, summary) => sum + summary.personalExpenseTotal, 0);
        expBreakdown.innerHTML = years.map(y => {
            const summary = personalByYear[y];
            const needsConfirmation = summary.unconfirmedCount + summary.missingCurrentUserShareCount;
            const amount = summary.totalExpenseCount > 0 && summary.confirmedCount === 0
                ? '尚未有足夠的個人支出資料'
                : `NT$ ${summary.personalExpenseTotal.toLocaleString()}`;
            return `
            <div style="display:flex; justify-content:space-between; gap:8px; font-size:0.82rem; margin-bottom:4px; color:var(--text-main);">
                <span style="font-weight:500;">${escapeHtml(y)} 年</span>
                <span style="font-weight:600; text-align:right;">${amount}${needsConfirmation > 0 ? `<small style="display:block; color:var(--text-muted); font-weight:400;">尚有 ${needsConfirmation} 筆費用未確認</small>` : ''}</span>
            </div>
        `;
        }).join('') + `
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-top:6px; padding-top:6px; border-top:1px solid rgba(26,58,95,0.15); color:var(--primary);">
                <span style="font-weight:600;">全部合計</span>
                <span style="font-weight:700;">NT$ ${allTotal.toLocaleString()}</span>
            </div>
        `;
    }

    // === 📊 旅程總支出（依類型） ===
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

function hasTripPermissionFields(trip) {
    return Boolean(trip.ownerId) || (Array.isArray(trip.memberIds) && trip.memberIds.length > 0);
}

function canAccessTrip(trip) {
    const uid = currentUser?.uid;
    if (!uid) return false;

    return trip.ownerId === uid || (Array.isArray(trip.memberIds) && trip.memberIds.includes(uid));
}

function getVisibleTrips() {
    return allTrips.filter(canAccessTrip);
}

function applyFilters() {
    const term = searchInput.value.toLowerCase().trim();
    let filtered = getVisibleTrips();
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
    renderHeroCard(filtered);
    renderTrips(filtered);
    updateStats(allTrips);
}

function setupEventListeners() {
    tripGrid.addEventListener('click', (e) => {
        const header = e.target.closest('.year-group-header');
        if (!header) return;

        const group = header.closest('.year-group');
        const isExpanded = group.classList.toggle('is-expanded');
        header.setAttribute('aria-expanded', String(isExpanded));
        yearExpansionState.set(group.dataset.year, isExpanded);
    });

    openAddModalBtn.onclick = () => {
        addTripModal.style.display = 'block';
    };
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
                ownerId: currentUser.uid, ownerName: getUserNickname(), memberIds: [currentUser.uid],
                createdByName: getUserNickname(), createdAt: serverTimestamp()
            });
            location.href = `trip.html?id=${encodeURIComponent(docRef.id)}&key=${encodeURIComponent(key)}`;
        } catch (err) {
            showErrorToast('createTrip', err);
        }
    };

    searchInput.oninput = applyFilters;
}
