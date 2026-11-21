/**
 * YEONJI ARCHIVE — first-party, lightweight images for World Cup PNG sharing.
 * Run AFTER sync-wav-s12.mjs, BEFORE vite build, in GitHub Actions.
 * CORS prevents browser Canvas from exporting many externally hosted photos;
 * downloading publicly available card thumbnails during deployment makes
 * poster rendering use same-origin, safe images without a user-tracking proxy.
 *
 * Does not modify the original Objekt catalog or its original image URLs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const CATALOG_FILE = path.resolve('public/data/objekt.json');
const OUTPUT_DIR = path.resolve('public/objekt-poster');
const MAP_FILE = path.resolve('public/data/objekt-poster-map.json');
const CONCURRENCY = 10;
const MAX_IMAGE_BYTES = 9 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const ID_LENGTH = 24;

function assetName(url) {
  return `${createHash('sha256').update(url).digest('hex').slice(0, ID_LENGTH)}.webp`;
}
function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443') return null;
    if (u.hostname === 'localhost' || /(?:^|\.)(?:local|internal|localhost)$/.test(u.hostname)) return null;
    if (/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(u.hostname)) return null;
    if (u.hostname === '::1' || u.hostname.includes(':')) return null;
    return u.href;
  } catch { return null; }
}
async function readLimitedBody(response) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_IMAGE_BYTES) throw new Error('source image too large');
  if (!response.body) throw new Error('empty image response');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) throw new Error('source image too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}
async function downloadAndOptimize(url, target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; YEONJI-ARCHIVE-Poster/1.7.1)',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!safeUrl(response.url)) throw new Error('unsafe redirect');
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/image\/|application\/octet-stream/i.test(contentType)) throw new Error(`not an image: ${contentType}`);
    const original = await readLimitedBody(response);
    if (original.length < 64) throw new Error('empty image');
    // 660px is sharp enough for share posters, yet small enough for mobile.
    const image = await sharp(original, { failOn: 'error', limitInputPixels: 30_000_000 })
      .rotate()
      .resize({ width: 660, height: 990, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    if (image.length < 64) throw new Error('empty optimized image');
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, image);
    await fs.rename(temp, target);
    return true;
  } finally { clearTimeout(timer); }
}
async function validCachedFile(file) {
  try {
    const info = await fs.stat(file);
    return info.isFile() && info.size >= 64 && info.size <= MAX_IMAGE_BYTES;
  } catch { return false; }
}
function catalogRows(input) {
  if (Array.isArray(input)) return input;
  return input?.objekts ?? input?.items ?? [];
}
async function build() {
  const raw = JSON.parse(await fs.readFile(CATALOG_FILE, 'utf8'));
  const rows = catalogRows(raw);
  if (!Array.isArray(rows)) throw Error('Invalid Objekt catalog');
  const urls = [...new Set(rows.map((item) => typeof item?.imageUrl === 'string' ? item.imageUrl.trim() : null)
    .filter((value) => value && safeUrl(value)))].sort();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(MAP_FILE), { recursive: true });
  let index = 0;
  let downloaded = 0;
  let cached = 0;
  let unavailable = 0;
  let firstErrors = 0;
  const sources = {};
  async function worker() {
    while (index < urls.length) {
      const url = urls[index++];
      const filename = assetName(url);
      const outputPath = path.join(OUTPUT_DIR, filename);
      let usable = await validCachedFile(outputPath);
      if (usable) cached++;
      else {
        try {
          // One retry for temporary CDN errors; never retry unsafe URLs.
          try { usable = await downloadAndOptimize(safeUrl(url), outputPath); }
          catch (firstError) {
            if (!/HTTP (?:429|50[0234])|abort|fetch failed|timeout/i.test(String(firstError?.message || firstError))) throw firstError;
            await new Promise((resolve) => setTimeout(resolve, 900));
            usable = await downloadAndOptimize(safeUrl(url), outputPath);
          }
          if (usable) downloaded++;
        } catch (error) {
          unavailable++;
          if (firstErrors++ < 12) console.warn(`[poster cache] skipped ${new URL(url).hostname}: ${error.message}`);
        }
      }
      if (usable) sources[url] = `objekt-poster/${filename}`;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  // Don't publish outdated cache files for cards that are no longer in the catalog.
  const used = new Set(Object.values(sources).map((asset) => path.basename(asset)));
  for (const filename of await fs.readdir(OUTPUT_DIR)) {
    if (filename.endsWith('.webp') && !used.has(filename)) await fs.rm(path.join(OUTPUT_DIR, filename), { force: true });
  }
  const data = {
    version: 1,
    preparedAt: new Date().toISOString(),
    totalSourceImages: urls.length,
    prepared: Object.keys(sources).length,
    sources,
  };
  const tmp = `${MAP_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data), 'utf8');
  await fs.rename(tmp, MAP_FILE);
  console.log(`[poster cache] ${urls.length} unique URLs: ${cached} cached, ${downloaded} new, ${unavailable} unavailable.`);
  console.log(`[poster cache] ${Object.keys(sources).length} cards ready for same-origin PNG sharing.`);
  // Only warn, don't break the entire archive if an image host is temporarily unavailable.
  if (urls.length && !Object.keys(sources).length) console.warn('[poster cache] WARNING: image hosts blocked all downloads; card photos may be unavailable in exported PNGs.');
}
if (process.argv.includes('--self-test')) {
  const url = 'https://example.org/objekt/A.webp';
  const hash = assetName(url);
  if (!/^[a-f0-9]{24}\.webp$/.test(hash) || safeUrl('http://localhost/img') || !safeUrl(url) || safeUrl('https://127.0.0.1/x')) throw Error('poster cache self-test failed');
  console.log('poster cache self-test: PASSED');
} else {
  build().catch((error) => { console.error(error); process.exitCode = 1; });
}
