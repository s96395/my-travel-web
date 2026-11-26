// Firebase 初始化。設定一律在啟動時從網路讀取（規格書 P09），讀不到就停止，不會改連其他環境
import { initializeApp } from 'firebase/app';
import { initializeAuth, browserLocalPersistence, indexedDBLocalPersistence, browserSessionPersistence, browserPopupRedirectResolver, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// mapsKey：Google 地圖（Maps JavaScript API）用的金鑰，沒設定時地圖區塊只顯示提示
export let auth, db, envName, mapsKey = '';

// Google 登入的中繼頁改走本站網址（vercel.json 轉給 firebaseapp.com）。
// 中繼頁和網站同一個網域，iPhone Safari 擋跨網站資料時，登入回來才讀得到原本的狀態。
// 只有這兩個網址已在 Google Cloud 加了重新導向 URI，其他預覽網址照舊用 firebaseapp.com
const OWN_AUTH_HOSTS = ['my-travel-web-pi.vercel.app', 'my-travel-web-git-next-yshen-s-projects.vercel.app'];

export async function initFirebase() {
  const res = await fetch('/firebase-config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('config-missing');
  const cfg = await res.json();
  if (!cfg.projectId || !cfg.apiKey) throw new Error('config-missing');
  const { env, emulator, appCheckSiteKey, mapsKey: key, ...options } = cfg;
  mapsKey = key || '';
  if (!emulator && OWN_AUTH_HOSTS.includes(location.hostname)) options.authDomain = location.host;
  const app = initializeApp(options);
  // App Check：設定檔有 reCAPTCHA 網站金鑰時才啟用，只讓本站送出的要求能讀寫資料
  if (appCheckSiteKey && !emulator) initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  // 登入狀態先存 localStorage：iPhone 加到主畫面的 App 關掉再開時，IndexedDB 裡的登入狀態可能讀不到
  auth = initializeAuth(app, { persistence: [browserLocalPersistence, indexedDBLocalPersistence, browserSessionPersistence], popupRedirectResolver: browserPopupRedirectResolver });
  db = getFirestore(app);
  envName = env || 'production';
  if (emulator) {
    connectAuthEmulator(auth, emulator.auth, { disableWarnings: true });
    connectFirestoreEmulator(db, emulator.firestoreHost, emulator.firestorePort);
  }
  return envName;
}
