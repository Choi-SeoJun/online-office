import test from 'node:test';
import assert from 'node:assert/strict';
import { KOREA_PROVINCES, KOREA_REGIONS, nearestKoreaRegion, koreaRegionById } from './korea-regions.ts';
import { normalizeRegion } from './weather-client.ts';

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
  const asan = KOREA_REGIONS.find(r => r.name === '충청남도 아산시')!;
  const selected = nearestKoreaRegion(36.7891234, 127.0045678);
  assert.equal(selected?.id, asan.id);
  assert.notEqual(selected?.latitude, 36.7891234);
  assert.equal(nearestKoreaRegion(40.71, -74.01), null);
  assert.equal(nearestKoreaRegion(NaN, 127), null);
  assert.equal(koreaRegionById('unknown'), null);
});

test('old Korean selections migrate and overseas preferences are rejected', () => {
  assert.equal(normalizeRegion({ name: '서울', latitude: 37.57, longitude: 126.98, timezone: 'Asia/Seoul', source: 'manual' })?.name, '서울특별시');
  assert.equal(normalizeRegion({ name: '뉴욕', latitude: 40.71, longitude: -74.01, timezone: 'America/New_York', source: 'manual' }), null);
  assert.equal(normalizeRegion({ name: '현재 위치', latitude: -33.87, longitude: 151.21, timezone: 'Australia/Sydney', source: 'location' }), null);
  const asan = KOREA_REGIONS.find(r => r.name === '충청남도 아산시')!;
  assert.equal(normalizeRegion(asan)?.name, asan.name);
});
