import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unzipSync, zipSync } from 'fflate';
import { regionCatalogSnapshot, koreaRegionById } from '../game/korea-regions.ts';
import { fetchMoisCatalog, parseMoisCatalog } from './mois-regions.ts';

const now = Date.parse('2026-11-19T12:00:00Z');
const article = 'https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId=131063';
const archive = new Uint8Array(readFileSync(new URL('./fixtures/mois-20261111.zip', import.meta.url)));
const files = unzipSync(archive);
const previous = regionCatalogSnapshot();
const decoder = new TextDecoder('euc-kr', { fatal: true });
function lines(data: Uint8Array) { return Array.from({ length: data.length / 301 }, (_, i) => data.slice(i * 301, i * 301 + 300)); }
function join(rows: Uint8Array[], width = 300) {
  const out = new Uint8Array(rows.length * (width + 1));
  rows.forEach((row, i) => { out.set(row, i * (width + 1)); out[i * (width + 1) + width] = 10; }); return out;
}
function replaceCode(data: Uint8Array, before: string, after: string) {
  const result = data.slice(); const needle = new TextEncoder().encode(before), value = new TextEncoder().encode(after);
  for (let i = 0; i <= result.length - needle.length; i++) if (needle.every((b, j) => result[i + j] === b)) { result.set(value, i); i += needle.length - 1; }
  return result;
}
function futureFiles() { return Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name.replace('20261111', '20261118'), bytes.slice()])); }

test('official complete CP949 fixture retains all H codes, both Dujeong jurisdictions, cross-district legal parents and Dokdo', () => {
  const catalog = parseMoisCatalog(files, previous, article, now), byId = new Map(catalog.regions.map(p => [p.id, p]));
  assert.equal(catalog.revision, 'mois-20261111');
  assert.equal(catalog.sourceDate, '2026-11-11');
  assert.equal([...byId.values()].filter(p => !p.retired && !p.addressId && p.level === 'neighborhood').length, 3632);
  assert.equal(byId.get('address:4413310400:4413358000')?.parentId, '4413300000');
  assert.equal(byId.get('address:4413310400:4413359000')?.parentId, '4413300000');
  assert.equal(byId.get('address:4117110100:4117351000')?.parentId, '4117100000');
  assert.match(byId.get('address:4117110100:4117351000')!.label, /동안구 비산1동/);
  assert.equal(byId.get('4122066000')?.retired, true);
  assert.equal(byId.get('4794033000')?.retired, undefined);
  assert.equal(byId.get('2811400000')?.label, '중구영종출장소');
  // The current release retains this branch but has replaced the former Jung-gu.
  assert.equal(byId.get('2811400000')?.parentId, '2800000000');
  assert.ok(byId.get('2811400000')?.representativePoint);
  assert.equal(byId.get('4110500000')?.label, '북부출장소');
  for (const row of lines(files['KIKcd_H.20261111']).slice(1)) {
    const id = decoder.decode(row.subarray(0, 10)); assert.ok(byId.has(id), id); assert.ok(!byId.get(id)!.retired, id);
  }
  for (const point of catalog.regions) if (point.parentId) assert.ok(byId.has(point.parentId), point.id);
});

test('a changed administrative code retains old selections and explicitly uses the prior same-place representative point', () => {
  const next = futureFiles();
  next['KIKcd_H.20261118'] = replaceCode(next['KIKcd_H.20261118'], '4413358000', '4413358100');
  next['KIKmix.20261118'] = replaceCode(next['KIKmix.20261118'], '4413358000', '4413358100');
  const catalog = parseMoisCatalog(next, previous, article, now), byId = new Map(catalog.regions.map(p => [p.id, p]));
  assert.equal(byId.get('4413358000')?.retired, true);
  assert.equal(byId.get('4413358100')?.label, '부성1동');
  assert.equal(byId.get('4413358100')?.latitude, koreaRegionById('4413358000')!.latitude);
  assert.ok(byId.get('4413358100')?.representativePoint);
  assert.equal(byId.get('address:4413310400:4413358100')?.parentId, '4413300000');
  assert.equal(byId.get('address:4413310400:4413358000')?.retired, true);
});

test('a future split accepts more administrative entries and new labels, with a named parent fallback for both new places', () => {
  const next = futureFiles(), h = lines(next['KIKcd_H.20261118']);
  const original = h.find(row => decoder.decode(row.subarray(0, 10)) === '4413358000')!;
  const first = replaceCode(original, '4413358000', '4413358100');
  const second = replaceCode(original, '4413358000', '4413358200');
  first[first.indexOf(49, 73)] = 51; second[second.indexOf(49, 73)] = 52; // 부성1동 → 부성3동/부성4동.
  next['KIKcd_H.20261118'] = join(h.filter(row => row !== original).concat([first, second]));
  const m = next['KIKmix.20261118'];
  const mixRows = Array.from({ length: m.length / 165 }, (_, i) => m.slice(i * 165, i * 165 + 164));
  let mapped = 0;
  next['KIKmix.20261118'] = join(mixRows.map(row => decoder.decode(row.subarray(0, 10)) === '4413358000'
    ? replaceCode(row, '4413358000', mapped++ === 0 ? '4413358100' : '4413358200') : row), 164);
  const catalog = parseMoisCatalog(next, previous, article, now), byId = new Map(catalog.regions.map(p => [p.id, p]));
  assert.equal(byId.get('4413358000')?.retired, true);
  for (const [id, label] of [['4413358100', '부성3동'], ['4413358200', '부성4동']]) {
    assert.equal(byId.get(id)?.label, label); assert.equal(byId.get(id)?.parentId, '4413300000');
    assert.equal(byId.get(id)?.representativePoint, '서북구');
    assert.equal(byId.get(id)?.latitude, koreaRegionById('4413300000')!.latitude);
  }
});

test('renaming an existing administrative ID updates its name and generated address jurisdiction labels', () => {
  const next = futureFiles(), rows = lines(next['KIKcd_H.20261118']);
  const renamed = rows.find(row => decoder.decode(row.subarray(0, 10)) === '4413358000')!;
  renamed[renamed.indexOf(49, 73)] = 51;
  next['KIKcd_H.20261118'] = join(rows);
  const catalog = parseMoisCatalog(next, previous, article, now), byId = new Map(catalog.regions.map(p => [p.id, p]));
  assert.equal(byId.get('4413358000')?.label, '부성3동');
  assert.equal(byId.get('address:4413310400:4413358000')?.label, '두정동 (부성3동 관할)');
});

test('new upper-level codes build a complete parent chain rather than silently dropping new places', () => {
  const next = futureFiles();
  for (const name of Object.keys(next)) next[name] = replaceCode(next[name], '4413', '6013');
  const h = lines(next['KIKcd_H.20261118']);
  const province = h.find(row => decoder.decode(row.subarray(0, 10)) === '4400000000')!.slice();
  province.set(new TextEncoder().encode('6000000000'), 0);
  h.push(province); next['KIKcd_H.20261118'] = join(h);
  const b = lines(next['KIKcd_B.20261118']);
  const legalProvince = b.find(row => decoder.decode(row.subarray(0, 10)) === '4400000000')!.slice();
  legalProvince.set(new TextEncoder().encode('6000000000'), 0); b.push(legalProvince); next['KIKcd_B.20261118'] = join(b);
  const mix = next['KIKmix.20261118'];
  const upper = mix.slice(165, 329); upper.set(new TextEncoder().encode('6000000000'), 0); upper.set(new TextEncoder().encode('6000000000'), 104);
  const enlarged = new Uint8Array(mix.length + 165); enlarged.set(mix); enlarged.set(upper, mix.length); enlarged[enlarged.length - 1] = 10; next['KIKmix.20261118'] = enlarged;
  const catalog = parseMoisCatalog(next, previous, article, now), byId = new Map(catalog.regions.map(p => [p.id, p]));
  assert.equal(byId.get('6000000000')?.parentId, null);
  assert.equal(byId.get('6013000000')?.parentId, '6000000000');
  assert.equal(byId.get('6013300000')?.parentId, '6013000000');
  assert.equal(byId.get('6013358000')?.parentId, '6013300000');
  assert.ok(byId.get('6000000000')?.representativePoint);
});

test('incomplete files, malformed rows, missing jurisdiction and regressing or future dates fail closed', () => {
  const noMix = { ...files }; delete noMix['KIKmix.20261111'];
  assert.throws(() => parseMoisCatalog(noMix, previous, article, now));
  const short = { ...files, 'KIKcd_H.20261111': files['KIKcd_H.20261111'].slice(0, -20) };
  assert.throws(() => parseMoisCatalog(short, previous, article, now));
  const missing = { ...files, 'KIKcd_H.20261111': join(lines(files['KIKcd_H.20261111']).filter(row => decoder.decode(row.subarray(0, 10)) !== '4413358000')) };
  assert.throws(() => parseMoisCatalog(missing, previous, article, now));
  const unmapped = { ...files, 'KIKmix.20261111': join(Array.from({ length: files['KIKmix.20261111'].length / 165 }, (_, i) => files['KIKmix.20261111'].slice(i * 165, i * 165 + 164)).filter(row => decoder.decode(row.subarray(104, 114)) !== '4413310400'), 164) };
  assert.throws(() => parseMoisCatalog(unmapped, previous, article, now));
  for (const date of ['20261011', '20261201']) {
    const changed = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name.replace('20261111', date), bytes]));
    assert.throws(() => parseMoisCatalog(changed, previous, article, now));
  }
  assert.equal(previous.regions.find(r => r.id === '4413358000')?.retired, undefined);
});

const listing = '<a href="/frt/bbs/type001/commonSelectBoardArticle.do;jsessionid=test?bbsId=BBSMSTR_000000000052&amp;nttId=131063">행정기관(행정동) 및 관할구역(법정동) 변경내역</a>';
const attachments = '<a href="/cmm/fms/FileDown.do?atchFileId=FILE_EXAMPLE&amp;fileSn=2">jscode20261111(말소코드포함).zip</a><a href="/cmm/fms/FileDown.do?atchFileId=FILE_EXAMPLE&amp;fileSn=1">jscode20261111.zip</a>';
function source(zip: Uint8Array = archive, html = attachments) {
  const calls: string[] = [];
  const fetcher = async (input: string, init?: RequestInit) => {
    calls.push(input); assert.equal(init?.redirect, 'manual'); assert.ok(init?.signal);
    const url = new URL(input); assert.equal(url.origin, 'https://www.mois.go.kr');
    if (url.pathname.includes('BoardList')) return new Response(listing);
    if (url.pathname.includes('BoardArticle')) return new Response(html);
    assert.equal(url.pathname, '/cmm/fms/FileDown.do'); assert.equal(url.searchParams.get('fileSn'), '1');
    return new Response(zip as BodyInit);
  }; return { fetcher, calls };
}

test('unattended discovery selects the current official ZIP attachment and imports its catalog without network in tests', async () => {
  const fixture = source(); const result = await fetchMoisCatalog(previous, now, fixture.fetcher);
  assert.equal(result.sourceUrl, article); assert.equal(result.revision, 'mois-20261111'); assert.equal(fixture.calls.length, 3);
});

test('official attachment IDs may contain URL-safe hyphens', async () => {
  const fixture = source(archive, attachments.replaceAll('FILE_EXAMPLE', 'FILE_00147311ctH5-ah'));
  const result = await fetchMoisCatalog(previous, now, fixture.fetcher);
  assert.equal(result.sourceDate, '2026-11-11');
});

test('the updater identifies itself so MOIS returns board content in Workers without a default User-Agent', async () => {
  const fixture = source();
  const result = await fetchMoisCatalog(previous, now, async (input, init) => {
    if (!new Headers(init?.headers).get('User-Agent')) return new Response('<html><body>MOIS page shell</body></html>');
    return fixture.fetcher(input, init);
  });
  assert.equal(result.sourceDate, '2026-11-11');
});

test('an announced future release does not suppress a newer already-effective current catalog', async () => {
  const html = '<a href="/cmm/fms/FileDown.do?atchFileId=FILE_NEXT&amp;fileSn=1">jscode20261120.zip</a>' +
    '<a href="/cmm/fms/FileDown.do?atchFileId=FILE_CURRENT&amp;fileSn=1">jscode20261118.zip</a>';
  const fixture = source(zipSync(futureFiles()), html);
  const result = await fetchMoisCatalog(previous, now, fixture.fetcher);
  assert.equal(result.sourceDate, '2026-11-18');
  assert.ok(fixture.calls.at(-1)?.includes('FILE_CURRENT'));
});

test('source failures, redirects, oversized responses and malformed archives never yield a replacement catalog', async () => {
  await assert.rejects(fetchMoisCatalog(previous, now, async () => new Response('Unavailable', { status: 503 })));
  await assert.rejects(fetchMoisCatalog(previous, now, async () => new Response(null, { status: 302, headers: { location: 'https://other.test' } })));
  await assert.rejects(fetchMoisCatalog(previous, now, async () => new Response('x'.repeat(1_100_000))));
  await assert.rejects(fetchMoisCatalog(previous, now, source(archive.slice(0, -20)).fetcher));
  await assert.rejects(fetchMoisCatalog(previous, now, source(zipSync({ 'KIKcd_H.20261111': files['KIKcd_H.20261111'] })).fetcher));
  await assert.rejects(fetchMoisCatalog(previous, now, source(archive, attachments.replaceAll('/cmm/fms/', 'https://untrusted.test/cmm/fms/')).fetcher));
});

test('archive CRC failures and advertised expansion bombs fail before returning a catalog', async () => {
  const central = archive.findIndex((value, i) => value === 80 && archive[i + 1] === 75 && archive[i + 2] === 1 && archive[i + 3] === 2);
  assert.ok(central > 0);
  const corrupt = archive.slice(); corrupt[central + 16] ^= 1;
  await assert.rejects(fetchMoisCatalog(previous, now, source(corrupt).fetcher), /corrupt text member/);
  const bomb = archive.slice(); new DataView(bomb.buffer).setUint32(central + 24, 256_000_000, true);
  await assert.rejects(fetchMoisCatalog(previous, now, source(bomb).fetcher), /unsafe archive expansion/);
});
