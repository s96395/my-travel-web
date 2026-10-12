// 舊版資料欄位（title、country、city、startDate…）轉成畫面用的形狀；不改動原始資料
import { daysBetween, todayString } from './dates.js';

export const TRIP_TYPES = ['自由行', '跟團', '潛旅'];
export const TRIP_STATUSES = ['規劃中', '即將出發', '已完成', '已封存'];
export const TYPE_ICON = { '自由行': '🎒', '跟團': '🚌', '潛旅': '🤿' };

export function participantsOf(trip) {
  const p = trip.participants;
  if (!p || typeof p !== 'object') return [];
  return Object.entries(p)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

// 登入者在這趟旅程對應的同行者 ID（沒有綁定時回傳 null）
export function myParticipantId(trip, uid) {
  return participantsOf(trip).find(p => p.uid && p.uid === uid)?.id || null;
}

export function viewTrip(trip) {
  const active = participantsOf(trip).filter(p => p.status !== 'inactive');
  return {
    id: trip.id,
    name: trip.title || '未命名旅程',
    country: trip.country || '',
    city: trip.city || '',
    place: [trip.country, trip.city].filter(Boolean).join('・'),
    type: TRIP_TYPES.includes(trip.tripType) ? trip.tripType : '自由行',
    status: trip.status || '規劃中',
    start: trip.startDate || '',
    end: trip.endDate || '',
    code: (trip.code || '').toUpperCase(),
    tanks: Number(trip.totalTanks) || 0,
    people: active.length,
    raw: trip,
  };
}

// 首頁登機證：正在旅行中的優先，其次是最近要出發的
export function pickNextTrip(trips, today = todayString()) {
  const dated = trips.filter(t => t.start && t.end);
  const ongoing = dated.filter(t => t.start <= today && today <= t.end).sort((a, b) => a.start.localeCompare(b.start));
  if (ongoing.length) return ongoing[0];
  return dated.filter(t => t.start > today).sort((a, b) => a.start.localeCompare(b.start))[0] || null;
}

export function countdown(trip, today = todayString()) {
  if (trip.start <= today && today <= trip.end) {
    return { ongoing: true, day: daysBetween(trip.start, today) + 1, days: daysBetween(trip.start, trip.end) + 1 };
  }
  return { ongoing: false, left: daysBetween(today, trip.start) };
}

export function tripDays(trip) {
  return trip.start && trip.end ? daysBetween(trip.start, trip.end) + 1 : 0;
}
