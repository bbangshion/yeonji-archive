/**
 * YEONJI FILM official YouTube Atom feed watcher.
 * The feed is limited to recent uploads, not a historical archive.
 * No video is added to the public catalog by this script.
 * Matching a title is a REVIEW CANDIDATE, never proof of S12 appearance.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OFFICIAL_CHANNEL_ID = 'UCJnL-TBcsYrF2SLs7tmiC8Q';
export const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${OFFICIAL_CHANNEL_ID}`;
const RELEVANT_TITLE = /곽\s*연지|(?<![가-힣])연지(?![가-힣])|kwak[\s._-]*yeon[\s._-]*ji|\byeon[\s._-]*ji\b|\bs12\b/i;
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
const escapeDecoded = text => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_,code) => {
  const named = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'"};
  if (code[0] === '#') {
    const value = Number.parseInt(code[1]?.toLowerCase()==='x' ? code.slice(2) : code.slice(1), code[1]?.toLowerCase()==='x'?16:10);
    return Number.isFinite(value) && value >= 0 && value <= 0x10FFFF && !(value >= 0xD800 && value <= 0xDFFF) ? String.fromCodePoint(value) : '';
  }
  return named[code.toLowerCase()] || '';
});
const getTag = (item, tag) => {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = item.match(re);
  return match ? escapeDecoded(match[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()) : '';
};
export function classifyTitle(title) {
  if (/signal/i.test(title)) return { category:'signal', kind:'signal' };
  if (/behind|비하인드|making|메이킹|현장|vlog|브이로그/i.test(title)) return { category:'other', kind:'behind' };
  if (/live|라이브/i.test(title)) return { category:'live', kind:'live' };
  if (/직캠|fancam|focus/i.test(title)) return { category:'performance', kind:'fancam' };
  if (/dance|choreography|안무/i.test(title)) return { category:'performance', kind:'dance' };
  if (/official mv|music video/i.test(title)) return { category:'music', kind:'mv' };
  return { category:'other', kind:'other' };
}
export function parseOfficialFeed(xml) {
  if (typeof xml !== 'string' || !xml.includes('<feed') || !xml.includes('</feed>')) throw new Error('Invalid YouTube Atom response');
  const feedChannel = getTag(xml, 'yt:channelId');
  if (feedChannel !== OFFICIAL_CHANNEL_ID) throw new Error(`Unexpected channel in Atom feed: ${feedChannel || 'missing'}`);
  const entries = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(match => match[1]);
  if (!entries.length) throw new Error('Empty Atom feed; previous review queue preserved');
  const seen = new Set();
  return entries.flatMap(entry => {
    const youtubeId = getTag(entry,'yt:videoId');
    const entryChannel = getTag(entry,'yt:channelId');
    const title = getTag(entry,'title');
    const publishedAt = getTag(entry,'published').slice(0,10);
    if (!validId(youtubeId) || entryChannel !== OFFICIAL_CHANNEL_ID || !title || seen.has(youtubeId)) return [];
    seen.add(youtubeId);
    if (!RELEVANT_TITLE.test(title)) return [];
    const dateIsValid = /^\d{4}-\d\d-\d\d$/.test(publishedAt) && !Number.isNaN(Date.parse(publishedAt));
    return [{youtubeId,title,publishedAt:dateIsValid ? publishedAt : null,
      source:'tripleS official', channelId:OFFICIAL_CHANNEL_ID,
      url:`https://www.youtube.com/watch?v=${youtubeId}`, status:'pending',
      ...classifyTitle(title), reviewNote:'영상에서 곽연지 출연을 직접 확인한 후 승인하세요.'}];
  });
}
export function mergeReviewQueue(previous, incoming, published) {
  const queue = Array.isArray(previous?.candidates) ? previous.candidates.filter(x=>validId(x?.youtubeId)) : [];
  const found = new Set([...queue.map(x=>x.youtubeId),...published]);
  const newCandidates = incoming.filter(x=>!found.has(x.youtubeId));
  const candidates = [...newCandidates,...queue].sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
  return {version:1, source:'official-youtube-atom', channelId:OFFICIAL_CHANNEL_ID, candidates};
}
async function main() {
  const root = process.env.YEONJI_REPO_ROOT || process.cwd();
  const catalog = JSON.parse(fs.readFileSync(path.join(root,'public/data/films.json'),'utf8'));
  if (!Array.isArray(catalog.items)) throw new Error('public/data/films.json invalid');
  const published = new Set(catalog.items.map(x=>x?.youtubeId).filter(validId));
  const reportFile = path.join(root,'reports/yeonji-film-review.json');
  const prior = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile,'utf8')) : {candidates:[]};
  let xml;
  if (process.env.YEONJI_FEED_FILE) xml = fs.readFileSync(process.env.YEONJI_FEED_FILE,'utf8');
  else {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),15000);
    try {
      const response = await fetch(FEED_URL,{signal:controller.signal,headers:{'User-Agent':'YeonJiArchive-OfficialFeedWatcher/1.0','Accept':'application/atom+xml,application/xml;q=0.9'}});
      if (!response.ok) throw new Error(`YouTube Atom HTTP ${response.status}`);
      xml = await response.text();
    } finally {clearTimeout(timeout);}
  }
  const incoming = parseOfficialFeed(xml);
  const report = mergeReviewQueue(prior,incoming,published);
  const output = JSON.stringify(report,null,2)+'\n';
  fs.mkdirSync(path.dirname(reportFile),{recursive:true});
  const changed = !fs.existsSync(reportFile) || fs.readFileSync(reportFile,'utf8') !== output;
  if (changed) fs.writeFileSync(reportFile,output);
  console.log(`Official feed candidates: ${incoming.length}; new queued: ${report.candidates.length-(prior.candidates?.length||0)}; pending: ${report.candidates.filter(x=>x.status==='pending').length}; changed=${changed}`);
  console.log('This scan never writes public/data/films.json.');
}
const direct = process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if (direct) main().catch(error => {console.error('Film feed scan failed:',error.message);process.exitCode=1;});
