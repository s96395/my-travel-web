import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signInWithCredential, signOut, onAuthStateChanged, reauthenticateWithPopup, deleteUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, envName } from './firebase.js';

export const watchUser = cb => onAuthStateChanged(auth, cb);

export async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    // 有些瀏覽器（例如加到主畫面後的 iPhone）擋掉彈出視窗，改用整頁轉址
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

// 只在本機模擬環境：自動化測試用假的 Google 帳號登入（模擬器接受任意內容）
export function exposeTestSignIn() {
  if (envName !== 'emulator') return;
  window.__testSignIn = (sub, email, name) =>
    signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true, name })));
}

export const logOut = () => signOut(auth);

// 刪除帳號前請 Google 再確認一次身分；擋掉彈出視窗的瀏覽器先跳過，最後刪帳號時若要求重新登入再提示
export async function confirmIdentity() {
  if (envName === 'emulator') return;
  try {
    await reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider());
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') return;
    throw err;
  }
}
export const removeAccount = () => deleteUser(auth.currentUser);

// 舊版存在 users/{uid} 的暱稱；沒有時用 Google 名稱
export async function nicknameOf(user) {
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const nick = snap.exists() ? snap.data().nickname : '';
    return nick || user.displayName || '旅人';
  } catch {
    return user.displayName || '旅人';
  }
}
