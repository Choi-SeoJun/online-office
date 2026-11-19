import { KOREA_REGION_POINTS } from './korea-region-points.ts';
import { KOREA_LOCAL_POINTS } from './korea-local-points.ts';
import type { WeatherRegion } from './environment-types.ts';

export type KoreaRegion = WeatherRegion & {
  id: string; provinceId: string; district: string | null;
  parentId: string | null; level: 'province' | 'city' | 'district' | 'neighborhood'; label: string;
};
const legacyProvinces = KOREA_REGION_POINTS.map(([id, name, direct, points]) => ({
  id, name, direct,
  regions: points.map(([regionId, district, latitude, longitude]): KoreaRegion => ({
    id: regionId, provinceId: id, district, name: district ? `${name} ${district}` : name,
    latitude, longitude, timezone: 'Asia/Seoul', source: 'manual',
    parentId: regionId === id ? null : id, level: regionId === id ? 'province' : 'city', label: district ?? name,
  })),
}));
// Old installed clients still send these rounded city coordinates.
export const KOREA_LEGACY_REGIONS = legacyProvinces.flatMap(province => province.regions);
const byId = new Map(KOREA_LEGACY_REGIONS.map(region => [region.id, region]));
for (const [id, provinceId, parentId, level, label, latitude, longitude, nx, ny] of KOREA_LOCAL_POINTS) {
  const previous = byId.get(id);
  byId.set(id, {
    id, provinceId, parentId, level, label, district: level === 'province' ? null : label, name: label,
    latitude: previous?.latitude ?? latitude, longitude: previous?.longitude ?? longitude,
    grid: { nx, ny }, timezone: 'Asia/Seoul', source: 'manual',
  });
}
export const KOREA_REGIONS = [...byId.values()];
export const koreaRegionById = (id: unknown) => typeof id === 'string' ? byId.get(id) ?? null : null;

export function koreaRegionPath(id: string): KoreaRegion[] {
  const path: KoreaRegion[] = [];
  for (let region = koreaRegionById(id); region; region = koreaRegionById(region.parentId)) path.unshift(region);
  return path;
}
const children = new Map<string, KoreaRegion[]>();
for (const region of KOREA_REGIONS) {
  region.name = koreaRegionPath(region.id).map(part => part.label).join(' ');
  if (region.parentId) {
    const siblings = children.get(region.parentId) ?? [];
    siblings.push(region); children.set(region.parentId, siblings);
  }
}
export const koreaRegionChildren = (id: string): readonly KoreaRegion[] => children.get(id) ?? [];
export const KOREA_PROVINCES = legacyProvinces.map(province => ({ ...province, regions: province.regions.map(r => byId.get(r.id)!) }));
const neighborhoods = KOREA_REGIONS.filter(region => region.level === 'neighborhood');

export function koreaChildLabel(options: readonly KoreaRegion[]) {
  if (options.some(r => r.level === 'neighborhood')) return '읍·면·동';
  if (options.some(r => r.level === 'city')) return options.some(r => r.level === 'district') ? '시·군·구' : '시·군';
  return '구';
}

const legacy: Record<string, string> = {
  서울: '1100000000', 부산: '2600000000', 대구: '2700000000', 인천: '2800000000',
  광주: '1224000000', 대전: '3000000000', 울산: '3100000000', 제주: '5011000000',
};
export const legacyKoreaRegion = (name: unknown) => typeof name === 'string' ? koreaRegionById(legacy[name]) : null;

/** Nearest official neighborhood point, resolved locally; not a border geofence. */
export function nearestKoreaRegion(latitude: number, longitude: number): KoreaRegion | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 33 || latitude > 38.7 || longitude < 124.5 || longitude > 132) return null;
  const rad = Math.PI / 180;
  let nearest: KoreaRegion | null = null, distance = Infinity;
  for (const candidate of neighborhoods) {
    const dLat = (candidate.latitude - latitude) * rad, dLon = (candidate.longitude - longitude) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(latitude * rad) * Math.cos(candidate.latitude * rad) * Math.sin(dLon / 2) ** 2;
    const km = 6371 * 2 * Math.asin(Math.sqrt(a));
    if (km < distance) { distance = km; nearest = candidate; }
  }
  return distance <= 180 ? nearest : null;
}
