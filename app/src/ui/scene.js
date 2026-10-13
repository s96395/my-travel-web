// 封面：有上傳照片就用照片；沒有上傳時，用使用者挑的預設圖案，或依旅程類型、地點與出發月份畫一張風景（規格書 F06）
// 共 30 種圖案，「自動」依地點關鍵字挑，沒有對到就用出發月份的山景
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

function taipei101(k) {
  const seg = [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const y = 205 - i * 16; return `<path d="M188 ${y}L212 ${y}L216 ${y - 16}L184 ${y - 16}Z"/>`; }).join('');
  return `<svg ${V}>${grad(k, '#f4a77a', '#ffe0c2')}<circle cx="300" cy="90" r="24" fill="#fff3e2"/>
    <path d="M0 210Q80 170 160 195T300 180T400 192V300H0Z" fill="#7d8fa8" opacity=".6"/>
    <g fill="#2f4a6b">${seg}<rect x="182" y="205" width="36" height="60"/><rect x="194" y="62" width="12" height="15"/><rect x="198.5" y="30" width="3" height="34"/></g>
    <g fill="#1f3550"><rect x="40" y="225" width="40" height="75"/><rect x="90" y="240" width="30" height="60"/><rect x="250" y="230" width="44" height="70"/><rect x="305" y="245" width="36" height="55"/><rect x="0" y="262" width="400" height="38"/></g></svg>`;
}

function alishan(k) {
  return `<svg ${V}>${grad(k, '#f6b56b', '#fbe2c4')}<circle cx="200" cy="130" r="32" fill="#fff1c9"/>
    <path d="M0 160L60 110L110 150L170 95L240 150L300 105L360 140L400 120V300H0Z" fill="#5a6b85"/>
    <g fill="#fff" opacity=".95"><ellipse cx="60" cy="180" rx="90" ry="22"/><ellipse cx="200" cy="190" rx="110" ry="26"/><ellipse cx="350" cy="182" rx="90" ry="22"/></g>
    <path d="M0 190H400V300H0Z" fill="#f6f1ea"/>
    <g fill="#2f4d3a"><path d="M40 300L60 210L80 300Z"/><path d="M70 300L90 230L110 300Z"/><path d="M320 300L340 215L360 300Z"/></g></svg>`;
}

function torii(k) {
  return `<svg ${V}>${grad(k, '#f7b38a', '#fde3cc')}<circle cx="300" cy="90" r="26" fill="#fff4e3"/>
    <path d="M0 200H400V300H0Z" fill="#6e8fb4"/><path d="M40 225H160M230 245H360" stroke="#fff" stroke-opacity=".45" stroke-width="3"/>
    <g fill="#d2402e"><path d="M120 92Q200 82 280 92L284 104Q200 96 116 104Z"/><rect x="132" y="120" width="136" height="9"/><rect x="146" y="104" width="12" height="130"/><rect x="242" y="104" width="12" height="130"/><rect x="195" y="104" width="10" height="18"/></g>
    <rect x="116" y="88" width="168" height="5" rx="2" fill="#2a1d1a"/></svg>`;
}

function tokyotower(k) {
  const bands = [0, 1, 2, 3, 4].map(i => { const y = 250 - i * 40, w = 46 - i * 8; return `<path d="M${200 - w} ${y}L${200 + w} ${y}L${200 + w - 6} ${y - 20}L${200 - w + 6} ${y - 20}Z" fill="#fff"/>`; }).join('');
  return `<svg ${V}>${grad(k, '#7fc3ee', '#e6f4fc')}
    <path d="M150 260L196 40H204L250 260Z" fill="#e2482f"/>${bands}
    <rect x="168" y="150" width="64" height="10" fill="#e2482f"/><rect x="182" y="90" width="36" height="8" fill="#e2482f"/>
    <g fill="#5b7186"><rect x="0" y="240" width="60" height="60"/><rect x="60" y="255" width="50" height="45"/><rect x="290" y="245" width="50" height="55"/><rect x="340" y="230" width="60" height="70"/><rect x="0" y="268" width="400" height="32"/></g></svg>`;
}

function palace(k) {
  return `<svg ${V}>${grad(k, '#9cd0ef', '#eaf6fc')}
    <path d="M0 170L80 110L150 150L230 90L310 140L400 105V300H0Z" fill="#7a9a86"/>
    <path d="M70 160Q200 120 330 160L310 168Q200 140 90 168Z" fill="#3b4a52"/>
    <rect x="110" y="168" width="180" height="16" fill="#4f7d6b"/>
    <g fill="#b8382c"><rect x="120" y="184" width="10" height="50"/><rect x="160" y="184" width="10" height="50"/><rect x="230" y="184" width="10" height="50"/><rect x="270" y="184" width="10" height="50"/></g>
    <path d="M50 208Q200 172 350 208L330 216Q200 188 70 216Z" fill="#3b4a52"/>
    <rect x="80" y="234" width="240" height="14" fill="#d9d2c3"/><path d="M0 248H400V300H0Z" fill="#cfc6b3"/></svg>`;
}

function thai(k) {
  return `<svg ${V}>${grad(k, '#f39a5c', '#fcd9a8')}
    <g fill="#d9a521"><path d="M200 40L210 110H190Z"/><path d="M170 175Q170 120 200 105Q230 120 230 175Z"/><rect x="160" y="175" width="80" height="18"/><rect x="145" y="193" width="110" height="20"/></g>
    <g fill="#c2901a"><path d="M110 213L118 150L126 213Z"/><path d="M274 213L282 150L290 213Z"/></g>
    <path d="M0 213H400V300H0Z" fill="#7a3b2a"/><path d="M0 240H400V300H0Z" fill="#5d2b1f"/>
    <g fill="#3a2a1e"><path d="M40 240Q44 180 54 160" fill="none" stroke="#3a2a1e" stroke-width="5"/><path d="M54 160Q30 150 14 160Q34 156 52 164ZM54 160Q76 146 92 154Q72 154 56 164Z"/></g></svg>`;
}

function eiffel(k) {
  return `<svg ${V}>${grad(k, '#a9cfee', '#f6e6ef')}
    <g fill="none" stroke="#5b4a46" stroke-width="5" stroke-linejoin="round"><path d="M200 30L196 90L180 160L150 250M200 30L204 90L220 160L250 250"/><path d="M188 120H212M174 175H226"/><path d="M165 250Q200 200 235 250"/></g>
    <rect x="198" y="18" width="4" height="14" fill="#5b4a46"/>
    <path d="M0 250H400V300H0Z" fill="#8fbf7a"/>
    <g fill="#4f8a4f"><circle cx="50" cy="245" r="22"/><circle cx="90" cy="250" r="18"/><circle cx="320" cy="248" r="22"/><circle cx="360" cy="245" r="18"/></g></svg>`;
}

function bigben(k) {
  return `<svg ${V}>${grad(k, '#a7bed3', '#e6edf3')}
    <g fill="#8a6a45"><rect x="175" y="90" width="50" height="160"/><path d="M175 90L200 30L225 90Z"/></g>
    <circle cx="200" cy="115" r="16" fill="#f5ecd6" stroke="#5a4630" stroke-width="3"/><path d="M200 115V104M200 115L208 119" stroke="#5a4630" stroke-width="2.5"/>
    <g fill="#7a5c3b"><rect x="225" y="170" width="175" height="80"/><rect x="0" y="185" width="175" height="65"/></g>
    <g fill="#b38f62">${[20, 60, 100, 140, 245, 285, 325, 365].map(x => `<rect x="${x}" y="200" width="8" height="30"/>`).join('')}</g>
    <path d="M0 250H400V300H0Z" fill="#5d7f99"/><path d="M40 270H140M220 280H360" stroke="#fff" stroke-opacity=".4" stroke-width="3"/></svg>`;
}

function venice(k) {
  const hs = [[0, 90, 70, '#e7a77a'], [70, 70, 60, '#f0d29a'], [130, 100, 50, '#d97b62'], [250, 80, 60, '#e9c08b'], [310, 60, 90, '#c96f5a']];
  return `<svg ${V}>${grad(k, '#a6d4f2', '#eaf6fc')}
    ${hs.map(([x, y, w, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${200 - y}" fill="${c}"/>${[0, 1, 2].map(i => `<rect x="${x + 12}" y="${y + 20 + i * 34}" width="${w - 24}" height="16" rx="8" fill="#5a3a2e" opacity=".55"/>`).join('')}`).join('')}
    <path d="M0 200H400V300H0Z" fill="#3f8f9a"/><path d="M30 230H120M240 260H380" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>
    <path d="M140 250Q200 262 270 246L276 240Q200 258 136 244Z" fill="#1d1d1d"/><path d="M240 250L250 200" stroke="#1d1d1d" stroke-width="3"/></svg>`;
}

function santorini(k) {
  const hs = [[40, 170, 50], [95, 150, 46], [150, 175, 40], [250, 160, 52], [310, 180, 44]];
  return `<svg ${V}>${grad(k, '#5fb3e8', '#d6eefb')}
    <path d="M0 190H400V300H0Z" fill="#1b5f9e"/>
    <path d="M0 210Q100 180 200 205T400 200V300H0Z" fill="#e9dccb"/>
    <g fill="#fff">${hs.map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="${230 - y}"/>`).join('')}</g>
    <g fill="#1f5fae"><path d="M198 160A22 22 0 0 1 242 160Z"/><rect x="196" y="160" width="48" height="60" fill="#fff"/><path d="M95 150A23 23 0 0 1 141 150Z"/></g>
    <g fill="#1f5fae"><rect x="58" y="190" width="12" height="16"/><rect x="265" y="180" width="12" height="16"/><rect x="212" y="185" width="16" height="20"/></g>
    <path d="M0 250Q120 236 240 248T400 242V300H0Z" fill="#d7c6ae"/></svg>`;
}

function windmill(k) {
  const rows = ['#e74c3c', '#f4d03f', '#e67eb3', '#e74c3c', '#f39c12'];
  return `<svg ${V}>${grad(k, '#8fcbef', '#eaf6fc')}
    <path d="M0 205H400V300H0Z" fill="#6aa84f"/>
    ${rows.map((c, i) => `<rect x="0" y="${214 + i * 18}" width="400" height="${8 + i * 2}" fill="${c}"/>`).join('')}
    <path d="M250 205L262 110H298L310 205Z" fill="#6b4b3a"/><path d="M256 112L280 88L304 112Z" fill="#3e2c22"/>
    <g transform="translate(280 112)" fill="#f4ede0" stroke="#3e2c22" stroke-width="2">${[20, 110, 200, 290].map(a => `<rect x="-6" y="-80" width="12" height="74" transform="rotate(${a})"/>`).join('')}</g>
    <circle cx="280" cy="112" r="5" fill="#3e2c22"/></svg>`;
}

function sydney(k) {
  return `<svg ${V}>${grad(k, '#6ab6e6', '#e3f2fb')}
    <path d="M230 150Q300 40 380 150" fill="none" stroke="#56616b" stroke-width="7"/><path d="M230 150H400" stroke="#56616b" stroke-width="5"/>
    <g fill="#f7f4ee" stroke="#c8c1b5" stroke-width="1.5"><path d="M60 200Q80 120 140 110Q110 150 112 200Z"/><path d="M100 200Q125 110 190 100Q160 145 160 200Z"/><path d="M150 200Q170 130 225 125Q205 160 205 200Z"/></g>
    <rect x="40" y="200" width="190" height="14" fill="#d9c7a7"/>
    <path d="M0 214H400V300H0Z" fill="#2c7fb8"/><path d="M40 240H160M240 260H380" stroke="#fff" stroke-opacity=".4" stroke-width="3"/></svg>`;
}

function camping(k) {
  const stars = [[40, 30], [100, 60], [170, 25], [240, 50], [320, 30], [370, 70], [140, 95]];
  return `<svg ${V}>${grad(k, '#1f2d55', '#5a6f9a')}<circle cx="320" cy="70" r="18" fill="#fff3d0"/>
    <g fill="#fff">${stars.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"/>`).join('')}</g>
    <path d="M0 190L70 130L130 175L200 120L280 170L340 135L400 160V300H0Z" fill="#2d3d5e"/>
    <g fill="#1d3a2e"><path d="M20 240L40 170L60 240Z"/><path d="M340 240L362 160L384 240Z"/><path d="M300 245L316 190L332 245Z"/></g>
    <path d="M0 235Q200 220 400 235V300H0Z" fill="#2f5b3d"/>
    <path d="M110 255L170 175L230 255Z" fill="#f08a3c"/><path d="M170 175L182 255H158Z" fill="#7a3b1c"/>
    <g transform="translate(275 262)"><path d="M-12 0L12 -6M-12 -6L12 0" stroke="#6b4a2b" stroke-width="4"/><path d="M0 -8Q-10 -24 0 -40Q10 -24 0 -8Z" fill="#ffb238"/><path d="M0 -10Q-5 -20 0 -28Q5 -20 0 -10Z" fill="#fff1b8"/></g></svg>`;
}

function cruise(k) {
  return `<svg ${V}>${grad(k, '#79c2ec', '#e3f3fb')}<circle cx="80" cy="70" r="24" fill="#fff6d6"/>
    <path d="M0 200H400V300H0Z" fill="#2a7fb8"/>
    <path d="M70 200L90 235H330L360 200Z" fill="#26364d"/>
    <g fill="#fff"><rect x="100" y="172" width="230" height="28"/><rect x="125" y="148" width="180" height="24"/><rect x="155" y="128" width="110" height="20"/></g>
    <g fill="#5aa2d6">${[110, 135, 160, 185, 210, 235, 260, 285, 310].map(x => `<rect x="${x}" y="182" width="12" height="8" rx="2"/>`).join('')}${[140, 170, 200, 230, 260, 285].map(x => `<rect x="${x}" y="156" width="12" height="8" rx="2"/>`).join('')}</g>
    <rect x="220" y="104" width="20" height="24" fill="#e2482f"/>
    <path d="M40 255H160M230 270H370" stroke="#fff" stroke-opacity=".45" stroke-width="3"/></svg>`;
}

function ferris(k) {
  const cab = [...Array(10)].map((_, i) => { const a = i * Math.PI / 5; return [270 + 70 * Math.cos(a), 130 + 70 * Math.sin(a)]; });
  const cols = ['#e74c3c', '#f4d03f', '#3498db', '#9b59b6', '#2ecc71'];
  return `<svg ${V}>${grad(k, '#f6b3c8', '#fde9d6')}
    <circle cx="270" cy="130" r="70" fill="none" stroke="#5a4a6b" stroke-width="4"/>
    <g stroke="#5a4a6b" stroke-width="2">${cab.map(([x, y]) => `<path d="M270 130L${x} ${y}"/>`).join('')}</g>
    <path d="M270 130L235 240M270 130L305 240" stroke="#5a4a6b" stroke-width="6"/>
    ${cab.map(([x, y], i) => `<rect x="${x - 8}" y="${y - 6}" width="16" height="13" rx="3" fill="${cols[i % 5]}"/>`).join('')}
    <path d="M60 170L110 120L160 170Z" fill="#e74c3c"/><rect x="66" y="170" width="88" height="70" fill="#fff4e3"/><path d="M60 170H160" stroke="#f4d03f" stroke-width="6"/>
    <path d="M0 240H400V300H0Z" fill="#8fc27a"/></svg>`;
}

// 使用者可以自己挑的預設圖案；auto 是依旅程自動決定
export const STYLES = [
  ['auto', '自動'], ['beach', '海灘'], ['sea', '海底'], ['city', '城市'], ['sakura', '櫻花'], ['fuji', '富士山'],
  ['temple', '寺塔'], ['castle', '歐洲古堡'], ['meadow', '草原'], ['desert', '沙漠'], ['snow', '雪景'], ['aurora', '極光'],
  ['taipei101', '台北 101'], ['alishan', '阿里山雲海'], ['camping', '露營'], ['torii', '日本鳥居'], ['tokyotower', '東京鐵塔'],
  ['palace', '韓國宮殿'], ['thai', '泰國寺廟'], ['cruise', '郵輪'], ['eiffel', '巴黎鐵塔'], ['bigben', '倫敦大笨鐘'],
  ['venice', '威尼斯'], ['santorini', '希臘藍白小屋'], ['windmill', '荷蘭風車'], ['sydney', '雪梨歌劇院'], ['ferris', '遊樂園'],
  ['spring', '春天山景'], ['summer', '夏天山景'], ['autumn', '秋天山景'], ['winter', '冬天山景'],
];
const DRAW = { beach, sea, city, sakura, fuji, castle, meadow, desert, snow, aurora, taipei101, alishan, camping, cruise, torii, tokyotower, palace, thai, eiffel, bigben, venice, santorini, windmill, sydney, ferris };

// 依旅程類型、地點與月份自動挑圖案
const AUTO = [
  ['aurora', /極光|冰島|芬蘭|挪威|阿拉斯加|黃刀/],
  ['snow', /北海道|雪|滑雪/],
  ['fuji', /富士|河口湖|箱根/],
  ['desert', /沙漠|杜拜|埃及|摩洛哥|約旦/],
  ['beach', /海灘|沙灘|海島|峇里|沖繩|墾丁|關島|塞班|帛琉|馬爾地夫|普吉|長灘|宿霧|夏威夷|綠島|蘭嶼|澎湖|小琉球/],
  ['ferris', /迪士尼|環球影城|樂園/],
  ['temple', /京都|奈良|寺/],
  ['camping', /露營|營地/],
  ['cruise', /郵輪|遊輪/],
  ['alishan', /阿里山/],
  ['taipei101', /台北|臺北/],
  ['tokyotower', /東京/],
  ['palace', /韓國|首爾/],
  ['thai', /泰國|曼谷|清邁/],
  ['eiffel', /法國|巴黎/],
  ['bigben', /英國|倫敦/],
  ['venice', /義大利|威尼斯/],
  ['santorini', /希臘|聖托里尼/],
  ['windmill', /荷蘭|阿姆斯特丹/],
  ['sydney', /澳洲|雪梨/],
  ['city', /大阪|香港|紐約|新加坡|上海/],
  ['castle', /歐洲|德國|西班牙|奧地利|瑞士|捷克|葡萄牙/],
  ['meadow', /紐西蘭|蒙古|草原/],
];
function autoStyle(trip) {
  if (trip.type === '潛旅') return 'sea';
  const where = `${trip.place}${trip.name}`;
  const hit = AUTO.find(([, re]) => re.test(where));
  if (hit) return hit[0];
  const sz = season(trip.start);
  if (/日本/.test(where)) return sz === 'spring' ? 'sakura' : 'torii';
  return sz;
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
