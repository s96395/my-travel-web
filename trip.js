import { db } from './firebase-db.js';
import { 
    doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, 
    serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getUserNickname, showToast, showErrorToast, getErrorMessage, formatDate, copyToClipboard,
    normalizeFormData, validateFormData, TRIP_TYPE_OPTIONS, TRIP_STATUS_OPTIONS,
    escapeHtml, safeUrl, safeCssUrl, requireLoginBeforeLoad
} from './utils.js';

const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
const shareKey = urlParams.get('key');

// 待辦範本依旅程類型不同
const TODO_TEMPLATES = {
    '自由行': ['訂機票', '訂住宿', '辦簽證', '換匯', '買 eSIM', '保旅平險', '收行李', '確認護照效期', '列印訂位確認'],
    '跟團':   ['確認行程單', '繳清團費', '辦簽證', '換匯', '買 eSIM', '保旅平險', '收行李', '確認護照效期', '備好現金小費'],
    '潛旅':   ['訂機票', '訂住宿', '確認潛水執照', '準備潛水裝備', '買 eSIM', '保旅平險+潛水險', '收行李', '確認護照效期', '準備防曬'],
};

let currentTripData = null;
let currentUser = null;
const DEFAULT_COVER_IMAGE = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828';
const SYSTEM_OWNER_EMAIL = 's96395@gmail.com';
const ITINERARY_TYPE_OPTIONS = ['attraction', 'restaurant', 'cafe', 'shopping', 'transport', 'other'];
const ITINERARY_PRIORITY_OPTIONS = ['must', 'want', 'optional'];
const ITINERARY_TYPE_LABELS = { attraction: '景點', restaurant: '餐廳', cafe: '咖啡', shopping: '購物', transport: '交通', other: '其他' };
const ITINERARY_TYPE_ICONS = { attraction: '📍', restaurant: '🍽️', cafe: '☕', shopping: '🛍️', transport: '🚆', other: '•' };
const ITINERARY_PRIORITY_LABELS = { must: '必去', want: '想去', optional: '有空再去' };

function getTripDayCount(trip = currentTripData) {
    const savedDays = Number(trip?.days);
    if (Number.isInteger(savedDays) && savedDays > 0) return savedDays;
    if (!trip?.startDate || !trip?.endDate) return 1;

    const start = new Date(`${trip.startDate}T00:00:00`);
    const end = new Date(`${trip.endDate}T00:00:00`);
    const dayCount = Math.round((end - start) / 86400000) + 1;
    return Number.isInteger(dayCount) && dayCount > 0 ? dayCount : 1;
}

function getItineraryDayOptions(selectedDay = 1) {
    const selected = Number(selectedDay) || 1;
    const dayCount = Math.max(getTripDayCount(), selected);
    const start = currentTripData?.startDate ? new Date(`${currentTripData.startDate}T00:00:00`) : null;
    const hasValidStart = start && !Number.isNaN(start.getTime());

    return Array.from({ length: dayCount }, (_, index) => {
        const day = index + 1;
        let label = `Day ${day}`;
        if (hasValidStart) {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            const weekday = date.toLocaleDateString('zh-TW', { weekday: 'short' }).replace('週', '');
            label += `｜${date.getMonth() + 1}/${date.getDate()}（${weekday}）`;
        }
        return `<option value="${day}" ${day === selected ? 'selected' : ''}>${label}</option>`;
    }).join('');
}

function getItineraryMoreFields(values = {}) {
    const isOpen = Boolean(values.type || values.reservationTime || values.note);
    return `
        <details class="itinerary-more" ${isOpen ? 'open' : ''}>
            <summary>＋ 更多資訊</summary>
            <div class="itinerary-more-fields">
                <div class="form-group"><label>類型</label><select name="type"><option value="">未設定</option>${ITINERARY_TYPE_OPTIONS.map(value => `<option value="${value}" ${value === values.type ? 'selected' : ''}>${ITINERARY_TYPE_LABELS[value]}</option>`).join('')}</select></div>
                <div class="form-group"><label>預約／固定時間</label><input type="time" name="reservationTime" value="${escapeHtml(values.reservationTime || '')}"></div>
                <div class="form-group"><label>備註</label><textarea name="note" rows="3">${escapeHtml(values.note || '')}</textarea></div>
            </div>
        </details>`;
}

function compareOptionalValues(a, b) {
    const aEmpty = a === undefined || a === null || a === '';
    const bEmpty = b === undefined || b === null || b === '';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;

    const aNum = Number(a);
    const bNum = Number(b);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;

    return String(a).localeCompare(String(b), 'zh-Hant', { numeric: true, sensitivity: 'base' });
}

function compareByFields(fields) {
    return (a, b) => {
        for (const field of fields) {
            const result = compareOptionalValues(a[field], b[field]);
            if (result !== 0) return result;
        }
        return String(a.id || '').localeCompare(String(b.id || ''));
    };
}

if (tripId && shareKey) {
    init();
} else {
    renderAccessError('缺少旅程連結資訊，請從首頁或有效的共編連結進入。');
}

async function init() {
    currentUser = await requireLoginBeforeLoad();

    try {
        const tripSnap = await getDoc(doc(db, "trips", tripId));
        if (tripSnap.exists() && tripSnap.data().shareKey === shareKey) {
            currentTripData = tripSnap.data();
            if (!canAccessTrip(currentTripData)) {
                renderAccessError('你沒有此旅程的存取權限。');
                return;
            }
            renderHeader(currentTripData);
            applyTripTypeUI(currentTripData.tripType);
            setupCopyLinkButton();
            renderCompanionSection(currentTripData);
            applyRoleUI();
            try {
                setupEvents(currentTripData);
            } catch (err) {
                console.error('[setupTripEvents]', err);
                showErrorToast('loadTrip', err);
            }
            setupTodos(currentTripData.tripType);
            setupDeleteDelegation();
            setupFlightHotel(currentTripData);
            loadAllData().catch(err => showErrorToast('loadTrip', err));
            loadTodos().catch(err => showErrorToast('loadTrip', err));
            if (currentTripData.tripType === '潛旅') loadDiveLogs().catch(err => showErrorToast('loadTrip', err));
            if (currentTripData.tripType === '跟團') setupTourSection(currentTripData);
            document.getElementById('trip-details').style.display = 'block';
            applyRoleUI();
        } else {
            renderAccessError('權限錯誤或旅程不存在，請確認共編連結是否正確。');
        }
    } catch (err) {
        console.error('[loadTrip]', err);
        renderAccessError(getErrorMessage('loadTrip', err));
    }
}

function isSystemOwner(user = currentUser) {
    return (user?.email || '').trim().toLowerCase() === SYSTEM_OWNER_EMAIL;
}

function canAccessTrip(trip) {
    const uid = currentUser?.uid;
    if (!uid) return false;

    if (isSystemOwner()) return true;

    return trip.ownerId === uid || (Array.isArray(trip.memberIds) && trip.memberIds.includes(uid));
}

function isTripOwner(trip = currentTripData) {
    return Boolean(currentUser?.uid && (isSystemOwner() || trip?.ownerId === currentUser.uid));
}

function isOwnRecord(record) {
    if (isTripOwner()) return true;
    if (record?.createdByUid) return record.createdByUid === currentUser?.uid;
    return Boolean(record?.createdByName && record.createdByName === getUserNickname());
}

function isOwnRecordDataset(dataset) {
    if (isTripOwner()) return true;
    if (dataset.createdByUid) return dataset.createdByUid === currentUser?.uid;
    return Boolean(dataset.createdByName && dataset.createdByName === getUserNickname());
}

function getAuditUserFields(action) {
    return {
        [`${action}ByName`]: getUserNickname(),
        [`${action}ByUid`]: currentUser?.uid || ''
    };
}

function applyRoleUI() {
    const ownerOnlyIds = ['editTripInfoBtn', 'editFlightBtn', 'editHotelBtn', 'editTourBtn', 'copyLinkBtn', 'deleteTripBtn'];
    ownerOnlyIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isTripOwner() ? '' : 'none';
    });

    ['deleteTripBtn'].forEach(id => {
        const card = document.getElementById(id)?.closest('.card');
        if (card) card.style.display = isTripOwner() ? '' : 'none';
    });

    document.querySelectorAll('[data-owner-only]').forEach(el => {
        el.style.display = isTripOwner() ? '' : 'none';
    });
}


function getTripUserIds(data) {
    const ownerId = data?.ownerId || '';
    const memberIds = Array.isArray(data?.memberIds) ? data.memberIds : [];
    return [ownerId, ...memberIds].filter((uid, index, ids) => uid && ids.indexOf(uid) === index);
}

async function getExpenseShareMembers(personalShares = {}) {
    const currentIds = getTripUserIds(currentTripData);
    const departedIds = Object.keys(personalShares).filter(uid => !currentIds.includes(uid));
    const profiles = await Promise.all([...currentIds, ...departedIds].map(uid => getTripUserProfile(uid)));
    return profiles.map(profile => ({ ...profile, departed: departedIds.includes(profile.uid) }));
}

function getExpenseSplitFields(members, personalShares) {
    const hasShares = personalShares && typeof personalShares === 'object' && !Array.isArray(personalShares);
    const mode = hasShares ? 'custom' : 'unallocated';
    const departedCount = members.filter(member => member.departed).length;
    return `
        <fieldset class="expense-split" data-split-root>
            <legend>費用分攤</legend>
            <div class="expense-split-options">
                <label><input type="radio" name="splitMode" value="unallocated" ${mode === 'unallocated' ? 'checked' : ''}> 尚未分攤</label>
                <label><input type="radio" name="splitMode" value="equal"> 平均分攤</label>
                <label><input type="radio" name="splitMode" value="custom" ${mode === 'custom' ? 'checked' : ''}> 自訂分攤</label>
            </div>
            ${departedCount ? `<p class="expense-split-warning">這筆資料包含 ${departedCount} 位已離開旅程成員。其原有分攤會保留；若改選平均分攤，將只以目前成員重新計算。</p>` : ''}
            <p class="expense-split-hint" data-split-hint></p>
            <div class="expense-share-list">
                ${members.map(member => `
                    <label class="expense-share-row" data-share-row data-departed="${member.departed}">
                        <span>${escapeHtml(member.displayName)}${member.departed ? '（已離開旅程）' : ''}</span>
                        <span>NT$ <input type="number" step="1" min="0" name="share_${escapeHtml(member.uid)}" data-share-uid="${escapeHtml(member.uid)}" value="${hasShares && Object.hasOwn(personalShares, member.uid) ? escapeHtml(personalShares[member.uid]) : ''}"></span>
                    </label>`).join('')}
            </div>
        </fieldset>`;
}

function distributeExpenseEqually(amount, memberCount) {
    if (!Number.isFinite(amount) || memberCount < 1) return [];
    const precision = (String(amount).split('.')[1] || '').length;
    const factor = 10 ** precision;
    const totalUnits = Math.round(amount * factor);
    const baseUnits = Math.floor(totalUnits / memberCount);
    const remainder = totalUnits - baseUnits * memberCount;
    return Array.from({ length: memberCount }, (_, index) => (baseUnits + (index < remainder ? 1 : 0)) / factor);
}

function setupExpenseSplitForm() {
    const form = document.getElementById('modalForm');
    const root = form.querySelector('[data-split-root]');
    if (!root) return;
    const amountInput = form.elements.amount;
    const modeInputs = [...form.querySelectorAll('[name="splitMode"]')];
    const shareRows = [...root.querySelectorAll('[data-share-row]')];
    const hint = root.querySelector('[data-split-hint]');

    const refresh = () => {
        const mode = modeInputs.find(input => input.checked)?.value || 'unallocated';
        const activeRows = shareRows.filter(row => mode === 'custom' || row.dataset.departed !== 'true');
        shareRows.forEach(row => {
            row.hidden = mode === 'unallocated' || !activeRows.includes(row);
            row.querySelector('input').disabled = mode === 'unallocated' || !activeRows.includes(row);
            row.querySelector('input').readOnly = mode === 'equal';
        });
        if (mode === 'equal') {
            const shares = distributeExpenseEqually(Number(amountInput.value), activeRows.length);
            activeRows.forEach((row, index) => { row.querySelector('input').value = Number.isFinite(shares[index]) ? shares[index] : ''; });
            hint.textContent = '尾差依旅程成員順序，從第一位起每人加上最小金額單位，直到總和等於總金額。';
        } else {
            hint.textContent = mode === 'unallocated' ? '不會建立 personalShares；編輯儲存時會移除原有分攤。' : '各成員金額加總必須等於總金額。';
        }
    };
    modeInputs.forEach(input => input.addEventListener('change', refresh));
    amountInput.addEventListener('input', () => {
        if (modeInputs.find(input => input.checked)?.value === 'equal') refresh();
    });
    refresh();
}

function collectExpensePersonalShares(form, amount) {
    const mode = form.elements.splitMode?.value || 'unallocated';
    if (mode === 'unallocated') return { mode, personalShares: undefined };
    const personalShares = {};
    for (const input of form.querySelectorAll('[data-share-uid]:not(:disabled)')) {
        const value = Number(input.value);
        if (input.value === '' || !Number.isFinite(value) || value < 0) {
            return { error: '每位旅程成員的負擔金額都必須是有效且不小於 0 的數字。' };
        }
        personalShares[input.dataset.shareUid] = value;
    }
    const sum = Object.values(personalShares).reduce((total, value) => total + value, 0);
    if (Math.abs(sum - amount) > Number.EPSILON * Math.max(1, Math.abs(sum), Math.abs(amount))) {
        return { error: `分攤金額加總 NT$${sum.toLocaleString()}，必須等於總金額 NT$${amount.toLocaleString()}。` };
    }
    return { mode, personalShares };
}


async function getTripUserProfile(uid) {
    try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (!userSnap.exists()) return { uid, displayName: '未知旅伴', photoURL: '' };
        const user = userSnap.data();
        return {
            uid,
            displayName: user.nickname || user.displayName || '未知旅伴',
            photoURL: user.photoURL || ''
        };
    } catch (err) {
        console.warn('[loadTripUser]', uid, err);
        return { uid, displayName: '未知旅伴', photoURL: '' };
    }
}

function setupCopyLinkButton() {
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    if (!copyLinkBtn) return;
    copyLinkBtn.onclick = () => {
        if (!isTripOwner()) return;
        const joinUrl = new URL('join.html', window.location.href);
        joinUrl.searchParams.set('id', tripId);
        joinUrl.searchParams.set('key', shareKey);
        copyToClipboard(joinUrl.href);
    };
}

function getParticipants(data = currentTripData) {
    const participants = data?.participants;
    if (!participants || typeof participants !== 'object' || Array.isArray(participants)) return [];
    return Object.entries(participants).map(([id, participant]) => ({
        id,
        ...(participant && typeof participant === 'object' && !Array.isArray(participant) ? participant : {})
    }))
        .sort(compareByFields(['order']));
}

function getParticipantUidConflicts(participants) {
    const activeUids = new Map();
    const conflicts = new Set();
    participants.filter(participant => participant.status !== 'inactive' && participant.uid).forEach(participant => {
        if (activeUids.has(participant.uid)) conflicts.add(participant.uid);
        activeUids.set(participant.uid, participant.id);
    });
    return conflicts;
}

function getNextParticipantOrder(participants = getParticipants()) {
    const orders = participants.map(participant => Number(participant.order)).filter(Number.isFinite);
    return orders.length ? Math.max(...orders) + 1 : 1;
}

async function updateParticipant(participantId, participant) {
    await updateDoc(doc(db, 'trips', tripId), {
        [`participants.${participantId}`]: participant,
        updatedAt: serverTimestamp()
    });
    currentTripData.participants = { ...(currentTripData.participants || {}), [participantId]: participant };
    renderSummaryCard(currentTripData);
    renderCompanionSection(currentTripData);
    applyRoleUI();
}

function openParticipantNameModal(participant = null) {
    if (!isTripOwner()) return;
    openModal(participant ? '修改同行者姓名' : '新增同行者', `
        ${participant ? `<input type="hidden" name="_participantId" value="${escapeHtml(participant.id)}">` : ''}
        <div class="form-group"><label>姓名</label><input type="text" name="name" maxlength="100" value="${escapeHtml(participant?.name || '')}" required placeholder="例如：媽媽"></div>
    `, participant ? 'edit-participant' : 'participant');
}

function setupParticipantActions() {
    const listEl = document.getElementById('companion-list');
    if (!listEl) return;
    listEl.onclick = async (event) => {
        if (!isTripOwner()) return;
        const button = event.target instanceof Element
            ? event.target.closest('[data-participant-action]')
            : null;
        if (!button) return;
        const participants = getParticipants();
        const participant = participants.find(item => item.id === button.dataset.participantId);
        const action = button.dataset.participantAction;

        if (action === 'add') return openParticipantNameModal();
        if (action === 'create-owner') {
            if (participants.some(item => item.uid === currentTripData.ownerId && item.status !== 'inactive')) {
                showToast('Owner 同行者已存在。', 'error');
                return;
            }
            const participantId = doc(collection(db, 'trips')).id;
            await updateParticipant(participantId, {
                name: currentTripData.ownerName || getUserNickname(), uid: currentTripData.ownerId,
                order: getNextParticipantOrder(participants), status: 'active'
            }).then(() => showToast('已建立 Owner 同行者 ✓')).catch(err => showErrorToast('saveRecord', err));
            return;
        }
        if (!participant) return;
        if (action === 'edit') return openParticipantNameModal(participant);
        if (action === 'deactivate') {
            if (participant.uid === currentTripData.ownerId) {
                showToast('Owner 同行者不可停用。', 'error');
                return;
            }
            if (!confirm(`確定要停用「${participant.name}」嗎？歷史資料仍會保留。`)) return;
            await updateParticipant(participant.id, { ...currentTripData.participants[participant.id], status: 'inactive' })
                .then(() => showToast('同行者已停用 ✓')).catch(err => showErrorToast('saveRecord', err));
        }
    };
}

function renderCompanionSection(data) {
    const listEl = document.getElementById('companion-list');
    if (!listEl) return;

    try {
        const participants = getParticipants(data);
        const conflicts = getParticipantUidConflicts(participants);
        const hasOwnerParticipant = participants.some(participant => participant.uid === data?.ownerId && participant.status !== 'inactive');
        listEl.innerHTML = participants.map(participant => {
            const isOwnerParticipant = participant.uid === data?.ownerId;
            const inactive = participant.status === 'inactive';
            return `<div class="companion-item ${inactive ? 'is-inactive' : ''}">
                <span class="companion-avatar">${escapeHtml(String(participant.name || '?').charAt(0).toUpperCase())}</span>
                <span class="companion-identity"><span class="companion-name">${escapeHtml(participant.name || '未命名')}</span>
                    <span class="companion-binding">${participant.uid ? '已綁定帳號' : '未綁定帳號'}${conflicts.has(participant.uid) ? ' · 帳號綁定異常' : ''}</span></span>
                <span class="companion-badges">${isOwnerParticipant ? '<span class="companion-role">Owner</span>' : ''}${inactive ? '<span class="companion-status">已停用</span>' : ''}</span>
                ${isTripOwner(data) ? `<span class="companion-actions"><button type="button" data-participant-action="edit" data-participant-id="${escapeHtml(participant.id)}">改名</button>${!isOwnerParticipant && !inactive ? `<button type="button" data-participant-action="deactivate" data-participant-id="${escapeHtml(participant.id)}">停用</button>` : ''}</span>` : ''}
            </div>`;
        }).join('') || '<p class="info-empty">尚未建立同行者</p>';
        if (isTripOwner(data)) listEl.insertAdjacentHTML('beforeend', `
            <div class="companion-manage-actions">
                ${!hasOwnerParticipant ? '<button class="btn btn-primary" type="button" data-participant-action="create-owner">建立我的同行者</button>' : '<button class="btn btn-primary" type="button" data-participant-action="add">＋ 新增同行者</button>'}
            </div>`);
        setupParticipantActions();
    } catch (err) {
        console.error('[renderCompanionSection]', err);
        listEl.innerHTML = '<p class="info-empty">同行者資料暫時無法載入，請稍後再試。</p>';
    }
}

function renderAccessError(message) {
    document.body.innerHTML = `
        <div style="text-align:center;padding:100px 24px;color:#1A3A5F;">
            <h1 style="margin-bottom:12px;">無法開啟旅程</h1>
            <p style="margin-bottom:24px;color:#6B7280;">${escapeHtml(message)}</p>
            <a href="index.html" style="color:#FF7A59;font-weight:700;text-decoration:none;">返回首頁</a>
        </div>
    `;
}

// ===== 依類型顯示/隱藏區塊 =====
function applyTripTypeUI(tripType) {
    const sectionTour = document.getElementById('section-tour');
    const sectionDive = document.getElementById('section-dive');
    const sectionHotel = document.getElementById('section-hotel');

    if (tripType === '跟團') {
        sectionTour.style.display = 'block';
        sectionHotel.style.display = 'none'; // 跟團通常住宿在行程內
    } else if (tripType === '潛旅') {
        sectionDive.style.display = 'block';
    }
}

function renderHeader(data) {
    document.getElementById('trip-title').innerText = data.title;
    document.getElementById('trip-subtitle').innerText = `${data.country} · ${formatDate(data.startDate)} — ${formatDate(data.endDate)}`;
    document.getElementById('inner-hero').style.backgroundImage = `linear-gradient(rgba(26,58,95,0.7), rgba(26,58,95,0.7)), ${safeCssUrl(data.coverImageUrl, DEFAULT_COVER_IMAGE)}`;
    renderSummaryCard(data);
}

function renderSummaryCard(data) {
    const statusMap = { '規劃中': 'planning', '即將出發': 'upcoming', '已完成': 'completed', '已封存': 'archived' };
    const days = data.days || (data.startDate && data.endDate
        ? Math.ceil((new Date(data.endDate) - new Date(data.startDate)) / 86400000) + 1 : '—');
    const TYPE_ICON = { '自由行': '🎒', '跟團': '🚌', '潛旅': '🤿' };
    const typeIcon = data.tripType ? `${TYPE_ICON[data.tripType] || ''} ${escapeHtml(data.tripType)}` : '—';

    document.getElementById('trip-summary-display').innerHTML = `
        <div class="summary-item">
            <span class="summary-label">旅程類型</span>
            <span class="summary-value"><span class="status-pill planning">${typeIcon}</span></span>
        </div>
        <div class="summary-item">
            <span class="summary-label">國家 / 城市</span>
            <span class="summary-value">${escapeHtml(data.country || '—')}${data.city ? ' · ' + escapeHtml(data.city) : ''}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">出發日期</span>
            <span class="summary-value">${formatDate(data.startDate) || '—'}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">回程日期</span>
            <span class="summary-value">${formatDate(data.endDate) || '—'}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">天數</span>
            <span class="summary-value">${days} 天</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">狀態</span>
            <span class="summary-value">
                <span class="status-pill ${statusMap[data.status] || 'planning'}">${escapeHtml(data.status || '規劃中')}</span>
            </span>
        </div>
        <div class="summary-item companion-summary-item">
            <span class="summary-label">同行者（${getParticipants(data).length}）</span>
            <div id="companion-list" class="summary-value companion-list">
                <p class="info-empty" style="padding:0; text-align:left;">載入旅伴中...</p>
            </div>
            ${isTripOwner(data) ? `
            <button class="btn companion-invite-btn" id="copyLinkBtn" type="button">邀請共編 Member</button>` : ''}
        </div>
    `;
}

// ===== 潛水日誌 =====
async function loadDiveLogs() {
    const snap = await getDocs(collection(db, `trips/${tripId}/diveLogs`));
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort(compareByFields(['diveDate', 'createdAt']));
    const totalTanks = logs.reduce((s, l) => s + (Number(l.tanks) || 1), 0);

    document.getElementById('dive-tank-summary').innerText = `本趟累計：${totalTanks} 瓶`;

    const listEl = document.getElementById('dive-log-list');
    if (logs.length === 0) {
        listEl.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:30px 0; font-weight:400;">尚無潛水記錄，點擊「＋ 新增潛水」開始記錄吧！</p>`;
        try {
            await updateDoc(doc(db, "trips", tripId), { totalTanks: 0 });
        } catch (err) {
            console.warn('[syncTotalTanks]', err);
        }
        return;
    }

    // 依日期分組，自動給流水序號
    const byDate = {};
    logs.forEach(l => {
        const d = l.diveDate || '未知日期';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(l);
    });

    let globalSeq = 1; // 跨天累計序號
    listEl.innerHTML = Object.entries(byDate).map(([date, dives]) => {
        const dayTanks = dives.reduce((s, l) => s + (Number(l.tanks) || 1), 0);
        const divesHtml = dives.map(l => {
            const seq = globalSeq++;
            return `
            <div class="dive-log-item">
                <div class="dive-log-num">Dive #${seq}</div>
                <div class="dive-log-info">
                    <div class="dive-log-site">${escapeHtml(l.diveSite || '未知潛點')}</div>
                    <div class="dive-log-meta">
                        ${l.maxDepth ? `⬇️ ${escapeHtml(l.maxDepth)}m` : ''}
                        ${l.duration ? `⏱ ${escapeHtml(l.duration)} 分` : ''}
                        ${l.visibility ? `👁 能見 ${escapeHtml(l.visibility)}m` : ''}
                        🫧 ${escapeHtml(l.tanks || 1)} 瓶
                    </div>
                    ${l.note ? `<div class="dive-log-note">📝 ${escapeHtml(l.note)}</div>` : ''}
                </div>
                ${isOwnRecord(l) ? `<div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
                    <button class="edit-btn-sub" data-edit-type="diveLogs" data-edit-id="${escapeHtml(l.id)}" data-own-only="true" data-created-by-name="${escapeHtml(l.createdByName || '')}" data-created-by-uid="${escapeHtml(l.createdByUid || '')}"
                        data-edit-divedate="${escapeHtml(l.diveDate||'')}"
                        data-edit-divesite="${escapeHtml(l.diveSite||'')}" data-edit-maxdepth="${escapeHtml(l.maxDepth||'')}"
                        data-edit-duration="${escapeHtml(l.duration||'')}" data-edit-visibility="${escapeHtml(l.visibility||'')}"
                        data-edit-tanks="${escapeHtml(l.tanks||1)}" data-edit-note="${escapeHtml(l.note||'')}" title="編輯">✎</button>
                    ${isTripOwner() ? `<button class="delete-btn-sub" data-delete-type="diveLogs" data-delete-id="${escapeHtml(l.id)}" data-owner-only="true" title="刪除">×</button>` : ''}
                </div>` : ''}
            </div>`;
        }).join('');

        return `
        <div class="dive-day-group">
            <div class="dive-day-header">
                <span>${escapeHtml(date)}</span>
                <span class="dive-day-tanks">🫧 ${dayTanks} 瓶</span>
            </div>
            ${divesHtml}
        </div>`;
    }).join('');

    // 同步總瓶數回主文件，並即時更新摘要卡
    try {
        await updateDoc(doc(db, "trips", tripId), { totalTanks });
    } catch (err) {
        console.warn('[syncTotalTanks]', err);
    }
    if (currentTripData) {
        currentTripData.totalTanks = totalTanks;
        renderSummaryCard(currentTripData);
    }
}

// ===== 跟團資訊 =====
function setupTourSection(data) {
    renderTourDisplay(data.tour || {});
    document.getElementById('editTourBtn').onclick = () => {
        if (!isTripOwner()) return;
        const t = data.tour || {};
        openModal('跟團資訊', `
            <div class="form-group"><label>旅行社 / 團名</label><input type="text" name="tourCompany" value="${escapeHtml(t.tourCompany||'')}" placeholder="例如：雄獅旅遊 東京賞楓5日團"></div>
            <div style="display:flex;gap:12px;">
                <div class="form-group" style="flex:1"><label>導遊姓名</label><input type="text" name="guideId" value="${escapeHtml(t.guideId||'')}" placeholder="例如：陳大明"></div>
                <div class="form-group" style="flex:1"><label>導遊電話</label><input type="text" name="guidePhone" value="${escapeHtml(t.guidePhone||'')}" placeholder="0912-345-678"></div>
            </div>
            <div style="display:flex;gap:12px;">
                <div class="form-group" style="flex:1"><label>團費 (TWD)</label><input type="number" name="tourFee" value="${escapeHtml(t.tourFee||'')}" placeholder="0" min="0"></div>
                <div class="form-group" style="flex:1"><label>已繳金額</label><input type="number" name="paidFee" value="${escapeHtml(t.paidFee||'')}" placeholder="0" min="0"></div>
            </div>
            <div class="form-group"><label>集合資訊</label><input type="text" name="meetingPoint" value="${escapeHtml(t.meetingPoint||'')}" placeholder="例如：桃園機場第二航廈 中華航空櫃台前"></div>
            <div class="form-group"><label>行程說明 / 注意事項</label><textarea name="tourNote" rows="3" style="width:100%;padding:10px;border:1px solid var(--border-color);border-radius:10px;font-size:0.95rem;resize:vertical;">${escapeHtml(t.tourNote||'')}</textarea></div>
        `, 'tour');
    };
}

function renderTourDisplay(t) {
    const el = document.getElementById('tour-display');
    if (!el) return;
    const isEmpty = !t.tourCompany && !t.guideId;
    if (isEmpty) { el.innerHTML = '<p class="info-empty">尚未填寫跟團資訊</p>'; return; }
    const paid = Number(t.paidFee) || 0;
    const fee = Number(t.tourFee) || 0;
    const remaining = fee - paid;
    el.innerHTML = `
        <div class="info-grid">
            ${t.tourCompany ? `<div class="info-item"><span class="info-label">旅行社 / 團名</span><span class="info-value"><strong>${escapeHtml(t.tourCompany)}</strong></span></div>` : ''}
            ${t.guideId ? `<div class="info-item"><span class="info-label">導遊</span><span class="info-value">${escapeHtml(t.guideId)}${t.guidePhone ? ' · ' + escapeHtml(t.guidePhone) : ''}</span></div>` : ''}
            ${fee ? `<div class="info-item"><span class="info-label">團費</span><span class="info-value">$${fee.toLocaleString()}${remaining > 0 ? ` <span style="color:#e74c3c; font-size:0.85em;">（尚欠 $${remaining.toLocaleString()}）</span>` : ' <span style="color:#27ae60; font-size:0.85em;">✓ 已付清</span>'}</span></div>` : ''}
            ${t.meetingPoint ? `<div class="info-item" style="flex-basis:100%"><span class="info-label">集合地點</span><span class="info-value">${escapeHtml(t.meetingPoint)}</span></div>` : ''}
            ${t.tourNote ? `<div class="info-item" style="flex-basis:100%"><span class="info-label">備註</span><span class="info-value" style="font-weight:400; color:var(--text-muted); white-space:pre-line;">${escapeHtml(t.tourNote)}</span></div>` : ''}
        </div>
    `;
}

function setupDeleteDelegation() {
    document.getElementById('trip-details').addEventListener('click', async (e) => {
        // 編輯
        const editBtn = e.target.closest('[data-edit-type]');
        if (editBtn) {
            const type = editBtn.dataset.editType;
            const id = editBtn.dataset.editId;
            if (editBtn.dataset.ownerOnly === 'true' && !isTripOwner()) return;
            if (editBtn.dataset.ownOnly === 'true' && !isOwnRecordDataset(editBtn.dataset)) return;
            const modal = document.getElementById('universalModal');
            const modalForm = document.getElementById('modalForm');

            if (type === 'itinerary') {
                const itineraryValues = {
                    type: editBtn.dataset.editItemType,
                    reservationTime: editBtn.dataset.editReservationTime,
                    note: editBtn.dataset.editNote,
                };
                openModal('編輯行程', `
                    <input type="hidden" name="_editId" value="${escapeHtml(id)}">
                    <div class="form-group"><label>行程日</label><select name="day" required>${getItineraryDayOptions(editBtn.dataset.editDay)}</select></div>
                    <div class="form-group"><label>行程名稱</label><input type="text" name="title" value="${escapeHtml(editBtn.dataset.editTitle)}" required></div>
                    <div class="form-group"><label>區域</label><input type="text" name="area" value="${escapeHtml(editBtn.dataset.editArea)}" placeholder="例如：海雲台"></div>
                    <div class="form-group"><label>優先度</label><select name="priority">${ITINERARY_PRIORITY_OPTIONS.map(value => `<option value="${value}" ${value === (editBtn.dataset.editPriority || 'want') ? 'selected' : ''}>${ITINERARY_PRIORITY_LABELS[value]}</option>`).join('')}</select></div>
                    ${getItineraryMoreFields(itineraryValues)}
                `, 'edit-itinerary');
            }

            if (type === 'expenses') {
                const personalShares = JSON.parse(decodeURIComponent(editBtn.dataset.editPersonalShares || 'null'));
                const members = await getExpenseShareMembers(personalShares || {});
                const catOptions = ['交通','住宿','餐飲','景點','購物','保險/簽證','電信費','其他']
                    .map(c => `<option value="${c}" ${c === editBtn.dataset.editCategory ? 'selected' : ''}>${c}</option>`).join('');
                const payOptions = ['刷卡','現金','行動支付','其他']
                    .map(p => `<option value="${p}" ${p === editBtn.dataset.editPaymethod ? 'selected' : ''}>${p}</option>`).join('');
                openModal('編輯支出', `
                    <input type="hidden" name="_editId" value="${escapeHtml(id)}">
                    <div class="form-group"><label>項目名稱</label><input type="text" name="name" value="${escapeHtml(editBtn.dataset.editName)}" required></div>
                    <div style="display:flex;gap:12px;">
                        <div class="form-group" style="flex:1"><label>金額 (TWD)</label><input type="number" name="amount" value="${escapeHtml(editBtn.dataset.editAmount)}" required min="0"></div>
                        <div class="form-group" style="flex:1"><label>分類</label><select name="category">${catOptions}</select></div>
                    </div>
                    <div class="form-group"><label>付款方式</label><select name="payMethod">${payOptions}</select></div>
                    <div class="form-group"><label>備註</label><input type="text" name="note" value="${escapeHtml(editBtn.dataset.editNote)}"></div>
                    ${getExpenseSplitFields(members, personalShares || undefined)}
                `, 'edit-expenses');
                setupExpenseSplitForm();
            }

            if (type === 'todos') {
                openModal('編輯待辦', `
                    <input type="hidden" name="_editId" value="${escapeHtml(id)}">
                    <div class="form-group"><label>待辦事項</label><input type="text" name="text" value="${escapeHtml(editBtn.dataset.editText)}" required></div>
                `, 'edit-todos');
            }

            if (type === 'diveLogs') {
                openModal('編輯潛水紀錄', `
                    <input type="hidden" name="_editId" value="${escapeHtml(id)}">
                    <div class="form-group"><label>潛水日期</label><input type="date" name="diveDate" value="${escapeHtml(editBtn.dataset.editDivedate)}" required></div>
                    <div class="form-group"><label>潛點名稱</label><input type="text" name="diveSite" value="${escapeHtml(editBtn.dataset.editDivesite)}" required placeholder="例如：北礁"></div>
                    <div style="display:flex;gap:12px;">
                        <div class="form-group" style="flex:1"><label>最大深度 (m)</label><input type="number" name="maxDepth" value="${escapeHtml(editBtn.dataset.editMaxdepth)}" min="0" step="0.1"></div>
                        <div class="form-group" style="flex:1"><label>潛水時間 (分鐘)</label><input type="number" name="duration" value="${escapeHtml(editBtn.dataset.editDuration)}" min="0"></div>
                    </div>
                    <div style="display:flex;gap:12px;">
                        <div class="form-group" style="flex:1"><label>能見度 (m)</label><input type="number" name="visibility" value="${escapeHtml(editBtn.dataset.editVisibility)}" min="0"></div>
                        <div class="form-group" style="flex:1"><label>使用氣瓶數</label><input type="number" name="tanks" value="${escapeHtml(editBtn.dataset.editTanks||1)}" min="1" required></div>
                    </div>
                    <div class="form-group"><label>備註</label><input type="text" name="note" value="${escapeHtml(editBtn.dataset.editNote)}" placeholder="海況、海洋生物..."></div>
                `, 'edit-diveLogs');
            }
            return;
        }

        // 勾選 todo
        const toggleBtn = e.target.closest('[data-toggle-todo]');
        if (toggleBtn) {
            const todoId = toggleBtn.dataset.toggleTodo;
            const isDone = toggleBtn.classList.contains('checked');
            try {
                await updateDoc(doc(db, `trips/${tripId}/todos`, todoId), {
                    done: !isDone, updatedAt: serverTimestamp(), ...getAuditUserFields('updated')
                });
                loadTodos();
            } catch (err) { showErrorToast('updateTodo', err); }
            return;
        }

        // 刪除
        const btn = e.target.closest('[data-delete-type]');
        if (!btn) return;
        const type = btn.dataset.deleteType;
        const id = btn.dataset.deleteId;
        if (btn.dataset.ownerOnly === 'true' && !isTripOwner()) return;
        if (btn.dataset.ownOnly === 'true' && !isOwnRecordDataset(btn.dataset)) return;
        if (confirm("確定要刪除這筆紀錄嗎？")) {
            try {
                await deleteDoc(doc(db, `trips/${tripId}/${type}`, id));
                if (type === 'todos') loadTodos();
                else if (type === 'diveLogs') loadDiveLogs();
                else loadAllData();
            } catch (err) { showErrorToast('deleteRecord', err); }
        }
    });
}

function openModal(title, body, type) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalBody').innerHTML = body;
    document.getElementById('modalForm').dataset.type = type;
    document.getElementById('universalModal').style.display = 'block';
}

function validateModalForm(type, data) {
    const rules = {};

    if (type === 'tripInfo') {
        rules.dateRange = true;
        rules.enumFields = {
            tripType: TRIP_TYPE_OPTIONS,
            status: TRIP_STATUS_OPTIONS,
        };
        rules.urlFields = ['coverImageUrl'];
    }

    if (type === 'images') {
        rules.urlFields = ['url'];
    }

    if (type === 'expenses' || type === 'edit-expenses') {
        rules.nonNegativeFields = ['amount'];
    }

    if (type === 'tour') {
        rules.nonNegativeFields = ['tourFee', 'paidFee'];
    }

    return validateFormData(data, rules);
}

function setupEvents(data) {
    const modal = document.getElementById('universalModal');
    const modalForm = document.getElementById('modalForm');

    document.getElementById('closeModal').onclick = () => modal.style.display = 'none';
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    document.getElementById('addDayBtn').onclick = () => openModal("新增行程", `
        <div class="form-group"><label>行程日</label><select name="day" required>${getItineraryDayOptions()}</select></div>
        <div class="form-group"><label>行程名稱</label><input type="text" name="title" required placeholder="例如：白淺灘文化村"></div>
        <div class="form-group"><label>區域</label><input type="text" name="area" placeholder="例如：影島"></div>
        <div class="form-group"><label>優先度</label><select name="priority">${ITINERARY_PRIORITY_OPTIONS.map(value => `<option value="${value}" ${value === 'want' ? 'selected' : ''}>${ITINERARY_PRIORITY_LABELS[value]}</option>`).join('')}</select></div>
        ${getItineraryMoreFields()}
    `, "itinerary");

    document.getElementById('addExpenseBtn').onclick = async () => {
        const members = await getExpenseShareMembers();
        openModal("新增支出", `
        <div class="form-group"><label>項目名稱</label><input type="text" name="name" required placeholder="例如：機票"></div>
        <div style="display:flex;gap:12px;">
            <div class="form-group" style="flex:1"><label>金額 (TWD)</label><input type="number" name="amount" required min="0"></div>
            <div class="form-group" style="flex:1"><label>分類</label>
                <select name="category">
                    <option value="交通">交通</option><option value="住宿">住宿</option>
                    <option value="餐飲">餐飲</option><option value="景點">景點</option>
                    <option value="購物">購物</option><option value="保險/簽證">保險/簽證</option>
                    <option value="潛水費用">潛水費用</option><option value="電信費">電信費</option><option value="其他">其他</option>
                </select>
            </div>
        </div>
        <div class="form-group"><label>付款方式</label>
            <select name="payMethod">
                <option value="刷卡">刷卡</option><option value="現金">現金</option>
                <option value="行動支付">行動支付</option><option value="其他">其他</option>
            </select>
        </div>
        <div class="form-group"><label>備註</label><input type="text" name="note" placeholder="例如：一人 $8790，媽媽先轉帳"></div>
        ${getExpenseSplitFields(members)}
    `, "expenses");
        setupExpenseSplitForm();
    };

    document.getElementById('addImageBtn').onclick = () => openModal("新增相片", `
        <div class="form-group"><label>圖片網址 (URL)</label><input type="url" name="url" required placeholder="https://..."></div>
    `, "images");

    // 潛水日誌新增按鈕（用 event delegation 避免 null 問題）
    document.getElementById('trip-details').addEventListener('click', (e) => {
        if (e.target.id === 'addDiveBtn' || e.target.closest('#addDiveBtn')) {
            openModal("新增潛水紀錄", `
                <div class="form-group"><label>潛水日期</label><input type="date" name="diveDate" required></div>
                <div class="form-group"><label>潛點名稱</label><input type="text" name="diveSite" required placeholder="例如：北礁、東北角"></div>
                <div style="display:flex;gap:12px;">
                    <div class="form-group" style="flex:1"><label>最大深度 (m)</label><input type="number" name="maxDepth" min="0" step="0.1" placeholder="18"></div>
                    <div class="form-group" style="flex:1"><label>潛水時間 (分鐘)</label><input type="number" name="duration" min="0" placeholder="55"></div>
                </div>
                <div style="display:flex;gap:12px;">
                    <div class="form-group" style="flex:1"><label>能見度 (m)</label><input type="number" name="visibility" min="0" placeholder="15"></div>
                    <div class="form-group" style="flex:1"><label>使用氣瓶數</label><input type="number" name="tanks" value="1" min="1" required></div>
                </div>
                <div class="form-group"><label>備註</label><input type="text" name="note" placeholder="海況、看到的海洋生物..."></div>
            `, "diveLogs");
        }
    }, { once: false });

    setupCopyLinkButton();

    // 編輯旅程基本資料
    document.getElementById('editTripInfoBtn').onclick = async () => {
        if (!isTripOwner()) return;
        const snap = await getDoc(doc(db, 'trips', tripId));
        const d = snap.data();
        const tags = Array.isArray(d.tags) ? d.tags.join(', ') : (d.tags || '');
        const TYPE_ICON = { '自由行': '🎒', '跟團': '🚌', '潛旅': '🤿' };
        openModal('編輯旅程資料', `
            <div class="form-group"><label>旅程名稱</label><input type="text" name="title" value="${escapeHtml(d.title || '')}" required></div>
            <div class="form-group">
                <label>旅程類型</label>
                <div class="trip-type-selector">
                    ${['自由行','跟團','潛旅'].map(t => `
                        <input type="radio" name="tripType" id="edit-type-${t}" value="${t}" ${d.tripType===t?'checked':''}>
                        <label for="edit-type-${t}" class="trip-type-option">${TYPE_ICON[t]} ${t}</label>
                    `).join('')}
                </div>
            </div>
            <div style="display:flex;gap:12px;">
                <div class="form-group" style="flex:1"><label>國家</label><input type="text" name="country" value="${escapeHtml(d.country || '')}"></div>
                <div class="form-group" style="flex:1"><label>城市</label><input type="text" name="city" value="${escapeHtml(d.city || '')}"></div>
            </div>
            <div style="display:flex;gap:12px;">
                <div class="form-group" style="flex:1"><label>出發日期</label><input type="date" name="startDate" value="${escapeHtml(d.startDate || '')}"></div>
                <div class="form-group" style="flex:1"><label>回程日期</label><input type="date" name="endDate" value="${escapeHtml(d.endDate || '')}"></div>
            </div>
            <div class="form-group"><label>狀態</label>
                <select name="status">
                    <option value="規劃中" ${d.status==='規劃中'?'selected':''}>規劃中</option>
                    <option value="即將出發" ${d.status==='即將出發'?'selected':''}>即將出發</option>
                    <option value="已完成" ${d.status==='已完成'?'selected':''}>已完成</option>
                    <option value="已封存" ${d.status==='已封存'?'selected':''}>已封存</option>
                </select>
            </div>
            <div class="form-group"><label>封面圖網址</label><input type="url" name="coverImageUrl" value="${escapeHtml(d.coverImageUrl || '')}" placeholder="https://..."></div>
            <div class="form-group"><label>備註</label><textarea name="note" rows="3" style="width:100%;padding:10px;border:1px solid var(--border-color);border-radius:10px;font-size:0.95rem;resize:vertical;">${escapeHtml(d.note || '')}</textarea></div>
        `, 'tripInfo');
    };

    document.getElementById('deleteTripBtn').onclick = async () => {
        if (!isTripOwner()) return;
        if (confirm("⚠️ 確定要刪除整趟旅程嗎？此操作無法復原。")) {
            try {
                await deleteDoc(doc(db, "trips", tripId));
                showToast("旅程已刪除");
                setTimeout(() => { window.location.href = 'index.html'; }, 1000);
            } catch (err) { showErrorToast('deleteTrip', err); }
        }
    };

    // 用 AbortController 確保只綁一次
    if (modalForm._submitController) modalForm._submitController.abort();
    modalForm._submitController = new AbortController();
    modalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = modalForm.dataset.type;
        const data = normalizeFormData(Object.fromEntries(new FormData(modalForm).entries()));
        const validationError = validateModalForm(type, data);
        if (validationError) {
            showToast(validationError, 'error');
            return;
        }

        if (type === 'participant' || type === 'edit-participant') {
            if (!isTripOwner()) return;
            const name = (data.name || '').trim();
            if (!name) { showToast('同行者姓名不可空白。', 'error'); return; }
            if (name.length > 100) { showToast('文字欄位不可超過 100 字。', 'error'); return; }
            const participantId = type === 'participant'
                ? doc(collection(db, 'trips')).id
                : data._participantId;
            const existing = currentTripData.participants?.[participantId];
            const participant = existing
                ? { ...existing, name }
                : { name, uid: null, order: getNextParticipantOrder(), status: 'active' };
            try {
                await updateParticipant(participantId, participant);
                modal.style.display = 'none'; modalForm.reset();
                showToast(type === 'participant' ? '同行者已新增 ✓' : '同行者姓名已更新 ✓');
            } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'edit-itinerary') {
            const id = data._editId; delete data._editId;
            if (data.day) data.day = Number(data.day);
            if (data.order) data.order = Number(data.order);
            data.updatedAt = serverTimestamp();
            Object.assign(data, getAuditUserFields('updated'));
            try { await updateDoc(doc(db, `trips/${tripId}/itinerary`, id), data); modal.style.display = 'none'; modalForm.reset(); showToast('行程已更新 ✓'); loadAllData(); } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'edit-expenses') {
            const id = data._editId; delete data._editId;
            data.amount = Number(data.amount);
            const split = collectExpensePersonalShares(modalForm, data.amount);
            if (split.error) { showToast(split.error, 'error'); return; }
            delete data.splitMode;
            Object.keys(data).filter(key => key.startsWith('share_')).forEach(key => delete data[key]);
            data.personalShares = split.mode === 'unallocated' ? deleteField() : split.personalShares;
            data.updatedAt = serverTimestamp();
            Object.assign(data, getAuditUserFields('updated'));
            try { await updateDoc(doc(db, `trips/${tripId}/expenses`, id), data); modal.style.display = 'none'; modalForm.reset(); showToast('支出已更新 ✓'); loadAllData(); } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'edit-todos') {
            const id = data._editId; delete data._editId;
            data.updatedAt = serverTimestamp();
            Object.assign(data, getAuditUserFields('updated'));
            try { await updateDoc(doc(db, `trips/${tripId}/todos`, id), data); modal.style.display = 'none'; modalForm.reset(); showToast('待辦已更新 ✓'); loadTodos(); } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'edit-diveLogs') {
            const id = data._editId; delete data._editId;
            if (data.maxDepth) data.maxDepth = Number(data.maxDepth);
            if (data.duration) data.duration = Number(data.duration);
            if (data.visibility) data.visibility = Number(data.visibility);
            if (data.tanks) data.tanks = Number(data.tanks);
            data.updatedAt = serverTimestamp();
            Object.assign(data, getAuditUserFields('updated'));
            try { await updateDoc(doc(db, `trips/${tripId}/diveLogs`, id), data); modal.style.display = 'none'; modalForm.reset(); showToast('潛水紀錄已更新 ✓'); loadDiveLogs(); } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'flight') {
            if (!isTripOwner()) return;
            try { await updateDoc(doc(db, 'trips', tripId), { flight: data, updatedAt: serverTimestamp() }); modal.style.display = 'none'; modalForm.reset(); renderFlightDisplay(data); showToast('班機資訊已儲存 ✓'); } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'hotel') {
            if (!isTripOwner()) return;
            try { await updateDoc(doc(db, 'trips', tripId), { hotel: data, updatedAt: serverTimestamp() }); modal.style.display = 'none'; modalForm.reset(); renderHotelDisplay(data); showToast('住宿資訊已儲存 ✓'); } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'tour') {
            if (!isTripOwner()) return;
            if (data.tourFee) data.tourFee = Number(data.tourFee);
            if (data.paidFee) data.paidFee = Number(data.paidFee);
            try { await updateDoc(doc(db, 'trips', tripId), { tour: data, updatedAt: serverTimestamp() }); modal.style.display = 'none'; modalForm.reset(); renderTourDisplay(data); showToast('跟團資訊已儲存 ✓'); } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'tripInfo') {
            if (!isTripOwner()) return;
            data.updatedAt = serverTimestamp();
            data.updatedByName = getUserNickname();
            try {
                await updateDoc(doc(db, 'trips', tripId), data);
                modal.style.display = 'none'; modalForm.reset();
                showToast("旅程資料已更新 ✓");
                const snap = await getDoc(doc(db, 'trips', tripId));
                currentTripData = snap.data();
                renderHeader(currentTripData);
                renderCompanionSection(currentTripData);
                applyTripTypeUI(currentTripData.tripType);
            } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        // 新增（通用）
        if (data.amount) data.amount = Number(data.amount);
        if (data.day) data.day = Number(data.day);
        if (data.maxDepth) data.maxDepth = Number(data.maxDepth);
        if (data.duration) data.duration = Number(data.duration);
        if (data.visibility) data.visibility = Number(data.visibility);
        if (data.tanks) data.tanks = Number(data.tanks);
        data.createdAt = serverTimestamp();
        Object.assign(data, getAuditUserFields('created'));
        if (type === 'expenses') {
            const split = collectExpensePersonalShares(modalForm, data.amount);
            if (split.error) { showToast(split.error, 'error'); return; }
            delete data.splitMode;
            Object.keys(data).filter(key => key.startsWith('share_')).forEach(key => delete data[key]);
            if (split.mode !== 'unallocated') data.personalShares = split.personalShares;
        }
        try {
            if (type === 'itinerary') {
                const itinerarySnap = await getDocs(collection(db, `trips/${tripId}/itinerary`));
                const sameDayOrders = itinerarySnap.docs.map(item => item.data())
                    .filter(item => Number(item.day) === data.day && item.order !== undefined && item.order !== '')
                    .map(item => Number(item.order)).filter(Number.isFinite);
                data.order = sameDayOrders.length ? Math.max(...sameDayOrders) + 1 : 1;
            }
            await addDoc(collection(db, `trips/${tripId}/${type}`), data);
            modal.style.display = 'none'; modalForm.reset();
            showToast("已儲存並同步 ✓");
            if (type === 'todos') loadTodos();
            else if (type === 'diveLogs') loadDiveLogs();
            else loadAllData();
        } catch (err) { showErrorToast('saveRecord', err); }
    }, { signal: modalForm._submitController.signal });
}

function setupFlightHotel(data) {
    renderFlightDisplay(data.flight || {});
    renderHotelDisplay(data.hotel || {});

    document.getElementById('editFlightBtn').onclick = () => {
        if (!isTripOwner()) return;
        const f = data.flight || {};
        openModal('班機資訊', `
            <div style="display:flex;gap:12px;">
                <div class="form-group" style="flex:1"><label>航空公司</label><input type="text" name="airline" value="${escapeHtml(f.airline||'')}" placeholder="例如：華航"></div>
                <div class="form-group" style="flex:1"><label>訂位代號</label><input type="text" name="flightCode" value="${escapeHtml(f.flightCode||'')}" placeholder="例如：ABC123"></div>
            </div>
            <p style="font-size:0.82rem;font-weight:600;color:var(--text-muted);margin:8px 0 12px;">去程</p>
            <div style="display:flex;gap:12px;">
                <div class="form-group" style="flex:2"><label>出發機場</label><input type="text" name="depAirport" value="${escapeHtml(f.depAirport||'')}" placeholder="例如：桃園機場"></div>
                <div class="form-group" style="flex:1"><label>出發時間</label><input type="time" name="depTime" value="${escapeHtml(f.depTime||'')}"></div>
                <div class="form-group" style="flex:1"><label>抵達時間</label><input type="time" name="arrTime" value="${escapeHtml(f.arrTime||'')}"></div>
            </div>
            <p style="font-size:0.82rem;font-weight:600;color:var(--text-muted);margin:8px 0 12px;">回程</p>
            <div style="display:flex;gap:12px;">
                <div class="form-group" style="flex:2"><label>出發機場</label><input type="text" name="retAirport" value="${escapeHtml(f.retAirport||'')}" placeholder="例如：那霸機場"></div>
                <div class="form-group" style="flex:1"><label>出發時間</label><input type="time" name="retDepTime" value="${escapeHtml(f.retDepTime||'')}"></div>
                <div class="form-group" style="flex:1"><label>抵達時間</label><input type="time" name="retArrTime" value="${escapeHtml(f.retArrTime||'')}"></div>
            </div>
        `, 'flight');
    };

    document.getElementById('editHotelBtn').onclick = () => {
        if (!isTripOwner()) return;
        const h = data.hotel || {};
        openModal('住宿資訊', `
            <div class="form-group"><label>飯店名稱</label><input type="text" name="hotelName" value="${escapeHtml(h.hotelName||'')}" placeholder="例如：Rembrandt Style Naha"></div>
            <div class="form-group"><label>地址</label><input type="text" name="hotelAddr" value="${escapeHtml(h.hotelAddr||'')}" placeholder="飯店地址"></div>
            <div class="form-group"><label>訂位代號</label><input type="text" name="hotelCode" value="${escapeHtml(h.hotelCode||'')}" placeholder="例如：XYZ789"></div>
            <div style="display:flex;gap:12px;">
                <div class="form-group" style="flex:1"><label>Check-in 時間</label><input type="time" name="checkIn" value="${escapeHtml(h.checkIn||'')}"></div>
                <div class="form-group" style="flex:1"><label>Check-out 時間</label><input type="time" name="checkOut" value="${escapeHtml(h.checkOut||'')}"></div>
            </div>
        `, 'hotel');
    };
}

function renderFlightDisplay(f) {
    const el = document.getElementById('flight-display');
    const isEmpty = !f.airline && !f.depAirport && !f.retAirport;
    if (isEmpty) { el.innerHTML = '<p class="info-empty">尚未填寫班機資訊</p>'; return; }
    const fmt = t => t ? t.replace(':', '.') : '—';
    el.innerHTML = `
        <div class="info-grid">
            ${f.airline ? `<div class="info-item"><span class="info-label">航空公司</span><span class="info-value">${escapeHtml(f.airline)}</span></div>` : ''}
            ${f.flightCode ? `<div class="info-item"><span class="info-label">訂位代號</span><span class="info-value code">${escapeHtml(f.flightCode)}</span></div>` : ''}
        </div>
        <div class="info-flight-row">
            <div class="info-flight-seg">
                <span class="info-flight-label">去程</span>
                <span class="info-flight-airport">${escapeHtml(f.depAirport || '—')}</span>
                <span class="info-flight-time">${escapeHtml(fmt(f.depTime))} → ${escapeHtml(fmt(f.arrTime))}</span>
            </div>
            <div class="info-flight-arrow">✈</div>
            <div class="info-flight-seg">
                <span class="info-flight-label">回程</span>
                <span class="info-flight-airport">${escapeHtml(f.retAirport || '—')}</span>
                <span class="info-flight-time">${escapeHtml(fmt(f.retDepTime))} → ${escapeHtml(fmt(f.retArrTime))}</span>
            </div>
        </div>
    `;
}

function renderHotelDisplay(h) {
    const el = document.getElementById('hotel-display');
    if (!el) return;
    const isEmpty = !h.hotelName && !h.hotelAddr;
    if (isEmpty) { el.innerHTML = '<p class="info-empty">尚未填寫住宿資訊</p>'; return; }
    el.innerHTML = `
        <div class="info-grid">
            ${h.hotelName ? `<div class="info-item"><span class="info-label">飯店</span><span class="info-value"><strong>${escapeHtml(h.hotelName)}</strong></span></div>` : ''}
            ${h.hotelAddr ? `<div class="info-item"><span class="info-label">地址</span><span class="info-value">${escapeHtml(h.hotelAddr)}</span></div>` : ''}
            ${h.hotelCode ? `<div class="info-item"><span class="info-label">訂位代號</span><span class="info-value code">${escapeHtml(h.hotelCode)}</span></div>` : ''}
            ${(h.checkIn || h.checkOut) ? `<div class="info-item"><span class="info-label">Check-in / out</span><span class="info-value">${escapeHtml(h.checkIn||'—')} / ${escapeHtml(h.checkOut||'—')}</span></div>` : ''}
        </div>
    `;
}

async function loadAllData() {
    // 行程
    try {
        const sI = await getDocs(collection(db, `trips/${tripId}/itinerary`));
        const items = sI.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
                const dayResult = compareOptionalValues(a.day, b.day);
                if (dayResult !== 0) return dayResult;
                const aHasOrder = a.order !== undefined && a.order !== null && a.order !== '';
                const bHasOrder = b.order !== undefined && b.order !== null && b.order !== '';
                if (aHasOrder && bHasOrder) return compareOptionalValues(a.order, b.order) || String(a.id).localeCompare(String(b.id));
                if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
                return compareOptionalValues(a.time, b.time) || String(a.id).localeCompare(String(b.id));
            });
        let htmlI = ""; let lastDay = null;
        items.forEach(item => {
            if (lastDay !== item.day) {
                lastDay = item.day;
                const dayAreas = [...new Set(items.filter(other => other.day === item.day).map(other => other.area || other.location).filter(Boolean))];
                htmlI += `<h3 class="itinerary-day-title">Day ${escapeHtml(lastDay || '未設定')}${dayAreas.length ? `｜${escapeHtml(dayAreas.join('・'))}` : ''}</h3>`;
            }
            const title = item.title || item.activity || '未命名行程';
            const area = item.area || item.location || '';
            const fixedTime = item.reservationTime || '';
            const itemType = ITINERARY_TYPE_OPTIONS.includes(item.type) ? item.type : 'other';
            const priority = ITINERARY_PRIORITY_OPTIONS.includes(item.priority) ? item.priority : '';
            htmlI += `<div class="itinerary-item">
                        <div class="itinerary-item-main"><span class="itinerary-type-icon" title="${escapeHtml(ITINERARY_TYPE_LABELS[itemType])}">${ITINERARY_TYPE_ICONS[itemType]}</span><div><div class="itinerary-item-heading"><strong>${escapeHtml(title)}</strong>${fixedTime ? `<span class="itinerary-fixed-time">${escapeHtml(fixedTime)}</span>` : ''}${priority ? `<span class="itinerary-priority ${priority}">${ITINERARY_PRIORITY_LABELS[priority]}</span>` : ''}</div>${area ? `<div class="itinerary-area">${escapeHtml(area)}</div>` : ''}${item.note ? `<div class="itinerary-note">${escapeHtml(item.note)}</div>` : ''}</div></div>
                        <div class="itinerary-actions">
                            <button class="edit-btn-sub" data-edit-type="itinerary" data-edit-id="${escapeHtml(item.id)}" data-edit-day="${escapeHtml(item.day || '')}" data-edit-title="${escapeHtml(title)}" data-edit-area="${escapeHtml(area)}" data-edit-item-type="${escapeHtml(item.type || '')}" data-edit-priority="${escapeHtml(item.priority || '')}" data-edit-reservation-time="${escapeHtml(item.reservationTime || '')}" data-edit-note="${escapeHtml(item.note || '')}" title="編輯">✎</button>
                            ${isTripOwner() ? `<button class="delete-btn-sub" data-delete-type="itinerary" data-delete-id="${escapeHtml(item.id)}" data-owner-only="true" title="刪除">×</button>` : ''}
                        </div>
                      </div>`;
        });
        document.getElementById('itinerary-timeline').innerHTML = htmlI || "<p style='color:#ccc; text-align:center; padding:30px 0;'>尚未建立行程</p>";
    } catch (err) {
        showErrorToast('loadTrip', err);
    }

    // 支出
    try {
        const sE = await getDocs(collection(db, `trips/${tripId}/expenses`));
        let total = 0; const cats = {}; let htmlE = "";
        let personalExpenseTotal = 0;
        let confirmedCount = 0;
        let unconfirmedCount = 0;
        let missingCurrentUserShareCount = 0;
        sE.forEach(d => {
            const ex = d.data(); const amt = Number(ex.amount) || 0;
            const hasPersonalShares = ex.personalShares && typeof ex.personalShares === 'object' && !Array.isArray(ex.personalShares);
            const hasCurrentUserShare = hasPersonalShares && Object.hasOwn(ex.personalShares, currentUser.uid);
            const myShareText = !hasPersonalShares ? '尚未確認' : hasCurrentUserShare ? `NT$${Number(ex.personalShares[currentUser.uid]).toLocaleString()}` : '沒有此使用者的分攤資料';
            if (!hasPersonalShares) {
                unconfirmedCount += 1;
            } else if (!hasCurrentUserShare) {
                missingCurrentUserShareCount += 1;
            } else {
                confirmedCount += 1;
                personalExpenseTotal += Number(ex.personalShares[currentUser.uid]) || 0;
            }
            total += amt; cats[ex.category || '其他'] = (cats[ex.category || '其他'] || 0) + amt;
            const payBadgeClass = ex.payMethod === '現金' ? 'pay-badge cash' : 'pay-badge card';
            htmlE += `<tr>
                <td class="expense-name">${escapeHtml(ex.name)}<span class="expense-my-share">我的負擔：${escapeHtml(myShareText)}</span></td>
                <td><span class="expense-cat-badge">${escapeHtml(ex.category || '其他')}</span></td>
                <td class="expense-amt">$${amt.toLocaleString()}</td>
                <td>${ex.payMethod ? `<span class="${payBadgeClass}">${escapeHtml(ex.payMethod)}</span>` : '—'}</td>
                <td class="expense-note">${escapeHtml(ex.note || '')}</td>
                <td class="expense-who">${escapeHtml(ex.createdByName || '—')}</td>
                <td style="white-space:nowrap;">
                    ${isOwnRecord(ex) ? `<button class="edit-btn-sub" data-edit-type="expenses" data-edit-id="${escapeHtml(d.id)}" data-own-only="true" data-created-by-name="${escapeHtml(ex.createdByName || '')}" data-created-by-uid="${escapeHtml(ex.createdByUid || '')}" data-edit-name="${escapeHtml(ex.name)}" data-edit-amount="${escapeHtml(ex.amount)}" data-edit-category="${escapeHtml(ex.category||'')}" data-edit-paymethod="${escapeHtml(ex.payMethod||'')}" data-edit-note="${escapeHtml(ex.note||'')}" data-edit-personal-shares="${escapeHtml(encodeURIComponent(JSON.stringify(hasPersonalShares ? ex.personalShares : null)))}" title="編輯">✎</button>` : ''}
                    ${isTripOwner() ? `<button class="delete-btn-sub" data-delete-type="expenses" data-delete-id="${escapeHtml(d.id)}" data-owner-only="true" title="刪除">×</button>` : ''}
                </td>
            </tr>`;
        });
        document.getElementById('total-expense').innerText = `$${total.toLocaleString()}`;
        const totalExpenseElement = document.getElementById('total-expense');
        let personalSummary = document.getElementById('personal-expense-summary');
        if (!personalSummary) {
            totalExpenseElement.insertAdjacentHTML('beforebegin', '<p id="personal-expense-summary" style="font-size:1rem; color:var(--primary); margin-top:4px; font-weight:700;"></p>');
            personalSummary = document.getElementById('personal-expense-summary');
        }
        const needsConfirmation = unconfirmedCount + missingCurrentUserShareCount;
        const insufficientText = sE.size > 0 && confirmedCount === 0 ? ' · 尚未有足夠的個人支出資料' : '';
        const confirmationText = confirmedCount > 0 && needsConfirmation > 0 ? ` · 尚有 ${needsConfirmation} 筆費用未確認` : '';
        personalSummary.textContent = `我的旅行支出 NT$ ${personalExpenseTotal.toLocaleString()}${insufficientText}${confirmationText}`;
        totalExpenseElement.textContent = `旅程總支出 $${total.toLocaleString()}`;
        const footTotal = document.getElementById('expense-total-foot');
        if (footTotal) footTotal.innerText = `$${total.toLocaleString()}`;
        document.getElementById('expense-list').innerHTML = htmlE ||
            `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px; font-weight:400;">尚無支出紀錄</td></tr>`;
        renderChart(cats);
        try {
            await updateDoc(doc(db, "trips", tripId), { totalExpense: total });
        } catch (err) {
            console.warn('[syncTotalExpense]', err);
        }
    } catch (err) {
        showErrorToast('loadTrip', err);
    }

    // 相片
    try {
        const sPh = await getDocs(collection(db, `trips/${tripId}/images`));
        let htmlPh = "";
        sPh.forEach(d => {
            const imageUrl = escapeHtml(safeUrl(d.data().url, ''));
            htmlPh += `<div style="position:relative; aspect-ratio:1; border-radius:15px; overflow:hidden;">
                        <img src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.display='none'">
                        ${isTripOwner() ? `<button data-delete-type="images" data-delete-id="${escapeHtml(d.id)}" data-owner-only="true" style="position:absolute; top:8px; right:8px; background:rgba(255,255,255,0.85); border:none; border-radius:50%; width:28px; height:28px; cursor:pointer; font-size:1rem;" title="刪除">×</button>` : ''}
                       </div>`;
        });
        document.getElementById('photo-grid').innerHTML = htmlPh || "<p style='color:#ccc; text-align:center; font-size:0.9rem; font-weight:400; padding:20px 0;'>尚無相片</p>";
    } catch (err) {
        showErrorToast('loadTrip', err);
    }
}

function setupTodos(tripType) {
    const templates = TODO_TEMPLATES[tripType] || TODO_TEMPLATES['自由行'];
    const chipsEl = document.getElementById('todo-template-chips');
    if (!chipsEl) return;
    chipsEl.innerHTML = templates.map(t =>
        `<span class="todo-chip" data-template="${escapeHtml(t)}">${escapeHtml(t)}</span>`
    ).join('');
    chipsEl.addEventListener('click', async (e) => {
        const chip = e.target.closest('[data-template]');
        if (!chip) return;
        await addTodo(chip.dataset.template);
    });
    document.getElementById('addTodoBtn').onclick = () => {
        const text = prompt('新增待辦事項：');
        if (text && text.trim()) addTodo(text.trim());
    };
}

async function addTodo(text) {
    const data = normalizeFormData({ text });
    const validationError = validateFormData(data);
    if (validationError) {
        showToast(validationError, 'error');
        return;
    }

    try {
        await addDoc(collection(db, `trips/${tripId}/todos`), {
            text: data.text, done: false, order: Date.now(),
            createdAt: serverTimestamp(), ...getAuditUserFields('created')
        });
        loadTodos();
        showToast(`已新增「${data.text}」`);
    } catch (err) { showErrorToast('addTodo', err); }
}

async function loadTodos() {
    const snap = await getDocs(collection(db, `trips/${tripId}/todos`));
    const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort(compareByFields(['order', 'createdAt']));
    const total = todos.length;
    const done = todos.filter(t => t.done).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    document.getElementById('todo-progress-bar').style.width = pct + '%';
    document.getElementById('todo-progress-text').innerText =
        total === 0 ? '尚無待辦事項' : `已完成 ${done} / ${total} 項（${pct}%）`;
    const sorted = [...todos.filter(t => !t.done), ...todos.filter(t => t.done)];
    document.getElementById('todo-list').innerHTML = sorted.length === 0
        ? `<p style="color:var(--text-muted); text-align:center; padding:20px 0; font-weight:400;">點擊下方範本快速新增，或按「＋ 新增」自訂</p>`
        : sorted.map(t => `
            <div class="todo-item ${t.done ? 'done' : ''}" data-todo-id="${escapeHtml(t.id)}">
                <div class="todo-checkbox ${t.done ? 'checked' : ''}" data-toggle-todo="${escapeHtml(t.id)}"></div>
                <span class="todo-text">${escapeHtml(t.text)}</span>
                ${t.createdByName ? `<span class="todo-meta">${escapeHtml(t.createdByName)}</span>` : ''}
                ${isOwnRecord(t) ? `<button class="edit-btn-sub" data-edit-type="todos" data-edit-id="${escapeHtml(t.id)}" data-own-only="true" data-created-by-name="${escapeHtml(t.createdByName || '')}" data-created-by-uid="${escapeHtml(t.createdByUid || '')}" data-edit-text="${escapeHtml(t.text)}" title="編輯">✎</button>` : ''}
                ${isTripOwner() ? `<button class="todo-delete" data-delete-type="todos" data-delete-id="${escapeHtml(t.id)}" data-owner-only="true" title="刪除">×</button>` : ''}
            </div>
        `).join('');
}

function renderChart(data) {
    const el = document.getElementById('expense-bar-chart');
    if (!el) return;
    const keys = Object.keys(data);
    if (keys.length === 0) { el.innerHTML = ''; return; }
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    const colors = ['#1A3A5F', '#E67E22', '#8E44AD', '#16A085', '#C0392B', '#2980B9', '#F39C12', '#95A5A6'];
    const sorted = keys.map((k, i) => ({ k, v: data[k], color: colors[i % colors.length] })).sort((a, b) => b.v - a.v);
    el.innerHTML = `
        <div style="margin-top:20px; padding-top:20px; border-top:1px solid var(--border-color);">
            <p style="font-size:0.78rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:16px;">分類統計</p>
            ${sorted.map(({ k, v, color }) => {
                const pct = Math.round(v / total * 100);
                return `<div style="margin-bottom:14px;">
                    <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
                        <span style="font-size:0.88rem; font-weight:500;">${escapeHtml(k)}</span>
                        <span style="font-size:0.88rem; font-weight:600;">$${v.toLocaleString()} <span style="font-weight:400; color:var(--text-muted); font-size:0.78rem;">${pct}%</span></span>
                    </div>
                    <div style="width:100%; height:10px; background:#f0f0f0; border-radius:99px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:${color}; border-radius:99px; transition:width 0.6s ease;"></div>
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;
}
