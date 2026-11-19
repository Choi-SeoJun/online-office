import type { KoreaRegion } from './korea-regions.ts';

/** Public administrative data only. Coordinates are published representative points. */
export type CatalogPoint = Omit<KoreaRegion, 'name' | 'district' | 'timezone' | 'source'>;
export type RegionCatalog = {
  schema: 1; revision: string; sourceDate: string; sourceUrl: string;
  regions: CatalogPoint[];
};

const code = (value: unknown): value is string => typeof value === 'string' && /^\d{10}$/.test(value);
const label = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 110 && !/[\u0000-\u001f\u007f<>]/.test(value);
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Atomic validation before any data replaces the bundled/last-good catalog. */
export function parseRegionCatalog(value: unknown, now = Date.now()): RegionCatalog | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as RegionCatalog;
  if (c.schema !== 1 || !/^mois-\d{8}$/.test(c.revision) || !/^\d{4}-\d{2}-\d{2}$/.test(c.sourceDate) || c.revision !== `mois-${c.sourceDate.replaceAll('-', '')}` ||
      !Number.isFinite(Date.parse(c.sourceDate)) || Date.parse(c.sourceDate) > now + 86400000 || c.sourceDate < '2026-11-11' ||
      typeof c.sourceUrl !== 'string' || !/^https:\/\/www\.mois\.go\.kr\/frt\/bbs\/type001\/commonSelectBoardArticle\.do\?/.test(c.sourceUrl) || c.sourceUrl.length > 500 ||
      !Array.isArray(c.regions) || c.regions.length < 4000 || c.regions.length > 30000) return null;
  const map = new Map<string, CatalogPoint>();
  for (const p of c.regions) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !/^(\d{10}|address:\d{10}:\d{10})$/.test(p.id) || map.has(p.id) ||
        !code(p.provinceId) || (p.parentId !== null && !code(p.parentId)) || !['province','city','district','neighborhood'].includes(p.level) || !label(p.label) ||
        !finite(p.latitude, 33, 39) || !finite(p.longitude, 124, 132) ||
        (p.grid !== undefined && (!Number.isInteger(p.grid?.nx) || !Number.isInteger(p.grid?.ny) || !finite(p.grid?.nx, 1, 149) || !finite(p.grid?.ny, 1, 253))) ||
        (p.retired !== undefined && typeof p.retired !== 'boolean') || (p.representativePoint !== undefined && !label(p.representativePoint))) return null;
    const alias = p.id.startsWith('address:');
    if (alias ? !code(p.addressId) || !code(p.administrativeId) || p.id !== `address:${p.addressId}:${p.administrativeId}` : p.addressId !== undefined || p.administrativeId !== undefined) return null;
    map.set(p.id, { id:p.id, provinceId:p.provinceId, parentId:p.parentId, level:p.level, label:p.label,
      latitude:p.latitude, longitude:p.longitude, ...(p.grid ? {grid:{...p.grid}} : {}),
      ...(alias ? {addressId:p.addressId,administrativeId:p.administrativeId} : {}),
      ...(p.retired ? {retired:true} : {}), ...(p.representativePoint ? {representativePoint:p.representativePoint} : {}),
    });
  }
  let neighborhoods = 0, provinces = 0;
  for (const p of map.values()) {
    const path = new Set<string>(); let current: CatalogPoint | undefined = p;
    while (current) {
      if (path.has(current.id) || path.size >= 5) return null;
      path.add(current.id);
      if (current.parentId === null) break;
      current = map.get(current.parentId);
      if (!current) return null;
    }
    if (current?.id !== p.provinceId || current.level !== 'province') return null;
    if (!p.retired && p.level === 'province') provinces++;
    if (!p.retired && p.level === 'neighborhood' && !p.addressId) neighborhoods++;
    if (p.addressId) {
      const admin = map.get(p.administrativeId!);
      if (!admin || admin.addressId || admin.level !== 'neighborhood' || p.latitude !== admin.latitude || p.longitude !== admin.longitude || p.grid?.nx !== admin.grid?.nx || p.grid?.ny !== admin.grid?.ny) return null;
    }
  }
  if (neighborhoods < 3000 || provinces < 10 || provinces > 30) return null;
  return {schema:1, revision:c.revision, sourceDate:c.sourceDate, sourceUrl:c.sourceUrl, regions:[...map.values()]};
}
