import { KOREA_REGION_POINTS } from './korea-region-points.ts';
import { KOREA_LOCAL_POINTS } from './korea-local-points.ts';
import { KOREA_ADMIN_ADDITIONS, KOREA_ADMIN_RENAMES, KOREA_RETIRED_ADMIN_IDS, KOREA_ADDRESS_LINKS } from './korea-address-data.ts';
import type { WeatherRegion } from './environment-types.ts';

export type KoreaRegion = WeatherRegion & {
  id: string; provinceId: string; district: string | null;
  parentId: string | null; level: 'province' | 'city' | 'district' | 'neighborhood'; label: string;
  addressId?: string; administrativeId?: string; representativePoint?: string; retired?: boolean;
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
for (const [id, parentId, label, pointId] of KOREA_ADMIN_ADDITIONS) {
  const point = byId.get(pointId)!;
  byId.set(id, { ...point, id, parentId, label, district: label, level: 'neighborhood', representativePoint: point.label });
}
for (const [id, label] of KOREA_ADMIN_RENAMES) byId.get(id)!.label = label;
for (const id of KOREA_RETIRED_ADMIN_IDS) byId.get(id)!.retired = true;
export const KOREA_REGIONS = [...byId.values()].filter(region => !region.retired);
export const koreaRegionById = (id: unknown) => typeof id === 'string' ? byId.get(id) ?? null : null;

export function koreaRegionPath(id: string): KoreaRegion[] {
  const path: KoreaRegion[] = [];
  for (let region = koreaRegionById(id); region; region = koreaRegionById(region.parentId)) path.unshift(region);
  return path;
}
const children = new Map<string, KoreaRegion[]>();
for (const region of byId.values()) {
  region.name = koreaRegionPath(region.id).map(part => part.label).join(' ');
  if (region.parentId && !region.retired) {
    const siblings = children.get(region.parentId) ?? [];
    siblings.push(region); children.set(region.parentId, siblings);
  }
}
export const koreaRegionChildren = (id: string): readonly KoreaRegion[] => children.get(id) ?? [];
export const KOREA_PROVINCES = legacyProvinces.map(province => ({ ...province, regions: province.regions.map(r => byId.get(r.id)!) }));
const neighborhoods = KOREA_REGIONS.filter(region => region.level === 'neighborhood' && !region.representativePoint);

const normalizedName = (value: string) => value.normalize('NFC').replace(/제(?=\d)/g, '').replace(/[.·]/g, '').toLocaleLowerCase('ko');
const nameOrder = new Intl.Collator('ko', { numeric: true });
export const koreaAddressRegionId = (legalId: string, administrativeId: string) => `address:${legalId}:${administrativeId}`;
export const KOREA_ADDRESS_REGIONS: KoreaRegion[] = [];
for (const [legalId, legalName, adminIds, parentId] of KOREA_ADDRESS_LINKS) {
  for (const administrativeId of adminIds) {
    const admin = byId.get(administrativeId)!;
    if (normalizedName(legalName) === normalizedName(admin.label) && parentId === admin.parentId) continue;
    const jurisdiction = parentId === admin.parentId ? admin.label : `${byId.get(admin.parentId!)!.label} ${admin.label}`;
    const label = `${legalName} (${jurisdiction} 관할)`;
    const alias: KoreaRegion = {
      ...admin, id: koreaAddressRegionId(legalId, administrativeId), parentId, label, district: legalName,
      name: [...koreaRegionPath(parentId).map(part => part.label), label].join(' '),
      addressId: legalId, administrativeId,
    };
    byId.set(alias.id, alias); KOREA_ADDRESS_REGIONS.push(alias);
  }
}
const selectableChildren = new Map<string, KoreaRegion[]>();
for (const region of [...KOREA_REGIONS, ...KOREA_ADDRESS_REGIONS]) {
  if (!region.parentId) continue;
  const siblings = selectableChildren.get(region.parentId) ?? [];
  siblings.push(region); selectableChildren.set(region.parentId, siblings);
}
for (const options of selectableChildren.values()) options.sort((a, b) => nameOrder.compare(a.label, b.label));
export const koreaRegionOptions = (id: string): readonly KoreaRegion[] => selectableChildren.get(id) ?? [];
const searchIndex = [...KOREA_REGIONS, ...KOREA_ADDRESS_REGIONS].map(region => ({ region, text: normalizedName(region.name).replace(/\s/g, ''), label: normalizedName(region.district ?? region.label) }));
searchIndex.sort((a, b) => nameOrder.compare(a.region.name, b.region.name));

/** Searches locally; typed addresses are never sent to a geocoding service. */
export function searchKoreaRegions(query: string): { items: KoreaRegion[]; total: number } {
  const tokens = normalizedName(query.trim().slice(0, 100)).split(/\s+/).filter(Boolean);
  if (!tokens.length) return { items: [], total: 0 };
  const matches = searchIndex.filter(item => tokens.every(token => item.text.includes(token)));
  const last = tokens[tokens.length - 1];
  const exact = matches.filter(item => item.label === last);
  const others = matches.filter(item => item.label !== last);
  return { items: [...exact, ...others].slice(0, 40).map(item => item.region), total: matches.length };
}

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
