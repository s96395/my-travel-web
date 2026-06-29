import { auth, db } from './firebase-db.js';
import {
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUserProfile = null;
let authUiInitialized = false;

export function generateShareKey() {
    return Math.random().toString(36).substring(2, 10);
}

export function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function getUserNickname() {
    if (currentUserProfile?.nickname) return currentUserProfile.nickname;

    let name = localStorage.getItem('travel_user_name');
    if (!name) {
        name = "旅人";
        localStorage.setItem('travel_user_name', name);
    }
    return name;
}

export function getCurrentUserProfile() {
    return currentUserProfile;
}

export function initAuthUI() {
    if (authUiInitialized) return;
    authUiInitialized = true;

    const authArea = document.getElementById('authArea');
    if (!authArea) return;

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            currentUserProfile = null;
            renderSignedOut(authArea);
            return;
        }

        try {
            currentUserProfile = await createOrUpdateUserProfile(user);
            renderSignedIn(authArea, currentUserProfile);
        } catch (error) {
            console.error('[authProfile]', error);
            showToast('登入資料同步失敗，請稍後再試。', 'error');
            renderSignedOut(authArea);
        }
    });
}

function renderSignedOut(authArea) {
    authArea.innerHTML = `<button class="btn btn-outline auth-login-btn" type="button">使用 Google 登入</button>`;
    authArea.querySelector('.auth-login-btn').onclick = signInWithGoogle;
}

function renderSignedIn(authArea, profile) {
    authArea.innerHTML = `
        <span class="auth-nickname">Hi, ${escapeHtml(profile.nickname)}</span>
        <button class="btn btn-outline auth-logout-btn" type="button">登出</button>
    `;
    authArea.querySelector('.auth-logout-btn').onclick = async () => {
        await signOut(auth);
        showToast('已登出');
    };
}

async function signInWithGoogle() {
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error('[googleLogin]', error);
        showToast('Google 登入失敗，請稍後再試。', 'error');
    }
}

async function createOrUpdateUserProfile(user) {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const existing = snap.exists() ? snap.data() : {};
    let nickname = existing.nickname;

    if (!nickname) {
        nickname = prompt('第一次登入，請輸入你想顯示給旅伴看的暱稱：')?.trim();
        if (!nickname) nickname = user.displayName || '旅人';
    }

    const profile = {
        uid: user.uid,
        email: user.email || '',
        nickname,
        photoURL: user.photoURL || '',
        updatedAt: serverTimestamp(),
    };

    if (!snap.exists()) {
        profile.createdAt = serverTimestamp();
    }

    await setDoc(userRef, profile, { merge: true });
    localStorage.setItem('travel_user_name', nickname);

    return {
        uid: user.uid,
        email: user.email || '',
        nickname,
        photoURL: user.photoURL || '',
    };
}

export function showToast(message, type = 'success') {
    const bg = type === 'error' ? '#e74c3c' : 'var(--primary)';
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:${bg}; color:white; padding:12px 25px; border-radius:50px; z-index:9999; font-weight:bold; box-shadow:0 5px 15px rgba(0,0,0,0.2); transition:opacity 0.5s;`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 3000);
}

const ERROR_MESSAGES = {
    default: '操作失敗，請稍後再試。',
    loadTrips: '旅程列表載入失敗，請稍後再試。',
    createTrip: '旅程建立失敗，請稍後再試。',
    loadHistory: '歷史紀錄載入失敗，請稍後再試。',
    loadTrip: '旅程載入失敗，請稍後再試。',
    updateTodo: '待辦更新失敗，請稍後再試。',
    deleteRecord: '紀錄刪除失敗，請稍後再試。',
    deleteTrip: '旅程刪除失敗，請稍後再試。',
    saveRecord: '資料儲存失敗，請稍後再試。',
    addTodo: '待辦新增失敗，請稍後再試。',
};

const FIREBASE_ERROR_MESSAGES = {
    'permission-denied': '沒有操作權限，請確認連結或 Firebase 權限設定。',
    unavailable: '目前無法連線到 Firebase，請檢查網路後再試。',
    'failed-precondition': '資料庫索引尚未建立或查詢條件不符合目前設定。',
    'not-found': '找不到指定資料，請重新整理後再試。',
};

export function getErrorMessage(context = 'default', error) {
    return FIREBASE_ERROR_MESSAGES[error?.code] || ERROR_MESSAGES[context] || ERROR_MESSAGES.default;
}

export function showErrorToast(context, error) {
    console.error(`[${context}]`, error);
    showToast(getErrorMessage(context, error), 'error');
}

export const TRIP_TYPE_OPTIONS = ['自由行', '跟團', '潛旅'];
export const TRIP_STATUS_OPTIONS = ['規劃中', '即將出發', '已完成', '已封存'];

const DEFAULT_TEXT_LIMIT = 200;
const TEXT_FIELD_LIMITS = {
    title: 100,
    country: 80,
    city: 80,
    companions: 200,
    note: 1000,
    activity: 120,
    location: 120,
    name: 120,
    category: 40,
    payMethod: 40,
    diveSite: 120,
    tourCompany: 120,
    guideId: 80,
    guidePhone: 40,
    meetingPoint: 200,
    tourNote: 1000,
    airline: 80,
    flightCode: 40,
    depAirport: 120,
    retAirport: 120,
    hotelName: 120,
    hotelAddr: 200,
    hotelCode: 60,
    coverImageUrl: 2048,
    url: 2048,
};

const FIELD_LABELS = {
    tripType: '旅程類型',
    status: '旅程狀態',
};

export function normalizeFormData(data) {
    return Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
            key,
            typeof value === 'string' ? value.trim() : value,
        ])
    );
}

export function validateFormData(data, rules = {}) {
    const textError = validateTextLength(data, rules.textFields);
    if (textError) return textError;

    if (rules.dateRange && data.startDate && data.endDate && data.startDate > data.endDate) {
        return '開始日期不可晚於結束日期。';
    }

    for (const field of rules.nonNegativeFields || []) {
        if (data[field] !== undefined && data[field] !== '' && Number(data[field]) < 0) {
            return '金額不可小於 0。';
        }
    }

    for (const [field, options] of Object.entries(rules.enumFields || {})) {
        if (!data[field] || !options.includes(data[field])) {
            return `${FIELD_LABELS[field] || field} 必須是既有選項。`;
        }
    }

    for (const field of rules.urlFields || []) {
        if (data[field] && !isValidHttpUrl(data[field])) {
            return 'URL 必須是合法的 http/https 網址。';
        }
    }

    return '';
}

function validateTextLength(data, fields) {
    const entries = fields
        ? Object.entries(fields)
        : Object.keys(data).map(field => [field, TEXT_FIELD_LIMITS[field] || DEFAULT_TEXT_LIMIT]);

    for (const [field, limit] of entries) {
        const value = data[field];
        if (typeof value === 'string' && value.length > limit) {
            return `文字欄位不可超過 ${limit} 字。`;
        }
    }

    return '';
}

function isValidHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function safeUrl(value, fallback = '') {
    if (!value) return fallback;
    try {
        const url = new URL(value, window.location.href);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return url.href;
        }
    } catch {
        // Fall through to fallback.
    }
    return fallback;
}

export function safeCssUrl(value, fallback = '') {
    return `url(${JSON.stringify(safeUrl(value, fallback))})`;
}

export async function copyToClipboard(text) {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
        document.execCommand('copy');
        showToast("分享連結已成功複製！");
    } catch (err) {
        showToast("複製失敗，請手動選取網址");
    }
    document.body.removeChild(input);
}
