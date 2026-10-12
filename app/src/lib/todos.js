// 待辦：排序、完成進度與快速範本（規格書 F40、F41）

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
