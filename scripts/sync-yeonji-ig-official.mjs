/**
 * YEONJI ARCHIVE — official/SNS/Instagram #연지 photo source reconciler.
 * No Instagram scraping, authentication bypass, or synthetic photo entries.
 * Meta hashtag matches are candidates only; a hashtag is not identity proof.
 * Explicitly approved, image-backed S12 photos are merged into photos.json.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const PATHS = {
  photos: 'public/data/photos.json',
  inbox: 'public/data/yeonji-social-inbox.json',
  candidates: 'public/data/yeonji-social-candidates.json',
  report: 'public/data/yeonji-social-audit.json',
};
const TAGS = ['연지', '곽연지', 'YeonJi', 'KwakYeonJi'];
const TAG_PATTERN = /(^|[^\p{L}\p{N}_])#(연지|곽연지|yeonji|kwakyeonji)(?=$|[^\p{L}\p{N}_])/iu;
const EXCLUDE_PATTERN = /(^|[^\p{L}\p{N}_])#지연(?=$|[^\p{L}\p{N}_])/u;
const KEY_S12 = /(?:^|[^\p{L}\p{N}])(?:곽연지|kwak\s*yeon\s*ji|S12)(?:$|[^\p{L}\p{N}])/iu;
const MAX_API_ITEMS = 400;
const VERSION = process.env.IG_GRAPH_API_VERSION || 'v24.0';
const SOURCE_TAG = 'Instagram / tripleS official';

function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function clean(x) { return typeof x === 'string' ? x.trim() : ''; }
function imageOK(img) {
  const s = clean(img);
  if (/^https:\/\//i.test(s)) { try { const u=new URL(s); return u.protocol === 'https:' && !/^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(u.hostname); } catch { return false; } }
  return /^(?!\/)(?!\.)(?!.*(?:\.\.\/|\/\.\.))[a-z\d_./%\-]+\.(?:jpg|jpeg|png|webp|avif)$/i.test(s);
}
function isoDate(x) {
  const s = clean(x).slice(0,10);
  if (!/^20\d\d-\d\d-\d\d$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s ? s : null;
}
function httpsUrl(x) { try { const u=new URL(clean(x)); return u.protocol==='https:' ? u.href : null; } catch { return null; } }
function normImage(img) {
  const s=clean(img);
  if(!/^https:/i.test(s)) return s.toLowerCase();
  try {
    const u=new URL(s); u.hash=''; u.search='';
    const p=decodeURIComponent(u.pathname).replace(/\/revision\/.*$/i,'');
    return (u.hostname.toLowerCase()+p).toLowerCase();
  } catch {return s.toLowerCase();}
}
function stableId(source, mediaId, img) {
  return 'yeonji-social-' + crypto.createHash('sha1').update([source,mediaId,img].join('|')).digest('hex').slice(0,18);
}
function photoRows(root) {
  if (Array.isArray(root)) return { list:root,wrap:false };
  if (isObj(root) && Array.isArray(root.photos)) return { list:root.photos,wrap:true };
  throw new Error('photos.json must contain an array or object with photos[]');
}
function validSource(c) {
  return !!httpsUrl(c.sourceUrl ?? c.permalink) && /^(?:https:\/\/)(?:www\.)?(?:instagram\.com|threads\.net|facebook\.com|x\.com|twitter\.com|triples\.fandom\.com|www\.triples-official\.jp|triples-official\.jp|kpopping\.com|pbs\.twimg\.com|youtube\.com|youtu\.be)/i.test(clean(c.sourceUrl ?? c.permalink));
}
function hashtags(text) { return TAG_PATTERN.test(clean(text)); }
function containsS12(text) { return KEY_S12.test(clean(text)) || hashtags(text); }
function normalizedCandidate(input) {
  if (!isObj(input)) return null;
  const sourceUrl=httpsUrl(input.sourceUrl ?? input.permalink);
  if (!sourceUrl) return null;
  const image=clean(input.image ?? input.media_url ?? input.thumbnail_url);
  const date=isoDate(input.date ?? input.timestamp ?? input.postedAt);
  const mediaId=clean(input.mediaId ?? input.id ?? input.instagramId) || sourceUrl;
  const caption=clean(input.caption ?? input.description);
  const username=clean(input.username ?? input.author);
  const tags=Array.isArray(input.tags)?input.tags.filter(x=>typeof x==='string').slice(0,20):[];
  return {
    id:stableId(sourceUrl,mediaId,image), memberId:'S12', sourceUrl, image, date, mediaId,
    caption, username, tags,
    channel: clean(input.channel) || 'instagram',
    official: input.official === true || ['triplescosmos','@triplescosmos'].includes(username.toLowerCase()),
    memberVerified: input.memberVerified === true,
    approved: input.approved === true,
    assetRightsReviewed: input.assetRightsReviewed === true,
    originalAuthor: clean(input.originalAuthor) || username || null,
    note: clean(input.note),
  };
}
function keyOf(x){return clean(x?.sourceUrl)+'|'+clean(x?.mediaId)+'|'+normImage(x?.image);}
function candidateProof(c) {
  return c.memberVerified===true && c.approved===true && c.assetRightsReviewed===true && imageOK(c.image) && !!c.date && validSource(c) && (c.date >= '2023-01-01') && (c.date <= new Date().toISOString().slice(0,10));
}
function toPhoto(c) {
  return {
    id:c.id, category:'photo', memberId:'S12',
    image:c.image, date:c.date,
    title:{ko:'곽연지',en:'Kwak YeonJi',ja:'クァク・ヨンジ'},
    album:{ko:c.official?'공식 SNS':'SNS',en:c.official?'Official SNS':'SNS',ja:c.official?'公式SNS':'SNS'},
    credit:{ko:'빵시온',en:'@bbangshion',ja:'빵시온'},
    sourceUrl:c.sourceUrl, originalAuthor:c.originalAuthor,
    tags:['S12','곽연지',...(c.tags||[])].slice(0,20),
    captureDateVerified:false, dateBasis:'post-publication',
    rightsStatus:'source-reviewed-not-a-licence-claim',
    identityVerified:true,reviewStatus:'approved',
  };
}
function dedupeMerge(photos, candidates) {
  const ids=new Set(photos.map(p=>clean(p.id)).filter(Boolean));
  const imgs=new Set(photos.map(p=>normImage(p.image)).filter(Boolean));
  const photoSourceKeys=new Set(photos.map(p=>`${clean(p.sourceUrl)}|${normImage(p.image)}`));
  let added=0, dupes=0, pending=0, invalid=0;
  for (const c of candidates) {
    if (!candidateProof(c)) { pending++; continue; }
    const k=normImage(c.image);
    if(!k) {invalid++;continue;}
    if(ids.has(c.id)||imgs.has(k)||photoSourceKeys.has(`${c.sourceUrl}|${k}`)) {dupes++;continue;}
    photos.push(toPhoto(c));ids.add(c.id);imgs.add(k);photoSourceKeys.add(`${c.sourceUrl}|${k}`);added++;
  }
  // Stable newest-first order, undated photos to the end without changing existing IDs
  photos.sort((a,b)=> (b.date||'').localeCompare(a.date||'') || clean(a.id).localeCompare(clean(b.id)));
  return {added,dupes,pending,invalid};
}
async function readJSON(file, fallback) {
  try {return JSON.parse(await fs.readFile(file,'utf8'));} catch(e){if(e.code==='ENOENT')return fallback;throw e;}
}
async function writeIfDifferent(file, value) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const next=JSON.stringify(value,null,2)+'\n';
  let old='';try{old=await fs.readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(old===next)return false;
  await fs.writeFile(file,next);return true;
}
async function graphFetch(url,token) {
  const u=new URL(url);
  if (u.hostname !== 'graph.facebook.com') throw new Error('Unexpected Graph API host');
  const ac=new AbortController();const tid=setTimeout(()=>ac.abort(),20000);
  try {
    const res=await fetch(u,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:ac.signal});
    if(!res.ok)throw new Error('Graph API HTTP '+res.status+': '+(await res.text()).slice(0,200));
    return await res.json();
  } finally {clearTimeout(tid);}
}
/** Optional Business Discovery of the official @triplescosmos profile.
 * Requires the necessary Meta app permissions; incomplete if disallowed.
 * CAROUSEL_ALBUM children are separate candidates to preserve photo counts.
 */
async function officialInstagramCandidates(userId, token) {
  const results=[], errors=[];
  try {
    const url=new URL('https://graph.facebook.com/'+VERSION+'/'+encodeURIComponent(userId));
    url.searchParams.set('fields','business_discovery.username(triplescosmos){media.limit(100){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username,children{id,media_type,media_url,thumbnail_url}}}');
    const json=await graphFetch(url,token);
    let media=json?.business_discovery?.media;
    if(!media) return {items:[], errors:['Official account Business Discovery is not available for this token']};
    let loops=0;
    while(media && loops++ < 4 && results.length < MAX_API_ITEMS) {
      for(const post of media.data||[]){
        if(!isObj(post))continue;
        if(!hashtags(post.caption) && !KEY_S12.test(clean(post.caption)))continue;
        if(post.media_type === 'VIDEO')continue;
        const images=post.media_type==='CAROUSEL_ALBUM' && Array.isArray(post.children?.data)
          ? post.children.data.filter(c=>c.media_type !== 'VIDEO') : [post];
        for (const part of images) {
          const c=normalizedCandidate({
            ...post, mediaId:part.id||post.id, sourceUrl:post.permalink,
            image:part.media_url||part.thumbnail_url||'',
            username:'triplescosmos', channel:'instagram-official', official:true,
            approved:false,memberVerified:false,assetRightsReviewed:false,
            tags:['S12','곽연지']
          });
          if(c)results.push(c);
        }
      }
      const next=clean(media.paging?.next);
      media=next.startsWith('https://graph.facebook.com/') ? await graphFetch(next,token) : null;
    }
  }catch(e){errors.push('Official Instagram: '+e.message);}
  return {items:results,errors};
}
async function metaCandidates() {
  const userId=clean(process.env.IG_USER_ID),token=clean(process.env.IG_ACCESS_TOKEN);
  if(!userId||!token)return {items:[],mode:'not-configured',errors:[]};
  const ret=[],errors=[];
  const official=await officialInstagramCandidates(userId,token);
  ret.push(...official.items);errors.push(...official.errors);
  for (const tag of TAGS) {
    try {
      const u=new URL('https://graph.facebook.com/'+VERSION+'/ig_hashtag_search');
      u.searchParams.set('user_id',userId);u.searchParams.set('q',tag);
      const id=(await graphFetch(u,token))?.data?.[0]?.id;
      if(!id)continue;
      let next=`https://graph.facebook.com/${VERSION}/${id}/recent_media?${new URLSearchParams({user_id:userId,fields:'id,caption,media_type,permalink,timestamp,username,media_url,thumbnail_url',limit:'100'})}`;
      let count=0;
      while(next&&count<MAX_API_ITEMS){
        const json=await graphFetch(next,token);
        for(const row of json.data||[]) {
          if(!isObj(row))continue;
          const caption=clean(row.caption);
          if(!hashtags(caption))continue;
          const candidate=normalizedCandidate({...row,sourceUrl:row.permalink,image:row.media_url || row.thumbnail_url || '',channel:'instagram-hashtag',approved:false,memberVerified:false,assetRightsReviewed:false,tags:['#'+tag]});
          if(candidate)ret.push(candidate);count++;
        }
        const paging=clean(json.paging?.next);
        next=paging.startsWith('https://graph.facebook.com/') ? paging : null;
      }
    } catch(e) {errors.push(`${tag}: ${e.message}`);}
  }
  return {items:ret,mode:'meta-official-and-hashtag-recent-partial',errors};
}
function rank(c) {return Number(c.approved===true)*4+Number(c.memberVerified===true)*2+Number(c.assetRightsReviewed===true);}
function mergeCandidateLists(inbox, backlog, fromAPI) {
  const m=new Map();
  for (const raw of [...backlog,...fromAPI,...inbox]) {
    const c=normalizedCandidate(raw);if(!c)continue;
    const key=keyOf(c);
    const existing=m.get(key);
    if(!existing || rank(c)>=rank(existing)) m.set(key,c);
  }
  return [...m.values()].sort((a,b)=>(b.date||'').localeCompare(a.date||'') || a.sourceUrl.localeCompare(b.sourceUrl));
}
function statByYear(items) {
  const out={};for(const p of items){const y=isoDate(p.date)?.slice(0,4);if(y)out[y]=(out[y]||0)+1;}return out;
}
function selfTest() {
  assert.equal(hashtags('사진 #연지 #tripleS'),true);
  assert.equal(hashtags('사진 #지연'),false);
  assert.equal(hashtags('사진 #연지님'),false);
  assert.equal(hashtags('사진 #YeonJi'),true);
  assert.equal(EXCLUDE_PATTERN.test('사진 #지연'),true);
  assert.equal(isoDate('2026-02-30'),null);
  const sample=normalizedCandidate({sourceUrl:'https://www.instagram.com/p/ABCD/',date:'2026-11-19',image:'https://example.com/a.jpg',approved:true,memberVerified:true,assetRightsReviewed:true,caption:'#연지',username:'triplescosmos'});
  assert.equal(candidateProof(sample),true);
  const copies=[{id:'cover',image:'images/yeonji-home.jpg',date:null}];
  assert.equal(dedupeMerge(copies,[sample]).added,1);
  assert.equal(dedupeMerge(copies,[sample]).added,0);
  assert.equal(dedupeMerge(copies,[{...sample,approved:false}]).added,0);
  assert.equal(mergeCandidateLists([{...sample,approved:true}],[{...sample,approved:false}],[])[0].approved,true);
  console.log('YEONJI official/Instagram photo sync self-test PASS');
}
async function main() {
  if(process.argv.includes('--self-test'))return selfTest();
  const photosDoc=await readJSON(PATHS.photos,[]);
  const {list,wrap}=photoRows(photosDoc);
  const inbox=await readJSON(PATHS.inbox,[]),backlog=await readJSON(PATHS.candidates,[]);
  if(!Array.isArray(inbox)||!Array.isArray(backlog))throw new Error('social inbox and candidates must be JSON arrays');
  const api=await metaCandidates();
  const candidates=mergeCandidateLists(inbox,backlog,api.items);
  const change=dedupeMerge(list,candidates);
  const photos=wrap?{...photosDoc,photos:list}:list;
  const report={
    checkedAt:new Date().toISOString(),memberId:'S12',
    coverage:'partial — public/authorized sources only; not all Instagram hashtag posts',
    queryTags:TAGS.map(t=>'#'+t), metaApiMode:api.mode, metaApiErrors:api.errors,
    registeredPhotos:list.length, photosByYear:statByYear(list), newestDate:[...list].map(p=>p.date).filter(Boolean).sort().at(-1)||null,
    candidates:candidates.length, candidatesWithImage:candidates.filter(c=>imageOK(c.image)).length,
    candidatesWithoutImage:candidates.filter(c=>!imageOK(c.image)).length,
    ...change,
  };
  await writeIfDifferent(PATHS.photos,photos);
  await writeIfDifferent(PATHS.candidates,candidates);
  await writeIfDifferent(PATHS.report,report);
  console.log(JSON.stringify(report,null,2));
}
await main();
