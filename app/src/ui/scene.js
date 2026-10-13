// 封面：有上傳照片就用照片；沒有上傳時，用使用者挑的預設圖案，或依旅程類型、地點與出發月份畫一張風景（規格書 F06）
// 共 15 種圖案，「自動」依地點關鍵字挑，沒有對到就用出發月份的山景
import { esc } from './dom.js';

let n = 0;
const V = 'class="scene" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"';

// 依出發月份換季節色：[天空, 山]
const SEASON = {
  spring: ['#f9c6cf', '#b5566b'],
  summer: ['#9ad7c2', '#2f7d5b'],
  autumn: ['#f4a259', '#b23a2a'],
  winter: ['#b9cfe6', '#4d6b8a'],
};
function season(start) {
  const m = Number(String(start).slice(5, 7)) || 10;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

function sea(k) {
  return `<svg ${V}><defs><linearGradient id="${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fe3f7"/><stop offset=".45" stop-color="#1690c4"/><stop offset="1" stop-color="#05324f"/></linearGradient></defs>
    <rect width="400" height="300" fill="url(#${k})"/>
    <g fill="#fff" opacity=".14"><polygon points="120,0 165,0 235,300 150,300"/><polygon points="225,0 245,0 305,300 255,300"/><polygon points="35,0 58,0 85,300 25,300"/></g>
    <path d="M0 0H400V10Q350 18 300 10T200 10T100 10T0 10Z" fill="#fff" opacity=".35"/>
    <g fill="#032538" opacity=".6"><path d="M95 168q16-11 32 0q-16 11-32 0zM127 168l9-7v14z"/><path d="M62 190q11-8 22 0q-11 8-22 0zM84 190l6-5v10z"/><path d="M118 205q9-6 18 0q-9 6-18 0zM136 205l5-4v8z"/></g>
    <g fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"><circle cx="300" cy="160" r="5"/><circle cx="309" cy="132" r="3.5"/><circle cx="302" cy="106" r="2.5"/><circle cx="312" cy="84" r="2"/></g>
    <path d="M0 250Q60 226 130 246T260 240T400 236V300H0Z" fill="#04293d"/><path d="M0 274Q90 254 170 270T400 262V300H0Z" fill="#021b2a"/>
    <g fill="#021b2a"><path d="M300 262q-6-30 4-48q4 22-2 48z"/><path d="M312 262q2-24 14-36q-4 20-10 36z"/></g></svg>`;
}

function snow(k) {
  const trees = [[60, 190, 1], [82, 184, .8], [250, 176, .9], [272, 182, 1.15], [300, 186, .8], [355, 180, .95]];
  const flakes = [[40, 60], [120, 30], [180, 90], [230, 40], [360, 130], [90, 120], [200, 140], [330, 30]];
  return `<svg ${V}><defs><linearGradient id="${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fc1e3"/><stop offset="1" stop-color="#eef4fb"/></linearGradient></defs>
    <rect width="400" height="300" fill="url(#${k})"/><circle cx="305" cy="78" r="30" fill="#fff" opacity=".75"/>
    <path d="M0 185Q80 135 170 172T340 158T400 166V300H0Z" fill="#dce7f3"/>
    <g fill="#34536d">${trees.map(([x, y, s]) => `<path d="M${x} ${y - 44 * s}L${x + 15 * s} ${y}H${x - 15 * s}Z"/>`).join('')}</g>
    <path d="M0 228Q120 188 220 222T400 212V300H0Z" fill="#fff"/><path d="M0 262Q140 236 260 258T400 250V300H0Z" fill="#d6e3f0"/>
    <g fill="#fff">${flakes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2"/>`).join('')}</g></svg>`;
}

function hills(k, [sky, hill], pagoda) {
  const tower = pagoda ? `<g fill="#2a110c" transform="translate(292 178)"><rect x="-1.5" y="-86" width="3" height="18"/>${[0, 1, 2, 3].map(i => { const w = 30 - i * 6, y = -i * 17; return `<path d="M${-w} ${y - 7}L${w} ${y - 7}L${w - 9} ${y - 14}L${-w + 9} ${y - 14}Z"/><rect x="${-w + 11}" y="${y - 7}" width="${2 * w - 22}" height="10"/>`; }).join('')}</g>` : '';
  return `<svg ${V}><defs><linearGradient id="${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${hill}"/></linearGradient></defs>
    <rect width="400" height="300" fill="url(#${k})"/><circle cx="110" cy="95" r="34" fill="#fff" opacity=".45"/>
    <path d="M0 170L70 120L130 160L210 105L290 150L350 118L400 140V300H0Z" fill="${hill}" opacity=".55"/>
    <path d="M0 205Q70 165 150 195T300 180T400 190V300H0Z" fill="${hill}"/>
    ${tower}<path d="M0 245Q110 205 230 232Q300 180 400 215V300H0Z" fill="#2a110c" opacity=".88"/></svg>`;
}

function grad(k, a, b) {
  return `<defs><linearGradient id="${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="300" fill="url(#${k})"/>`;
}

function beach(k) {
  return `<svg ${V}>${grad(k, '#7cc8ee', '#d9f1fb')}<circle cx="300" cy="80" r="30" fill="#fff4c2"/>
    <path d="M0 175H400V215H0Z" fill="#2a9fc9"/><path d="M0 200Q100 190 200 200T400 198V215H0Z" fill="#7fd3ea" opacity=".7"/>
    <path d="M0 212Q120 200 240 214T400 210V300H0Z" fill="#f2d9a6"/><path d="M0 250Q150 236 300 252T400 248V300H0Z" fill="#e8c88a"/>
    <path d="M92 252Q98 190 120 150" fill="none" stroke="#6b4a2b" stroke-width="7" stroke-linecap="round"/>
    <g fill="#2f7d5b"><path d="M120 150Q90 128 58 140Q92 136 118 154Z"/><path d="M120 150Q150 122 184 130Q150 134 122 154Z"/><path d="M120 150Q112 116 84 104Q112 120 117 152Z"/><path d="M120 150Q140 112 168 104Q140 124 123 152Z"/><path d="M120 150Q132 172 150 186Q128 170 118 154Z"/></g></svg>`;
}

function city(k) {
  const b = [[10, 150, 40], [52, 110, 34], [90, 170, 44], [138, 80, 30], [172, 130, 46], [222, 95, 36], [262, 160, 40], [306, 120, 34], [344, 150, 50]];
  const win = b.map(([x, y, w]) => { let r = ''; for (let yy = y + 12; yy < 280; yy += 18) for (let xx = x + 6; xx < x + w - 6; xx += 10) if ((xx * 7 + yy) % 3) r += `<rect x="${xx}" y="${yy}" width="4" height="7"/>`; return r; }).join('');
  return `<svg ${V}>${grad(k, '#1d2b53', '#e58c6b')}<circle cx="320" cy="70" r="20" fill="#ffe7b0" opacity=".9"/>
    <g fill="#1a1f3a">${b.map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="${300 - y}"/>`).join('')}<rect x="151" y="50" width="4" height="30"/></g>
    <g fill="#ffd27a" opacity=".85">${win}</g></svg>`;
}

function sakura(k) {
  const bloom = [[250, 60], [290, 40], [330, 70], [300, 95], [360, 45], [270, 120], [340, 115], [220, 90], [380, 90], [310, 15]];
  const petals = [[60, 80], [110, 150], [160, 60], [190, 200], [80, 230], [140, 110]];
  return `<svg ${V}>${grad(k, '#bfe3f5', '#fde7ee')}
    <path d="M0 230Q100 205 200 225T400 215V300H0Z" fill="#9cc98a"/><path d="M0 262Q140 244 260 258T400 252V300H0Z" fill="#7cb46c"/>
    <path d="M400 70Q330 80 300 110Q270 140 230 150M330 82Q300 50 280 40M300 110Q330 125 360 120" fill="none" stroke="#5b3a2e" stroke-width="7" stroke-linecap="round"/>
    <g fill="#f6a5c0">${bloom.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="26"/>`).join('')}</g>
    <g fill="#fbd0dd">${bloom.map(([x, y]) => `<circle cx="${x - 8}" cy="${y - 8}" r="12"/>`).join('')}</g>
    <g fill="#f6a5c0">${petals.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="3" transform="rotate(30 ${x} ${y})"/>`).join('')}</g></svg>`;
}

function fuji(k) {
  return `<svg ${V}>${grad(k, '#6fb3e0', '#e3f1fa')}
    <path d="M40 220L170 80Q200 64 230 80L360 220Z" fill="#4a6a8f"/>
    <path d="M170 80Q200 64 230 80L262 115L246 108L232 120L216 106L200 122L184 106L168 120L154 108L138 115Z" fill="#fff"/>
    <path d="M0 215Q200 205 400 215V300H0Z" fill="#2c6f99"/><path d="M60 235H340M100 250H300" stroke="#fff" stroke-opacity=".4" stroke-width="3"/>
    <path d="M0 270Q120 252 240 266T400 258V300H0Z" fill="#2f5d3a"/></svg>`;
}

function aurora(k) {
  const stars = [[30, 30], [80, 70], [140, 20], [210, 50], [260, 25], [340, 60], [380, 20], [120, 110], [300, 100]];
  return `<svg ${V}>${grad(k, '#081428', '#1d3b5c')}
    <g fill="#fff">${stars.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"/>`).join('')}</g>
    <path d="M-10 140Q80 60 170 110T340 70T420 90" fill="none" stroke="#5cf2b0" stroke-width="26" stroke-linecap="round" opacity=".55"/>
    <path d="M-10 120Q90 80 180 130T360 100T420 120" fill="none" stroke="#8a7bf2" stroke-width="14" stroke-linecap="round" opacity=".45"/>
    <path d="M0 230L80 170L140 210L220 150L300 205L360 175L400 195V300H0Z" fill="#14253d"/>
    <path d="M0 262Q140 244 260 258T400 252V300H0Z" fill="#e6eef7"/></svg>`;
}

function desert(k) {
  return `<svg ${V}>${grad(k, '#f7c873', '#fbe7c2')}<circle cx="110" cy="85" r="34" fill="#fff3d6"/>
    <path d="M230 200L280 130L330 200Z" fill="#c98b45"/><path d="M280 130L330 200H300Z" fill="#a8702f"/>
    <path d="M0 210Q90 170 190 205T400 190V300H0Z" fill="#e3a957"/><path d="M0 250Q120 215 250 245T400 235V300H0Z" fill="#cf8c3c"/></svg>`;
}

function castle(k) {
  return `<svg ${V}>${grad(k, '#9fd0f0', '#eaf5fc')}<circle cx="80" cy="70" r="26" fill="#fff" opacity=".6"/>
    <path d="M0 220Q100 180 200 205T400 195V300H0Z" fill="#7aa86a"/>
    <g fill="#e9e1d3"><rect x="190" y="120" width="90" height="90"/><rect x="170" y="95" width="26" height="115"/><rect x="274" y="105" width="22" height="105"/><rect x="225" y="80" width="20" height="50"/></g>
    <g fill="#3d5a8a"><path d="M167 95L183 62L199 95Z"/><path d="M271 105L285 76L299 105Z"/><path d="M222 80L235 50L248 80Z"/></g>
    <rect x="227" y="175" width="16" height="35" rx="8" fill="#6b5b4a"/>
    <path d="M0 255Q140 232 260 250T400 244V300H0Z" fill="#5d8f52"/></svg>`;
}

function meadow(k) {
  return `<svg ${V}>${grad(k, '#79bde8', '#e8f5fb')}
    <g fill="#fff" opacity=".9"><ellipse cx="90" cy="70" rx="40" ry="14"/><ellipse cx="115" cy="60" rx="26" ry="14"/><ellipse cx="290" cy="50" rx="34" ry="11"/></g>
    <path d="M0 190Q100 150 210 180T400 165V300H0Z" fill="#9ccc6a"/><path d="M0 235Q130 200 260 228T400 220V300H0Z" fill="#78b04f"/>
    <rect x="300" y="160" width="7" height="34" fill="#5b3a2e"/><circle cx="303" cy="150" r="22" fill="#3f7d3a"/>
    <g fill="#fff">${[[60, 250], [120, 270], [200, 255], [250, 280], [340, 262]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3"/>`).join('')}</g></svg>`;
}

// 使用者可以自己挑的預設圖案；auto 是依旅程自動決定
export const STYLES = [
  ['auto', '自動'], ['beach', '海灘'], ['sea', '海底'], ['city', '城市'], ['sakura', '櫻花'], ['fuji', '富士山'],
  ['temple', '寺塔'], ['castle', '歐洲古堡'], ['meadow', '草原'], ['desert', '沙漠'], ['snow', '雪景'], ['aurora', '極光'],
  ['spring', '春天山景'], ['summer', '夏天山景'], ['autumn', '秋天山景'], ['winter', '冬天山景'],
];
const DRAW = { beach, sea, city, sakura, fuji, castle, meadow, desert, snow, aurora };

// 依旅程類型、地點與月份自動挑圖案
const AUTO = [
  ['aurora', /極光|冰島|芬蘭|挪威|阿拉斯加|黃刀/],
  ['snow', /北海道|雪|滑雪/],
  ['fuji', /富士|河口湖|箱根/],
  ['desert', /沙漠|杜拜|埃及|摩洛哥|約旦/],
  ['beach', /海灘|沙灘|海島|峇里|沖繩|墾丁|關島|塞班|帛琉|馬爾地夫|普吉|長灘|宿霧|夏威夷|綠島|蘭嶼|澎湖|小琉球/],
  ['temple', /京都|奈良|寺/],
  ['city', /東京|大阪|首爾|香港|紐約|新加坡|上海|曼谷|台北|倫敦|巴黎/],
  ['castle', /歐洲|法國|義大利|德國|英國|西班牙|奧地利|瑞士|捷克|葡萄牙|荷蘭/],
  ['meadow', /紐西蘭|蒙古|草原|澳洲/],
];
function autoStyle(trip) {
  if (trip.type === '潛旅') return 'sea';
  const where = `${trip.place}${trip.name}`;
  const hit = AUTO.find(([, re]) => re.test(where));
  if (hit) return hit[0];
  const sz = season(trip.start);
  return /日本/.test(where) && sz === 'spring' ? 'sakura' : sz;
}

export function scene(trip, style = 'auto') {
  const k = 'sc' + (++n);
  const st = style === 'auto' || !style ? autoStyle(trip) : style;
  if (DRAW[st]) return DRAW[st](k);
  if (st === 'temple') return hills(k, SEASON[style === 'temple' ? 'autumn' : season(trip.start)], true);
  return hills(k, SEASON[st] || SEASON[season(trip.start)], false);
}

// 有上傳封面時用照片，照存好的位置與放大倍數顯示
export const coverImg = c => `<img class="cover-img" alt="" src="${esc(c.src)}" style="object-position:${+c.x}% ${+c.y}%;transform:scale(${+c.z || 1});transform-origin:${+c.x}% ${+c.y}%">`;
export const art = (trip, cover) => (cover?.src ? coverImg(cover) : scene(trip, cover?.style));

export function coverHtml(trip, big = false, cover = null) {
  return `<span class="cover${big ? ' big' : ''}">${art(trip, cover)}<span class="status">${esc(trip.status)}</span></span>`;
}
