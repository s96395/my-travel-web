// 沒有上傳封面時，依旅程類型、地點與出發月份畫一張風景（規格書 F06）
// 目前有海底、雪景、山景（四季配色，京都加五重塔）；其他種類之後再補
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

export function scene(trip) {
  const k = 'sc' + (++n);
  const where = `${trip.place}${trip.name}`;
  if (trip.type === '潛旅') return sea(k);
  if (/北海道|雪|滑雪/.test(where)) return snow(k);
  return hills(k, SEASON[season(trip.start)], /京都|奈良|寺/.test(where));
}

export function coverHtml(trip, big = false) {
  return `<span class="cover${big ? ' big' : ''}">${scene(trip)}<span class="status">${esc(trip.status)}</span></span>`;
}
