# VoyageArchive｜自由行旅遊規劃與共編旅程系統

一個長期可用的旅遊規劃網站。每次出國自由行都可以在這裡新增旅程、規劃每日行程、管理花費、保存旅程圖片，並透過分享連結讓旅伴一起共編行程。

---

## 目錄

1. [專案簡介](#1-專案簡介)
2. [技術架構](#2-技術架構)
3. [Firebase Console 設定](#3-firebase-console-設定)
4. [建立 Firestore Database](#4-建立-firestore-database)
5. [啟用 Firebase Storage](#5-啟用-firebase-storage)
6. [部署 Firestore 與 Storage 規則](#6-部署-firestore-與-storage-規則)
7. [firebase-config.js 說明](#7-firebase-configjs-說明)
8. [Firestore 資料結構](#8-firestore-資料結構)
9. [shareKey 共編機制說明](#9-sharekey-共編機制說明)
10. [可自訂選項系統說明](#10-可自訂選項系統說明)
11. [如何新增示範資料](#11-如何新增示範資料)
12. [部署到 GitHub Pages](#12-部署到-github-pages)
13. [路徑調整說明](#13-路徑調整說明)
14. [哪些檔案要放入 Repository](#14-哪些檔案要放入-repository)
15. [圖片使用策略](#15-圖片使用策略)
16. [常見錯誤排查](#16-常見錯誤排查)
17. [未來升級方向](#17-未來升級方向)

---

## 1. 專案簡介

VoyageArchive 是一個以「旅遊品牌感」為設計方向的個人旅遊規劃工具，定位為：

- **旅程規劃工具**：建立旅程、每日行程、待辦事項、支出管理
- **旅程展示頁**：每筆旅程有視覺感的詳情頁，像旅行作品集
- **歷史旅遊資料館**：長期保存不同國家、年份的旅程，方便回顧查詢
- **共編工具**：透過分享連結讓旅伴一起編輯行程與支出

---

## 2. 技術架構

| 項目 | 說明 |
|------|------|
| 前端 | 純 HTML + CSS + Vanilla JavaScript |
| 模組系統 | ES Modules（`type="module"`） |
| 後端資料庫 | Firebase Cloud Firestore |
| 圖片儲存 | Firebase Storage |
| 部署方式 | GitHub Pages（靜態頁面，不需 build） |
| 登入機制 | 無（使用 shareKey 連結共編） |

**無需任何 npm install 或 build 流程**，直接把檔案放上 GitHub 即可運作。

---

## 3. Firebase Console 設定

### 3.1 建立 Firebase 專案

本專案已使用以下 Firebase 專案，若要使用自己的專案請自行替換 `firebase-config.js`：

- 專案 ID：`my-travel-app-af5e5`
- 已啟用：Firestore Database、Firebase Storage

### 3.2 需要在 Firebase Console 啟用的功能

前往 [Firebase Console](https://console.firebase.google.com/)，確認以下項目已啟用：

1. **Firestore Database**（見第 4 節）
2. **Firebase Storage**（見第 5 節）
3. **已授權網域**：前往「Authentication → 設定 → 已授權網域」，加入你的 GitHub Pages 網域（例如 `yourusername.github.io`）

> 注意：即使不使用登入功能，Firebase SDK 仍需要「已授權網域」才能存取 Firestore 與 Storage。

---

## 4. 建立 Firestore Database

1. 進入 Firebase Console → 選擇你的專案
2. 左側選單點選「Firestore Database」
3. 點選「建立資料庫」
4. 選擇「以測試模式啟動」（之後再套用本專案的 rules）
5. 選擇資料庫位置（建議選 `asia-east1` 台灣最近）
6. 完成後，將 `firestore.rules` 內容貼入「規則」分頁

---

## 5. 啟用 Firebase Storage

1. 進入 Firebase Console → 選擇你的專案
2. 左側選單點選「Storage」
3. 點選「開始使用」
4. 選擇「以測試模式啟動」（之後再套用本專案的 rules）
5. 選擇儲存空間位置
6. 完成後，將 `storage.rules` 內容貼入「規則」分頁

---

## 6. 部署 Firestore 與 Storage 規則

### 方法一：Firebase Console 手動貼入（建議新手）

**Firestore 規則：**
1. 進入 Firestore Database → 點選「規則」分頁
2. 將 `firestore.rules` 的內容完整貼入
3. 點選「發布」

**Storage 規則：**
1. 進入 Storage → 點選「規則」分頁
2. 將 `storage.rules` 的內容完整貼入
3. 點選「發布」

### 方法二：Firebase CLI 部署

```bash
# 安裝 Firebase CLI
npm install -g firebase-tools

# 登入
firebase login

# 初始化（選擇 Firestore 與 Storage）
firebase init

# 部署規則
firebase deploy --only firestore:rules,storage:rules
```

---

## 7. firebase-config.js 說明

`firebase-config.js` 存放 Firebase 專案的連線設定，由 `firebase-db.js` 引入並初始化。

```javascript
// firebase-config.js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
  measurementId: "..."
};
export default firebaseConfig;
```

**⚠️ 安全性說明：**
Firebase 前端 config 的 `apiKey` 並非後端私鑰，是公開識別碼，放在前端原始碼是正常做法。真正的安全性控管來自 Firestore Rules 與 Storage Rules，以及 Firebase Console 的「已授權網域」設定。

如果你要換成自己的 Firebase 專案，只需替換 `firebase-config.js` 裡的設定即可，其他檔案不需要改動。

---

## 8. Firestore 資料結構

### trips（主集合）
每筆旅程的主要資訊。

```
trips/{tripId}
  ├── title          String    旅程名稱
  ├── country        String    國家
  ├── city           String    城市
  ├── startDate      String    開始日期（YYYY-MM-DD）
  ├── endDate        String    結束日期（YYYY-MM-DD）
  ├── days           Number    天數
  ├── companions     String    旅伴
  ├── note           String    備註
  ├── summary        String    旅程摘要
  ├── coverImageUrl  String    封面圖網址
  ├── mapImageUrl    String    地圖圖網址
  ├── status         String    狀態（規劃中 / 即將出發 / 已完成 / 已封存）
  ├── tags           Array     標籤陣列
  ├── shareKey       String    共編金鑰（隨機產生）
  ├── archived       Boolean   是否封存
  ├── totalExpense   Number    總支出（由 trip.js 自動同步）
  ├── createdAt      Timestamp 建立時間
  ├── updatedAt      Timestamp 最後更新時間
  ├── createdByName  String    建立者暱稱
  └── updatedByName  String    最後更新者暱稱
```

### trips/{tripId}/todos（待辦清單）
```
todos/{todoId}
  ├── text           String    待辦事項文字
  ├── done           Boolean   是否完成
  ├── order          Number    排序（用 Date.now() 產生）
  ├── createdAt      Timestamp
  ├── updatedAt      Timestamp
  ├── createdByName  String
  └── updatedByName  String
```

### trips/{tripId}/expenses（支出記錄）
```
expenses/{expenseId}
  ├── name           String    項目名稱
  ├── category       String    分類（餐飲 / 交通 / 住宿 / 購物 / 其他...）
  ├── amount         Number    金額
  ├── paymentMethod  String    付款方式（現金 / 信用卡 / 其他）
  ├── note           String    備註
  ├── included       Boolean   是否納入統計（預設 true）
  ├── createdAt      Timestamp
  ├── updatedAt      Timestamp
  ├── createdByName  String
  └── updatedByName  String
```

### trips/{tripId}/itinerary（每日行程，目前版本）
```
itinerary/{itemId}
  ├── day            Number    第幾天
  ├── time           String    時間（HH:MM）
  ├── activity       String    活動內容
  ├── location       String    地點
  ├── order          Number    排序
  ├── createdAt      Timestamp
  └── createdByName  String
```

> 未來版本規劃升級為 `itineraryDays/{dayId}/items/{itemId}` 兩層結構，以支援拖曳排序與每天獨立標題。

### trips/{tripId}/images（旅程圖片）
```
images/{imageId}
  ├── type           String    圖片類型（cover / map / spot / food / hotel / other）
  ├── title          String    圖片標題
  ├── imageUrl       String    圖片網址（或上傳後的 downloadURL）
  ├── storagePath    String    Firebase Storage 路徑（預留）
  ├── note           String    備註
  ├── createdAt      Timestamp
  ├── updatedAt      Timestamp
  ├── createdByName  String
  └── updatedByName  String
```

### trips/{tripId}/flights（航班資訊）
```
flights/{flightId}
  ├── type           String    departure（去程）/ return（回程）
  ├── airline        String    航空公司
  ├── flightNumber   String    航班號碼
  ├── departAirport  String    出發機場
  ├── arriveAirport  String    抵達機場
  ├── departTime     String    出發時間
  ├── arriveTime     String    抵達時間
  ├── note           String    備註
  ├── createdAt      Timestamp
  └── createdByName  String
```

### trips/{tripId}/accommodations（住宿資訊）
```
accommodations/{accommodationId}
  ├── name           String    住宿名稱
  ├── address        String    地址
  ├── checkInDate    String    入住日期
  ├── checkOutDate   String    退房日期
  ├── bookingPlatform String   訂房平台（Booking.com / Agoda...）
  ├── bookingCode    String    訂單號碼
  ├── note           String    備註
  ├── createdAt      Timestamp
  └── createdByName  String
```

---

## 9. shareKey 共編機制說明

### 運作原理

本系統不使用帳號登入，改用「連結即權限」的共編方式：

1. 建立旅程時，系統自動產生一組隨機 `shareKey`（8 位英數字）
2. 旅程連結格式為：`trip.html?id=TRIP_ID&key=SHARE_KEY`
3. 進入 trip.html 時，前端會比對 URL 的 `key` 與 Firestore 中的 `shareKey`
4. 比對正確才顯示旅程內容，否則顯示「權限錯誤」

### 如何分享給旅伴

在旅程詳情頁點選「複製分享連結」按鈕，即可取得完整連結，直接傳給旅伴即可。

### 安全性說明

⚠️ 此模式為「連結即權限」，請注意：
- 持有連結的人可以**查看與編輯**整趟旅程
- 不適合存放護照號碼、信用卡資訊等敏感資料
- 若要撤銷某人的存取權，目前版本需手動在 Firestore 修改 `shareKey`
- 此機制適合與信任的旅伴共享，不適合公開分享

---

## 10. 可自訂選項系統說明

### 目前版本（v1）

目前以下選項採用程式碼內建預設值：

| 選項類型 | 預設值 | 位置 |
|----------|--------|------|
| 旅程狀態 | 規劃中 / 即將出發 / 已完成 / 已封存 | `index.html` 表單 |
| 支出類別 | 餐飲 / 交通 / 住宿 / 購物 / 其他 | `trip.js` |
| Todo 範本 | 訂機票 / 訂住宿 / 辦簽證... | `trip.js` 的 `TODO_TEMPLATES` |

### 未來版本（v2，規劃中）

計劃在 Firestore 建立 `optionSets` 集合，讓所有選項可在介面上自行管理：

```
optionSets/{key}
  ├── key      String    識別鍵（如 expenseCategories）
  ├── label    String    顯示名稱（如 支出類別）
  ├── items    Array     選項陣列（如 ["餐飲","交通","住宿"]）
  └── updatedAt Timestamp
```

屆時前台表單會從 Firestore 動態讀取選項，不再硬寫於程式碼中，並提供管理介面增刪改。

---

## 11. 如何新增示範資料

### 方法一：直接在 Firebase Console 手動建立

前往 Firestore Database → 點選「開始收藏」→ 選擇 `trips`，建立如下範例：

**範例旅程 1：2026 沖繩**
```json
{
  "title": "2026 初夏沖繩之旅",
  "country": "日本",
  "city": "那霸",
  "startDate": "2026-03-20",
  "endDate": "2026-03-25",
  "status": "即將出發",
  "coverImageUrl": "https://images.unsplash.com/photo-1601042879364-f3947d3f9c16",
  "shareKey": "demo0001",
  "totalExpense": 28000,
  "createdByName": "旅人小明"
}
```

**範例旅程 2：2025 東京**
```json
{
  "title": "2025 秋天東京賞楓",
  "country": "日本",
  "city": "東京",
  "startDate": "2025-11-15",
  "endDate": "2025-11-22",
  "status": "已完成",
  "coverImageUrl": "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf",
  "shareKey": "demo0002",
  "totalExpense": 52000,
  "createdByName": "旅人小明"
}
```

**範例旅程 3：2024 香港**
```json
{
  "title": "2024 香港美食探索",
  "country": "香港",
  "city": "香港",
  "startDate": "2024-12-26",
  "endDate": "2024-12-30",
  "status": "已完成",
  "coverImageUrl": "https://images.unsplash.com/photo-1507941097613-9f2157b69235",
  "shareKey": "demo0003",
  "totalExpense": 18000,
  "createdByName": "旅人小明"
}
```

### 方法二：直接從網站新增

打開 `index.html`，點選「＋ 新增旅程」，填入資料後系統會自動寫入 Firestore 並產生 shareKey。

---

## 12. 部署到 GitHub Pages

### 步驟一：建立 GitHub Repository

```bash
git init
git add .
git commit -m "init: VoyageArchive 旅遊規劃系統"
git remote add origin https://github.com/你的帳號/my-travel-web.git
git push -u origin main
```

### 步驟二：啟用 GitHub Pages

1. 進入你的 Repository → 點選「Settings」
2. 左側選單找到「Pages」
3. Source 選擇「Deploy from a branch」
4. Branch 選擇 `main`，資料夾選 `/ (root)`
5. 點選「Save」
6. 等待約 1～3 分鐘後，頁面會顯示你的網址

網址格式為：`https://你的帳號.github.io/my-travel-web/`

### 步驟三：設定 Firebase 已授權網域

1. 進入 Firebase Console → Authentication → 設定 → 已授權網域
2. 點選「新增網域」
3. 輸入：`你的帳號.github.io`
4. 儲存

---

## 13. 路徑調整說明

本專案所有頁面連結使用相對路徑（如 `trip.html`、`index.html`），適用於以下情境：

- **直接放在 repository 根目錄**：無需調整，直接可用
- **放在子目錄**（如 `/docs`）：所有 HTML 內的 `href` 與 `src` 路徑不需調整，但需確認 GitHub Pages 的「資料夾」設定選到正確位置

若你的 GitHub Pages 網址是 `https://帳號.github.io/repo名稱/`，請確認：
- `index.html` 中連結到 `history.html` 和 `trip.html` 使用的是相對路徑（目前已是）
- `app.js` 中的 `trip.html?id=xxx&key=xxx` 是相對路徑（目前已是）

---

## 14. 哪些檔案要放入 Repository

以下為必要檔案，全部放入 repository 根目錄：

```
my-travel-web/
├── index.html          ← 首頁（必要）
├── trip.html           ← 旅程詳情頁（必要）
├── history.html        ← 歷史旅程頁（必要）
├── style.css           ← 全站樣式（必要）
├── app.js              ← 首頁邏輯（必要）
├── trip.js             ← 旅程詳情邏輯（必要）
├── history.js          ← 歷史頁邏輯（必要）
├── firebase-config.js  ← Firebase 設定（必要）
├── firebase-db.js      ← Firebase 初始化（必要）
├── utils.js            ← 工具函式（必要）
├── firestore.rules     ← Firestore 安全規則（部署用）
├── storage.rules       ← Storage 安全規則（部署用）
└── README.md           ← 說明文件
```

**不需要放入的檔案：**
- `node_modules/`（本專案不使用 npm）
- `.env`（無環境變數）
- 任何 build 產出物

---

## 15. 圖片使用策略

### 建議做法

- 每筆旅程建議限制圖片在 **10 張以內**
- 圖片主要用途為**旅程規劃與呈現**，不是大量旅遊照片備份
- 建議上傳前先壓縮，單張建議 **500KB 以下**，最大不超過 1MB

### 目前版本（v1）支援方式

- 輸入**圖片網址（URL）**：貼上 Unsplash、Imgur 或其他圖床的連結

### 推薦免費圖床

- [Imgur](https://imgur.com/)：上傳後取得直連網址
- [Unsplash](https://unsplash.com/)：免費旅遊風格封面圖
- Google Photos 分享連結（需轉換格式才可直接引用）

### Firebase Storage 上傳（未來版本）

`firebase-db.js` 已初始化 `storage` 實例，未來版本可加入圖片上傳功能：
```javascript
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
// 上傳後取得 downloadURL 存回 Firestore 的 imageUrl 欄位
```

---

## 16. 常見錯誤排查

### ❌ 頁面開啟後一片空白 / Console 有 CORS 錯誤

**原因**：Firebase 不允許從未授權的網域存取  
**解決**：Firebase Console → Authentication → 已授權網域 → 加入你的 GitHub Pages 網域或 `localhost`

---

### ❌ Firestore 讀取失敗，Console 顯示 `permission-denied`

**原因**：Firestore Rules 尚未套用，或套用的是「鎖定模式」  
**解決**：將 `firestore.rules` 的內容貼入 Firebase Console 的 Firestore 規則並發布

---

### ❌ 旅程卡片點擊後顯示「權限錯誤」

**原因**：URL 的 `key` 參數與 Firestore 中的 `shareKey` 不符  
**解決**：確認旅程卡片的連結是 `trip.html?id=xxx&key=正確的shareKey`

---

### ❌ 圖片顯示破圖

**原因**：圖片網址失效，或圖床不允許外部引用（hotlink protection）  
**解決**：改用 Imgur 或 Unsplash 等允許直接引用的圖片服務

---

### ❌ ES Module 載入錯誤（`Cannot use import statement`）

**原因**：直接用 `file://` 開啟 HTML 檔案，瀏覽器不支援本地 ES Modules  
**解決**：使用本地伺服器，例如 VS Code 的 Live Server 擴充套件，或執行：
```bash
npx serve .
```

---

### ❌ `orderBy` 查詢失敗，Console 顯示需要建立索引

**原因**：Firestore 複合查詢需要索引  
**解決**：點選 Console 錯誤訊息中的連結，Firebase 會自動引導你建立對應索引

---

### ❌ history.html 顯示空白列表

**原因**：history.js 使用 `where("status", "in", ["已完成", "已封存"])` 查詢，若沒有旅程符合此條件則為空  
**解決**：在首頁新增旅程後，將旅程狀態改為「已完成」，再重新整理歷史頁

---

## 17. 未來升級方向

### 升級一：加入登入機制

若未來要升級為帳號制，可採用 Firebase Authentication（Google 登入）：

1. 在 Firebase Console 啟用 Google 登入
2. 在 `firebase-db.js` 加入 `getAuth`
3. 在頁面加入登入/登出按鈕
4. 將 Firestore Rules 改為：
   ```
   allow read, write: if request.auth != null 
                      && resource.data.ownerId == request.auth.uid;
   ```
5. 建立旅程時記錄 `ownerId: auth.currentUser.uid`

### 升級二：可自訂選項系統

在 Firestore 建立 `optionSets` 集合，讓所有選項從資料庫讀取，並提供管理介面。

### 升級三：行程拖曳排序

將 `itinerary` 升級為 `itineraryDays + items` 兩層結構，並加入 HTML5 Drag and Drop，拖曳後更新 `order` 欄位。

### 升級四：PWA 支援

加入 `manifest.json` 與 Service Worker，讓網站可安裝至手機桌面並支援離線瀏覽。

---

*VoyageArchive — 將每一段旅程，轉化為永恆的數位精品檔案。*
