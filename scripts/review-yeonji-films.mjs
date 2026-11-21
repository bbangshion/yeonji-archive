/** Manual decision for queued videos. approve only after checking the actual footage. */
import fs from 'node:fs';
import path from 'node:path';

const root=process.env.YEONJI_REPO_ROOT || process.cwd();
const reviewFile=path.join(root,'reports/yeonji-film-review.json');
const catalogFile=path.join(root,'public/data/films.json');
const command=process.argv[2];
const ids=(process.argv[3]||'').split(/[,\s]+/).map(v=>v.trim()).filter(Boolean);
if (!['approve','ignore'].includes(command) || ids.length<1 || ids.length>20) {
  throw new Error('Usage: node scripts/review-yeonji-films.mjs approve|ignore 12345678901,ABCDEFGHIJK (max 20 IDs)');
}
if (ids.some(id=>!/^[A-Za-z0-9_-]{11}$/.test(id)) || new Set(ids).size!==ids.length) throw new Error('Video IDs must be unique 11-char YouTube IDs');
const report=JSON.parse(fs.readFileSync(reviewFile,'utf8'));
const catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
if (!Array.isArray(report.candidates) || !Array.isArray(catalog.items)) throw new Error('Bad review queue or catalog');
const index=new Map(report.candidates.map(c=>[c.youtubeId,c]));
for (const id of ids) {
  const c=index.get(id);
  if (!c) throw new Error(`ID not in review queue: ${id}`);
  if (c.status!=='pending') throw new Error(`Video already reviewed: ${id} (${c.status})`);
  if (c.channelId!=='UCJnL-TBcsYrF2SLs7tmiC8Q') throw new Error(`Untrusted channel for ${id}`);
}
const published=new Set(catalog.items.map(v=>v.youtubeId));
if(command==='approve') for(const id of ids) if(published.has(id)) throw new Error(`Already present in catalog: ${id}`);
const today=new Date().toISOString().slice(0,10);
for(const id of ids){
  const c=index.get(id);
  c.status=command==='approve'?'approved':'ignored';
  c.reviewedAt=today;
  if(command==='approve') catalog.items.push({
    youtubeId:id,title:c.title,category:c.category,publishedAt:c.publishedAt,
    memberIds:['S12'],group:'tripleS',scope:'group',publisher:'official',
    source:'tripleS official',song:'',note:'곽연지 출연 확인 후 수동 승인한 영상',
    kind:c.kind,reference:c.url,verified:true,
  });
}
if(command==='approve'){
  catalog.items.sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
  catalog.updatedAt=today;
  fs.writeFileSync(catalogFile,JSON.stringify(catalog,null,2)+'\n');
}
fs.writeFileSync(reviewFile,JSON.stringify(report,null,2)+'\n');
console.log(`${command}: ${ids.length} video(s). Manual review state updated.`);
