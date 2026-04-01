import { db } from './firebase-db.js';
import { 
    collection, 
    getDocs, 
    query, 
    orderBy, 
    where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { formatDate, showToast } from './utils.js';

const historyGrid = document.getElementById('historyGrid');
const historySearch = document.getElementById('historySearch');
const yearFilter = document.getElementById('yearFilter');

let archivedTrips = [];

/**
 * 初始化歷史頁面
 */
async function init() {
    await fetchHistoryTrips();
    setupFilters();
}

/**
 * 抓取已完成或已封存的旅程
 */
async function fetchHistoryTrips() {
    try {
        // 只抓取「已完成」與「已封存」的資料
        const q = query(
            collection(db, "trips"), 
            where("status", "in", ["已完成", "已封存"]),
            orderBy("startDate", "desc")
        );
        
        const querySnapshot = await getDocs(q);
        archivedTrips = [];
        const years = new Set();

        querySnapshot.forEach((doc) => {
            const data = { id: doc.id, ...doc.data() };
            archivedTrips.push(data);
            
            // 提取年份供篩選使用
            if (data.startDate) {
                const year = new Date(data.startDate).getFullYear();
                years.add(year);
            }
        });

        renderHistory(archivedTrips);
        populateYearFilter(Array.from(years).sort((a, b) => b - a));
        
    } catch (error) {
        console.error("Error fetching history:", error);
        historyGrid.innerHTML = `<div class="empty-state">目前還沒有歷史紀錄。</div>`;
    }
}

/**
 * 渲染卡片 (樣式與首頁保持一致，但增加年份標記)
 */
function renderHistory(trips) {
    if (trips.length === 0) {
        historyGrid.innerHTML = `<div class="empty-state">尚未有已完成的旅程存檔。</div>`;
        return;
    }

    historyGrid.innerHTML = trips.map(trip => `
        <div class="trip-card" onclick="window.location.href='trip.html?id=${trip.id}&key=${trip.shareKey}'" style="opacity: 0.9;">
            <img src="${trip.coverImageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800'}" class="trip-cover" style="filter: grayscale(20%);">
            <div class="status-badge" style="background: var(--primary); color: white;">${trip.status}</div>
            <div class="trip-info">
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700;">
                    ${new Date(trip.startDate).getFullYear()} ARCHIVE
                </span>
                <h3 style="margin-top: 5px;">${trip.title}</h3>
                <p class="trip-meta">${trip.country} · ${trip.city || ''}</p>
                <p class="trip-date">${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</p>
            </div>
        </div>
    `).join('');
}

/**
 * 動態產生年份下拉選單
 */
function populateYearFilter(years) {
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `${year} 年`;
        yearFilter.appendChild(option);
    });
}

/**
 * 篩選邏輯
 */
function setupFilters() {
    const handleFilter = () => {
        const term = historySearch.value.toLowerCase();
        const selectedYear = yearFilter.value;

        const filtered = archivedTrips.filter(trip => {
            const matchTerm = trip.title.toLowerCase().includes(term) || 
                              trip.country.toLowerCase().includes(term);
            const tripYear = new Date(trip.startDate).getFullYear().toString();
            const matchYear = selectedYear === 'all' || tripYear === selectedYear;
            
            return matchTerm && matchYear;
        });
        renderHistory(filtered);
    };

    historySearch.addEventListener('input', handleFilter);
    yearFilter.addEventListener('change', handleFilter);
}

init();