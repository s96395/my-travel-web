// 待辦：排序、完成進度與快速範本（規格書 F40、F41）
import { matchPlaces } from './world.js';

// 範本沿用舊版內容，依旅程類型不同
export const TEMPLATES = {
  自由行: ['訂機票', '訂住宿', '辦簽證', '換匯', '買 eSIM', '保旅平險', '收行李', '確認護照效期', '列印訂位確認'],
  跟團: ['確認行程單', '繳清團費', '辦簽證', '換匯', '買 eSIM', '保旅平險', '收行李', '確認護照效期', '備好現金小費'],
  潛旅: ['訂機票', '訂住宿', '確認潛水執照', '準備潛水裝備', '買 eSIM', '保旅平險+潛水險', '收行李', '確認護照效期', '準備防曬'],
};
export const templateOf = type => TEMPLATES[type] || TEMPLATES['自由行'];

const ms = t => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);
// 依加入順序排列；舊版資料同樣有 order（加入時的時間）
export const sortTodos = list => [...list].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || ms(a.createdAt) - ms(b.createdAt) || String(a.id).localeCompare(String(b.id)));

export function progress(list) {
  const total = list.length, done = list.filter(t => t.done).length;
  return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
}

// 範本裡清單還沒有的項目（文字相同就算已有）
export function missingTemplate(list, type) {
  const have = new Set(list.map(t => String(t.text || '').trim()));
  return templateOf(type).filter(x => !have.has(x));
}

// 行李清單：每個人各自一份，國內版、出國版兩套範本（使用者提供的清單），潛旅另加潛水裝備
// 行動電源、備用電池只能隨身帶上飛機，所以放在「隨身」
export const PACK_GROUPS = [['bag', '行李'], ['carry', '隨身'], ['dive', '潛水裝備']];
export const PACK_KINDS = { domestic: '國內版', abroad: '出國版' };
const PACK = {
  domestic: {
    bag: ['內衣褲', '衣物', '襪子', '帽子、配件', '飾品', '睡衣', '化妝品', '保養品', '電棒', '梳子', '卸妝、洗臉', '牙刷、牙膏', 'Nubra', '隱眼盒、隱眼藥水', '眼鏡或隱眼', '藥品', '相機充電器、記憶卡、電池', 'iPad 充電器', '手機充電器', '拖鞋', '垃圾袋', '防曬用品', '盥洗用品', '毛巾'],
    carry: ['錢包', 'AirPods', '相機', '口罩', '口紅、護唇膏', '水壺', '衛生紙'],
  },
  abroad: {
    bag: ['髮圈', '內衣褲', '衣物', '外套', '襪子', '帽子、配件', '飾品', '睡衣', '化妝品', '保養品', '梳子', '卸妝', '洗臉', '牙刷、牙膏', '化妝棉', '隱眼盒、隱眼藥水', '眼鏡或隱眼', '藥品', '保健食品', '手機充電器', '毛巾', '腳架', '口罩', '盥洗用品', '雨傘', '泳裝', '防曬用品', '衛生棉', '吹風機、髮品', '萬國轉接頭'],
    carry: ['護照', '機票', '國際駕照', '行動電源、行動電源充電器', '錢包', 'AirPods', '口罩', '口紅、護唇膏', '水壺', '衛生紙'],
  },
  dive: ['潛水證照', '潛水電腦錶', '面鏡、呼吸管', '防寒衣', '蛙鞋', '防水袋'],
};

// 國家只填台灣（或沒填國家、城市是台灣的地方）就是國內版，其他都算出國
export const packKindOf = trip => {
  const { ids, unmatched } = matchPlaces(trip.country || trip.city);
  return ids.length && !unmatched.length && ids.every(id => id === '158') ? 'domestic' : 'abroad';
};

// 範本項目：[{ group, text }]
export function packTemplate(kind, type) {
  const t = PACK[kind] || PACK.abroad;
  return [...t.bag.map(text => ({ group: 'bag', text })), ...t.carry.map(text => ({ group: 'carry', text })),
    ...(type === '潛旅' ? PACK.dive.map(text => ({ group: 'dive', text })) : [])];
}

// 範本裡自己的清單還沒有的項目（文字相同就算已有，不管放在哪一區）
export function missingPack(list, kind, type) {
  const have = new Set(list.map(t => String(t.text || '').trim()));
  return packTemplate(kind, type).filter(x => !have.has(x.text));
}
