import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeWallpaper, readWallpaper, writeWallpaper, wallpaperDataUrl, WALLPAPER_MAX_BYTES, WALLPAPER_STORAGE_KEY } from './wallpaper.ts';
const bytes = new Uint8Array(readFileSync(new URL('./fixtures/monitor.jpg', import.meta.url)));
const image = wallpaperDataUrl(bytes);
test('wallpaper accepts a real bounded JPEG and rejects non-raster, oversized and wrong dimensions', () => {
  assert.deepEqual(decodeWallpaper(image), bytes);
  for (const bad of [null, {}, 'https://example.com/image.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', image.slice(0, -4), wallpaperDataUrl(new Uint8Array(WALLPAPER_MAX_BYTES + 1))]) assert.equal(decodeWallpaper(bad), null);
  const wrongSize = bytes.slice(), marker = wrongSize.findIndex((value, index) => value === 255 && wrongSize[index + 1] === 192);
  assert.ok(marker > 0); wrongSize[marker + 5] = 100;
  assert.equal(decodeWallpaper(wallpaperDataUrl(wrongSize)), null);
});
test('solo wallpaper persists, restores and removes without depending on the game mode save', () => {
  const data = new Map<string, string>(), storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  assert.equal(writeWallpaper(image, storage), true); assert.equal(readWallpaper(storage), image);
  assert.equal(writeWallpaper('bad data', storage), false); assert.equal(readWallpaper(storage), image);
  assert.equal(writeWallpaper(null, storage), true); assert.equal(readWallpaper(storage), null);
  storage.setItem(WALLPAPER_STORAGE_KEY, 'damaged'); assert.equal(readWallpaper(storage), null);
  assert.equal(writeWallpaper(image, { ...storage, setItem() { throw new Error('QuotaExceeded'); } }), false);
});
