import test from 'node:test';
import assert from 'node:assert/strict';
import { KOREA_PROVINCES, KOREA_REGIONS, nearestKoreaRegion, koreaRegionById, koreaRegionPath, koreaRegionChildren } from './korea-regions.ts';
import { normalizeRegion, regionKey } from './weather-client.ts';

test('domestic administrative hierarchy includes cities and counties with official names', () => {
  const asan = KOREA_REGIONS.find(r => r.name === '충청남도 아산시');
  const hwacheon = KOREA_REGIONS.find(r => r.name === '강원특별자치도 화천군');
  assert.ok(asan); assert.ok(hwacheon);
  assert.ok(Math.abs(asan.latitude - 36.79) < .05);
  assert.ok(Math.abs(hwacheon.latitude - 38.10) < .05);
  assert.equal(KOREA_PROVINCES.find(p => p.name === '경기도')?.regions.length, 31);
  assert.equal(KOREA_PROVINCES.find(p => p.name === '강원특별자치도')?.regions.length, 18);
  assert.equal(KOREA_PROVINCES.find(p => p.name === '서울특별시')?.direct, true);
  assert.ok(KOREA_REGIONS.every(r => r.timezone === 'Asia/Seoul' && r.latitude >= 33 && r.latitude <= 39));
  assert.equal(new Set(KOREA_REGIONS.map(r => r.id)).size, KOREA_REGIONS.length);
});

test('locations resolve locally to a named domestic point without retaining GPS precision', () => {
  const selected = nearestKoreaRegion(36.7891234, 127.0045678);
  assert.equal(selected?.level, 'neighborhood');
  assert.ok(selected?.name.startsWith('충청남도 아산시 '));
  assert.notEqual(selected?.latitude, 36.7891234);
  assert.equal(nearestKoreaRegion(40.71, -74.01), null);
  assert.equal(nearestKoreaRegion(NaN, 127), null);
  assert.equal(koreaRegionById('unknown'), null);
});

test('Cheonan neighborhoods preserve the official district path and grid', () => {
  const dong = koreaRegionById('4413356700');
  assert.ok(dong);
  assert.equal(dong.name, '충청남도 천안시 서북구 불당2동');
  assert.equal(dong.parentId, '4413300000');
  assert.equal(koreaRegionById(dong.parentId)?.parentId, '4413000000');
  assert.deepEqual(dong.grid, { nx: 62, ny: 110 });
  assert.equal(nearestKoreaRegion(36.817294, 127.108701)?.id, dong.id);
  assert.equal(normalizeRegion({ ...dong, name: 'fake', latitude: 0, longitude: 0 })?.name, dong.name);
});

test('every official neighborhood can be reached through the selectable hierarchy', () => {
  const leaves = KOREA_REGIONS.filter(r => r.level === 'neighborhood');
  assert.equal(leaves.length, 3632); // current MOIS entries plus KMA's Dokdo point
  for (const leaf of leaves) {
    const path = koreaRegionPath(leaf.id);
    assert.equal(path[0].id, leaf.provinceId, leaf.name);
    assert.ok(path.length >= 2 && path.length <= 4, leaf.name);
    for (let i = 1; i < path.length; i++) assert.ok(koreaRegionChildren(path[i - 1].id).some(r => r.id === path[i].id), leaf.name);
  }
  assert.deepEqual(koreaRegionPath('4413356700').map(r => r.label), ['충청남도', '천안시', '서북구', '불당2동']);
  assert.deepEqual(koreaRegionChildren('4413300000').filter(r => r.label.startsWith('불당')).map(r => r.label), ['불당1동', '불당2동']);
});

test('metro, rural and Sejong neighborhood paths skip nonexistent levels', () => {
  assert.equal(koreaRegionById('1168000000')?.parentId, '1100000000');
  assert.equal(koreaRegionById('5179025000')?.name, '강원특별자치도 화천군 화천읍');
  assert.equal(koreaRegionById('5179025000')?.parentId, '5179000000');
  const sejong = KOREA_REGIONS.filter(r => r.provinceId === '3600000000' && r.level === 'neighborhood');
  assert.ok(sejong.length > 10);
  assert.ok(sejong.every(r => r.parentId === '3600000000' && !r.name.includes('세종특별자치시 세종')));
});

test('nearby neighborhood forecast caches never alias by rounded coordinates', () => {
  const first = { id: '4413356600', name: 'a', latitude: 36.801, longitude: 127.111, timezone: 'Asia/Seoul', source: 'manual' as const };
  const second = { ...first, id: '4413356700', latitude: 36.802 };
  assert.notEqual(regionKey(first), regionKey(second));
});

test('old Korean selections migrate and overseas preferences are rejected', () => {
  assert.equal(normalizeRegion({ name: '서울', latitude: 37.57, longitude: 126.98, timezone: 'Asia/Seoul', source: 'manual' })?.name, '서울특별시');
  assert.equal(normalizeRegion({ name: '뉴욕', latitude: 40.71, longitude: -74.01, timezone: 'America/New_York', source: 'manual' }), null);
  assert.equal(normalizeRegion({ name: '현재 위치', latitude: -33.87, longitude: 151.21, timezone: 'Australia/Sydney', source: 'location' }), null);
  const asan = KOREA_REGIONS.find(r => r.name === '충청남도 아산시')!;
  assert.equal(normalizeRegion(asan)?.name, asan.name);
});
