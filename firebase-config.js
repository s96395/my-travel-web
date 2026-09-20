const REQUIRED_FIREBASE_CONFIG_FIELDS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

function renderFirebaseConfigError() {
  const render = () => {
    if (document.getElementById('firebaseConfigError')) return;

    const errorPage = document.createElement('main');
    errorPage.id = 'firebaseConfigError';
    errorPage.setAttribute('role', 'alert');
    errorPage.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:32px;background:#fff;color:#1a3a5f;text-align:center;';
    errorPage.innerHTML = `
      <div style="width:min(520px,100%);">
        <h1 style="font-size:1.8rem;margin-bottom:14px;">系統設定載入失敗</h1>
        <p style="color:#5f7184;line-height:1.7;">為保護旅程資料，Firebase 連線已停止。請確認 Vercel 的 FIREBASE_CONFIG_JSON 設定後重新部署。</p>
      </div>`;
    document.body.appendChild(errorPage);
  };

  if (document.body) render();
  else document.addEventListener('DOMContentLoaded', render, { once: true });
}

function validateFirebaseConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Runtime Firebase config must be an object.');
  }

  const missingFields = REQUIRED_FIREBASE_CONFIG_FIELDS.filter(field => (
    typeof config[field] !== 'string' || !config[field].trim()
  ));
  if (missingFields.length) {
    throw new Error(`Runtime Firebase config is missing required fields: ${missingFields.join(', ')}`);
  }

  return Object.freeze({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    ...(typeof config.measurementId === 'string' && config.measurementId.trim()
      ? { measurementId: config.measurementId }
      : {}),
  });
}

async function loadFirebaseConfig() {
  const response = await fetch('/api/firebase-config', {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Runtime Firebase config request failed with status ${response.status}.`);
  }

  return validateFirebaseConfig(await response.json());
}

let firebaseConfig;
try {
  firebaseConfig = await loadFirebaseConfig();
} catch (error) {
  console.error('[firebaseConfig]', error);
  renderFirebaseConfigError();
  throw error;
}

export default firebaseConfig;
