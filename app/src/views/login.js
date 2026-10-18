// 登入頁：只有 Google 登入一種方式（同舊版）
import { ICON, esc } from '../ui/dom.js';

export function renderLogin(S) {
  return `<div class="boot login">
    <div class="brand">沈迷旅行<small>ADDICTED TO YSHEN TRAVEL</small></div>
    <p class="slogan">把嚮往的地方，都變成走過的路</p>
    <button type="button" class="btn block login-btn" data-act="signIn" ${S.signingIn || S.offline ? 'disabled' : ''}>${ICON.google}${S.signingIn ? '登入中…' : '用 Google 帳號登入'}</button>
    ${S.offline ? '<p class="small">目前沒有網路，連上網路後才能登入。</p>' : ''}
    ${S.loginError ? `<p class="small err-text" role="alert">${esc(S.loginError)}</p>` : ''}
    <p class="small muted">登入即表示同意<button type="button" class="linkbtn" data-act="privacy">隱私權說明</button></p>
  </div>`;
}

// 錯誤代碼轉成看得懂的說明
export function loginErrorText(err) {
  const code = err?.code || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
  if (code === 'auth/unauthorized-domain') return '這個網址還沒加入 Firebase 的授權網域，請到 Firebase 主控台加入後再試。';
  if (code === 'auth/network-request-failed') return '網路連線不穩，請稍後再試。';
  return '登入沒有成功，請再試一次。';
}
