/**
 * YEONJI ARCHIVE: link photo entries from the separate main Fandom gallery.
 * The SNS archive uses its own importer: this script supplements it, never replaces it.
 *
 * Source: https://triples.fandom.com/wiki/Kwak_YeonJi/Gallery
 * Scope: promotional/pictorial/SNS/misc/behind-the-scenes/stages still photos.
 * Excludes: videos, fancams, Objekt cards, polaroids, unspecified assets.
 *
 * GitHub Action: node scripts/import-yeonji-gallery.mjs --strict
 * Offline verification: node scripts/import-yeonji-gallery.mjs --self-test
 * Fandom blocks some API clients: optional --input path/to/wikitext-export.wiki
 * IMPORTANT: imports external image URL references, does NOT download photos.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export const GALLERY_PAGE = 'https://triples.fandom.com/wiki/Kwak_YeonJi/Gallery';
const API = 'https://triples.fandom.com/api.php';
const TARGET = 'public/data/photos.json';
const REPORT = 'public/data/yeonji-gallery-sync.json';
const DETAIL = 'public/data/yeonji-gallery.json';
const USER_AGENT = 'YEONJI-ARCHIVE-S12-Gallery/1.0 (fan-maintained reference index; no media download)';
const MAX_PAYLOAD_BYTES = 18 * 1024 * 1024;
const MAX_IMAGES = 4500;
const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|avif)$/i;
const DISALLOWED = /(objekt|polaroid|\.gif$|\.svg$)/i;
const PHOTO_SECTIONS = new Map([
  ['promotional', {ko:'프로모션',en:'Promotional',ja:'プロモーション'}],
  ['pictorial', {ko:'화보',en:'Pictorial',ja:'グラビア'}],
  ['sns', {ko:'SNS',en:'SNS',ja:'SNS'}],
  ['misc', {ko:'기타',en:'Misc.',ja:'その他'}],
  ['behind', {ko:'비하인드',en:'Behind the Scenes',ja:'ビハインド'}],
  ['stages', {ko:'무대',en:'Stages',ja:'ステージ'}],
]);
const SECTION_REGEX = /^(promotional|pictorial|sns|misc(?:ellaneous)?\.?|behind\s*the\s*scenes|stages|videos|fancams|objekts|polaroids)$/i;
const SECTION_MAP = {promotional:'promotional',pictorial:'pictorial',sns:'sns',misc:'misc',miscellaneous:'misc',behindthescenes:'behind',stages:'stages',videos:'exclude',fancams:'exclude',objekts:'exclude',polaroids:'exclude'};
const isoDate = (raw) => {
  const result = String(raw || '').match(/(?<!\d)(?:(20\d\d)[-./])?(0?[1-9]|1[0-2])[-./](0?[1-9]|[12]\d|3[01])(?!\d)/);
  return result ? [result[1]||null,Number(result[2]),Number(result[3])] : null;
};
function makeDate(raw, year) {
  const info=isoDate(raw);
  if (!info) return null;
  const y=Number(info[0]||year),mo=info[1],d=info[2];
  if (!(y>=2023&&y<=2100)) return null;
  const t=new Date(Date.UTC(y,mo-1,d));
  if (t.getUTCFullYear()!==y || t.getUTCMonth()!==mo-1 || t.getUTCDate()!==d) return null;
  return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function plain(value) {
  return String(value||'').replace(/<!--.*?-->/g,'').replace(/<[^>]+>/g,' ').replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g,'$1')
    .replace(/\{\{[^{}]*\}\}/g,' ').replace(/'{2,}/g,'').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
}
function safeName(name) {return String(name||'').replace(/^(file|image):\s*/i,'').replace(/_/g,' ').trim();}
function fileKey(name){return safeName(name).toLocaleLowerCase().replace(/\s+/g,'_');}
function validImage(name) {return IMAGE_EXTENSION.test(safeName(name)) && !DISALLOWED.test(safeName(name));}
function isImageUrl(url) {
  try {const u = new URL(url);return u.protocol==='https:' && /\.(?:jpe?g|png|webp|avif)(?:[/?#]|$)/i.test(u.pathname);} catch{return false;}
}
function getSection(text) {
  const key=plain(text).toLocaleLowerCase().replace(/[^a-z]/g,'');
  return SECTION_MAP[key]||null;
}
function sourceTitle(chunk){return plain(chunk).replace(/\[\[|\]\]/g,'').slice(0,130);}
/** Parse only explicitly listed files in the main member gallery.
 * A year without a verified day stays in sourceYear rather than being made 01-01.
 */
export function parseMainGallery(wikitext) {
  const photos=[];const seen=new Set();
  let activeSection='promotional';let year=null;let subheading='';let pendingDate=null;let inGallery=false;let headingDepth=9;
  function add(file, caption='') {
    const name=safeName(file);
    if (!validImage(name) || activeSection==='exclude' || !year) return;
    const key=fileKey(name); if(seen.has(key))return;
    seen.add(key);
    const date=makeDate(caption,year) ?? makeDate(subheading,year) ?? pendingDate;
    const section=PHOTO_SECTIONS.get(activeSection)||PHOTO_SECTIONS.get('misc');
    photos.push({file:name,year:String(year),date,album:section,section:activeSection,chapter:subheading,caption:plain(caption)});
  }
  for (const raw of String(wikitext).split(/\r?\n/)) {
    const line=raw.trim(); if(!line || line.startsWith('<!--'))continue;
    const header=line.match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if(header){
      const depth=header[1].length, title=sourceTitle(header[2]);
      const section=getSection(title);
      if(section){activeSection=section;year=null;subheading='';pendingDate=null;headingDepth=depth;continue;}
      const yearMatch=title.match(/^(20\d{2})(?:\s*년)?$/);
      if(yearMatch){year=Number(yearMatch[1]);subheading='';pendingDate=null;continue;}
      if(depth<=headingDepth && SECTION_REGEX.test(title)){activeSection=getSection(title)||'exclude';year=null;subheading='';pendingDate=null;continue;}
      subheading=title;pendingDate=makeDate(title,year);continue;
    }
    // Fandom sometimes uses <tabber> labels for category headings.
    const tab=line.match(/^\|?-?\s*([^|=<>]{3,35})\s*\|?=\s*$/);
    if(tab && getSection(tab[1])) {activeSection=getSection(tab[1]);year=null;subheading='';pendingDate=null;continue;}
    if (/<gallery(?:\s|>)/i.test(line)) {inGallery=true;continue;}
    if (/<\/gallery\s*>/i.test(line)) {inGallery=false;continue;}
    if (activeSection==='exclude' || !year || photos.length>=MAX_IMAGES)continue;
    // A standalone date label applies to images that follow it.
    if(!inGallery && !/(?:File|Image):/i.test(line) && line.length<45 && isoDate(plain(line))) {
      pendingDate=makeDate(plain(line),year); continue;
    }
    if(inGallery) {
      const trimmed=line.replace(/^\|\s*/, '').replace(/^(?:File|Image):\s*/i,'');
      const [file,...caption] = trimmed.split('|');
      if (file) add(file, caption.join(' '));
      continue;
    }
    // Inline wiki table / File links (exclude non-file thumbnails and embed references).
    for(const match of line.matchAll(/\[\[(?:File|Image):([^|\]]+)([^\]]*)\]\]/gi)) add(match[1], match[2]||'');
    // Some main galleries list image names in template parameters.
    const imageParam=line.match(/^\|(?:image|file|photo)(?:\d+)?\s*=\s*(?:File:)?([^|{}\n]+?\.(?:jpe?g|png|webp|avif))\s*$/i);
    if (imageParam) add(imageParam[1]);
  }
  return photos;
}
async function limitedFetch(url,accept='application/json',timeout=28000){
  const ac=new AbortController();const cancel=setTimeout(()=>ac.abort(),timeout);
  try {
    const res=await fetch(url,{headers:{Accept:accept,'User-Agent':USER_AGENT},signal:ac.signal,redirect:'follow'});
    if(!res.ok)throw Error(`HTTP ${res.status}`);
    const buf=Buffer.from(await res.arrayBuffer());
    if(buf.length>MAX_PAYLOAD_BYTES)throw Error('Response exceeded size limit');
    return buf.toString('utf8');
  } finally {clearTimeout(cancel);}
}
function apiUrl(args) {return `${API}?${new URLSearchParams(args)}`;}
async function obtainWikitext(){
  const probes=[
    apiUrl({action:'parse',page:'Kwak_YeonJi/Gallery',prop:'wikitext',format:'json',formatversion:'2'}),
    apiUrl({action:'query',prop:'revisions',titles:'Kwak YeonJi/Gallery',rvprop:'content',rvslots:'main',format:'json',formatversion:'2'}),
    `${GALLERY_PAGE}?action=raw`,
  ];
  const errors=[];
  for(const url of probes){try{
    const data=await limitedFetch(url);
    if(data.startsWith('{')){
      const obj=JSON.parse(data);
      if(obj.error)throw Error(obj.error.info||obj.error.code||'MediaWiki API returned an error');
      const value=obj.parse?.wikitext?.['*']??obj.parse?.wikitext??obj.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
      if(typeof value==='string' && value.length>100)return value;
    } else if(data.includes('<gallery')||data.includes('[[File:'))return data;
    throw Error('Empty or incompatible wiki source');
  }catch(err){errors.push(String(err.message||err));}}
  throw Error(`Unable to read source: ${errors.join(' / ')}`);
}
async function lookupImages(rows){
  const results=new Map();
  for(let i=0;i<rows.length;i+=25){
    const names=rows.slice(i,i+25).map(x=>`File:${x.file}`);
    const data=JSON.parse(await limitedFetch(apiUrl({action:'query',prop:'imageinfo',titles:names.join('|'),iiprop:'url|extmetadata',iiurlwidth:'800',format:'json',formatversion:'2'})));
    if(data.error)throw Error(data.error.info||data.error.code||'imageinfo error');
    if(!Array.isArray(data.query?.pages))throw Error('imageinfo lacked pages');
    for(const page of data.query.pages){
      const info=page.imageinfo?.[0];if(!info)continue;
      const display=info.thumburl||info.url;
      if(!isImageUrl(display))continue;
      const filename=String(page.title||'').replace(/^(?:File|Image):/i,'');
      results.set(fileKey(filename),{image:display,original:info.url,filePage: `https://triples.fandom.com/wiki/File:${encodeURIComponent(filename.replace(/ /g,'_'))}`,
        artist:info.extmetadata?.Artist?.value??null,license:info.extmetadata?.LicenseShortName?.value??null});
    }
  }
  return results;
}
function compactId(file){return Buffer.from(fileKey(file)).toString('base64url').slice(0,160);}
export function addMainGallery(existing, rows, infos){
  if(!Array.isArray(existing))throw Error('photos.json must contain a JSON array');
  const ids=new Set(existing.map(x=>x?.id).filter(Boolean));
  const fileNames=new Set(existing.map(x=>fileKey(x?.originalFileName||'')).filter(Boolean));
  const images=new Set(existing.map(x=>x?.image).filter(Boolean));
  const added=[];
  for(const row of rows){
    const img=infos.get(fileKey(row.file));if(!img || !isImageUrl(img.image))continue;
    // Identical file across SNS Archive and Gallery is a single card, retain first source metadata.
    const id=`fandom-s12-${Buffer.from(row.file).toString('base64url').slice(0,160)}`;
    if(ids.has(id)||fileNames.has(fileKey(row.file))||images.has(img.image)||images.has(img.original))continue;
    const label=row.date?.replace(/-/g,'.')||row.year;
    const chapter=row.chapter && !/^(?:\d{4}|\d{2}[./]\d{2})$/.test(row.chapter) ? row.chapter : '';
    const heading=[label,chapter,'곽연지'].filter(Boolean).join(' · ');
    const photo={
      id,category:'photo',memberId:'S12',identityVerified:false,
      image:isImageUrl(img.original) ? img.original : img.image,
      thumbnail:img.image,
      title:{ko:heading,en:`YeonJi · ${[label,chapter].filter(Boolean).join(' · ')}`,ja:`ヨンジ · ${[label,chapter].filter(Boolean).join(' · ')}`},
      album:row.album,date:row.date,sourceYear:row.year,
      credit:{ko:'아카이브 정리 · @bbangshion',en:'Curated by @bbangshion',ja:'アーカイブ編集 · @bbangshion'},
      sourceUrl:img.filePage,
      tags:['곽연지','YeonJi','S12','빵시온',row.album.ko,chapter].filter(Boolean),
      originalFileName:row.file,sourceCollection:GALLERY_PAGE,sourceSection:row.section,
      rightsStatus:'media-license-not-confirmed',assetType:'external-link',
      originalArtistMetadata:img.artist,mediaLicense:img.license,
      curator:'@bbangshion'
    };
    added.push(photo);ids.add(id);fileNames.add(fileKey(row.file));images.add(photo.image);images.add(img.image);
  }
  return {photos:[...existing,...added],added};
}
async function sync(argv) {
  const p=argv.indexOf('--input');const file=p>=0?argv[p+1]:null;
  const dryRun=argv.includes('--dry-run');
  const attempt=new Date().toISOString();
  const report={source:GALLERY_PAGE,attemptedAt:attempt,mode:file?'local-wikitext':'MediaWiki-API',status:'not-run',sourceRows:0,matchedImages:0,added:0,total:0,
    caveat:'Only gallery-listed file metadata is linked, not downloaded. Year-only images have an unknown exact date.'};
  const existing=JSON.parse(await fs.readFile(TARGET,'utf8'));
  try {
    const input=file?await fs.readFile(file,'utf8'):await obtainWikitext();
    const rows=parseMainGallery(input);
    if(!rows.length)throw Error('No eligible still-image file names found in the gallery wikitext');
    report.sourceRows=rows.length;
    const images=await lookupImages(rows);report.matchedImages=images.size;
    if(!images.size)throw Error('Gallery had no resolvable image URLs');
    const {photos,added}=addMainGallery(existing,rows,images);
    report.added=added.length;report.total=photos.length;report.status='synced';
    if(!dryRun){
      await fs.writeFile(TARGET,`${JSON.stringify(photos,null,2)}\n`);
      const included=photos.filter(x=>x.sourceCollection===GALLERY_PAGE);
      const data={schemaVersion:'1.0',source:GALLERY_PAGE,generatedAt:attempt,memberId:'S12',
        totalPhotos:included.length,years:[2026,2025,2024,2023].map(year=>({year,count:included.filter(p=>p.sourceYear===String(year)).length})),
        photos:included.map(x=>({id:x.id,date:x.date,sourceYear:x.sourceYear,section:x.sourceSection,sourceUrl:x.sourceUrl,originalFileName:x.originalFileName}))};
      await fs.writeFile(DETAIL,`${JSON.stringify(data,null,2)}\n`);
    }
    console.log(`YEONJI Gallery: ${rows.length} still files; ${images.size} matched; ${added.length} new; ${photos.length} site photos.`);
  } catch(error){
    report.status='unavailable';report.total=existing.length;report.error=String(error.message||error);
    console.warn(`Gallery not imported; existing ${existing.length} photos untouched. ${report.error}`);
    if(argv.includes('--strict'))process.exitCode=1;
  }
  if(!dryRun)await fs.writeFile(REPORT,`${JSON.stringify(report,null,2)}\n`);
  return report;
}
function test(){
  const fixture=`== Promotional ==
=== 2023 ===
==== Reveal ====
<gallery>
YeonJi_Reveal_A.jpg|Concept #1
File:YeonJi_Reveal_B.png|02/05
</gallery>
=== 2024 ===
==== ASSEMBLE24 ====
<gallery>
YeonJi_ASSEMBLE24.jpg|Concept #2
</gallery>
== Behind the Scenes ==
=== 2025 ===
==== 11/24 ====
<gallery>
YeonJi_Behind.jpg|Jacket shoot
YeonJi_Reveal_A.jpg|duplicate
</gallery>
== Videos ==
=== 2026 ===
<gallery>
video_thumbnail.jpg|Do not import
</gallery>
== Fancams ==
=== 2026 ===
<gallery>
fancam_cover.jpg|Do not import
</gallery>
== Stages ==
=== 2026 ===
<gallery>
stage_photo.png|No exact day
</gallery>`;
  const rows=parseMainGallery(fixture);
  assert.equal(rows.length,5);
  assert.equal(rows[0].year,'2023');assert.equal(rows[0].date,null);
  assert.equal(rows[1].date,'2023-02-05');
  assert.equal(rows[3].date,'2025-11-24');
  assert.equal(rows[4].year,'2026');assert.equal(rows[4].section,'stages');
  const infos=new Map(rows.map(row=>[fileKey(row.file),{image:`https://static.wikia.nocookie.net/test/images/0/ab/${encodeURIComponent(row.file)}/revision/latest`,filePage:GALLERY_PAGE,artist:null,license:null}]));
  const snsFile='YeonJi_Reveal_B.png';
  const existing=[{id:'fandom-s12-abc',image:'https://test.org/x.jpg',originalFileName:snsFile,memberId:'S12'}];
  const {photos,added}=addMainGallery(existing,rows,infos);
  assert.equal(added.length,4);assert.equal(photos.length,5);
  assert.ok(added.every(p=>p.memberId==='S12' && p.sourceUrl && !p.date?.includes('2026-01-01')));
  assert.equal(added[0].sourceYear,'2023');
  console.log('YEONJI Gallery tests PASS: sections, years, verified dates, media exclusions, SNS dedupe, curator.');
}
const called=process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1]);
if(called){if(process.argv.includes('--self-test'))test();else await sync(process.argv.slice(2));}
