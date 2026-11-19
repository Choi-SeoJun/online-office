import test from 'node:test';
import assert from 'node:assert/strict';
import * as regions from './korea-regions.ts';
import { KOREA_ADDRESS_LINKS, KOREA_ADMIN_ADDITIONS } from './korea-address-data.ts';
import { normalizeRegion, regionKey, saveRegion, readRegion } from './weather-client.ts';

test('Dujeong address choices preserve both jurisdictions and survive preference restoration', () => {
  const first = regions.koreaRegionById('address:4413310400:4413358000');
  const second = regions.koreaRegionById('address:4413310400:4413359000');
  assert.ok(first); assert.ok(second);
  assert.equal(first.name, '충청남도 천안시 서북구 두정동 (부성1동 관할)');
  assert.deepEqual(first.grid, { nx: 63, ny: 111 });
  assert.equal(normalizeRegion(JSON.parse(JSON.stringify(first)))?.id, first.id);
  assert.notEqual(regionKey(first), regionKey(second));
  assert.equal(regions.koreaRegionById('address:4413310400:1168000000'), null);
});

test('address search distinguishes same names nationwide and supports multiple words', () => {
  const search = regions.searchKoreaRegions;
  assert.equal(typeof search, 'function');
  const matches = search('천안 두정동').items;
  assert.equal(matches.length, 2);
  assert.ok(matches.every(r => r.name.includes('천안시 서북구 두정동')));
  assert.ok(search('두정동').items.some(r => !r.name.includes('천안시')));
  assert.ok(search('잠실동').items.some(r => r.name.includes('잠실본동')));
  assert.equal(search('없는동네이름').total, 0);
  assert.equal(search('  ').total, 0);
  assert.equal(search('동').items.length, 40);
  assert.ok(search('동').total > 40);
  assert.equal(search('평택 고덕1동').items[0].label, '고덕1동');
});

test('current names include Goduk split and branch offices without inventing new KMA points', () => {
  for (const id of ['4122067000', '4122068000']) {
    const item = regions.koreaRegionById(id);
    assert.ok(item);
    assert.deepEqual(item.grid, regions.koreaRegionById('4122066000')?.grid);
    assert.equal(item.representativePoint, '고덕동');
  }
  assert.ok(regions.koreaRegionById('4122066000')); // old installed preferences
  const options = regions.koreaRegionOptions('4122000000');
  assert.ok(!options.some(r => r.id === '4122066000'));
  assert.ok(regions.koreaRegionById('4794033000')); // Dokdo is a KMA special point
  assert.equal(regions.koreaRegionById('2812565000')?.label, '송림3·5동');
  const first = regions.koreaRegionById('4122067000')!;
  const nearest = regions.nearestKoreaRegion(first.latitude, first.longitude);
  assert.ok(nearest && !nearest.representativePoint && !nearest.retired && !nearest.id.startsWith('address:'));
});

test('cross-district jurisdictions retain the legal address path', () => {
  const alias = regions.koreaRegionById('address:4117110100:4117351000');
  assert.ok(alias);
  assert.equal(alias.name, '경기도 안양시 만안구 안양동 (동안구 비산1동 관할)');
  assert.equal(alias.parentId, '4117100000');
  assert.ok(regions.searchKoreaRegions('안양 만안구 안양동').items.some(r => r.id === alias.id));
  assert.ok(regions.koreaRegionOptions('4117100000').some(r => r.id === alias.id));
  assert.deepEqual(alias.grid, regions.koreaRegionById('4117351000')?.grid);
});

test('all 5067 legal neighborhoods map to selectable current jurisdictions', () => {
  assert.equal(KOREA_ADDRESS_LINKS.length, 5067);
  const normalized = (text: string) => text.replace(/제(?=\d)/g, '').replace(/[.·]/g, '');
  for (const [legalId, legalName, ids, parentId] of KOREA_ADDRESS_LINKS) {
    assert.ok(ids.length);
    for (const id of ids) {
      const admin = regions.koreaRegionById(id);
      assert.ok(admin && !admin.retired, id);
      const selection = normalized(legalName) === normalized(admin.label) && parentId === admin.parentId ? admin : regions.koreaRegionById(regions.koreaAddressRegionId(legalId, id));
      assert.ok(selection, `${legalId} ${legalName} ${id}`);
      assert.deepEqual(selection.grid, admin.grid);
      assert.equal(selection.parentId, parentId);
      assert.ok(regions.koreaRegionOptions(selection.parentId!).some(r => r.id === selection.id));
    }
  }
  assert.equal(KOREA_ADMIN_ADDITIONS.length, 68);
  for (const [id] of KOREA_ADMIN_ADDITIONS) assert.ok(regions.koreaRegionById(id)?.representativePoint);
});

test('address preference uses the shared browser key across reloads and game modes', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } });
  try {
    const region = regions.koreaRegionById('address:4413310400:4413359000')!;
    saveRegion(region);
    assert.equal(readRegion().id, region.id);
    assert.equal(readRegion().name, region.name);
    assert.equal(data.size, 1);
    assert.equal(normalizeRegion({ ...region, id: 'address:4413310400:1168000000' }), null);
    assert.deepEqual(normalizeRegion({ ...region, grid: { nx: 1, ny: 1 } })?.grid, region.grid);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
