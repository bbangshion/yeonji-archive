import type { Catalog, Objekt, ObjektQuery, SortMode } from '../types/objekt';

export const YEONJI_QUERY: ObjektQuery = Object.freeze({ member: 'S12_YEONJI' });

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstDefined(obj: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function pickText(obj: JsonRecord, keys: string[]): string | null {
  return asText(firstDefined(obj, keys));
}

function memberValueMatches(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(memberValueMatches);
  if (isRecord(value)) {
    return ['code', 'id', 'member', 'memberCode', 'memberId', 'member_name', 'name', 'slug', 'number', 'sNumber']
      .some((key) => memberValueMatches(value[key]));
  }
  if (typeof value === 'number') return value === 12;
  const text = asText(value);
  if (!text) return false;
  const clean = text.normalize('NFKC').toUpperCase().replace(/[\s.\-]/g, '');
  return /^(S12|S12_YEONJI|S12YEONJI|YEONJI|KWAKYEONJI|곽연지|12)$/.test(clean);
}

export function isYeonjiRecord(item: unknown): boolean {
  if (!isRecord(item)) return false;
  // IMPORTANT: only member-identifying fields qualify. A title containing '시온'
  // is not sufficient; this prevents other members' cards entering the catalog.
  const candidates = [
    item.member, item.memberCode, item.member_code, item.memberId,
    item.member_id, item.memberName, item.member_name, item.members,
    item.artist, item.artistName, item.artist_name, item.ownerMember,
  ];
  return candidates.some(memberValueMatches);
}

function extractArray(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return null;
  for (const key of ['objekts', 'objekt', 'items', 'results', 'cards', 'catalog', 'data']) {
    const candidate = raw[key];
    if (Array.isArray(candidate)) return candidate;
    if (isRecord(candidate)) {
      const nested = extractArray(candidate);
      if (nested) return nested;
    }
  }
  return null;
}

function readImage(value: unknown): string | null {
  const raw = isRecord(value)
    ? asText(firstDefined(value, ['url', 'src', 'imageUrl', 'thumbnail', 'original']))
    : asText(value);
  if (!raw) return null;
  // Only HTTP(S) and local paths. Never pass data:, javascript: etc. to the DOM.
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(?:\.?\/?)[\w./%-]+$/i.test(raw) && !raw.startsWith('//')) {
    const prefix = import.meta.env.BASE_URL;
    return `${prefix}${raw.replace(/^\.?\//, '')}`;
  }
  return null;
}

function normalize(item: JsonRecord, index: number): Objekt {
  const id = pickText(item, ['id', 'objektId', 'objekt_id', 'uuid', 'tokenId', 'token_id', 'slug']) ?? `imported-${index + 1}`;
  const rawIssued = pickText(item, ['issuedAt', 'issued_at', 'releaseDate', 'release_date', 'date']);
  const issuedAt = rawIssued && !Number.isNaN(Date.parse(rawIssued)) ? rawIssued : null;
  const imageCandidate = firstDefined(item, ['imageUrl', 'image_url', 'image', 'thumbnail', 'photo', 'imagePath', 'image_path']);
  return {
    id,
    member: 'S12_YEONJI',
    title: pickText(item, ['title', 'name', 'objektName', 'objekt_name', 'label']) ?? `Objekt ${id}`,
    imageUrl: readImage(imageCandidate),
    series: pickText(item, ['series', 'collection', 'edition', 'dimension']) ?? 'Uncategorized',
    season: pickText(item, ['season', 'era', 'year']) ?? 'Unknown',
    className: pickText(item, ['className', 'class', 'rarity', 'type', 'grade']) ?? 'Standard',
    issuedAt,
    serial: pickText(item, ['serial', 'serialNumber', 'serial_number', 'number']),
    description: pickText(item, ['description', 'desc', 'note']),
    isDemo: item.demo === true,
  };
}

export function createCatalog(raw: unknown, query: ObjektQuery = YEONJI_QUERY): Catalog {
  const rows = extractArray(raw);
  if (!rows) throw new Error('Objekt 데이터 형식이 올바르지 않습니다. 배열 또는 { objekts: [...] } 형식을 사용하세요.');
  const seen = new Set<string>();
  const items: Objekt[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (query.member !== 'S12_YEONJI' || !isYeonjiRecord(row) || !isRecord(row)) continue;
    const objekt = normalize(row, index);
    if (seen.has(objekt.id)) continue;
    seen.add(objekt.id);
    items.push(objekt);
  }
  return {
    items,
    sourceCount: rows.length,
    skippedCount: rows.length - items.length,
    isDemo: items.length > 0 && items.every((item) => item.isDemo),
  };
}

export function filterObjekts(
  items: Objekt[],
  input: { query: string; series: string; season: string; mode: 'all' | 'favorites'; favoriteIds: Set<string>; sort: SortMode },
): Objekt[] {
  const query = input.query.normalize('NFKC').toLocaleLowerCase().trim();
  const filtered = items.filter((item) => {
    if (input.mode === 'favorites' && !input.favoriteIds.has(item.id)) return false;
    if (input.series !== 'all' && item.series !== input.series) return false;
    if (input.season !== 'all' && item.season !== input.season) return false;
    if (!query) return true;
    return [item.title, item.id, item.series, item.season, item.serial ?? '']
      .some((text) => text.normalize('NFKC').toLocaleLowerCase().includes(query));
  });
  filtered.sort((a, b) => {
    if (input.sort === 'title') return a.title.localeCompare(b.title, 'ko');
    const left = a.issuedAt ? Date.parse(a.issuedAt) : 0;
    const right = b.issuedAt ? Date.parse(b.issuedAt) : 0;
    return input.sort === 'newest' ? right - left || a.id.localeCompare(b.id) : left - right || a.id.localeCompare(b.id);
  });
  return filtered;
}

/** Readable card caption without repeated artist names or decorative punctuation. */
export function objektLabel(item: Objekt): string {
  if (item.serial) return `#${item.serial.replace(/^#/, '')}`;
  return item.title.replace(/^YEONJI\s*[·:—-]\s*/i, '').replace(/\.$/, '').trim() || 'Objekt';
}
