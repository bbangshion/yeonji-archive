import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const rows = read('public/data/yeonji-activities.json').activities;
const seed = read('public/data/yeonji-timeline-seed.json').activities;

test('S12 milestones are all sourced and well-formed', () => {
  assert.equal(new Set(rows.map(r=>r.id)).size, rows.length);
  for (const r of rows) {
    assert.equal(r.s12,true,`${r.id} member mismatch`);
    assert.match(r.date,/^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(r.date+'T00:00:00.000Z').toISOString().slice(0,10), r.date);
    assert.match(r.source,/^https:\/\//);
    for (const k of ['title','description']) for (const lang of ['ko','en','ja']) assert.ok(r[k]?.[lang]?.trim(),`${r.id} lacks ${k}.${lang}`);
  }
});

test('all curated seed records are present after non-destructive merge', () => {
  const ids = new Set(rows.map(r=>r.id));
  for (const r of seed) assert.ok(ids.has(r.id),`missing ${r.id}`);
  assert.ok(rows.length >= seed.length);
  for (const year of ['2023','2024','2025','2026']) assert.ok(rows.some(r => r.date.startsWith(year)), `missing ${year}`);
});

test('Signal dates and performances remain distinct from album releases', () => {
  assert.ok(rows.some(r => r.scope === 'SIGNAL' && r.kind === 'appearance'));
  assert.ok(rows.some(r => r.kind === 'concert'));
  assert.ok(rows.some(r => r.kind === 'release'));
});
