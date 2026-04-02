import { db } from './firebase-db.js';
import { 
    doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, 
    query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserNickname, showToast, formatDate, copyToClipboard } from './utils.js';

const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
const shareKey = urlParams.get('key');
let chartInstance = null;

if (tripId && shareKey) { init(); }

async function init() {
    try {
        const tripSnap = await getDoc(doc(db, "trips", tripId));
        if (tripSnap.exists() && tripSnap.data().shareKey === shareKey) {
            renderHeader(tripSnap.data());
            setupEvents();
            setupDeleteDelegation(); // 用 event delegation 取代 window.deleteSubItem
            loadAllData();
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
}

// ✅ 修正：改用 event delegation，不需要掛 window
function setupDeleteDelegation() {
    document.getElementById('trip-details').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-delete-type]');
        if (!btn) return;
        const type = btn.dataset.deleteType;
        const id = btn.dataset.deleteId;
        if (confirm("確定要刪除這筆紀錄嗎？")) {
            try {
                await deleteDoc(doc(db, `trips/${tripId}/${type}`, id));
                loadAllData();
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

    document.getElementById('addExpenseBtn').onclick = () => open("紀錄支出", `
        <div class="form-group"><label>項目名稱</label><input type="text" name="name" required></div>
        <div class="form-group"><label>金額 (TWD)</label><input type="number" name="amount" required min="0"></div>
        <div class="form-group"><label>分類</label>
            <select name="category">
                <option value="餐飲">餐飲</option>
                <option value="交通">交通</option>
                <option value="住宿">住宿</option>
                <option value="購物">購物</option>
                <option value="其他">其他</option>
            </select>
        </div>
    `, "expenses");

    document.getElementById('addImageBtn').onclick = () => open("新增相片", `
        <div class="form-group"><label>圖片網址 (URL)</label><input type="url" name="url" required placeholder="https://..."></div>
    `, "images");

    document.getElementById('copyLinkBtn').onclick = () => copyToClipboard(window.location.href);

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
        if (data.amount) data.amount = Number(data.amount);
        if (data.day) data.day = Number(data.day);
        data.createdAt = serverTimestamp();
        data.createdByName = getUserNickname();
        try {
            await addDoc(collection(db, `trips/${tripId}/${type}`), data);
            modal.style.display = 'none';
            showToast("已儲存並同步 ✓");
            loadAllData();
        } catch (err) {
            showToast("儲存失敗", "error");
        }
    };
}

async function loadAllData() {
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
        // ✅ 修正：改用 data-* 屬性
        htmlE += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span>💸 ${ex.name} <small style="color:var(--text-muted); font-weight:400;">(${ex.category})</small></span>
                    <span style="display:flex; align-items:center; gap:8px;">$${amt.toLocaleString()}
                        <button data-delete-type="expenses" data-delete-id="${d.id}" style="border:none;background:none;color:#ccc;cursor:pointer;font-size:1rem;" title="刪除">×</button>
                    </span>
                  </div>`;
    });
    document.getElementById('total-expense').innerText = `$${total.toLocaleString()}`;
    document.getElementById('expense-list').innerHTML = htmlE || "<p style='color:#ccc; text-align:center; font-size:0.9rem; font-weight:400;'>尚無支出紀錄</p>";
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

function renderChart(data) {
    const ctx = document.getElementById('expenseChart');
    if (chartInstance) chartInstance.destroy();
    if (Object.keys(data).length === 0) return;
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: ['#1A3A5F', '#E67E22', '#E6D5B8', '#95A5A6', '#2C3E50'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            cutout: '75%',
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 12 } } } }
        }
    });
}
