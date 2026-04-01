import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import firebaseConfig from "./firebase-config.js";

// 初始化 Firebase 應用程式
const app = initializeApp(firebaseConfig);

// 匯出資料庫與儲存空間實例
const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };