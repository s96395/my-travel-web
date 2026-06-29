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
let authUiStarted = false;

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

function initAuthUI() {
    if (authUiStarted) return;
    authUiStarted = true;

    const authArea = ensureAuthArea();
    if (!authArea) return;

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            currentUserProfile = null;
            renderLoggedOut(authArea);
            return;
        }

        currentUserProfile = await createOrUpdateUser(user);
        renderLoggedIn(authArea, currentUserProfile);
    });
}

function ensureAuthArea() {
    let authArea = document.getElementById('authArea');
    if (authArea) return authArea;

    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return null;

    authArea = document.createElement('div');
    authArea.id = 'authArea';
    authArea.className = 'auth-area';
    navLinks.prepend(authArea);
    return authArea;
}

function renderLoggedOut(authArea) {
    authArea.innerHTML = `<button class="btn btn-outline auth-login-btn" type="button">使用 Google 登入</button>`;
    authArea.querySelector('.auth-login-btn').onclick = async () => {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    };
}

function renderLoggedIn(authArea, profile) {
    authArea.innerHTML = `
        <span class="auth-nickname"></span>
        <button class="btn btn-outline auth-logout-btn" type="button">登出</button>
    `;
    authArea.querySelector('.auth-nickname').textContent = `Hi, ${profile.nickname}`;
    authArea.querySelector('.auth-logout-btn').onclick = () => signOut(auth);
}

async function createOrUpdateUser(user) {
    const userRef = doc(db, 'users', user.uid);
    const snapshot = await getDoc(userRef);
    const existing = snapshot.exists() ? snapshot.data() : {};
    let nickname = existing.nickname;

    if (!nickname) {
        nickname = prompt('第一次登入，請輸入你的顯示名稱（暱稱）：')?.trim();
        if (!nickname) nickname = user.displayName || '旅人';
    }

    const profile = {
        uid: user.uid,
        email: user.email || '',
        nickname,
        photoURL: user.photoURL || '',
        updatedAt: serverTimestamp(),
    };

    if (!snapshot.exists()) {
        profile.createdAt = serverTimestamp();
    }

    await setDoc(userRef, profile, { merge: true });
    localStorage.setItem('travel_user_name', nickname);

    return {
        uid: user.uid,
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

initAuthUI();
