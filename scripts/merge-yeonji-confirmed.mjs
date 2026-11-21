/** Curated, source-checked tripleS official SIGNAL entries. Only inserts missing video IDs. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.YEONJI_REPO_ROOT || process.cwd();
const file = path.join(root, 'public/data/films.json');
const additions = [
  {
    youtubeId: '2hg-ezffEbI',
    title: 'tripleS의 평범한 나날들 (feat.연지) | SIGNAL 260312',
    publishedAt: '2026-03-12', scope: 'group',
  },
  {
    youtubeId: 'ZFO2w3TDpb4',
    title: '펌프 여신 곽곽 곽연지 | SIGNAL 230518',
    publishedAt: '2023-05-18', scope: 'solo',
  },
  {
    youtubeId: 'O583LWP68Ic',
    title: '코토네와 연지 서울 등장 | SIGNAL 230301',
    publishedAt: '2023-03-01', scope: 'group',
  },
];
if (!fs.existsSync(file)) throw new Error('films.json is missing; refusing to create or replace the catalog');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!data || !Array.isArray(data.items)) throw new Error('films.json has no items array');
const existing = new Set(data.items.map(item => item?.youtubeId || item?.videoId));
const newItems = additions.filter(item => !existing.has(item.youtubeId)).map(item => ({
  ...item, memberIds: ['S12'], group: 'tripleS', publisher: 'official',
  source: 'tripleS official', song: '', note: '공식 YouTube 제목에서 곽연지 출연을 확인한 SIGNAL.',
  category: 'signal', kind: 'signal', verified: true,
  reference: `https://www.youtube.com/watch?v=${item.youtubeId}`,
}));
if (newItems.length) {
  data.items.push(...newItems);
  data.items.sort((a,b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  data.updatedAt = new Date().toISOString().slice(0,10);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
console.log(`Curated SIGNAL entries: ${newItems.length} added, ${data.items.length} total (no replacements)`);
