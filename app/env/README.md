# Firebase 設定

網頁啟動時會讀 `/firebase-config.json`，這個檔案在打包時依環境從這裡複製：

| 環境 | 檔案 | 何時使用 |
|---|---|---|
| 本機模擬器 | `firebase.emulator.json` | `npm run dev`（搭配 `npm run emulators`） |
| 測試環境 | `firebase.test.json` | Vercel 預覽網址 |
| 正式環境 | `firebase.production.json` | 正式網址（全部完成、資料轉換後才加入） |

找不到對應的檔案時，網頁會停在提示畫面，不會改連其他環境（規格書 P09、N05）。
Firebase 網頁設定本來就會出現在瀏覽器裡，不是密碼；資料安全靠資料庫規則。
