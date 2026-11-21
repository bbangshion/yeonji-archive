/**
 * YEONJI ARCHIVE — S12 SNS Gallery synchronizer.
 * Source: https://triples.fandom.com/wiki/Kwak_YeonJi/Gallery/SNS_Archive
 * Only keeps EXPLICITLY listed images from this single page. Does not download or
 * republish the image files; uses image URLs supplied by MediaWiki imageinfo.
 * This is a source reference, not verification of each photo's owner or license.
 *
 * Usage:
 *   node scripts/import-yeonji-fandom.mjs           # automatic API sync
 *   node scripts/import-yeonji-fandom.mjs --input path/to/page.wiki
 *   node scripts/import-yeonji-fandom.mjs --input path/to/saved-page.html
 *   node scripts/import-yeonji-fandom.mjs --self-test
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export const SOURCE_PAGE = 'https://triples.fandom.com/wiki/Kwak_YeonJi/Gallery/SNS_Archive';
const API = 'https://triples.fandom.com/api.php';
const TARGET = 'public/data/photos.json';
const REPORT = 'public/data/yeonji-fandom-sync.json';
const MAX_BYTES = 15 * 1024 * 1024;
const THUMB_WIDTH = 820;
const UA = 'YEONJI-Archive-Fan-Index/1.6.4 (metadata-only, public wiki MediaWiki API)';
const MAX_ROWS = 5000;
const INVALID_FILE = /(objekt|polaroid|\.gif$|\.svg$)/i;
const VALID_FILE = /\.(?:jpe?g|png|webp|avif)$/i;
const dateRegex = /(?<!\d)(?:(20\d{2})[-./])?(0?[1-9]|1[0-2])[-./](0?[1-9]|[12]\d|3[01])(?!\d)/;

const cleanMarkup = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/''+/g, '').replace(/&nbsp;/gi,' ').replace(/\s+/g, ' ').trim();
function encodeTitle(s) { return String(s).normalize('NFC').replace(/_/g,' ').trim(); }
function titleKey(s) { return encodeTitle(s).toLowerCase().replace(/\s+/g, '_'); }
function fileValid(s) { const file = encodeTitle(s).replace(/^(?:file|image):\s*/i, ''); return VALID_FILE.test(file) && !INVALID_FILE.test(file); }
function isoDate(raw, year) {
  const match = cleanMarkup(raw).match(dateRegex);
  if (!match) return null;
  const y = Number(match[1] ?? year);
  const m = Number(match[2]); const d = Number(match[3]);
  if (y < 2023 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m-1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth()+1 !== m || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function albumFor(headers) {
  const combined = headers.join(' ').toLowerCase();
  if (/cosmo|코스모/.test(combined)) return {ko:'COSMO', en:'COSMO', ja:'COSMO'};
  if (/sns|twitter|instagram|x\s*\/|트위터|인스타/.test(combined)) return {ko:'공식 SNS',en:'Official SNS',ja:'公式SNS'};
  return {ko:'SNS 아카이브',en:'SNS Archive',ja:'SNSアーカイブ'};
}
function uniqueRows(rows) {
  const seen = new Set(); const out = [];
  for (const item of rows) {
    if (!fileValid(item.file)) continue;
    const key = titleKey(item.file);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({file:encodeTitle(item.file).replace(/^(?:file|image):\s*/i,''), date:item.date ?? null, album:item.album});
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}
/** Supports MediaWiki source `<gallery>` and File:... inside wiki tables. */
export function parseWikitext(wikitext) {
  let year = null; let headers = []; let inGallery = false;
  let mostRecentDate = null;
  const rows = [];
  for (const original of String(wikitext).split(/\r?\n/)) {
    const line = original.trim();
    const h = line.match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if (h) {
      const depth = h[1].length;
      const name = cleanMarkup(h[2]);
      const yearMatch = name.match(/\b(20\d{2})\b/);
      if (yearMatch && /^20\d{2}(?:\s*년)?$/.test(name)) { year = Number(yearMatch[1]); headers = [name]; }
      else { headers = headers.slice(0,Math.max(1,depth-2)); headers.push(name); }
      mostRecentDate = null;
      continue;
    }
    if (/<gallery(?:\s|>)/i.test(line)) { inGallery=true; continue; }
    if (/<\/gallery\s*>/i.test(line)) { inGallery=false; continue; }
    if (!year || /^(?:<!--|\|\-|\{\{!)/.test(line)) continue;
    if (!inGallery) {
      // Some Fandom pages format a date as its own line preceding image rows.
      const standalone = cleanMarkup(line);
      if (dateRegex.test(standalone) && standalone.length < 55) mostRecentDate = isoDate(standalone, year);
    }
    let file = null; let caption='';
    if (inGallery) {
      const entry = line.replace(/^(?:\|\s*)?(?:File|Image):/i,'');
      const parts = entry.split('|');
      file = parts.shift()?.trim() ?? '';
      caption = parts.join(' ');
    } else {
      const m = line.match(/\[\[(?:File|Image):([^\]|]+)([^\]]*)\]\]/i);
      if (!m) continue;
      file=m[1]; caption=m[2];
    }
    if (file && fileValid(file)) {
      const date = isoDate(caption, year) ?? isoDate(headers.join(' '), year) ?? mostRecentDate;
      rows.push({file,date,album:albumFor(headers)});
    }
  }
  return uniqueRows(rows);
}
/** Supports a browser-saved HTML page, using associated figure captions where present.
 * HTML without filenames should not silently invent image URLs. */
export function parseHtml(html) {
  const rows=[]; let year=null; let album={ko:'SNS 아카이브',en:'SNS Archive',ja:'SNSアーカイブ'};
  const tags=String(html).match(/<(?:h[2-6]|figure|img|a)\b[^>]*>(?:[\s\S]*?<\/(?:h[2-6]|figure|a)>)?/gi) ?? [];
  for (const tag of tags) {
    const header = tag.match(/^<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/i);
    if (header) {
      const value=cleanMarkup(header[2]);
      const match=value.match(/\b20\d{2}\b/);
      if (match) year=Number(match[0]);
      album=albumFor([value]);
      continue;
    }
    if (!year) continue;
    let file=null;
    const match=tag.match(/(?:href|data-src|src)=["']([^"']+)["']/i);
    if (match) {
      const decoded=match[1].replace(/&amp;/g,'&');
      const found=decoded.match(/(?:File:|\/images\/|\/wiki\/File:)([^?#"'&]+\.(?:jpe?g|png|webp|avif))/i);
      if (found) file=decodeURIComponent(found[1]).replace(/_/g,' ');
    }
    if (file && fileValid(file)) rows.push({file,date:isoDate(tag,year),album});
  }
  return uniqueRows(rows);
}
async function fetchSafe(url,timeout=28000) {
  const controller = new AbortController();
  const stop = setTimeout(()=>controller.abort(),timeout);
  try {
    const response = await fetch(url, {signal:controller.signal,headers:{'Accept':'application/json, text/plain;q=0.9','User-Agent':UA},redirect:'follow'});
    if (!response.ok) throw Error(`HTTP ${response.status} (${new URL(url).pathname})`);
    const reader = response.body?.getReader();
    if (!reader) return await response.text();
    let size = 0; const chunks=[];
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw Error('Remote response exceeds safety limit');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { clearTimeout(stop); }
}
function params(input) { return `${API}?${new URLSearchParams(input)}`; }
async function getWikiSource() {
  const errors=[];
  for (const endpoint of [
    params({action:'parse',page:'Kwak_YeonJi/Gallery/SNS_Archive',prop:'wikitext',format:'json',formatversion:'2'}),
    params({action:'query',prop:'revisions',titles:'Kwak YeonJi/Gallery/SNS Archive',rvprop:'content',rvslots:'main',format:'json',formatversion:'2'}),
    'https://triples.fandom.com/wiki/Kwak_YeonJi/Gallery/SNS_Archive?action=raw',
  ]) {
    try {
      const output=await fetchSafe(endpoint);
      if (output.startsWith('{')) {
        const data=JSON.parse(output);
        if (data.error) throw Error(data.error.info || data.error.code || 'API error');
        const result=data.parse?.wikitext?.['*'] ?? data.parse?.wikitext ?? data.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
        if (typeof result==='string' && result.length>100) return result;
        throw Error('Unexpected or empty MediaWiki response');
      }
      if (output.length > 100 && (output.includes('<gallery')||output.includes('File:'))) return output;
      throw Error('No gallery source in response');
    } catch(e) { errors.push(String(e.message ?? e)); }
  }
  throw Error(`Fandom fetch failed: ${errors.join('; ')}`);
}
function isImageHTTPS(url) {
  try { const u=new URL(url); return u.protocol==='https:' && /\.(?:jpe?g|png|webp|avif)(?:[/?#]|$)/i.test(u.pathname); } catch {return false;}
}
async function resolveImageInfo(files) {
  const byName=new Map();
  for (let i=0;i<files.length;i+=30) {
    const titles=files.slice(i,i+30).map(x=>`File:${x.file}`);
    const url=params({action:'query',titles:titles.join('|'),prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:String(THUMB_WIDTH),format:'json',formatversion:'2'});
    const body=JSON.parse(await fetchSafe(url));
    if (body.error) throw Error(body.error.info || body.error.code);
    if (!Array.isArray(body.query?.pages)) throw Error('imageinfo pages are missing');
    for (const p of body.query.pages) {
      const info=p.imageinfo?.[0];
      if (!info) continue;
      const image=info.thumburl || info.url;
      if (!isImageHTTPS(image)) continue;
      byName.set(titleKey(p.title.replace(/^(?:File|Image):/i,'')),{
        image,
        page:typeof p.canonicalurl==='string' ? p.canonicalurl : `${SOURCE_PAGE}?image=${encodeURIComponent(p.title)}`,
        original:info.url,
        license:info.extmetadata?.LicenseShortName?.value ?? null,
        artist:info.extmetadata?.Artist?.value ?? null,
      });
    }
  }
  return byName;
}
function fileIdentifier(name) { return Buffer.from(name).toString('base64url').slice(0,160); }
export function mergePhotos(existing, rows, infos) {
  if (!Array.isArray(existing)) throw Error('Existing photos.json must be an array');
  const identifiers=new Set(existing.map(p=>p?.id).filter(x=>typeof x==='string'));
  const previousImages=new Set(existing.map(p=>p?.image).filter(x=>typeof x==='string'));
  const added=[];
  for (const row of rows) {
    const info=infos.get(titleKey(row.file));
    if (!info || !isImageHTTPS(info.image)) continue;
    const id=`fandom-s12-${fileIdentifier(row.file)}`;
    if (identifiers.has(id) || previousImages.has(info.image)) continue;
    const dateText=row.date?.replace(/-/g,'.');
    const label=dateText ? `${dateText} 곽연지` : '곽연지 SNS 사진';
    added.push({
      id,category:'photo',memberId:'S12',identityVerified:false,
      image:info.image,
      title:{ko:label,en:dateText?`YeonJi · ${dateText}`:'YeonJi SNS photo',ja:dateText?`ヨンジ · ${dateText}`:'ヨンジ SNS写真'},
      album:row.album,date:row.date,
      credit:{ko:'아카이브 정리 · @bbangshion',en:'Curated by @bbangshion',ja:'アーカイブ整理 · @bbangshion'},
      sourceUrl:info.page,
      tags:['S12','YeonJi','곽연지','연지','SNS',row.album.ko],
      assetType:'external-link',rightsStatus:'media-license-not-confirmed',
      identityStatus:'listed-on-S12-gallery-not-visually-verified',
      sourceCollection:SOURCE_PAGE,
      mediaLicense:info.license,
      originalArtistMetadata:info.artist,
      originalFileName:row.file,
      curator:'@bbangshion'
    });
    identifiers.add(id); previousImages.add(info.image);
  }
  return {photos:[...existing,...added],added};
}
async function sync(argv) {
  const inputFlag=argv.indexOf('--input');
  const inputFile = inputFlag!==-1 ? argv[inputFlag+1] : null;
  const dryRun = argv.includes('--dry-run');
  const report={source:SOURCE_PAGE,mode:inputFile?'local-input':'public-api',attemptedAt:new Date().toISOString(),status:'not-run',sourceRows:0,matchedImages:0,added:0,total:0,notice:'External photos are linked, not downloaded. Per-image rights require separate review.'};
  const existing=JSON.parse(await fs.readFile(TARGET,'utf8'));
  try {
    const wikitext=inputFile ? await fs.readFile(inputFile,'utf8') : await getWikiSource();
    const rows=wikitext.includes('<html')||wikitext.includes('<!DOCTYPE') ? parseHtml(wikitext) : parseWikitext(wikitext);
    if (rows.length===0) throw Error('No dated or undated image entries could be parsed from the exact SNS Archive');
    report.sourceRows=rows.length;
    const infos=await resolveImageInfo(rows);
    report.matchedImages=infos.size;
    if (!infos.size) throw Error('No resolved images; refusing to replace existing photo data');
    const {photos,added}=mergePhotos(existing,rows,infos);
    report.added=added.length; report.total=photos.length; report.status='synced';
    if (!dryRun) {
      await fs.writeFile(TARGET,JSON.stringify(photos,null,2)+'\n');
      const snsPhotos = photos.filter(p => p.memberId === 'S12' && p.sourceCollection === SOURCE_PAGE);
      const years = [2026, 2025, 2024, 2023].map(year => ({year,count:snsPhotos.filter(p=>p.date?.startsWith(String(year))).length}));
      const meta = {
        schemaVersion:'1.0.0',memberId:'S12',generatedAt:report.attemptedAt,status:'synced',
        source:{title:'Kwak YeonJi/Gallery/SNS Archive',page:SOURCE_PAGE,dateBasis:'Gallery caption date; not necessarily date of creation'},
        totalPhotos:snsPhotos.length, years,
        photos:snsPhotos.map(p=>({id:p.id,date:p.date,image:p.image,sourceUrl:p.sourceUrl,originalFileName:p.originalFileName})),
      };
      await fs.writeFile('public/data/yeonji-sns.json',JSON.stringify(meta,null,2)+'\n');
    }
    console.log(`[S12 Fandom] source ${rows.length} / resolved ${infos.size} / new ${added.length} / total ${photos.length}`);
  } catch(err) {
    report.status='unavailable'; report.total=existing.length; report.error=String(err?.message ?? err);
    console.warn(`[S12 Fandom] Could not verify remote gallery: ${report.error}. Existing ${existing.length} entries preserved.`);
    if (argv.includes('--strict')) process.exitCode=1;
  }
  if (!dryRun) await fs.writeFile(REPORT,JSON.stringify(report,null,2)+'\n');
  return report;
}
function selfTest() {
  const sample=`== 2025 ==\n=== Cosmo Exclusive ===\n<gallery>\nYeonJi_Photo_A.jpg|09/18\nYeonJi_Photo_B.jpg|09/18 (with JooBin)\nYeonJi_Photo_B.jpg|09/18 duplicate\n</gallery>\n== 2024 ==\n=== SNS ===\n<gallery>\nYeonJi_2024_C.png|03/04\nFake_Objekt.png|03/04\n</gallery>`;
  const items=parseWikitext(sample);
  assert.equal(items.length,3);
  assert.equal(items[0].date,'2025-09-18');
  assert.equal(items[1].album.ko,'COSMO');
  assert.equal(items[2].date,'2024-03-04');
  const infos=new Map(items.map(i=>[titleKey(i.file),{image:`https://static.wikia.nocookie.net/testing/images/${i.file}`,page:SOURCE_PAGE,license:null,artist:null}]));
  const {photos,added}=mergePhotos([{id:'existing',image:'https://example.org/portrait.jpg'}],items,infos);
  assert.equal(photos.length,4); assert.equal(added.length,3);
  assert.equal(added[0].credit.ko,'아카이브 정리 · @bbangshion');
  assert.ok(added.every(p=>p.memberId==='S12' && p.sourceUrl));
  console.log('[S12 Fandom] self-test PASS: dated source items, duplicate filtering, merge, curator vs origin');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--self-test')) selfTest();
  else await sync(process.argv.slice(2));
}
