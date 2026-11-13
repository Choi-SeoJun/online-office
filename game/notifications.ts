import type { RoomNotification } from './multi-types.ts';
import { JOB_RANKS } from './ranks.ts';

export function pokeMessage(name: string) {
  const sender = JOB_RANKS.some(rank => name.endsWith(rank)) ? name : `${name} 사원`;
  const last = sender.charCodeAt(sender.length - 1);
  const subject = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 === 0 ? '가' : '이';
  return `${sender}${subject} 당신을 콕! 찔렀어요`;
}
export function unreadNotifications(items: readonly RoomNotification[]) {
  return items.filter(item => item.readAt === null).length;
}
export function newestNotificationId(items: readonly RoomNotification[]) {
  return items.reduce((latest, item) => Math.max(latest, item.id), 0);
}
