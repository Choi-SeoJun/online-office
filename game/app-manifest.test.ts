import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicRoot = new URL('../public/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', publicRoot), 'utf8'));

test('installation opens the clean game URL and keeps icons in each deployment scope', async () => {
  for (const base of ['https://choi-seojun.github.io/online-office/', 'https://office-break-01a1bf07.mobilechrysanthemum1.chatgpt.site/']) {
    const manifestUrl = new URL('manifest.webmanifest', base);
    assert.equal(new URL(manifest.start_url, manifestUrl).href, base);
    assert.equal(new URL(manifest.scope, manifestUrl).href, base);
    // Without id, browsers use the stable start_url as identity, not the room URL.
    assert.equal(new URL(manifest.start_url, manifestUrl).search, '');
    for (const icon of manifest.icons) assert.ok(new URL(icon.src, manifestUrl).href.startsWith(base + 'icons/'));
  }
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.prefer_related_applications, false);
  assert.equal(manifest.short_name, '온라인 회사');
});

test('install and Apple icons are real PNGs of the declared size', async () => {
  const icons = [...manifest.icons, { src: 'icons/office-apple-180.png', sizes: '180x180' }];
  assert.ok(icons.some(icon => icon.sizes === '192x192'));
  assert.ok(icons.some(icon => icon.sizes === '512x512'));
  for (const icon of icons) {
    const png = await readFile(new URL(icon.src, publicRoot));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});
