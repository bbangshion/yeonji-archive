/** Merge verified YEONJI timeline events without deleting previously added activities. */
import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve('public/data/yeonji-activities.json');
const seed = path.resolve('public/data/yeonji-timeline-seed.json');
const existing = JSON.parse(fs.readFileSync(target, 'utf8'));
const patch = JSON.parse(fs.readFileSync(seed, 'utf8'));
if (!Array.isArray(existing.activities) || !Array.isArray(patch.activities)) {
  throw new Error('Invalid activities JSON; no file changed');
}
const allowed = new Set(['milestone', 'unit', 'release', 'concert', 'appearance']);
const valid = (r) => r && r.s12 === true && typeof r.id === 'string' && /^\d{4}-\d\d-\d\d$/.test(r.date) &&
  !Number.isNaN(Date.parse(r.date+'T00:00:00Z')) && allowed.has(r.kind) && /^https:\/\//.test(r.source) &&
  ['title','description'].every(k => ['ko','en','ja'].every(l => typeof r[k]?.[l] === 'string' && r[k][l].trim()));
if (![...existing.activities,...patch.activities].every(valid)) throw new Error('Found invalid activity row; no file changed');
const map = new Map(existing.activities.map(row => [row.id,row]));
for (const row of patch.activities) map.set(row.id, row);
const activities = [...map.values()].sort((a,b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
const changed = activities.length - existing.activities.length;
fs.writeFileSync(target, JSON.stringify({...existing, updatedAt:'2026-11-21',activities},null,2)+'\n');
console.log(`YEONJI timeline: ${activities.length} verified catalog entries; ${changed} new rows; known records refreshed`);
