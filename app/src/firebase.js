// Firebase 初始化。設定一律在啟動時從網路讀取（規格書 P09），讀不到就停止，不會改連其他環境
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

export let auth, db, envName;

export async function initFirebase() {
  const res = await fetch('/firebase-config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('config-missing');
  const cfg = await res.json();
  if (!cfg.projectId || !cfg.apiKey) throw new Error('config-missing');
  const { env, emulator, ...options } = cfg;
  const app = initializeApp(options);
  auth = getAuth(app);
  db = getFirestore(app);
  envName = env || 'production';
  if (emulator) {
    connectAuthEmulator(auth, emulator.auth, { disableWarnings: true });
    connectFirestoreEmulator(db, emulator.firestoreHost, emulator.firestorePort);
  }
  return envName;
}
