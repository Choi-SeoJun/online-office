import { unzipSync } from 'fflate';
import type { RegionCatalog, CatalogPoint } from '../game/region-catalog.ts';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type CodeRow = { id: string; province: string; city: string; neighborhood: string; ri: string };
type Node = Pick<CatalogPoint, 'id' | 'parentId' | 'provinceId' | 'level' | 'label'>;
const ORIGIN = 'https://www.mois.go.kr';
const BOARD = 'BBSMSTR_000000000052';
const LIST = `${ORIGIN}/frt/bbs/type001/commonSelectBoardList.do?bbsId=${BOARD}`;
const MAX_TEXT = 16_000_000, MAX_ZIP = 8_000_000;
const filePattern = /^(KIKcd_[HB]|KIKmix)\.(\d{8})(?:\.txt)?$/i;
const normal = (s: string) => s.normalize('NFC').replace(/제(?=\d)/g, '').replace(/[.·\s]/g, '');
function fail(reason: string): never { throw new Error(`MOIS catalog: ${reason}`); }
const day = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
function validDate(date: string) {
  return /^\d{8}$/.test(date) && Number.isFinite(Date.parse(`${day(date)}T00:00:00Z`)) && new Date(`${day(date)}T00:00:00Z`).toISOString().slice(0, 10) === day(date);
}
function checkedDate(date: string, previous: RegionCatalog, now: number) {
  if (!validDate(date) || day(date) > new Date(now + 9 * 3600000).toISOString().slice(0, 10) || day(date) < previous.sourceDate) fail('future or regressing source date');
}

/** CP949 fields are byte offsets, not character offsets. WHATWG euc-kr includes CP949. */
function records(bytes: Uint8Array, kind: 'H' | 'B' | 'M', date: string) {
  const decoder = new TextDecoder('euc-kr', { fatal: true });
  const width = kind === 'M' ? 164 : 300, rows: Uint8Array[] = [];
  let start = 0, header = false;
  for (let end = 0; end <= bytes.length; end++) {
    if (end !== bytes.length && bytes[end] !== 10) continue;
    let stop = end; if (bytes[stop - 1] === 13) stop--;
    if (stop === start && end === bytes.length) break;
    if (stop - start !== width) fail('malformed or truncated fixed-width row');
    const row = bytes.subarray(start, stop); start = end + 1;
    if (!header) {
      if (!decoder.decode(row).startsWith(kind === 'B' ? '법정동코드' : '행정동코드')) fail('unexpected source header');
      header = true; continue;
    }
    if (!/^\d{10}$/.test(decoder.decode(row.subarray(0, 10)))) fail('invalid administrative code');
    const createdAt = kind === 'H' ? 104 : kind === 'B' ? 135 : 146;
    const created = decoder.decode(row.subarray(createdAt, createdAt + 8));
    const closed = decoder.decode(row.subarray(createdAt + 9, createdAt + 17)).trim();
    if (!validDate(created) || created > date || closed) fail('unexpected future or retired source row');
    rows.push(row);
  }
  if (!rows.length) fail('empty source file');
  return { rows, field: (row: Uint8Array, offset: number, length = 30) => {
    const value = decoder.decode(row.subarray(offset, offset + length)).trim();
    if (/[\u0000-\u001f\u007f\ufffd]/.test(value)) fail('invalid source text');
    return value;
  } };
}
function codeRows(bytes: Uint8Array, kind: 'H' | 'B', date: string) {
  const { rows, field } = records(bytes, kind, date), result = new Map<string, CodeRow>();
  for (const row of rows) {
    const value = { id: field(row, 0, 10), province: field(row, 11), city: field(row, 42), neighborhood: field(row, 73), ri: kind === 'B' ? field(row, 104) : '' };
    if (result.has(value.id) || !value.province || (value.ri && !value.neighborhood)) fail('duplicate or incomplete code row');
    result.set(value.id, value);
  }
  return result;
}

/** Produces a replacement only after all three official current-code files validate. */
export function parseMoisCatalog(files: Record<string, Uint8Array>, previous: RegionCatalog, sourceUrl: string, now = Date.now()): RegionCatalog {
  const selected = new Map<string, Uint8Array>(); let date = '', size = 0;
  for (const [path, bytes] of Object.entries(files)) {
    const match = filePattern.exec(path.split('/').at(-1)!); if (!match) continue;
    const kind = match[1].toLowerCase();
    if (selected.has(kind) || (date && date !== match[2])) fail('duplicate or mixed-date source files');
    date = match[2]; size += bytes.byteLength;
    if (size > MAX_TEXT) fail('source files too large');
    selected.set(kind, bytes);
  }
  if (selected.size !== 3) fail('missing H, B or jurisdiction source file');
  checkedDate(date, previous, now);
  const admin = codeRows(selected.get('kikcd_h')!, 'H', date), legal = codeRows(selected.get('kikcd_b')!, 'B', date);
  const { rows, field } = records(selected.get('kikmix')!, 'M', date);
  const mappedAdmin = new Set<string>(), mappedLegal = new Set<string>(), pairs = new Set<string>(), links = new Map<string, Set<string>>();
  for (const row of rows) {
    const aid = field(row, 0, 10), lid = field(row, 104, 10), a = admin.get(aid), b = legal.get(lid);
    if (!a || !/^\d{10}$/.test(lid) || pairs.has(`${aid}:${lid}`)) fail('invalid or duplicate jurisdiction');
    // The official file has upper branch-office self-links absent from B.
    if (!b && (aid !== lid || a.neighborhood || !lid.endsWith('00000'))) fail('jurisdiction references missing legal code');
    pairs.add(`${aid}:${lid}`); mappedAdmin.add(aid); mappedLegal.add(lid);
    if (b?.neighborhood && !b.ri && a.neighborhood) {
      const ids = links.get(lid) ?? new Set<string>(); ids.add(aid); links.set(lid, ids);
    }
  }
  for (const id of admin.keys()) if (!mappedAdmin.has(id)) fail('administrative code missing jurisdiction');
  for (const row of legal.values()) {
    if (row.neighborhood && !mappedLegal.has(row.id)) fail('legal code missing jurisdiction');
    if (row.neighborhood && !row.ri && !links.has(row.id)) fail('legal neighborhood missing current administration');
  }
  const old = new Map(previous.regions.map(point => [point.id, point]));
  const formerNeighborhoods = previous.regions.filter(p => !p.retired && !p.addressId && p.level === 'neighborhood' && p.id !== '4794033000').length;
  const currentNeighborhoods = [...admin.values()].filter(row => row.neighborhood).length;
  // Counts follow the last good release, not frozen 2026 totals. A national bulk
  // loss needs investigation rather than automatic overwrite.
  if (currentNeighborhoods < formerNeighborhoods * .98) fail('unexpected national coverage loss');
  const nodes = new Map<string, Node>();
  const upper = new Map([...legal, ...admin].filter(([, row]) => !row.neighborhood));
  function makeNode(row: CodeRow): Node {
    const provinceId = row.id.slice(0, 2) + '00000000', isProvince = row.id === provinceId;
    if (!upper.has(provinceId)) fail('missing province parent');
    let parentId: string | null = isProvince ? null : provinceId;
    if (row.neighborhood) {
      const candidate = row.id.slice(0, 5) + '00000', parent = upper.get(candidate);
      if (!parent) fail('missing neighborhood parent');
      // Sejong's code-only duplicate level has no district name.
      parentId = parent.city ? candidate : provinceId;
    } else if (!isProvince) {
      const candidate = row.id.slice(0, 4) + '000000';
      if (candidate !== row.id && upper.has(candidate)) parentId = candidate;
    }
    const parent = parentId ? upper.get(parentId) : null;
    let label = row.neighborhood || row.city || row.province;
    const level = isProvince ? 'province' : row.neighborhood ? 'neighborhood' : label.endsWith('구') || label.includes('출장') ? 'district' : 'city';
    if (level === 'district' && !label.includes('출장') && parent?.city && label.startsWith(parent.city)) label = label.slice(parent.city.length).trim();
    if (!label || parentId === row.id) fail('invalid hierarchy');
    return { id: row.id, parentId, provinceId, level, label };
  }
  for (const row of upper.values()) nodes.set(row.id, makeNode(row));
  for (const row of admin.values()) if (row.neighborhood) nodes.set(row.id, makeNode(row));
  function path(id: string, entries: Map<string, Node | CatalogPoint>, omitProvince = false): string {
    const parts: string[] = []; let node = entries.get(id), depth = 0;
    while (node) {
      if (++depth > 5) fail('cyclic hierarchy');
      if (!omitProvince || node.level !== 'province') parts.unshift(node.label);
      node = node.parentId ? entries.get(node.parentId) : undefined;
    }
    return normal(parts.join(' '));
  }
  const fullNames = new Map<string, CatalogPoint[]>(), localNames = new Map<string, CatalogPoint[]>();
  for (const point of previous.regions) {
    if (point.addressId) continue;
    for (const [index, name] of [[fullNames, path(point.id, old)], [localNames, path(point.id, old, true)]] as const) {
      const key = `${point.level}:${name}`, values = index.get(key) ?? []; values.push(point); index.set(key, values);
    }
  }
  const result = new Map<string, CatalogPoint>();
  const pointFrom = (node: Node, point: CatalogPoint, fallback: boolean): CatalogPoint => ({ ...node,
    latitude: point.latitude, longitude: point.longitude, ...(point.grid ? { grid: { ...point.grid } } : {}),
    ...(fallback ? { representativePoint: point.representativePoint || point.label } : point.representativePoint ? { representativePoint: point.representativePoint } : {}) });
  for (const node of nodes.values()) {
    const existing = old.get(node.id);
    if (existing && !existing.addressId) { result.set(node.id, pointFrom(node, existing, false)); continue; }
    const exact = fullNames.get(`${node.level}:${path(node.id, nodes)}`) ?? [];
    const local = localNames.get(`${node.level}:${path(node.id, nodes, true)}`) ?? [];
    const candidates = exact.length ? exact : !old.has(node.provinceId) && node.level !== 'province' ? local : [];
    if (candidates.length === 1) result.set(node.id, pointFrom(node, candidates[0], true));
  }
  // New provinces can use a known descendant's point nearest their average;
  // no invented coordinates or grid are presented as a newly published KMA point.
  for (const node of nodes.values()) {
    if (result.has(node.id) || node.parentId) continue;
    const descendants = [...result.values()].filter(p => p.provinceId === node.id && p.level === 'neighborhood' && !p.addressId);
    if (!descendants.length) fail('new province has no known representative point');
    const latitude = descendants.reduce((sum, p) => sum + p.latitude, 0) / descendants.length;
    const longitude = descendants.reduce((sum, p) => sum + p.longitude, 0) / descendants.length;
    const anchor = descendants.reduce((best, p) => (p.latitude - latitude) ** 2 + (p.longitude - longitude) ** 2 < (best.latitude - latitude) ** 2 + (best.longitude - longitude) ** 2 ? p : best);
    result.set(node.id, { ...pointFrom(node, anchor, true), representativePoint: `${anchor.label} (관할 대표지점)` });
  }
  for (let pass = 0; pass < 5; pass++) for (const node of nodes.values()) {
    if (result.has(node.id) || !node.parentId) continue;
    const parent = result.get(node.parentId); if (parent) result.set(node.id, pointFrom(node, parent, true));
  }
  if (result.size !== nodes.size) fail('unresolved representative point');
  for (const [lid, ids] of links) {
    const row = legal.get(lid)!, legalParent = makeNode(row).parentId!;
    if (!result.has(legalParent)) fail('unknown legal address parent');
    for (const aid of ids) {
      const adminPoint = result.get(aid)!;
      if (normal(row.neighborhood) === normal(adminPoint.label) && legalParent === adminPoint.parentId) continue;
      const jurisdiction = legalParent === adminPoint.parentId ? adminPoint.label : `${result.get(adminPoint.parentId!)!.label} ${adminPoint.label}`;
      const id = `address:${lid}:${aid}`;
      result.set(id, { ...adminPoint, id, parentId: legalParent, provinceId: result.get(legalParent)!.provinceId,
        label: `${row.neighborhood} (${jurisdiction} 관할)`, addressId: lid, administrativeId: aid });
    }
  }
  const dokdo = old.get('4794033000'); if (dokdo && result.has(dokdo.parentId!)) result.set(dokdo.id, { ...dokdo });
  for (const point of previous.regions) if (!result.has(point.id)) result.set(point.id, { ...point, retired: true });
  return { schema: 1, revision: `mois-${date}`, sourceDate: day(date), sourceUrl, regions: [...result.values()] };
}

function officialUrl(input: string, path: string) {
  const url = new URL(input, ORIGIN);
  if (url.origin !== ORIGIN || url.username || url.password || url.pathname.split(';')[0] !== path) fail('untrusted source URL');
  url.pathname = path; url.hash = ''; return url;
}
function anchors(html: string) {
  return [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi)].map(m => ({
    href: m[2].replace(/&amp;/g, '&'), text: m[3].replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, ' '),
  }));
}
async function download(url: string, limit: number, fetcher: Fetcher, overall: AbortSignal): Promise<Uint8Array> {
  const signal = AbortSignal.any([overall, AbortSignal.timeout(6000)]);
  // MOIS returns an empty board shell when Workers sends no User-Agent.
  const response = await fetcher(url, { redirect: 'manual', signal, headers: {
    Accept: '*/*', 'User-Agent': 'online-office-regions/1.0 (+https://choi-seojun.github.io/online-office/)',
  } });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); fail('source HTTP error or oversized response'); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > limit) fail('response too large'); chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

// fflate does not verify ZIP CRCs. Validate selected central-directory entries
// so corrupt transport cannot silently remove the final rows.
function unpack(bytes: Uint8Array) {
  if (bytes.length > MAX_ZIP || bytes.length < 22) fail('invalid archive size');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), u32 = (at: number) => view.getUint32(at, true), u16 = (at: number) => view.getUint16(at, true);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && u32(end) !== 0x06054b50) end--;
  if (end < 0 || u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length || u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) fail('truncated or unsupported archive');
  const count = u16(end + 10), centralSize = u32(end + 12), centralAt = u32(end + 16);
  if (count > 64 || centralAt + centralSize !== end) fail('invalid archive directory');
  const metadata = new Map<string, { size: number; crc: number }>(); let offset = centralAt, expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || u32(offset) !== 0x02014b50) fail('invalid archive entry');
    const compressed = u32(offset + 20), size = u32(offset + 24), nameLength = u16(offset + 28), extra = u16(offset + 30), comment = u16(offset + 32), local = u32(offset + 42);
    const next = offset + 46 + nameLength + extra + comment;
    if (next > end || local + 30 > centralAt || u32(local) !== 0x04034b50 || u16(offset + 8) & 1 || local + 30 + u16(local + 26) + u16(local + 28) + compressed > centralAt) fail('invalid compressed member');
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (filePattern.test(name.split('/').at(-1)!)) {
      expanded += size;
      if (metadata.has(name) || size > MAX_TEXT || expanded > MAX_TEXT || compressed > MAX_ZIP) fail('unsafe archive expansion');
      metadata.set(name, { size, crc: u32(offset + 16) });
    }
    offset = next;
  }
  if (offset !== end || metadata.size !== 3) fail('missing or duplicate text members');
  const files = unzipSync(bytes, { filter: file => metadata.has(file.name) && file.originalSize === metadata.get(file.name)!.size });
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let crc = i; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); table[i] = crc >>> 0; }
  for (const [name, meta] of metadata) {
    const data = files[name]; if (!data || data.length !== meta.size) fail('truncated text member');
    let crc = 0xffffffff; for (const byte of data) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255];
    if (((crc ^ 0xffffffff) >>> 0) !== meta.crc) fail('corrupt text member');
  }
  return files;
}

/** Official host only; at most five relevant articles and one ZIP, 24 seconds total. */
export async function fetchMoisCatalog(previous: RegionCatalog, now: number, fetcher: Fetcher = fetch): Promise<RegionCatalog> {
  const signal = AbortSignal.timeout(24000), decoder = new TextDecoder('utf-8', { fatal: true });
  const listing = decoder.decode(await download(LIST, 1_000_000, fetcher, signal));
  const candidates = new Map<number, string>();
  for (const link of anchors(listing)) {
    if (!/행정동|법정동/.test(link.text) || !link.href.includes('commonSelectBoardArticle.do')) continue;
    const url = officialUrl(link.href, '/frt/bbs/type001/commonSelectBoardArticle.do');
    if (url.searchParams.get('bbsId') !== BOARD || !/^\d{1,9}$/.test(url.searchParams.get('nttId') ?? '')) continue;
    const id = Number(url.searchParams.get('nttId')); candidates.set(id, `${ORIGIN}/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=${BOARD}&nttId=${id}`);
  }
  if (!candidates.size) fail('official release listing not recognized');
  const attachments: { date: string; article: string; url: string }[] = [];
  for (const [, article] of [...candidates].sort((a, b) => b[0] - a[0]).slice(0, 5)) {
    const html = decoder.decode(await download(article, 1_000_000, fetcher, signal));
    for (const link of anchors(html)) {
      const match = /\bjscode(\d{8})\.zip\b/i.exec(link.text); if (!match) continue;
      const url = officialUrl(link.href, '/cmm/fms/FileDown.do');
      const fileId = url.searchParams.get('atchFileId'), fileSn = url.searchParams.get('fileSn');
      if (!/^FILE_[a-zA-Z0-9_-]{1,80}$/.test(fileId ?? '') || !/^\d{1,3}$/.test(fileSn ?? '')) fail('unrecognized attachment link');
      attachments.push({ date: match[1], article, url: `${ORIGIN}/cmm/fms/FileDown.do?atchFileId=${fileId}&fileSn=${fileSn}` });
    }
  }
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const latest = attachments.filter(a => validDate(a.date) && day(a.date) <= today && day(a.date) >= previous.sourceDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) fail('effective current-code ZIP attachment not found');
  checkedDate(latest.date, previous, now);
  const catalog = parseMoisCatalog(unpack(await download(latest.url, MAX_ZIP, fetcher, signal)), previous, latest.article, now);
  if (catalog.sourceDate !== day(latest.date)) fail('attachment and file dates disagree');
  return catalog;
}
