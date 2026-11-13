import { requestRoom } from './multi-client.ts';
import type { RoomSession } from './multi-types.ts';
import { decodeWallpaper, validWallpaperId, WALLPAPER_HEIGHT, WALLPAPER_INPUT_LIMIT, WALLPAPER_WIDTH } from './wallpaper.ts';

export async function prepareWallpaper(file: File, fit: 'contain' | 'cover'): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WebP 이미지를 골라 주세요.');
  if (!file.size || file.size > WALLPAPER_INPUT_LIMIT) throw new Error('10MB 이하의 이미지를 골라 주세요.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('이미지를 읽을 수 없어요. 다른 파일을 골라 주세요.'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 24_000_000) throw new Error('이미지 해상도가 너무 커요. 크기를 줄여 주세요.');
    const canvas = document.createElement('canvas'); canvas.width = WALLPAPER_WIDTH; canvas.height = WALLPAPER_HEIGHT;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('이미지를 준비하지 못했어요.');
    ctx.fillStyle = '#253632'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ratio = (fit === 'cover' ? Math.max : Math.min)(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * ratio, height = bitmap.height * ratio;
    ctx.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    for (const quality of [.86, .72, .56, .4, .26]) {
      const image = canvas.toDataURL('image/jpeg', quality);
      if (decodeWallpaper(image)) return image;
    }
    throw new Error('이미지가 너무 복잡해요. 다른 이미지를 골라 주세요.');
  } finally { bitmap.close(); }
}

export async function saveRoomWallpaper(session: RoomSession, image: string | null): Promise<string | null> {
  const result = await requestRoom<{ wallpaperId: unknown }>({ action: image ? 'set' : 'remove', ...session, image }, undefined, 'wallpaper');
  if (result.wallpaperId !== null && !validWallpaperId(result.wallpaperId)) throw new Error('저장 결과를 확인하지 못했어요.');
  return result.wallpaperId;
}
export async function fetchRoomWallpaper(session: RoomSession, id: string, signal?: AbortSignal): Promise<string> {
  const result = await requestRoom<{ id: string; image: string }>({ action: 'read', ...session, id }, signal, 'wallpaper');
  if (result.id !== id || !decodeWallpaper(result.image)) throw new Error('배경화면을 불러오지 못했어요.');
  return result.image;
}
