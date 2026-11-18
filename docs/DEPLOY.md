# 部署

- 程式送 PR 到 `next`，合併後 Vercel 會更新測試網址（my-travel-web-git-next-yshen-s-projects.vercel.app）。
- 要上線時，開 `next` → `main` 的 PR 並合併（用 merge commit）。Vercel 看到 `main` 有新的 commit 才會建立正式部署，更新 https://my-travel-web-pi.vercel.app/ 。
- 合併後幾分鐘，可以到 GitHub 的 Deployments 確認有沒有一筆 Production、對到 `main` 最新的 commit。

## 合併了但正式網站沒更新

2026-11-18 曾經發生：PR #316 合併到 `main` 後，Vercel 沒有建立正式部署，正式網站停在前一版。處理方式擇一：

1. 到 Vercel 後台 Deployments，右上角「⋯」→「Create Deployment」，分支填 `main`。
2. 再送一個小改動到 `next`，合併後再開一次 `next` → `main` 並合併，讓 `main` 有新的 commit。

手機上加到主畫面的 App，更新後要整個關掉再開，才會換成新版。
