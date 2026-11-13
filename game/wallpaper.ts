export const WALLPAPER_WIDTH = 768, WALLPAPER_HEIGHT = 432;
export const WALLPAPER_MAX_BYTES = 96 * 1024;
export const WALLPAPER_BODY_LIMIT = 140 * 1024;
export const WALLPAPER_INPUT_LIMIT = 10 * 1024 * 1024;
export const WALLPAPER_STORAGE_KEY = 'office-monitor-wallpaper-v1';
export const validWallpaperId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);

/** Only bounded JPEG pixels enter storage; SVG, URLs and arbitrary data are rejected. */
export function decodeWallpaper(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || !value.startsWith('data:image/jpeg;base64,') || value.length > WALLPAPER_MAX_BYTES * 4 / 3 + 30) return null;
  const encoded = value.slice(23);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) return null;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0)); } catch { return null; }
  if (bytes.length > WALLPAPER_MAX_BYTES || bytes.length < 30 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) return null;
  let offset = 2, dimensions = false;
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 255) return null;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218) return dimensions ? bytes : null;
    if (marker === 217 || marker === 216 || marker === 0) return null;
    const size = bytes[offset] * 256 + bytes[offset + 1];
    if (size < 2 || offset + size > bytes.length) return null;
    if ([192, 194].includes(marker)) {
      if (size < 8 || bytes[offset + 2] !== 8 || bytes[offset + 3] * 256 + bytes[offset + 4] !== WALLPAPER_HEIGHT || bytes[offset + 5] * 256 + bytes[offset + 6] !== WALLPAPER_WIDTH) return null;
      dimensions = true;
    } else if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) return null;
    offset += size;
  }
  return null;
}

export function wallpaperDataUrl(bytes: Uint8Array): string {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return 'data:image/jpeg;base64,' + btoa(binary);
}

export function readWallpaper(storage?: Pick<Storage, 'getItem'>): string | null {
  try { const image = (storage ?? globalThis.localStorage).getItem(WALLPAPER_STORAGE_KEY); return decodeWallpaper(image) ? image : null; } catch { return null; }
}
export function writeWallpaper(image: string | null, storage?: Pick<Storage, 'setItem' | 'removeItem'>): boolean {
  try { const target = storage ?? globalThis.localStorage; if (image === null) target.removeItem(WALLPAPER_STORAGE_KEY); else if (decodeWallpaper(image)) target.setItem(WALLPAPER_STORAGE_KEY, image); else return false; return true; } catch { return false; }
}
