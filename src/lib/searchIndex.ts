/** Search data adapter for the YEONJI ARCHIVE 1.9 interface.
 * All data stays in its original JSON source; the index is built in memory
 * only when someone opens SEARCH. No extra synchronization pipeline.
 */
import type { Objekt } from '../types/objekt';
import { normalizeFilms, filmThumbnail } from './films';
import type { Language } from '../i18n/messages';

export type SearchCategory = 'profile' | 'photos' | 'film' | 'collection';
export type SearchFilter = SearchCategory | 'all';
export type SearchLabel = { ko: string; en: string; ja: string };
export type SearchEntry = {
  key: string;
  id: string;
  category: SearchCategory;
  title: SearchLabel;
  description: SearchLabel;
  image: string | null;
  date: string | null;
  year: string | null;
  searchText: string;
};

const BASE = import.meta.env.BASE_URL;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const rawText = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const langText = (value: unknown, fallback: string): SearchLabel => {
  if (typeof value === 'string' && value.trim()) return { ko: value.trim(), en: value.trim(), ja: value.trim() };
  const obj = isRecord(value) ? value : {};
  const ko = rawText(obj.ko) || fallback;
  return { ko, en: rawText(obj.en) || ko, ja: rawText(obj.ja) || ko };
};
export const searchLabel = (item: SearchLabel, language: Language) => item[language] || item.ko;
export const normalizeSearchText = (value: string): string => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

/** Use the same core PHOTO eligibility rule as the gallery: never index Objekt photos. */
export function indexPhotos(payload: unknown): SearchEntry[] {
  const rows = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.photos) ? payload.photos : [];
  const seen = new Set<string>();
  const results: SearchEntry[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    if (row.memberId && row.memberId !== 'S12') continue;
    if (typeof row.category === 'string' && row.category.toLowerCase() !== 'photo') continue;
    if (typeof row.type === 'string' && row.type.toLowerCase() !== 'photo') continue;
    const id = rawText(row.id);
    const rawImage = rawText(row.image);
    if (!id || !rawImage || seen.has(id)) continue;
    if (/(^|\/)objekt(?:-collection)?\//i.test(rawImage)) continue;
    let image: string | null = null;
    if (/^https:\/\//i.test(rawImage)) {
      try { image = new URL(rawImage).href; } catch { /* invalid URL */ }
    } else if (/^(?!\/)(?!\.)(?!.*\/\.?\.\/)[a-z\d_./%\-]+\.(?:jpe?g|png|webp|avif)$/i.test(rawImage)) {
      image = `${BASE}${rawImage}`;
    }
    if (!image) continue;
    seen.add(id);
    const title = langText(row.title, '곽연지');
    const album = langText(row.album, '사진');
    // SNS Archive is the legacy album label; the gallery displays 빵연지.
    if (/^SNS\s*(아카이브|Archive|アーカイブ)$/i.test(album.ko)) {
      album.ko = '빵연지'; album.en = 'bbangshion'; album.ja = '빵연지';
    }
    const date = /^\d{4}-\d\d-\d\d$/.test(rawText(row.date)) ? rawText(row.date) : null;
    const credit = langText(row.credit, '');
    const tags = Array.isArray(row.tags) ? row.tags.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
    results.push({
      key: `photos:${id}`, id, category: 'photos', title,
      description: album, image, date, year: date?.slice(0, 4) || null,
      searchText: normalizeSearchText([id, ...Object.values(title), ...Object.values(album), ...Object.values(credit), ...tags, date, '곽연지', 'S12', 'YeonJi', 'ヨンジ', 'クァク・ヨンジ'].join(' ')),
    });
  }
  return results;
}

export function indexFilms(payload: unknown): SearchEntry[] {
  return normalizeFilms(payload).map((film) => ({
    key: `film:${film.id}`, id: film.id, category: 'film',
    title: { ko: film.title, en: film.title, ja: film.title },
    description: { ko: film.group, en: film.group, ja: film.group },
    image: filmThumbnail(film.id), date: film.publishedAt, year: film.publishedAt?.slice(0, 4) ?? null,
    searchText: normalizeSearchText([film.title, film.group, film.note, film.source, film.scope, film.category, film.publishedAt,
      film.category === 'signal' ? 'SIGNAL 시그널' : '', film.category === 'performance' ? '직캠 무대 fancam' : '',
      '곽연지 S12 YeonJi ヨンジ クァク・ヨンジ', film.id].join(' ')),
  }));
}

export function indexObjekts(items: Objekt[]): SearchEntry[] {
  return items.map((objekt) => ({
    key: `collection:${objekt.id}`, id: objekt.id, category: 'collection',
    title: { ko: objekt.title, en: objekt.title, ja: objekt.title },
    description: { ko: `${objekt.season} · ${objekt.series}`, en: `${objekt.season} · ${objekt.series}`, ja: `${objekt.season} · ${objekt.series}` },
    image: objekt.imageUrl, date: objekt.issuedAt,
    year: objekt.issuedAt?.slice(0,4) || /20\d\d/.exec(objekt.season)?.[0] || null,
    searchText: normalizeSearchText([objekt.id, objekt.title, objekt.season, objekt.series, objekt.className,
      objekt.serial, objekt.description, objekt.issuedAt, 'objekt 오브젝트 곽연지 S12 YeonJi ヨンジ クァク・ヨンジ'].join(' ')),
  }));
}

export const PROFILE_ENTRY: SearchEntry = {
  key: 'profile:S12', id: 'S12', category: 'profile',
  title: { ko: '곽연지 · S12', en: 'Kwak YeonJi · S12', ja: 'クァク・ヨンジ · S12' },
  description: { ko: '프로필 · 취향 · 참여 유닛', en: 'Profile · interests · units', ja: 'プロフィール・趣味・ユニット' },
  image: `${BASE}images/yeonji-home.jpg`, date: null, year: null,
  searchText: normalizeSearchText('곽연지 연지 Kwak YeonJi YeonJi S12 tripleS 트리플에스 프로필 취향 유닛 EVOLution Visionary Vision zenith Invincible Hit The Floor Q&A 곽곽곽연지 초월읍 미소녀 샤인 베러 곽부호 초코쿠키 피아노 게임 사진 망고'),
};

function rank(entry: SearchEntry, terms: string[]): number {
  const title = normalizeSearchText(Object.values(entry.title).join(' '));
  const desc = normalizeSearchText(Object.values(entry.description).join(' '));
  let score = 0;
  for (const term of terms) {
    if (title === term) score += 14;
    else if (title.startsWith(term)) score += 8;
    else if (title.includes(term)) score += 5;
    else if (desc.includes(term)) score += 3;
    else score += 1;
  }
  return score;
}
export function searchArchive(entries: SearchEntry[], query: string, filter: SearchFilter, year: string): SearchEntry[] {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  return entries.filter((entry) =>
    (filter === 'all' || entry.category === filter) &&
    (year === 'all' || entry.year === year) &&
    terms.every((term) => entry.searchText.includes(term)),
  ).sort((a,b) => {
    if (terms.length) {
      const diff = rank(b, terms) - rank(a, terms);
      if (diff) return diff;
    }
    return (b.date ?? '').localeCompare(a.date ?? '') || a.key.localeCompare(b.key, 'ko');
  });
}
