// Firebase 初始化。設定一律在啟動時從網路讀取（規格書 P09），讀不到就停止，不會改連其他環境
import { initializeApp } from 'firebase/app';
import { initializeAuth, browserLocalPersistence, indexedDBLocalPersistence, browserPopupRedirectResolver, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

export let auth, db, envName;

export async function initFirebase() {
  const res = await fetch('/firebase-config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('config-missing');
  const cfg = await res.json();
  if (!cfg.projectId || !cfg.apiKey) throw new Error('config-missing');
  const { env, emulator, ...options } = cfg;
  const app = initializeApp(options);
  // 登入狀態先存 localStorage：iPhone 加到主畫面的 App 關掉再開時，IndexedDB 裡的登入狀態可能讀不到
  auth = initializeAuth(app, { persistence: [browserLocalPersistence, indexedDBLocalPersistence], popupRedirectResolver: browserPopupRedirectResolver });
  db = getFirestore(app);
  envName = env || 'production';
  if (emulator) {
    connectAuthEmulator(auth, emulator.auth, { disableWarnings: true });
    connectFirestoreEmulator(db, emulator.firestoreHost, emulator.firestorePort);
  }
  return envName;
}
