#!/usr/bin/env node
/**
 * YEONJI ARCHIVE • Instagram bulk media importer.
 * Reads reviewed post metadata and user-provided, redistribution-authorized assets.
 * Does NOT scrape Instagram or obtain media without explicit review.
 * Preserves existing photos.json; adds only distinct, verified S12 photos.
 * Requires Node.js 20+ and no dependencies.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT=process.cwd();
const MANIFEST=path.join(ROOT,'public/data/yeonji-instagram-bulk.json');
const TARGET=path.join(ROOT,'public/data/photos.json');
const REPORT=path.join(ROOT,'public/data/yeonji-instagram-bulk-report.json');
const PHOTOS_DIR=path.join(ROOT,'public');
const pad=(v)=>String(v||'').trim();
const dateOK=(s)=>{if(!/^20\d\d-\d\d-\d\d$/.test(pad(s)))return false;
  let v=new Date(s+'T00:00:00Z');return !Number.isNaN(+v)&&v.toISOString().slice(0,10)===s&&s<=new Date().toISOString().slice(0,10);};
function sourceOK(value){
 try {const u=new URL(pad(value)); return u.protocol==='https:'&& /^(www\.)?instagram\.com$/i.test(u.hostname) && /^\/(p|reel)\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname);}catch{return false;}
}
function shortcode(url){ try{const u=new URL(url);return u.pathname.split('/')[2]||'';}catch{return '';}}
function imgKey(url){
 if(typeof url!=='string')return '';
 const v=url.trim();if(!v)return '';
 if(!/^https?:\/\//i.test(v))return v.replace(/^\/+/,'').toLowerCase();
 try{const u=new URL(v);u.search='';u.hash='';return u.hostname.toLowerCase()+decodeURIComponent(u.pathname).replace(/\/revision\/.*$/i,'').toLowerCase()}catch{return v.toLowerCase()}
}
function imgPath(value){
 const s=pad(value);if(!s)return null;
 if(/^https:\/\//i.test(s)){
  try{const u=new URL(s);if(u.protocol==='https:' && !/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname))return {image:s,file:null};}catch{}
  return null;
 }
 if(!/^images\/yeonji-instagram\/[a-zA-Z0-9_./-]+\.(?:jpg|jpeg|png|webp|avif)$/i.test(s) || s.includes('..'))return null;
 return {image:s,file:path.join(PHOTOS_DIR,s)};
}
function normalizeMedia(item){return typeof item==='string'?{image:item}:item;}
async function jsonOr(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}}
async function shaFile(file){let b=await fs.readFile(file);return crypto.createHash('sha256').update(b).digest('hex')}
async function writeIfDifferent(file,data){
 const t=JSON.stringify(data,null,2)+'\n';let old='';try{old=await fs.readFile(file,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
 if(old===t)return false;await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,t);return true;
}
function getItems(root){if(Array.isArray(root))return {items:root,wrapped:false};if(root && Array.isArray(root.photos))return {items:root.photos,wrapped:true};throw new Error('photos.json must be an array or an object with photos[]')}
const manifest=await jsonOr(MANIFEST,[]);
if(!Array.isArray(manifest))throw Error('yeonji-instagram-bulk.json must be an array');
const data=await jsonOr(TARGET,[]);const {items:photos}=getItems(data);
const ids=new Set(photos.map(p=>pad(p.id)).filter(Boolean));
const images=new Set(photos.map(p=>imgKey(p.image)).filter(Boolean));
const sourceImage=new Set(photos.map(p=>pad(p.sourceUrl)+'|'+imgKey(p.image)));
const newHashes=new Set(photos.map(p=>pad(p.fileSha256)).filter(Boolean));
const stats={checkedPosts:0,foundMedia:0,added:0,duplicate:0,pendingReview:0,invalid:0,missingFiles:0,
  earliestNew:null,newestNew:null,knownPhotoCountBefore:photos.length,knownPhotoCountAfter:photos.length,
  issues:[], note:'Only authorized, verified, explicitly approved images are imported. No Instagram scraping or bypass.'};
for(const post of manifest){
 stats.checkedPosts++;
 const u=pad(post?.sourceUrl);const date=pad(post?.date);const code=shortcode(u);
 const files=Array.isArray(post?.media)?post.media:Array.isArray(post?.images)?post.images:[];
 if(!sourceOK(u)||!dateOK(date)||!code){stats.invalid++;stats.issues.push({sourceUrl:u,reason:'Invalid Instagram sourceUrl or publication date'});continue;}
 if(!post.memberVerified||!post.approved||!post.rightsReviewed){
  stats.pendingReview+=files.length||1;continue;
 }
 if(!files.length){stats.pendingReview++;stats.issues.push({sourceUrl:u,reason:'No reviewed media files or URLs in post'});continue;}
 const author=pad(post.originalAuthor)||'@triplescosmos';
 for(let i=0;i<files.length;i++){
  stats.foundMedia++;
  const entry=normalizeMedia(files[i]);const ref=imgPath(entry?.image||entry?.path);
  if(!ref){stats.invalid++;stats.issues.push({sourceUrl:u,index:i+1,reason:'Missing/invalid media image'});continue;}
  let filehash=null;
  if(ref.file){try{filehash=await shaFile(ref.file)}catch(e){stats.missingFiles++;stats.issues.push({sourceUrl:u,index:i+1,reason:'File not uploaded to public/images/yeonji-instagram'});continue}}
  const key=imgKey(ref.image);
  const id=`yeonji-ig-${code}-${String(i+1).padStart(2,'0')}`;
  if(ids.has(id)||images.has(key)||sourceImage.has(u+'|'+key)||(filehash&&newHashes.has(filehash))){stats.duplicate++;continue;}
  const title={ko:'곽연지',en:'Kwak YeonJi',ja:'クァク・ヨンジ'};
  const album={ko:'공식 인스타그램',en:'Official Instagram',ja:'公式Instagram'};
  const photo={id,memberId:'S12',category:'photo',image:ref.image,date,
    title,album,credit:{ko:'빵시온',en:'@bbangshion',ja:'빵시온'},
    sourceUrl:u,originalAuthor:author,sourcePlatform:'instagram',instagramShortcode:code,
    photoIndex:i+1,albumCaption:pad(post.caption).slice(0,400),
    tags:['곽연지','S12','연지','Instagram'],identityVerified:true,
    reviewStatus:'approved',captureDateVerified:false,dateBasis:'post-publication',
    rightsStatus:'user-reviewed; image use authorized by uploader',
    ...(filehash?{fileSha256:filehash}:{})};
  photos.push(photo); ids.add(id);images.add(key);sourceImage.add(u+'|'+key);
  if(filehash)newHashes.add(filehash);
  stats.added++;
  if(!stats.earliestNew||date<stats.earliestNew)stats.earliestNew=date;
  if(!stats.newestNew||date>stats.newestNew)stats.newestNew=date;
 }
}
photos.sort((a,b)=>(pad(b.date)).localeCompare(pad(a.date))||pad(a.id).localeCompare(pad(b.id)));
stats.knownPhotoCountAfter=photos.length;
if(stats.added){await writeIfDifferent(TARGET,data)}
await writeIfDifferent(REPORT,stats);
console.log(JSON.stringify(stats,null,2));
if(process.env.GITHUB_STEP_SUMMARY){
 const summary=`## YEONJI Instagram bulk import\n\n- Checked posts: ${stats.checkedPosts}\n- New photos: ${stats.added}\n- Duplicates: ${stats.duplicate}\n- Missing files: ${stats.missingFiles}\n- Pending review: ${stats.pendingReview}\n- Current photos.json: ${stats.knownPhotoCountAfter}\n\n> Success does not mean all Instagram photos have been collected; only reviewed media entries with valid assets are imported.\n`;
 await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
}
