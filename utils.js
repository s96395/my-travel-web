/**
 * 產生 8 位數隨機 ShareKey (用於共編連結)
 */
export function generateShareKey() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * 格式化日期 (2026/04/01)
 */
export function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * 取得或設定使用者暱稱 (LocalStorage)
 */
export function getUserNickname() {
    let name = localStorage.getItem('travel_user_name');
    if (!name) {
        name = prompt("歡迎使用 VoyageArchive！請輸入您的暱稱以記錄編輯者身份：") || "旅人";
        localStorage.setItem('travel_user_name', name);
    }
    return name;
}

/**
 * 顯示精品感的 Toast 提示
 */
export function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }, 100);
}

/**
 * 複製文字到剪貼簿 (修正 iframe 內權限問題)
 */
export async function copyToClipboard(text) {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
        document.execCommand('copy');
        showToast("分享連結已成功複製！");
    } catch (err) {
        showToast("複製失敗，請手動複製網址", "error");
    }
    document.body.removeChild(input);
}