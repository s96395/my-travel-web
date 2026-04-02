export function generateShareKey() {
    return Math.random().toString(36).substring(2, 10);
}

export function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function getUserNickname() {
    let name = localStorage.getItem('travel_user_name');
    if (!name) {
        name = prompt("歡迎使用 VoyageArchive！請輸入您的暱稱：") || "旅人";
        localStorage.setItem('travel_user_name', name);
    }
    return name;
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