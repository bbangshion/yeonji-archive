/** YEONJI FILM — member-only YouTube video catalog adapter.
 * The API intentionally discards items that do not explicitly contain S12.
 */
export type FilmCategory = 'signal' | 'music' | 'performance' | 'live' | 'other';
export type FilmScope = 'solo' | 'unit' | 'group';
export type FilmPublisher = 'official' | 'broadcast' | 'fan';
export type FilmKind = 'mv' | 'fancam' | 'dance' | 'signal' | 'live' | 'behind' | 'stage' | 'other';
export interface Film {
  id: string;
  youtubeId: string;
  title: string;
  category: FilmCategory;
  publishedAt: string | null;
  group: string;
  note: string;
  source: string;
  song: string;
  verified: boolean;
  scope: FilmScope;
  publisher: FilmPublisher;
  kind: FilmKind;
}
const CATEGORY_MAP: Record<string, FilmCategory> = {
  signal: 'signal', sssignal: 'signal', secretbase: 'signal', '시그널': 'signal',
  mv: 'music', music: 'music', '뮤직비디오': 'music', visual: 'music',
  performance: 'performance', fancam: 'performance', dance: 'performance', '직캠': 'performance',
  live: 'live', '라이브': 'live', other: 'other', reveal: 'other', teaser: 'other',
};
const KIND_SET = new Set<FilmKind>(['mv','fancam','dance','signal','live','behind','stage','other']);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asText = (v: unknown): string => typeof v === 'string' ? v.trim() : '';
function findVideoId(value: unknown): string {
  const input = asText(value);
  if (/^[\w-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:') return '';
    let raw = '';
    if (url.hostname === 'youtu.be') raw = url.pathname.split('/')[1] ?? '';
    else if (['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') raw = url.searchParams.get('v') ?? '';
      else if (/^\/(shorts|embed|live)\//.test(url.pathname)) raw = url.pathname.split('/')[2] ?? '';
    }
    return /^[\w-]{11}$/.test(raw) ? raw : '';
  } catch { return ''; }
}
function hasS12(row: Record<string, unknown>): boolean {
  const possible = row.memberIds ?? row.members ?? row.memberId ?? row.member;
  const list = Array.isArray(possible) ? possible : [possible];
  return list.some((value) => {
    const s = (isObject(value) ? asText(value.id ?? value.name ?? value.memberId) : asText(value)).toLowerCase().replace(/[\s._-]/g, '');
    return ['s12','s12yeonji','yeonji','kwakyeonji','곽연지','연지'].includes(s);
  });
}
function validDate(value: unknown): string | null {
  const text = asText(value);
  if (!/^\d{4}-\d\d-\d\d/.test(text)) return null;
  const date = text.slice(0,10);
  const parsed = new Date(date + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === date ? date : null;
}
export function normalizeFilms(input: unknown): Film[] {
  const rows: unknown[] = Array.isArray(input) ? input : isObject(input) && Array.isArray(input.items) ? input.items : isObject(input) && Array.isArray(input.videos) ? input.videos : [];
  const seen = new Map<string,Film>();
  for (const v of rows) {
    if (!isObject(v) || !hasS12(v)) continue;
    const id = findVideoId(v.youtubeId ?? v.youtubeUrl ?? v.videoId ?? v.videoUrl ?? v.url);
    const title = asText(v.title);
    if (!id || title.length < 1 || title.length > 190) continue;
    const category = CATEGORY_MAP[asText(v.category ?? v.type).toLowerCase()] ?? 'other';
    const scopeCandidate = asText(v.scope);
    const scope: FilmScope = scopeCandidate === 'unit' || scopeCandidate === 'group' ? scopeCandidate : 'solo';
    const publisherValue = asText(v.publisher);
    const publisher: FilmPublisher = publisherValue === 'broadcast' || publisherValue === 'fan' ? publisherValue : 'official';
    const rawKind = asText(v.kind).toLowerCase() as FilmKind;
    const kind: FilmKind = KIND_SET.has(rawKind) ? rawKind : (category === 'music' ? 'mv' : category === 'signal' ? 'signal' : category === 'performance' ? 'stage' : category === 'live' ? 'live' : 'other');
    const film: Film = {
      id, youtubeId:id, title, category,
      publishedAt: validDate(v.publishedAt ?? v.date),
      group: asText(v.group ?? v.dimension).slice(0,70) || 'tripleS',
      note: asText(v.note ?? v.description).slice(0,160),
      source: asText(v.source ?? v.channel).slice(0,90) || 'YouTube',
      song: asText(v.song ?? v.track).slice(0,90),
      verified: v.verified === true,
      scope, publisher, kind,
    };
    const prev = seen.get(id);
    if (!prev || (!prev.verified && film.verified)) seen.set(id, film);
  }
  return [...seen.values()].sort((a,b)=>(b.publishedAt??'').localeCompare(a.publishedAt??'') || a.title.localeCompare(b.title,'ko'));
}
export const filmThumbnail = (id: string): string => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const filmYoutubeUrl = (id: string): string => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
export const filmEmbedUrl = (id: string): string => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
export function readableFilmDate(date: string | null): string { return date ? date.replace(/-/g, '.') : '날짜 미등록'; }
export const filmScopeLabel = (scope: FilmScope): string => ({solo:'개인',unit:'유닛',group:'완전체'}[scope]);
export const filmPublisherLabel = (publisher: FilmPublisher): string => ({official:'tripleS 공식',broadcast:'방송사',fan:'팬 촬영'}[publisher]);
