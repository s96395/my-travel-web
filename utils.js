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

export function showToast(message) {
    alert(message); // 為了最穩定的顯示，我們先用 alert，確定邏輯通了再改回樣式
}

export async function copyToClipboard(text) {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    alert("分享連結已成功複製！");
}