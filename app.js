// 僅需修改 renderTrips 函數中的 HTML 結構
function renderTrips(trips) {
    if (trips.length === 0) {
        tripGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 100px; color: var(--text-muted);">尚未有旅程檔案。</div>`;
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
                <p style="color: var(--accent); font-size: 0.9rem;">${trip.country} · ${trip.city || ''}</p>
                <p style="color: var(--text-muted); font-size: 0.85rem;">${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</p>
            </div>
        </div>
    `).join('');
}