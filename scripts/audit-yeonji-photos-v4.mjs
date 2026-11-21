/**
 * YEONJI PHOTO V4: conservative, source-based import of manually approved photos.
 * This script never downloads, modifies, or deletes an image and never mistakes a
 * collection reference for a photo. Only members explicitly tagged S12 qualify.
 * Run: node scripts/audit-yeonji-photos-v4.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const PATHS = {
  photos: 'public/data/photos.json',
  candidates: 'public/data/yeonji-photo-candidates.json',
  sources: 'public/data/recent-photo-collections.json',
  report: 'public/data/yeonji-photo-v4-report.json',
};
function read(file, fallback = undefined) {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required file: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function validDate(value) {
  if (typeof value !== 'string' || !/^20\d\d-\d\d-\d\d$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}
function validHttps(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname.includes('.'); }
  catch { return false; }
}
function validImage(value) {
  return validHttps(value) || (typeof value === 'string' &&
    /^(?!\/)(?!\.)(?!.*\.{2})[a-zA-Z0-9_/%.-]+\.(?:jpe?g|png|webp|avif)$/.test(value));
}
function normalizedImage(image) {
  if (typeof image !== 'string') return '';
  try {
    const url = new URL(image);
    url.hash = '';
    const host = url.hostname.toLowerCase();
    let file = decodeURIComponent(url.pathname).normalize('NFC');
    if (host.endsWith('.wikia.nocookie.net') || host === 'static.wikia.nocookie.net') {
      file = file.replace(/\/revision\/[^/]+.*$/i, '');
      url.search = '';
    }
    return `${host}${file}${url.search}`.toLowerCase();
  } catch { return image.trim().toLowerCase(); }
}
function normalizeTitle(value) {
  if (typeof value === 'string' && value.trim()) return { ko: value.trim() };
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.ko === 'string' && value.ko.trim()) {
    return { ko: value.ko.trim(), ...(typeof value.en === 'string' ? { en: value.en.trim() } : {}),
      ...(typeof value.ja === 'string' ? { ja: value.ja.trim() } : {}) };
  }
  return null;
}
function isApproved(photo) {
  return photo && typeof photo === 'object' && !Array.isArray(photo) &&
    photo.reviewStatus === 'approved' && photo.memberId === 'S12' &&
    photo.verifiedBy === '@bbangshion' && validDate(photo.date) &&
    validImage(photo.image) && validHttps(photo.sourceUrl) &&
    typeof photo.id === 'string' && /^yeonji-[a-zA-Z0-9_-]{5,}$/.test(photo.id) &&
    normalizeTitle(photo.title) && normalizeTitle(photo.album);
}
function summary(photos, year = '2026') {
  const dated = photos.filter(p => p && p.memberId === 'S12' && validDate(p.date));
  const inYear = dated.filter(p => p.date.startsWith(year));
  const months = Object.fromEntries([...new Set(inYear.map(p => p.date.slice(0,7)))].sort().reverse()
    .map(month => [month, inYear.filter(p => p.date.startsWith(month)).length]));
  return {
    registeredS12: photos.filter(p => p?.memberId === 'S12').length,
    registeredDated: dated.length,
    year,
    yearCount: inYear.length,
    latestDate: inYear.map(p => p.date).sort().at(-1) || null,
    monthlyCounts: months,
  };
}
function run() {
  const original = read(PATHS.photos);
  const candidates = read(PATHS.candidates, []);
  if (!Array.isArray(original) || !Array.isArray(candidates)) throw Error('photos.json and candidates must be arrays. Nothing modified.');
  const photoIds = new Set(original.map(p => String(p?.id || '').trim()).filter(Boolean));
  const photoImages = new Set(original.map(p => normalizedImage(p?.image)).filter(Boolean));
  const accepted = [];
  const issues = [];
  const breakdown = { submitted: candidates.length, approved: 0, rejected: 0, duplicates: 0, added: 0 };
  for (const [index, candidate] of candidates.entries()) {
    if (!isApproved(candidate)) {
      breakdown.rejected++;
      issues.push({ index, id: candidate?.id ?? null, reason: 'Not approved or missing S12, valid date, source URL, photo image, verifiedBy or title' });
      continue;
    }
    breakdown.approved++;
    const key = normalizedImage(candidate.image);
    if (photoIds.has(candidate.id) || photoImages.has(key)) {
      breakdown.duplicates++;
      issues.push({ index, id: candidate.id, reason: 'Already registered: same ID or original image URL' });
      continue;
    }
    const next = {
      id: candidate.id, category: 'photo', memberId: 'S12', image: candidate.image,
      title: normalizeTitle(candidate.title), album: normalizeTitle(candidate.album),
      date: candidate.date, credit: { ko: '아카이브 정리 @bbangshion', en: 'Curated by @bbangshion', ja: '編集 @bbangshion' },
      sourceUrl: candidate.sourceUrl,
      tags: Array.isArray(candidate.tags) ? candidate.tags.filter(x => typeof x === 'string').slice(0,12) : [],
      reviewStatus: 'approved', verifiedBy: '@bbangshion',
      rightsStatus: candidate.rightsStatus || 'source-attributed-not-licensed',
      sourceCredit: typeof candidate.sourceCredit === 'string' ? candidate.sourceCredit : '',
    };
    photoIds.add(candidate.id);
    photoImages.add(key);
    accepted.push(next);
  }
  const combined = [...original, ...accepted];
  breakdown.added = accepted.length;
  const before = summary(original);
  const after = summary(combined);
  const references = read(PATHS.sources, { collections: [] });
  const referenceCount = Array.isArray(references?.collections) ? references.collections.length : 0;
  const report = {
    schemaVersion: '4.0', memberId: 'S12',
    before, after, changes: breakdown, referenceCollections: referenceCount,
    warnings: [
      'External collection references are not individual photo entries',
      'Fandom or Instagram links alone do not prove image ownership or permission',
      'No photos are downloaded or created; only manually approved candidate image URLs are merged',
      ...(after.yearCount === 0 ? ['No verified 2026 photos have been registered; update requires approved image entries'] : []),
    ],
    issues: issues.slice(0, 100),
  };
  // Atomic write only after validation, preserving preexisting entries byte-for-byte in memory.
  const put = (file, data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const value = JSON.stringify(data, null, 2) + '\n';
    if (fs.existsSync(file) && fs.readFileSync(file,'utf8') === value) return;
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, value, 'utf8');
    fs.renameSync(temp, file);
  };
  if (accepted.length) put(PATHS.photos, combined);
  put(PATHS.report, report);
  const lines = [
    '### YEONJI PHOTO V4 — verified photo audit',
    `- S12 images registered: ${before.registeredS12} → ${after.registeredS12}`,
    `- 2026 S12 images: ${before.yearCount} → ${after.yearCount}`,
    `- Latest actual registered date (2026): ${after.latestDate ?? 'none'}`,
    `- Candidate entries submitted / approved / imported: ${breakdown.submitted} / ${breakdown.approved} / ${breakdown.added}`,
    `- Rejected / already registered: ${breakdown.rejected} / ${breakdown.duplicates}`,
    `- External reference collections (NOT counted as photos): ${referenceCount}`,
    '- Photo data are not deleted, existing URLs are not modified and no photos are invented',
  ];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  return report;
}
run();
