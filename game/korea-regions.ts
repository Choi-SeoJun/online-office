import { KOREA_REGION_POINTS } from './korea-region-points.ts';
import type { WeatherRegion } from './environment-types.ts';

export type KoreaRegion = WeatherRegion & { id: string; provinceId: string; district: string | null };
export const KOREA_PROVINCES = KOREA_REGION_POINTS.map(([id, name, direct, points]) => ({
  id, name, direct,
  regions: points.map(([regionId, district, latitude, longitude]): KoreaRegion => ({
    id: regionId, provinceId: id, district, name: district ? `${name} ${district}` : name,
    latitude, longitude, timezone: 'Asia/Seoul', source: 'manual',
  })),
}));
export const KOREA_REGIONS = KOREA_PROVINCES.flatMap(province => province.regions);
const byId = new Map(KOREA_REGIONS.map(region => [region.id, region]));
export const koreaRegionById = (id: unknown) => typeof id === 'string' ? byId.get(id) ?? null : null;

const legacy: Record<string, string> = {
  서울: '1100000000', 부산: '2600000000', 대구: '2700000000', 인천: '2800000000',
  광주: '1224000000', 대전: '3000000000', 울산: '3100000000', 제주: '5011000000',
};
export const legacyKoreaRegion = (name: unknown) => typeof name === 'string' ? koreaRegionById(legacy[name]) : null;

/** Resolve to a domestic representative point locally. This is not a border geofence. */
export function nearestKoreaRegion(latitude: number, longitude: number): KoreaRegion | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 33 || latitude > 38.7 || longitude < 124.5 || longitude > 132) return null;
  const rad = Math.PI / 180;
  let nearest: KoreaRegion | null = null, distance = Infinity;
  for (const candidate of KOREA_REGIONS) {
    const dLat = (candidate.latitude - latitude) * rad, dLon = (candidate.longitude - longitude) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(latitude * rad) * Math.cos(candidate.latitude * rad) * Math.sin(dLon / 2) ** 2;
    const km = 6371 * 2 * Math.asin(Math.sqrt(a));
    if (km < distance) { distance = km; nearest = candidate; }
  }
  return distance <= 180 ? nearest : null;
}
