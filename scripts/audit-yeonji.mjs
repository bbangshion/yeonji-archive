import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const read = async path => JSON.parse(await fs.readFile(path, 'utf8'));
const member = value => String(value || '').toUpperCase().replace(/[.\s_-]/g, '');
const isS12 = value => ['S12','S12YEONJI','YEONJI','KWAKYEONJI','곽연지'].includes(member(value));
const isISO = date => date == null || (typeof date==='string' && /^\d{4}-\d\d-\d\d$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date);
const list = (root, field) => Array.isArray(root) ? root : root?.[field] || [];
export function inspect(photos, films, objekts, activities) {
  const errors = [];
  const counts = {photos: photos.length,films: films.length,objekts: objekts.length,activities: activities.length};
  for(const [type,rows] of Object.entries({photos,films,objekts,activities})){
    if(!Array.isArray(rows)){errors.push(`${type}: not an array`);continue;}
    const ids=new Set();
    for(const row of rows){
      const id = type==='films' ? row.youtubeId : row.id;
      if(!id || ids.has(id)) errors.push(`${type}: duplicated / empty ID ${id}`);
      ids.add(id);
      if(type==='photos' && !isS12(row.memberId)) errors.push(`photos: non-S12 ${id}`);
      if(type==='films' && !(row.memberIds||[]).some(isS12)) errors.push(`films: non-S12 ${id}`);
      if(type==='objekts' && !isS12(row.member)) errors.push(`objekts: non-S12 ${id}`);
      if(type==='activities' && row.s12 !== true) errors.push(`activities: non-S12 ${id}`);
      if(!isISO(row.date??row.issuedAt??row.publishedAt)) errors.push(`${type}: invalid date ${id}`);
    }
  }
  return { errors, counts };
}
async function main(){
  if(process.argv.includes('--self-test')){
    const good=inspect([{id:'cover',memberId:'S12'}],[{youtubeId:'abcdefghijk',memberIds:['S12']}],[{id:'one',member:'S12_YEONJI'}],[{id:'act',s12:true}]);
    assert.equal(good.errors.length,0);
    const bad=inspect([{id:'s20',memberId:'S20'}],[],[],[]);
    assert.ok(bad.errors.length>0);
    console.log('S12 archive isolation self-test: PASS');return;
  }
  const photoData=await read('public/data/photos.json');
  const filmData=await read('public/data/films.json');
  const objektData=await read('public/data/objekt.json');
  const activityData=await read('public/data/yeonji-activities.json');
  const result=inspect(list(photoData,'photos'),list(filmData,'items'),list(objektData,'objekts'),list(activityData,'activities'));
  console.log(JSON.stringify(result));
  if(result.errors.length && process.argv.includes('--ci'))process.exitCode=1;
}
await main();
