import { db } from './firebase-db.js';
import { 
    doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, 
    query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserNickname, showToast, formatDate, copyToClipboard } from './utils.js';

const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
const shareKey = urlParams.get('key');
let chartInstance = null;

const TODO_TEMPLATES = [
    '訂機票', '訂住宿', '辦簽證', '換匯', '買 eSIM',
    '保旅平險', '收行李', '確認護照效期', '列印訂位確認'
];

if (tripId && shareKey) { init(); }

async function init() {
    try {
        const tripSnap = await getDoc(doc(db, "trips", tripId));
        if (tripSnap.exists() && tripSnap.data().shareKey === shareKey) {
            renderHeader(tripSnap.data());
            setupEvents();
            setupTodos();
            setupDeleteDelegation();
            loadAllData();
            loadTodos();
            document.getElementById('trip-details').style.display = 'block';
        } else {
            document.body.innerHTML = "<div style='text-align:center;padding:100px;'><h1>權限錯誤</h1><a href='index.html'>返回首頁</a></div>";
        }
    } catch (err) { console.error(err); }
}

function renderHeader(data) {
    document.getElementById('trip-title').innerText = data.title;
    document.getElementById('trip-subtitle').innerText = `${data.country} · ${formatDate(data.startDate)} — ${formatDate(data.endDate)}`;
    document.getElementById('inner-hero').style.backgroundImage = `linear-gradient(rgba(26,58,95,0.7), rgba(26,58,95,0.7)), url('${data.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828'}')`;
    renderSummaryCard(data);
}

function renderSummaryCard(data) {
    const statusMap = {
        '規劃中': 'planning', '即將出發': 'upcoming',
        '已完成': 'completed', '已封存': 'archived'
    };
    const days = data.days || (data.startDate && data.endDate
        ? Math.ceil((new Date(data.endDate) - new Date(data.startDate)) / 86400000) + 1
        : '—');
    const tags = Array.isArray(data.tags) ? data.tags
        : (data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : []);

    document.getElementById('trip-summary-display').innerHTML = `
        <div class="summary-item">
            <span class="summary-label">國家 / 城市</span>
            <span class="summary-value">${data.country || '—'}${data.city ? ' · ' + data.city : ''}</span>
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
            <span class="summary-value">${data.companions || '獨旅'}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">狀態</span>
            <span class="summary-value">
                <span class="status-pill ${statusMap[data.status] || 'planning'}">${data.status || '規劃中'}</span>
            </span>
        </div>
        ${data.note ? `
        <div class="summary-item" style="flex-basis: 100%;">
            <span class="summary-label">備註</span>
            <span class="summary-value" style="font-weight:400; color:var(--text-muted);">${data.note}</span>
        </div>` : ''}
        ${tags.length > 0 ? `
        <div class="summary-item" style="flex-basis: 100%;">
            <span class="summary-label">標籤</span>
            <div class="summary-tags">${tags.map(t => `<span class="summary-tag">${t}</span>`).join('')}</div>
        </div>` : ''}
    `;
}

// ✅ 修正：改用 event delegation，不需要掛 window
function setupDeleteDelegation() {
    document.getElementById('trip-details').addEventListener('click', async (e) => {
        // 勾選 todo
        const toggleBtn = e.target.closest('[data-toggle-todo]');
        if (toggleBtn) {
            const todoId = toggleBtn.dataset.toggleTodo;
            const isDone = toggleBtn.classList.contains('checked');
            try {
                await updateDoc(doc(db, `trips/${tripId}/todos`, todoId), {
                    done: !isDone,
                    updatedAt: serverTimestamp(),
                    updatedByName: getUserNickname()
                });
                loadTodos();
            } catch (err) { showToast('更新失敗', 'error'); }
            return;
        }

        // 刪除（通用）
        const btn = e.target.closest('[data-delete-type]');
        if (!btn) return;
        const type = btn.dataset.deleteType;
        const id = btn.dataset.deleteId;
        if (confirm("確定要刪除這筆紀錄嗎？")) {
            try {
                await deleteDoc(doc(db, `trips/${tripId}/${type}`, id));
                if (type === 'todos') loadTodos();
                else loadAllData();
            } catch (err) {
                showToast("刪除失敗", "error");
            }
        }
    });
}

function setupEvents() {
    const modal = document.getElementById('universalModal');
    const modalForm = document.getElementById('modalForm');

    const open = (title, body, type) => {
        document.getElementById('modalTitle').innerText = title;
        document.getElementById('modalBody').innerHTML = body;
        modalForm.dataset.type = type;
        modal.style.display = 'block';
    };

    document.getElementById('closeModal').onclick = () => modal.style.display = 'none';
    window.onclick = (e) => { if (e.target == modal) modal.style.display = 'none'; };

    document.getElementById('addDayBtn').onclick = () => open("新增行程", `
        <div class="form-group"><label>第幾天</label><input type="number" name="day" value="1" min="1" required></div>
        <div class="form-group"><label>時間</label><input type="time" name="time"></div>
        <div class="form-group"><label>活動內容</label><input type="text" name="activity" required placeholder="例如：參觀首里城"></div>
        <div class="form-group"><label>地點</label><input type="text" name="location"></div>
    `, "itinerary");

    document.getElementById('addExpenseBtn').onclick = () => open("新增支出", `
        <div class="form-group"><label>項目名稱</label><input type="text" name="name" required placeholder="例如：機票"></div>
        <div style="display:flex;gap:12px;">
            <div class="form-group" style="flex:1"><label>金額 (TWD)</label><input type="number" name="amount" required min="0"></div>
            <div class="form-group" style="flex:1"><label>分類</label>
                <select name="category">
                    <option value="交通">交通</option>
                    <option value="住宿">住宿</option>
                    <option value="餐飲">餐飲</option>
                    <option value="景點">景點</option>
                    <option value="購物">購物</option>
                    <option value="保險/簽證">保險/簽證</option>
                    <option value="電信費">電信費</option>
                    <option value="其他">其他</option>
                </select>
            </div>
        </div>
        <div class="form-group"><label>付款方式</label>
            <select name="payMethod">
                <option value="刷卡">刷卡</option>
                <option value="現金">現金</option>
                <option value="行動支付">行動支付</option>
                <option value="其他">其他</option>
            </select>
        </div>
        <div class="form-group"><label>備註</label><input type="text" name="note" placeholder="例如：一人 $8790，媽媽先轉帳"></div>
    `, "expenses");

    document.getElementById('addImageBtn').onclick = () => open("新增相片", `
        <div class="form-group"><label>圖片網址 (URL)</label><input type="url" name="url" required placeholder="https://..."></div>
    `, "images");

    document.getElementById('copyLinkBtn').onclick = () => copyToClipboard(window.location.href);

    // 編輯旅程基本資料
    document.getElementById('editTripInfoBtn').onclick = async () => {
        const snap = await getDoc(doc(db, 'trips', tripId));
        const d = snap.data();
        const tags = Array.isArray(d.tags) ? d.tags.join(', ')
            : (d.tags || '');
        open('編輯旅程資料', `
            <div class="form-group"><label>旅程名稱</label><input type="text" name="title" value="${d.title || ''}" required></div>
            <div style="display:flex;gap:12px;">
                <div class="form-group" style="flex:1"><label>國家</label><input type="text" name="country" value="${d.country || ''}"></div>
                <div class="form-group" style="flex:1"><label>城市</label><input type="text" name="city" value="${d.city || ''}"></div>
            </div>
            <div style="display:flex;gap:12px;">
                <div class="form-group" style="flex:1"><label>出發日期</label><input type="date" name="startDate" value="${d.startDate || ''}"></div>
                <div class="form-group" style="flex:1"><label>回程日期</label><input type="date" name="endDate" value="${d.endDate || ''}"></div>
            </div>
            <div class="form-group"><label>旅伴</label><input type="text" name="companions" value="${d.companions || ''}" placeholder="例如：小明、小花"></div>
            <div class="form-group"><label>狀態</label>
                <select name="status">
                    <option value="規劃中" ${d.status==='規劃中'?'selected':''}>規劃中</option>
                    <option value="即將出發" ${d.status==='即將出發'?'selected':''}>即將出發</option>
                    <option value="已完成" ${d.status==='已完成'?'selected':''}>已完成</option>
                    <option value="已封存" ${d.status==='已封存'?'selected':''}>已封存</option>
                </select>
            </div>
            <div class="form-group"><label>封面圖網址</label><input type="url" name="coverImageUrl" value="${d.coverImageUrl || ''}" placeholder="https://..."></div>
            <div class="form-group"><label>標籤（用逗號分隔）</label><input type="text" name="tags" value="${tags}" placeholder="自由行, 美食, 親子"></div>
            <div class="form-group"><label>備註</label><textarea name="note" rows="3" style="width:100%;padding:10px;border:1px solid var(--border-color);border-radius:10px;font-size:0.95rem;resize:vertical;">${d.note || ''}</textarea></div>
        `, 'tripInfo');
    };

    document.getElementById('deleteTripBtn').onclick = async () => {
        if (confirm("⚠️ 確定要刪除整趟旅程嗎？此操作無法復原。")) {
            try {
                await deleteDoc(doc(db, "trips", tripId));
                showToast("旅程已刪除");
                setTimeout(() => { window.location.href = 'index.html'; }, 1000);
            } catch (err) {
                showToast("刪除失敗", "error");
            }
        }
    };

    modalForm.onsubmit = async (e) => {
        e.preventDefault();
        const type = modalForm.dataset.type;
        const data = Object.fromEntries(new FormData(modalForm).entries());

        // 特殊處理：更新旅程主文件
        if (type === 'tripInfo') {
            if (data.tags) {
                data.tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);
            } else {
                data.tags = [];
            }
            data.updatedAt = serverTimestamp();
            data.updatedByName = getUserNickname();
            try {
                await updateDoc(doc(db, 'trips', tripId), data);
                modal.style.display = 'none';
                modalForm.reset();
                showToast("旅程資料已更新 ✓");
                // 重新渲染摘要卡與 Hero
                const snap = await getDoc(doc(db, 'trips', tripId));
                renderHeader(snap.data());
            } catch (err) {
                showToast("儲存失敗", "error");
            }
            return;
        }

        if (data.amount) data.amount = Number(data.amount);
        if (data.day) data.day = Number(data.day);
        data.createdAt = serverTimestamp();
        data.createdByName = getUserNickname();
        try {
            await addDoc(collection(db, `trips/${tripId}/${type}`), data);
            modal.style.display = 'none';
            modalForm.reset();
            showToast("已儲存並同步 ✓");
            if (type === 'todos') loadTodos();
            else loadAllData();
        } catch (err) {
            showToast("儲存失敗", "error");
        }
    };
}

async function loadAllData() {
    loadTodos();
    // --- 行程 ---
    const qI = query(collection(db, `trips/${tripId}/itinerary`), orderBy("day"), orderBy("time"));
    const sI = await getDocs(qI);
    let htmlI = ""; let lastDay = null;
    sI.forEach(d => {
        const item = d.data();
        if (lastDay !== item.day) {
            lastDay = item.day;
            htmlI += `<h3 style="margin-top:25px; margin-bottom:10px; border-left:6px solid var(--primary); padding-left:15px;">Day ${lastDay}</h3>`;
        }
        // ✅ 修正：改用 data-* 屬性，不用 inline onclick
        htmlI += `<div class="itinerary-item">
                    <div><span style="color:var(--accent);">${item.time || '--:--'}</span> <strong>${item.activity}</strong>${item.location ? `<span style="color:var(--text-muted); font-size:0.85rem; font-weight:400;"> · ${item.location}</span>` : ''}</div>
                    <button class="delete-btn-sub" data-delete-type="itinerary" data-delete-id="${d.id}" title="刪除">×</button>
                  </div>`;
    });
    document.getElementById('itinerary-timeline').innerHTML = htmlI || "<p style='color:#ccc; text-align:center; padding:30px 0;'>尚未建立行程</p>";

    // --- 支出 ---
    const sE = await getDocs(collection(db, `trips/${tripId}/expenses`));
    let total = 0; const cats = {}; let htmlE = "";
    sE.forEach(d => {
        const ex = d.data(); const amt = Number(ex.amount) || 0;
        total += amt;
        cats[ex.category] = (cats[ex.category] || 0) + amt;
        const payBadgeClass = ex.payMethod === '現金' ? 'pay-badge cash' : 'pay-badge card';
        htmlE += `<tr>
            <td class="expense-name">${ex.name}</td>
            <td><span class="expense-cat-badge">${ex.category || '其他'}</span></td>
            <td class="expense-amt">$${amt.toLocaleString()}</td>
            <td>${ex.payMethod ? `<span class="${payBadgeClass}">${ex.payMethod}</span>` : '—'}</td>
            <td class="expense-note">${ex.note || ''}</td>
            <td><button class="delete-btn-sub" data-delete-type="expenses" data-delete-id="${d.id}" title="刪除">×</button></td>
        </tr>`;
    });
    document.getElementById('total-expense').innerText = `$${total.toLocaleString()}`;
    const footTotal = document.getElementById('expense-total-foot');
    if (footTotal) footTotal.innerText = `$${total.toLocaleString()}`;
    document.getElementById('expense-list').innerHTML = htmlE ||
        `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px; font-weight:400;">尚無支出紀錄</td></tr>`;
    renderChart(cats);

    // 同步總支出回 trips 主文件
    await updateDoc(doc(db, "trips", tripId), { totalExpense: total });

    // --- 相片 ---
    const sPh = await getDocs(collection(db, `trips/${tripId}/images`));
    let htmlPh = "";
    sPh.forEach(d => {
        // ✅ 修正：改用 data-* 屬性
        htmlPh += `<div style="position:relative; aspect-ratio:1; border-radius:15px; overflow:hidden;">
                    <img src="${d.data().url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.display='none'">
                    <button data-delete-type="images" data-delete-id="${d.id}" style="position:absolute; top:8px; right:8px; background:rgba(255,255,255,0.85); border:none; border-radius:50%; width:28px; height:28px; cursor:pointer; font-size:1rem;" title="刪除">×</button>
                   </div>`;
    });
    document.getElementById('photo-grid').innerHTML = htmlPh || "<p style='color:#ccc; text-align:center; font-size:0.9rem; font-weight:400; padding:20px 0;'>尚無相片</p>";
}


// ===== 待辦清單功能 =====
function setupTodos() {
    // 渲染範本 chips
    const chipsEl = document.getElementById('todo-template-chips');
    if (!chipsEl) return;
    chipsEl.innerHTML = TODO_TEMPLATES.map(t =>
        `<span class="todo-chip" data-template="${t}">${t}</span>`
    ).join('');
    chipsEl.addEventListener('click', async (e) => {
        const chip = e.target.closest('[data-template]');
        if (!chip) return;
        await addTodo(chip.dataset.template);
    });

    // 新增按鈕
    document.getElementById('addTodoBtn').onclick = () => {
        const text = prompt('新增待辦事項：');
        if (text && text.trim()) addTodo(text.trim());
    };
}

async function addTodo(text) {
    try {
        await addDoc(collection(db, `trips/${tripId}/todos`), {
            text,
            done: false,
            order: Date.now(),
            createdAt: serverTimestamp(),
            createdByName: getUserNickname()
        });
        loadTodos();
        showToast(`已新增「${text}」`);
    } catch (err) {
        showToast('新增失敗', 'error');
    }
}

async function loadTodos() {
    const snap = await getDocs(query(collection(db, `trips/${tripId}/todos`), orderBy('order')));
    const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const total = todos.length;
    const done = todos.filter(t => t.done).length;

    // 進度條
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    document.getElementById('todo-progress-bar').style.width = pct + '%';
    document.getElementById('todo-progress-text').innerText =
        total === 0 ? '尚無待辦事項' : `已完成 ${done} / ${total} 項（${pct}%）`;

    // 列表：未完成在前，已完成在後
    const sorted = [...todos.filter(t => !t.done), ...todos.filter(t => t.done)];
    document.getElementById('todo-list').innerHTML = sorted.length === 0
        ? `<p style="color:var(--text-muted); text-align:center; padding:20px 0; font-weight:400;">點擊下方範本快速新增，或按「＋ 新增」自訂</p>`
        : sorted.map(t => `
            <div class="todo-item ${t.done ? 'done' : ''}" data-todo-id="${t.id}">
                <div class="todo-checkbox ${t.done ? 'checked' : ''}" data-toggle-todo="${t.id}"></div>
                <span class="todo-text">${t.text}</span>
                ${t.createdByName ? `<span class="todo-meta">${t.createdByName}</span>` : ''}
                <button class="todo-delete" data-delete-type="todos" data-delete-id="${t.id}" title="刪除">×</button>
            </div>
        `).join('');
}

function renderChart(data) {
    const ctx = document.getElementById('expenseChart');
    if (chartInstance) chartInstance.destroy();
    const colors = ['#1A3A5F', '#E67E22', '#E6D5B8', '#95A5A6', '#2C3E50', '#8E44AD', '#16A085', '#C0392B'];
    const keys = Object.keys(data);
    if (keys.length === 0) return;
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: keys,
            datasets: [{
                data: Object.values(data),
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            cutout: '75%',
            plugins: { legend: { display: false } }
        }
    });
    // 渲染圖例
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    const legend = document.getElementById('expense-cat-legend');
    if (legend) {
        legend.innerHTML = keys.map((k, i) => `
            <div class="expense-cat-legend-item">
                <span class="expense-cat-legend-dot" style="background:${colors[i % colors.length]};"></span>
                <span style="flex:1;">${k}</span>
                <span style="font-weight:600;">$${data[k].toLocaleString()}</span>
                <span style="color:var(--text-muted); margin-left:4px;">(${Math.round(data[k]/total*100)}%)</span>
            </div>
        `).join('');
    }
}
