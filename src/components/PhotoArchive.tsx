import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nContext';
import { clearRouteItem, getRouteItem } from '../lib/archiveRoute';
import { RecentPhotoSources } from './RecentPhotoSources';

type LocalizedText = { ko: string; en?: string; ja?: string };
type Photo = {
  id: string;
  image: string;
  thumbnail: string | null;
  title: LocalizedText;
  album: LocalizedText;
  date: string | null;
  year: string | null;
  credit: LocalizedText | null;
  source: string | null;
  tags: string[];
};
type PhotoRecord = Record<string, unknown>;
type SortOrder = 'newest' | 'oldest';
type ViewMode = 'date' | 'album';
const BASE = import.meta.env.BASE_URL;
const PAGE_SIZE = 36;
const FALLBACK: Photo = {
  id: 'airport-photo', image: `${BASE}images/yeonji-home.jpg`, thumbnail: null,
  title: { ko: '곽연지 아카이브 커버', en: 'YeonJi archive cover', ja: 'ヨンジのアーカイブ' },
  album: { ko: '일상', en: 'Daily life', ja: '日常' },
  date: null, year: null,
  credit: { ko: '사용자 제공 사진', en: 'User-provided photo', ja: 'ユーザー提供写真' },
  source: null, tags: [],
};
function isRecord(value: unknown): value is PhotoRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function localized(value: unknown, fallback: string): LocalizedText {
  if (typeof value === 'string' && value.trim()) return { ko: value.trim() };
  if (!isRecord(value)) return { ko: fallback };
  const ko = typeof value.ko === 'string' && value.ko.trim() ? value.ko.trim() : fallback;
  return {
    ko,
    ...(typeof value.en === 'string' && value.en.trim() ? { en: value.en.trim() } : {}),
    ...(typeof value.ja === 'string' && value.ja.trim() ? { ja: value.ja.trim() } : {}),
  };
}
function imageURL(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const value = input.trim();
  if (/^https:\/\//i.test(value)) {
    try { return new URL(value).protocol === 'https:' ? value : null; } catch { return null; }
  }
  if (!/^(?!\/)(?!\.)(?!.*\/\.?\.\/)[a-z\d_./%\-]+\.(?:jpe?g|png|webp|avif)$/i.test(value)) return null;
  return `${BASE}${value}`;
}
function sourceURL(input: unknown): string | null {
  if (typeof input !== 'string' || !/^https:\/\//i.test(input.trim())) return null;
  try { return new URL(input.trim()).protocol === 'https:' ? input.trim() : null; } catch { return null; }
}
function validDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
}
/** Photo-only import: data belonging to Objekt (or any other category) is always rejected. */
function readPhotos(payload: unknown): Photo[] {
  const items = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.photos) ? payload.photos : [];
  const ids = new Set<string>();
  const results: Photo[] = [];
  for (const raw of items) {
    if (!isRecord(raw)) continue;
    if (typeof raw.category === 'string' && raw.category.toLowerCase() !== 'photo') continue;
    if (raw.memberId && raw.memberId !== 'S12') continue;
    if (typeof raw.type === 'string' && raw.type.toLowerCase() !== 'photo') continue;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const image = imageURL(raw.image);
    if (!id || !image || ids.has(id)) continue;
    if (/(^|\/)objekt(?:-collection)?\//i.test(image)) continue;
    ids.add(id);
    results.push({
      id, image, thumbnail: imageURL(raw.thumbnail),
      title: localized(raw.title, '곽연지'),
      album: localized(raw.album, '사진'),
      date: validDate(raw.date),
      year: validDate(raw.date)?.slice(0, 4) ?? (typeof raw.sourceYear === 'string' && /^20\d\d$/.test(raw.sourceYear) ? raw.sourceYear : null),
      credit: raw.credit ? localized(raw.credit, '') : null,
      source: sourceURL(raw.sourceUrl ?? raw.source),
      tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 20) : [],
    });
  }
  return results;
}
/* Keep real source categories for filtering; photo tiles use one archive signature. */
function dateKey(photo: Photo): string { return photo.date ?? (photo.year ? `${photo.year}-unknown` : 'unknown'); }
function comparePhotos(a: Photo, b: Photo, order: SortOrder): number {
  const aKey = a.date ?? (a.year ? `${a.year}-00-00` : '');
  const bKey = b.date ?? (b.year ? `${b.year}-00-00` : '');
  const diff = aKey.localeCompare(bKey);
  return (order === 'newest' ? -diff : diff) || a.id.localeCompare(b.id);
}
/** Lightweight previews for official X images; open the original in the viewer. */
function thumbnailURL(image: string): string {
  if (!image.startsWith('https://pbs.twimg.com/media/')) return image;
  try { const url = new URL(image); url.searchParams.set('name', 'small'); return url.toString(); }
  catch { return image; }
}
function PhotoTile({ photo, title, onClick }: {
  photo: Photo;
  title: string;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [photo.image]);
  return <button type="button" className="shion-gallery-tile" onClick={onClick} aria-label={`${title} — ${t('사진 확대')}`}>
    <span className="shion-gallery-image">
      {broken ? <span className="shion-gallery-image-error">{t('이미지를 표시할 수 없습니다')}</span>
        : <img src={photo.thumbnail ?? thumbnailURL(photo.image)} alt={title} loading="lazy" decoding="async" onError={() => setBroken(true)}/>}
    </span>
    <span className="shion-gallery-meta"><strong>{title}</strong><span>빵시온</span></span>
  </button>;
}
// Accept legacy props during staged GitHub uploads; photo data never uses Objekt.
export function PhotoArchive(_legacyProps?: { objekts?: unknown[]; loading?: boolean; error?: string }) {
  const { language, t, formatNumber } = useI18n();
  const [photos, setPhotos] = useState<Photo[]>([FALLBACK]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [year, setYear] = useState('all');
  const [month, setMonth] = useState('all');
  const [album, setAlbum] = useState('all');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [mode, setMode] = useState<ViewMode>('date');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [recentOnly, setRecentOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [brokenDetail, setBrokenDetail] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const swipeStart = useRef<number | null>(null);
  const deferred = useDeferredValue(query.trim().toLocaleLowerCase());
  const text = (label: LocalizedText): string => (label[language] || t(label.ko)).replace(/빵시온/g, '빵시온');
  const albumText = (label: LocalizedText): string => text(label);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${BASE}data/photos.json`, { signal: controller.signal, cache: 'no-cache' })
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then((payload: unknown) => { if (!controller.signal.aborted) { setPhotos(readPhotos(payload)); setLoadError(false); } })
      .catch(() => { if (!controller.signal.aborted) { setPhotos([FALLBACK]); setLoadError(true); } })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const id = getRouteItem('photos');
    if (id && photos.some((photo) => photo.id === id)) {
      setYear('all'); setMonth('all'); setAlbum('all'); setQuery('');
      setSelectedId(id);
    }
  }, [isLoading, photos]);

  const years = useMemo(() => [...new Set(photos.flatMap((photo) => photo.year ? [photo.year] : []))].sort().reverse(), [photos]);
  const months = useMemo(() => [...new Set(photos.flatMap((photo) => photo.date && (year === 'all' || photo.year === year) ? [photo.date.slice(5, 7)] : []))].sort(), [photos, year]);
  const albums = useMemo(() => [...new Set(photos.map((photo) => photo.album.ko))].sort((a, b) => a.localeCompare(b, 'ko')), [photos]);
  const albumNames = useMemo(() => new Map(photos.map((photo) => [photo.album.ko, albumText(photo.album)])), [photos, language]);
  const recentCutoff = useMemo(() => {
    const day = new Date(); day.setDate(day.getDate() - 30);
    return [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-');
  }, []);
  const filtered = useMemo(() => photos.filter((photo) =>
    (!recentOnly || (photo.date !== null && photo.date >= recentCutoff)) &&
    (year === 'all' || photo.year === year) &&
    (month === 'all' || photo.date?.slice(5, 7) === month) &&
    (album === 'all' || photo.album.ko === album) &&
    (!deferred || [photo.title.ko, photo.title.en, photo.title.ja, photo.album.ko, photo.album.en,
      photo.album.ja, '빵시온', '@bbangshion', photo.date, photo.year, photo.credit?.ko, ...photo.tags]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(deferred))
  ).sort((a, b) => comparePhotos(a, b, sort)), [photos, year, month, album, deferred, sort, recentOnly, recentCutoff]);
  const visible = filtered.slice(0, limit);
  const groups = useMemo(() => {
    const collected = new Map<string, Photo[]>();
    for (const photo of visible) {
      const key = mode === 'album' ? photo.album.ko : dateKey(photo);
      const list = collected.get(key) ?? [];
      list.push(photo);
      collected.set(key, list);
    }
    return [...collected.entries()];
  }, [visible, mode]);
  const currentIndex = selectedId === null ? -1 : filtered.findIndex((photo) => photo.id === selectedId);
  const selected = currentIndex < 0 ? null : filtered[currentIndex] ?? null;
  const close = () => { setSelectedId(null); clearRouteItem('photos'); };
  const step = (direction: -1 | 1) => {
    if (currentIndex < 0 || filtered.length === 0) return;
    setSelectedId(filtered[(currentIndex + direction + filtered.length) % filtered.length]?.id ?? null);
  };
  useEffect(() => { setLimit(PAGE_SIZE); }, [year, month, album, sort, deferred, mode, recentOnly]);
  useEffect(() => { setBrokenDetail(false); }, [selectedId]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'Tab') {
        const controls = document.querySelectorAll<HTMLButtonElement>('.shion-lightbox button, .shion-lightbox a[href]');
        const first = controls.item(0);
        const last = controls.item(controls.length - 1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; previous?.focus(); };
  }, [selectedId, filtered]);
  const reset = () => { setYear('all'); setMonth('all'); setAlbum('all'); setQuery(''); setSort('newest'); setRecentOnly(false); };
  const photoDate = (date: string | null, year: string | null) => date ?? (year ? `${year} · ${t('날짜 미상')}` : t('날짜 미상'));
  const monthLabel = (monthValue: string) => new Intl.DateTimeFormat(language === 'en' ? 'en-US' : language === 'ja' ? 'ja-JP' : 'ko-KR', { month: 'long' }).format(new Date(2020, Number(monthValue) - 1, 1));
  const groupLabel = (key: string) => mode === 'album'
    ? (albumNames.get(key) ?? key)
    : (key === 'unknown' ? t('날짜 미상') : key.endsWith('-unknown') ? `${key.slice(0, 4)} · ${t('날짜 미상')}` : key.replace(/-/g, '.')); 

  return <section className="shion-photos shion-photo-v2 animate-appear" aria-labelledby="photos-heading">
    <header className="shion-page-heading">
      <span className="shion-page-kicker">PHOTO ARCHIVE</span>
      <h1 id="photos-heading">{t('사진')}</h1>
      <p>{t('곽연지의 사진을 날짜와 앨범별로 정리했습니다')}</p>
      <p className="shion-source-note">{language === 'en' ? 'Curated by @bbangshion' : language === 'ja' ? 'アーカイブ編集 · @bbangshion' : '아카이브 정리 · @bbangshion'}</p>
    </header>
    <RecentPhotoSources />
    <div className="shion-photo-controls">
      <div className="shion-photo-view-tabs" role="group" aria-label={t('사진 보기방식')}>
        <button type="button" className={mode === 'date' ? 'is-active' : ''} aria-pressed={mode === 'date'} onClick={() => setMode('date')}>{t('날짜별')}</button>
        <button type="button" className={mode === 'album' ? 'is-active' : ''} aria-pressed={mode === 'album'} onClick={() => setMode('album')}>{t('앨범별')}</button>
      </div>
      <div className="shion-photo-filters">
        <label className="shion-photo-search"><span className="sr-only">{t('사진 검색')}</span>
          <input type="search" value={query} maxLength={100} placeholder={t('사진 제목, 앨범, 키워드 검색')} onChange={(e) => setQuery(e.target.value)}/>
        </label>
        <label><span className="sr-only">{t('연도 선택')}</span><select value={year} onChange={(e) => { setYear(e.target.value); setMonth('all'); }}>
          <option value="all">{t('전체 연도')}</option>{years.map((item) => <option value={item} key={item}>{item}</option>)}
        </select></label>
        <label><span className="sr-only">{t('월 선택')}</span><select value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">{t('전체 월')}</option>{months.map((item) => <option value={item} key={item}>{monthLabel(item)}</option>)}
        </select></label>
        <label><span className="sr-only">{t('앨범 선택')}</span><select value={album} onChange={(e) => setAlbum(e.target.value)}>
          <option value="all">{t('모든 앨범')}</option>{albums.map((name) => <option value={name} key={name}>{albumNames.get(name) ?? name}</option>)}
        </select></label>
        <label><span className="sr-only">{t('정렬')}</span><select value={sort} onChange={(e) => setSort(e.target.value as SortOrder)}>
          <option value="newest">{t('최신순')}</option><option value="oldest">{t('오래된 순')}</option>
        </select></label>
      </div>
    </div>
    <div className="shion-photo-recent-toggle" role="group" aria-label={language === 'ko' ? '사진 기간' : language === 'en' ? 'Photo period' : '写真の期間'}>
      <button type="button" className={!recentOnly ? 'is-active' : ''} aria-pressed={!recentOnly} onClick={() => setRecentOnly(false)}>{language === 'ko' ? '전체 사진' : language === 'en' ? 'All photos' : 'すべて'}</button>
      <button type="button" className={recentOnly ? 'is-active' : ''} aria-pressed={recentOnly} onClick={() => setRecentOnly(true)}>{language === 'ko' ? '최근 30일' : language === 'en' ? 'Last 30 days' : '過去30日'}</button>
    </div>
    <div className="shion-photo-result" aria-live="polite">
      <span>{formatNumber(filtered.length)} {t('장')}</span>
      <button type="button" className="shion-photo-reset" onClick={reset}>{t('필터 초기화')}</button>
    </div>
    <>
    {isLoading ? <div role="status" className="shion-photo-empty">{t('사진을 불러오는 중')}</div> : filtered.length === 0 ?
      <div className="shion-photo-empty">{t('조건에 맞는 사진이 없습니다')}</div> : <>
        {groups.map(([key, list]) => <section className="shion-photo-group" key={`${mode}-${key}`} aria-label={groupLabel(key)}>
          <div className="shion-photo-group-head"><h2>{groupLabel(key)}</h2><span>{formatNumber(list.length)} {t('장')}</span></div>
          <div className="shion-photo-grid">{list.map((photo) =>
            <PhotoTile key={photo.id} photo={photo} title={text(photo.title)} onClick={() => setSelectedId(photo.id)}/>)}</div>
        </section>)}
        {limit < filtered.length && <button className="shion-photo-more" type="button" onClick={() => setLimit((n) => n + PAGE_SIZE)}>{t('더 보기')}</button>}
      </>}
    </>
    {loadError && <p className="shion-source-note" role="status">{t('사진 목록을 불러오지 못해 기본 사진을 표시합니다')}</p>}
    <p className="shion-source-note">{t('출처가 확인된 사진만 등록합니다')}</p>
    {selected && createPortal(<div role="dialog" aria-modal="true" aria-label={`${text(selected.title)} — ${t('사진 확대')}`}
      className="shion-lightbox" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="shion-lightbox-top"><span>{formatNumber(currentIndex + 1)} / {formatNumber(filtered.length)}</span>
        <button type="button" ref={closeButton} id="shion-photo-close" onClick={close} aria-label={t('닫기')}>{t('닫기')} ×</button>
      </div>
      <div className="shion-lightbox-stage" onTouchStart={(event) => { swipeStart.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => { const last = event.changedTouches[0]?.clientX; if (last !== undefined && swipeStart.current !== null && Math.abs(last - swipeStart.current) > 65) step(last < swipeStart.current ? 1 : -1); swipeStart.current = null; }}>
        <button className="shion-lightbox-step" type="button" onClick={() => step(-1)} aria-label={t('이전 사진')}>‹</button>
        {brokenDetail ? <div className="shion-lightbox-failed">{t('이미지를 표시할 수 없습니다')}</div> :
          <img key={selected.id} src={selected.image} alt={text(selected.title)} onError={() => setBrokenDetail(true)} decoding="async"/>}
        <button className="shion-lightbox-step" type="button" onClick={() => step(1)} aria-label={t('다음 사진')}>›</button>
      </div>
      <div className="shion-lightbox-caption shion-lightbox-caption-v2"><div><strong>{text(selected.title)}</strong>
        <span>{albumText(selected.album)} · {photoDate(selected.date, selected.year)}</span>
        {selected.credit && <span>{selected.id.startsWith('fandom-s12-') ? text(selected.credit) : `${t('출처')}: ${text(selected.credit)}`}</span>}</div>
        {selected.source && <a href={selected.source} target="_blank" rel="noopener noreferrer">{t('원본 게시물')}</a>}
      </div>
    </div>, document.body)}
  </section>;
}
