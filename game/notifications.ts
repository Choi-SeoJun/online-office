import type { RoomNotification } from './multi-types.ts';

export function pokeMessage(name: string) {
  return `${name}${name.endsWith('사원') ? '' : ' 사원'}이 당신을 콕! 찔렀어요`;
}
export function unreadNotifications(items: readonly RoomNotification[]) {
  return items.filter(item => item.readAt === null).length;
}
export function newestNotificationId(items: readonly RoomNotification[]) {
  return items.reduce((latest, item) => Math.max(latest, item.id), 0);
}
