import { db } from './firebase-db.js';
import { 
    doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, 
    query, orderBy, serverTimestamp
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
            setupEvents(currentTripData);
            setupTodos(currentTripData.tripType);
            setupDeleteDelegation();
            setupFlightHotel(currentTripData);
            loadAllData();
            loadTodos();
            if (currentTripData.tripType === '潛旅') loadDiveLogs();
            if (currentTripData.tripType === '跟團') setupTourSection(currentTripData);
            document.getElementById('trip-details').style.display = 'block';
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
    const tags = Array.isArray(data.tags) ? data.tags
        : (data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : []);
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
            <span class="summary-label">旅伴</span>
            <span class="summary-value">${escapeHtml(data.companions || '獨旅')}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">狀態</span>
            <span class="summary-value">
                <span class="status-pill ${statusMap[data.status] || 'planning'}">${escapeHtml(data.status || '規劃中')}</span>
            </span>
        </div>
        ${data.tripType === '潛旅' ? `
        <div class="summary-item">
            <span class="summary-label">本趟氣瓶</span>
            <span class="summary-value" style="color:var(--ocean); font-weight:700;">🫧 ${data.totalTanks || 0} 瓶</span>
        </div>` : ''}
        ${data.note ? `
        <div class="summary-item" style="flex-basis: 100%;">
            <span class="summary-label">備註</span>
            <span class="summary-value" style="font-weight:400; color:var(--text-muted);">${escapeHtml(data.note)}</span>
        </div>` : ''}
    `;
}

// ===== 潛水日誌 =====
async function loadDiveLogs() {
    const snap = await getDocs(query(collection(db, `trips/${tripId}/diveLogs`), orderBy('diveDate'), orderBy('createdAt')));
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const totalTanks = logs.reduce((s, l) => s + (Number(l.tanks) || 1), 0);

    document.getElementById('dive-tank-summary').innerText = `本趟累計：${totalTanks} 瓶`;

    const listEl = document.getElementById('dive-log-list');
    if (logs.length === 0) {
        listEl.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:30px 0; font-weight:400;">尚無潛水記錄，點擊「＋ 新增潛水」開始記錄吧！</p>`;
        await updateDoc(doc(db, "trips", tripId), { totalTanks: 0 });
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
                <div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
                    <button class="edit-btn-sub" data-edit-type="diveLogs" data-edit-id="${escapeHtml(l.id)}"
                        data-edit-divedate="${escapeHtml(l.diveDate||'')}"
                        data-edit-divesite="${escapeHtml(l.diveSite||'')}" data-edit-maxdepth="${escapeHtml(l.maxDepth||'')}"
                        data-edit-duration="${escapeHtml(l.duration||'')}" data-edit-visibility="${escapeHtml(l.visibility||'')}"
                        data-edit-tanks="${escapeHtml(l.tanks||1)}" data-edit-note="${escapeHtml(l.note||'')}" title="編輯">✎</button>
                    <button class="delete-btn-sub" data-delete-type="diveLogs" data-delete-id="${escapeHtml(l.id)}" title="刪除">×</button>
                </div>
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
    await updateDoc(doc(db, "trips", tripId), { totalTanks });
    if (currentTripData) {
        currentTripData.totalTanks = totalTanks;
        renderSummaryCard(currentTripData);
    }
}

// ===== 跟團資訊 =====
function setupTourSection(data) {
    renderTourDisplay(data.tour || {});
    document.getElementById('editTourBtn').onclick = () => {
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
            const modal = document.getElementById('universalModal');
            const modalForm = document.getElementById('modalForm');

            if (type === 'itinerary') {
                openModal('編輯行程', `
                    <input type="hidden" name="_editId" value="${escapeHtml(id)}">
                    <div class="form-group"><label>第幾天</label><input type="number" name="day" value="${escapeHtml(editBtn.dataset.editDay)}" min="1" required></div>
                    <div class="form-group"><label>時間</label><input type="time" name="time" value="${escapeHtml(editBtn.dataset.editTime)}"></div>
                    <div class="form-group"><label>活動內容</label><input type="text" name="activity" value="${escapeHtml(editBtn.dataset.editActivity)}" required></div>
                    <div class="form-group"><label>地點</label><input type="text" name="location" value="${escapeHtml(editBtn.dataset.editLocation)}"></div>
                `, 'edit-itinerary');
            }

            if (type === 'expenses') {
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
                `, 'edit-expenses');
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
                    done: !isDone, updatedAt: serverTimestamp(), updatedByName: getUserNickname()
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
        <div class="form-group"><label>第幾天</label><input type="number" name="day" value="1" min="1" required></div>
        <div class="form-group"><label>時間</label><input type="time" name="time"></div>
        <div class="form-group"><label>活動內容</label><input type="text" name="activity" required placeholder="例如：參觀首里城"></div>
        <div class="form-group"><label>地點</label><input type="text" name="location"></div>
    `, "itinerary");

    document.getElementById('addExpenseBtn').onclick = () => openModal("新增支出", `
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
    `, "expenses");

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

    document.getElementById('copyLinkBtn').onclick = () => copyToClipboard(window.location.href);

    // 編輯旅程基本資料
    document.getElementById('editTripInfoBtn').onclick = async () => {
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
            <div class="form-group"><label>旅伴</label><input type="text" name="companions" value="${escapeHtml(d.companions || '')}" placeholder="例如：小明、小花"></div>
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

        if (type === 'edit-itinerary') {
            const id = data._editId; delete data._editId;
            if (data.day) data.day = Number(data.day);
            data.updatedAt = serverTimestamp();
            try { await updateDoc(doc(db, `trips/${tripId}/itinerary`, id), data); modal.style.display = 'none'; modalForm.reset(); showToast('行程已更新 ✓'); loadAllData(); } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'edit-expenses') {
            const id = data._editId; delete data._editId;
            if (data.amount) data.amount = Number(data.amount);
            data.updatedAt = serverTimestamp();
            try { await updateDoc(doc(db, `trips/${tripId}/expenses`, id), data); modal.style.display = 'none'; modalForm.reset(); showToast('支出已更新 ✓'); loadAllData(); } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'edit-diveLogs') {
            const id = data._editId; delete data._editId;
            if (data.maxDepth) data.maxDepth = Number(data.maxDepth);
            if (data.duration) data.duration = Number(data.duration);
            if (data.visibility) data.visibility = Number(data.visibility);
            if (data.tanks) data.tanks = Number(data.tanks);
            data.updatedAt = serverTimestamp();
            try { await updateDoc(doc(db, `trips/${tripId}/diveLogs`, id), data); modal.style.display = 'none'; modalForm.reset(); showToast('潛水紀錄已更新 ✓'); loadDiveLogs(); } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'flight') {
            try { await updateDoc(doc(db, 'trips', tripId), { flight: data, updatedAt: serverTimestamp() }); modal.style.display = 'none'; modalForm.reset(); renderFlightDisplay(data); showToast('班機資訊已儲存 ✓'); } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'hotel') {
            try { await updateDoc(doc(db, 'trips', tripId), { hotel: data, updatedAt: serverTimestamp() }); modal.style.display = 'none'; modalForm.reset(); renderHotelDisplay(data); showToast('住宿資訊已儲存 ✓'); } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'tour') {
            if (data.tourFee) data.tourFee = Number(data.tourFee);
            if (data.paidFee) data.paidFee = Number(data.paidFee);
            try { await updateDoc(doc(db, 'trips', tripId), { tour: data, updatedAt: serverTimestamp() }); modal.style.display = 'none'; modalForm.reset(); renderTourDisplay(data); showToast('跟團資訊已儲存 ✓'); } catch (err) { showErrorToast('saveRecord', err); }
            return;
        }

        if (type === 'tripInfo') {
            data.updatedAt = serverTimestamp();
            data.updatedByName = getUserNickname();
            try {
                await updateDoc(doc(db, 'trips', tripId), data);
                modal.style.display = 'none'; modalForm.reset();
                showToast("旅程資料已更新 ✓");
                const snap = await getDoc(doc(db, 'trips', tripId));
                currentTripData = snap.data();
                renderHeader(currentTripData);
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
        data.createdByName = getUserNickname();
        try {
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
    const qI = query(collection(db, `trips/${tripId}/itinerary`), orderBy("day"), orderBy("time"));
    const sI = await getDocs(qI);
    let htmlI = ""; let lastDay = null;
    sI.forEach(d => {
        const item = d.data();
        if (lastDay !== item.day) {
            lastDay = item.day;
            htmlI += `<h3 style="margin-top:25px; margin-bottom:10px; border-left:6px solid var(--primary); padding-left:15px;">Day ${escapeHtml(lastDay)}</h3>`;
        }
        htmlI += `<div class="itinerary-item">
                    <div><span style="color:var(--accent);">${escapeHtml(item.time || '--:--')}</span> <strong>${escapeHtml(item.activity)}</strong>${item.location ? `<span style="color:var(--text-muted); font-size:0.85rem; font-weight:400;"> · ${escapeHtml(item.location)}</span>` : ''}</div>
                    <div style="display:flex;gap:6px;">
                        <button class="edit-btn-sub" data-edit-type="itinerary" data-edit-id="${escapeHtml(d.id)}" data-edit-day="${escapeHtml(item.day)}" data-edit-time="${escapeHtml(item.time||'')}" data-edit-activity="${escapeHtml(item.activity)}" data-edit-location="${escapeHtml(item.location||'')}" title="編輯">✎</button>
                        <button class="delete-btn-sub" data-delete-type="itinerary" data-delete-id="${escapeHtml(d.id)}" title="刪除">×</button>
                    </div>
                  </div>`;
    });
    document.getElementById('itinerary-timeline').innerHTML = htmlI || "<p style='color:#ccc; text-align:center; padding:30px 0;'>尚未建立行程</p>";

    // 支出
    const sE = await getDocs(collection(db, `trips/${tripId}/expenses`));
    let total = 0; const cats = {}; let htmlE = "";
    sE.forEach(d => {
        const ex = d.data(); const amt = Number(ex.amount) || 0;
        total += amt; cats[ex.category] = (cats[ex.category] || 0) + amt;
        const payBadgeClass = ex.payMethod === '現金' ? 'pay-badge cash' : 'pay-badge card';
        htmlE += `<tr>
            <td class="expense-name">${escapeHtml(ex.name)}</td>
            <td><span class="expense-cat-badge">${escapeHtml(ex.category || '其他')}</span></td>
            <td class="expense-amt">$${amt.toLocaleString()}</td>
            <td>${ex.payMethod ? `<span class="${payBadgeClass}">${escapeHtml(ex.payMethod)}</span>` : '—'}</td>
            <td class="expense-note">${escapeHtml(ex.note || '')}</td>
            <td class="expense-who">${escapeHtml(ex.createdByName || '—')}</td>
            <td style="white-space:nowrap;">
                <button class="edit-btn-sub" data-edit-type="expenses" data-edit-id="${escapeHtml(d.id)}" data-edit-name="${escapeHtml(ex.name)}" data-edit-amount="${escapeHtml(ex.amount)}" data-edit-category="${escapeHtml(ex.category||'')}" data-edit-paymethod="${escapeHtml(ex.payMethod||'')}" data-edit-note="${escapeHtml(ex.note||'')}" title="編輯">✎</button>
                <button class="delete-btn-sub" data-delete-type="expenses" data-delete-id="${escapeHtml(d.id)}" title="刪除">×</button>
            </td>
        </tr>`;
    });
    document.getElementById('total-expense').innerText = `$${total.toLocaleString()}`;
    const footTotal = document.getElementById('expense-total-foot');
    if (footTotal) footTotal.innerText = `$${total.toLocaleString()}`;
    document.getElementById('expense-list').innerHTML = htmlE ||
        `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px; font-weight:400;">尚無支出紀錄</td></tr>`;
    renderChart(cats);
    await updateDoc(doc(db, "trips", tripId), { totalExpense: total });

    // 相片
    const sPh = await getDocs(collection(db, `trips/${tripId}/images`));
    let htmlPh = "";
    sPh.forEach(d => {
        const imageUrl = escapeHtml(safeUrl(d.data().url, ''));
        htmlPh += `<div style="position:relative; aspect-ratio:1; border-radius:15px; overflow:hidden;">
                    <img src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.display='none'">
                    <button data-delete-type="images" data-delete-id="${escapeHtml(d.id)}" style="position:absolute; top:8px; right:8px; background:rgba(255,255,255,0.85); border:none; border-radius:50%; width:28px; height:28px; cursor:pointer; font-size:1rem;" title="刪除">×</button>
                   </div>`;
    });
    document.getElementById('photo-grid').innerHTML = htmlPh || "<p style='color:#ccc; text-align:center; font-size:0.9rem; font-weight:400; padding:20px 0;'>尚無相片</p>";
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
            createdAt: serverTimestamp(), createdByName: getUserNickname()
        });
        loadTodos();
        showToast(`已新增「${data.text}」`);
    } catch (err) { showErrorToast('addTodo', err); }
}

async function loadTodos() {
    const snap = await getDocs(query(collection(db, `trips/${tripId}/todos`), orderBy('order')));
    const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
                <button class="todo-delete" data-delete-type="todos" data-delete-id="${escapeHtml(t.id)}" title="刪除">×</button>
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
