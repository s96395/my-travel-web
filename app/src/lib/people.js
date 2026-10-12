// 同行者與共編成員（規格書 F10–F15）
// 同行者存在旅程主檔 participants：{ 同行者ID: { name, uid, order, status } }，uid 空白就是沒有帳號
import { participantsOf } from './trips.js';

export const isOwner = (trip, uid) => !!uid && trip.ownerId === uid;
export const isMember = (trip, uid) => isOwner(trip, uid) || (Array.isArray(trip.memberIds) && trip.memberIds.includes(uid));

// 建立者在最前面，其餘照加入順序，重複的去掉
export const memberUids = trip => [trip.ownerId, ...(Array.isArray(trip.memberIds) ? trip.memberIds : [])].filter((u, i, a) => u && a.indexOf(u) === i);

export function nextOrder(trip) {
  const orders = participantsOf(trip).map(p => Number(p.order)).filter(Number.isFinite);
  return orders.length ? Math.max(...orders) + 1 : 1;
}

// 往上移一位：和前一位交換順序；順序值重複或缺漏時先重新編號
export function moveUp(trip, id) {
  const list = participantsOf(trip), i = list.findIndex(p => p.id === id);
  if (i <= 0) return {};
  const ids = list.map(p => p.id);
  [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
  const out = {};
  ids.forEach((pid, n) => { if (Number(list.find(p => p.id === pid).order) !== n + 1) out[pid] = n + 1; });
  return out;
}

// 這個帳號綁定的同行者（停用的也算，一個帳號只能綁一位）
export const boundTo = (trip, uid) => participantsOf(trip).find(p => p.uid && p.uid === uid) || null;

// 加入旅程時能不能綁到這位同行者；回傳錯誤訊息，可以時回傳空字串
export function bindProblem(trip, uid, pid) {
  if (boundTo(trip, uid)) return '你的帳號已經綁定這趟旅程的同行者';
  if (pid === 'new') return '';
  const p = participantsOf(trip).find(x => x.id === pid);
  if (!p) return '找不到這位同行者，可能已經被移除';
  if (p.status === 'inactive') return '這位同行者已停用，請找建立者處理';
  if (p.uid) return '這位同行者已經綁定別的帳號';
  return '';
}

export const cleanName = s => String(s || '').trim().slice(0, 40);
