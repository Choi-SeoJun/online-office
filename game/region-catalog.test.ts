import test from 'node:test';
import assert from 'node:assert/strict';
import * as catalog from './region-catalog.ts';
import * as regions from './korea-regions.ts';

test('remote catalogs reject incomplete trees, malformed IDs and invented alias coordinates', () => {
  const parse = catalog.parseRegionCatalog;
  assert.equal(typeof parse, 'function');
  const snapshot = regions.regionCatalogSnapshot();
  assert.ok(parse(snapshot));
  assert.equal(parse({ ...snapshot, regions: snapshot.regions.slice(0, 10) }), null);
  const changed = structuredClone(snapshot);
  changed.regions.find(r => r.addressId)!.latitude = 0;
  assert.equal(parse(changed), null);
  const cycle = structuredClone(snapshot);
  cycle.regions[0].parentId = cycle.regions[0].id;
  assert.equal(parse(cycle), null);
});

test('a future verified catalog adds searchable regions without an application rebuild', () => {
  const snapshot = regions.regionCatalogSnapshot();
  const next = structuredClone(snapshot);
  next.revision = 'mois-20261120'; next.sourceDate = '2026-11-20';
  const base = next.regions.find(r => r.id === '4413358000')!;
  next.regions.push({ ...base, id: '4413361000', label: '두정새동', representativePoint: base.label });
  assert.equal(regions.applyRegionCatalog(next, Date.parse('2026-11-20T12:00:00Z')), true);
  assert.equal(regions.searchKoreaRegions('천안 두정새동').items[0]?.id, '4413361000');
  assert.ok(regions.koreaRegionOptions('4413300000').some(r => r.id === '4413361000'));
  assert.equal(regions.applyRegionCatalog(snapshot), false); // no revision rollback
});
