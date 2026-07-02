import { db } from './firebase-db.js';
import {
    doc, getDoc, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    requireLoginBeforeLoad, formatDate, escapeHtml, showToast, getErrorMessage
} from './utils.js';

const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
const shareKey = urlParams.get('key');
const joinContent = document.getElementById('join-content');

let currentUser = null;
let currentTripData = null;

if (tripId && shareKey) {
    init();
} else {
    renderError('缺少邀請連結資訊，請確認網址是否完整。');
}

async function init() {
    currentUser = await requireLoginBeforeLoad();

    try {
        const tripSnap = await getDoc(doc(db, 'trips', tripId));

        if (!tripSnap.exists()) {
            renderError('找不到此旅程，請確認邀請連結是否正確。');
            return;
        }

        const trip = tripSnap.data();
        if (trip.shareKey !== shareKey) {
            renderError('邀請金鑰不正確，請確認你使用的是最新的共編邀請連結。');
            return;
        }

        currentTripData = trip;
        renderJoinPage(currentTripData);
    } catch (error) {
        console.error('[joinTrip]', error);
        renderError(getErrorMessage('loadTrip', error));
    }
}

function renderJoinPage(trip) {
    const alreadyJoined = isCurrentUserMember(trip);
    const locationText = [trip.country, trip.city].filter(Boolean).join(' / ') || '尚未設定地點';
    const dateText = [formatDate(trip.startDate), formatDate(trip.endDate)].filter(Boolean).join(' - ') || '尚未設定日期';

    joinContent.innerHTML = `
        <p style="color:var(--accent);font-weight:700;margin-bottom:10px;">旅程共編邀請</p>
        <h1 style="color:var(--primary);font-size:2rem;margin-bottom:18px;">${escapeHtml(trip.title || '未命名旅程')}</h1>
        <div style="display:grid;gap:12px;text-align:left;background:var(--bg);border-radius:var(--radius);padding:22px;margin-bottom:24px;">
            <div><strong style="color:var(--primary);">國家 / 城市：</strong>${escapeHtml(locationText)}</div>
            <div><strong style="color:var(--primary);">日期：</strong>${escapeHtml(dateText)}</div>
            <div><strong style="color:var(--primary);">建立者：</strong>${escapeHtml(trip.ownerName || '旅程建立者')}</div>
        </div>
        ${alreadyJoined ? renderAlreadyJoinedActions() : renderJoinActions()}
    `;

    if (alreadyJoined) {
        document.getElementById('goTripBtn').onclick = goToTrip;
    } else {
        document.getElementById('joinTripBtn').onclick = joinTrip;
    }
}

function renderJoinActions() {
    return `
        <p style="color:var(--text-muted);margin-bottom:18px;">加入後即可與旅伴一起查看與編輯這趟旅程。</p>
        <button class="btn btn-primary" id="joinTripBtn" type="button" style="width:100%;justify-content:center;">加入旅程</button>
    `;
}

function renderAlreadyJoinedActions() {
    return `
        <p style="color:var(--primary);font-weight:700;margin-bottom:18px;">你已經加入此旅程</p>
        <button class="btn btn-primary" id="goTripBtn" type="button" style="width:100%;justify-content:center;">前往旅程</button>
    `;
}

async function joinTrip() {
    const joinButton = document.getElementById('joinTripBtn');
    joinButton.disabled = true;
    joinButton.innerText = '加入中...';

    try {
        await updateDoc(doc(db, 'trips', tripId), {
            memberIds: arrayUnion(currentUser.uid),
        });
        showToast('已加入旅程');
        goToTrip();
    } catch (error) {
        console.error('[joinTrip]', error);
        renderError(getErrorMessage('saveRecord', error));
    }
}

function isCurrentUserMember(trip) {
    return Array.isArray(trip.memberIds) && trip.memberIds.includes(currentUser?.uid);
}

function goToTrip() {
    window.location.href = `trip.html?id=${encodeURIComponent(tripId)}&key=${encodeURIComponent(shareKey)}`;
}

function renderError(message) {
    joinContent.innerHTML = `
        <h1 style="color:var(--primary);margin-bottom:12px;">無法加入旅程</h1>
        <p style="color:var(--text-muted);margin-bottom:24px;">${escapeHtml(message)}</p>
        <a href="index.html" class="btn btn-primary" style="justify-content:center;">返回首頁</a>
    `;
}
