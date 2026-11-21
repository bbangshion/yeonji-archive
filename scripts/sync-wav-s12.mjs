/**
 * YEONJI ARCHIVE | WAV ARCHIVE S12 Objekt snapshot converter
 *
 * Runs in GitHub Actions (Node 22), never in the visitor's browser.
 * Reads the publicly committed WAV ARCHIVE catalog and emits a small,
 * deduplicated YEONJI-only file compatible with the v1 React front-end.
 * No API key, no invented assets, no changes to WAV ARCHIVE itself.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_PREFIX = 'https://raw.githubusercontent.com/bbangshion/wav-archive/main/objekt-collection/data/';
const IMAGE_BASE = 'https://bbangshion.github.io/wav-archive/objekt-collection/';
const FEEDS = ['objekt-top.json', 'apollo.json'];
const OUTPUT = path.resolve('public/data/objekt.json');
const MAX_BYTES = 60 * 1024 * 1024;

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const asText = (x) => typeof x === 'string' ? x.trim() : typeof x === 'number' && Number.isFinite(x) ? String(x) : '';

function get(obj, ...paths) {
  for (const p of paths) {
    const v = p.split('.').reduce((state, key) => isObject(state) ? state[key] : undefined, obj);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}
function text(obj, ...paths) {
  const value = get(obj, ...paths);
  return asText(isObject(value) ? get(value, 'name', 'code', 'slug', 'value') : value);
}
function isS12(value) {
  if (Array.isArray(value)) return value.some(isS12);
  if (isObject(value)) return ['id', 'code', 'member', 'memberId', 'slug', 'name', 'nameKo', 'nameEn', 'number'].some(k=>isS12(value[k]));
  const label = asText(value).normalize('NFKC').toUpperCase().replace(/[\s._\-]/g, '');
  return /^(S12|S12YEONJI|12|YEONJI|KWAKYEONJI|곽연지)$/.test(label);
}
function isYeonji(row) {
  if (!isObject(row)) return false;
  return [
    'memberId', 'member', 'member.id', 'member.name', 'member.slug', 'memberCode',
    'member_code', 'member_id', 'memberName', 'member_name', 'memberSlug',
    'members', 'artistMember', 'artistMember.name', 'ownerMember',
  ].some(k => isS12(get(row, k)));
}
function extractRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (!isObject(raw)) return null;
  for (const key of ['collections', 'items', 'objekts', 'results', 'rows', 'catalog', 'data']) {
    const value = raw[key];
    if (Array.isArray(value)) return value;
    if (isObject(value)) {
      const found = extractRows(value);
      if (found) return found;
    }
  }
  return null;
}
function urlValue(input) {
  if (isObject(input)) return urlValue(get(input, 'front', 'frontUrl', 'url', 'original', 'src', 'path', 'thumbnail', 'imageUrl'));
  return asText(input);
}
function safeImage(raw) {
  const input = urlValue(raw);
  if (!input) return null;
  try {
    const link = new URL(input, IMAGE_BASE);
    if (link.protocol !== 'https:' || link.username || link.password) return null;
    if (!/^https?:\/\//i.test(input)) {
      if (input.startsWith('//') || input.split('/').includes('..')) return null;
      if (!/\.(png|jpe?g|webp|avif)(?:[?#].*)?$/i.test(input)) return null;
    }
    if (/\.(svg|html?|js)$/i.test(link.pathname)) return null;
    return link.href;
  } catch { return null; }
}
function normalize(row) {
  if (!isYeonji(row)) return null;
  const season = text(row, 'season', 'season.name', 'seasonName', 'era', 'year');
  const no = text(row, 'collectionNo', 'collectionNumber', 'collection_no', 'collection.code', 'collection.collectionNo', 'collection.number', 'cardNumber', 'objektNumber', 'number', 'code', 'serial');
  // Required to preserve stable collection IDs and avoid mistaking mint serials for a design.
  if (!season || !no) return null;
  const klass = text(row, 'class', 'class.name', 'className', 'klass', 'objektClass', 'rarity', 'grade') || 'Unknown';
  const local = safeImage(get(row, 'localImageUrl', 'localWebp', 'localImage'));
  const remote = safeImage(get(row, 'frontImageUrl', 'frontImage', 'image.front', 'images.front', 'media.frontUrl', 'imageUrl', 'frontUrl', 'image.url', 'image', 'thumbnailUrl', 'images.thumbnail', 'thumbnail', 'metadata.imageUrl'));
  const date = text(row, 'issuedAt', 'issued_at', 'releaseDate', 'release_date', 'date', 'mintedAt');
  return {
    id: `${season}:S12:${no}`,
    member: 'S12_YEONJI',
    title: text(row, 'title', 'objektName', 'objekt_name', 'label') || `YEONJI · ${season} #${no}`,
    imageUrl: local ?? remote,
    series: text(row, 'series', 'edition', 'unitTag', 'unit', 'dimension') || klass,
    season,
    class: klass,
    issuedAt: date && !Number.isNaN(Date.parse(date)) ? date : null,
    serial: no,
    description: text(row, 'description', 'desc', 'note') || null,
  };
}

async function download(file, optional = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  try {
    const res = await fetch(SOURCE_PREFIX + file, {
      headers: { Accept: 'application/json', 'User-Agent': 'YEONJI-ARCHIVE-GitHub-Actions/1.1' },
      signal: controller.signal,
    });
    if (optional && res.status === 404) return null;
    if (!res.ok) throw Error(`${file} HTTP ${res.status}`);
    const length = Number(res.headers.get('content-length') || 0);
    if (length > MAX_BYTES) throw Error(`${file} 데이터 용량 초과`);
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) throw Error(`${file} 데이터 용량 초과`);
    const raw = JSON.parse(new TextDecoder().decode(buffer));
    const records = extractRows(raw);
    if (!records) throw Error(`${file} JSON 배열 구조 미확인`);
    return records;
  } finally { clearTimeout(timer); }
}

export function convert(feeds) {
  const items = new Map();
  let sourceCount = 0;
  let yeonjiRows = 0;
  for (const { filename, rows } of feeds) {
    sourceCount += rows.length;
    for (const row of rows) {
      const item = normalize(row);
      if (!item) continue;
      yeonjiRows += 1;
      if (row.demo === true) continue;
      const old = items.get(item.id);
      if (old) {
        items.set(item.id, {
          ...old,
          imageUrl: old.imageUrl ?? item.imageUrl,
          description: old.description ?? item.description,
          issuedAt: old.issuedAt ?? item.issuedAt,
          class: old.class === 'Unknown' ? item.class : old.class,
        });
      } else {
        items.set(item.id, item);
      }
    }
    console.log(`[${filename}] source rows: ${rows.length}, S12 merged so far: ${items.size}`);
  }
  return { objekts: [...items.values()], provenance: { source: 'WAV ARCHIVE', sourceCount, yeonjiRows, uniqueYeonji: items.size, importedAt: new Date().toISOString() } };
}

function selfTest() {
  const fixture = [
    { member: 'yeonji', season: 'Cream02', collectionNo: '101Z', class: 'First', frontImageUrl: 'https://static.cosmo.fans/actual-test.webp' },
    { memberId: 'S12', season: 'Atom01', collectionNo: '102Z', class: 'Special', frontImage: './cards/example.webp' },
    { member: { name: '곽연지' }, season: 'Binary01', collectionNo: '103Z', class: 'First' },
    { member: 'chaewon', season: 'Cream02', collectionNo: '104Z', class: 'First' },
    { member: 'yeonji', season: 'Cream02', collectionNo: '101Z', class: 'First' },
  ];
  const result = convert([{ filename: 'fixture', rows: fixture }]);
  if (result.objekts.length !== 3 || result.objekts[0].imageUrl !== 'https://static.cosmo.fans/actual-test.webp' || !result.objekts[1].imageUrl.includes('/wav-archive/objekt-collection/cards/')) {
    throw Error('S12 strict-filter, deduplication or URL handling self-test failed');
  }
  console.log('S12 catalog converter self-test: PASSED');
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const mainRows = await download(FEEDS[0]);
  if (!mainRows || mainRows.length === 0) throw Error('WAV ARCHIVE main snapshot is empty; preserving last deployed site.');
  let apolloRows = null;
  try { apolloRows = await download(FEEDS[1], true); }
  catch (e) { console.warn(`Optional Apollo feed skipped: ${e.message}`); }
  const feeds = [{ filename: FEEDS[0], rows: mainRows }];
  if (apolloRows?.length) feeds.push({ filename: FEEDS[1], rows: apolloRows });
  const result = convert(feeds);
  if (result.objekts.length < 20) throw Error(`S12 entries (${result.objekts.length}) unexpectedly low; refusing to publish incomplete data.`);
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  const tmp = `${OUTPUT}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(result), 'utf8');
  await fs.rename(tmp, OUTPUT);
  console.log(`SUCCESS: ${result.provenance.uniqueYeonji} YEONJI objects / ${result.provenance.sourceCount} raw rows; wrote ${OUTPUT}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
