import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { useArchive } from '../state/ArchiveContext';
import { indexFilms, indexObjekts, indexPhotos, PROFILE_ENTRY, searchArchive, searchLabel } from '../lib/searchIndex';
import type { SearchEntry, SearchFilter, SearchCategory } from '../lib/searchIndex';

const BASE = import.meta.env.BASE_URL;
const PAGE_SIZE = 30;
const FILTERS: ReadonlyArray<{ id: SearchFilter; label: string }> = [
  { id:'all', label:'전체' }, { id:'photos', label:'사진' }, { id:'film', label:'영상' },
  { id:'collection', label:'오브젝트' }, { id:'profile', label:'프로필' },
];
const CATEGORY_NAMES: Record<SearchCategory, string> = { photos:'PHOTO', film:'FILM', collection:'OBJEKT', profile:'PROFILE' };

function ResultImage({ entry, title }: { entry: SearchEntry; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [entry.image]);
  return <span className="shion-search-result-image">
    {entry.image && !failed ? <img src={entry.image} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}/> : <span aria-hidden="true">S12</span>}
    <span className="sr-only">{title}</span>
  </span>;
}

export default function SearchPage() {
  const { t, language, formatNumber } = useI18n();
  const { catalogState, setScreen } = useArchive();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<SearchFilter>('all');
  const [year, setYear] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [photos, setPhotos] = useState<SearchEntry[]>([]);
  const [films, setFilms] = useState<SearchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failedSections, setFailedSections] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query.trim());

  // Fetch only on SEARCH; each section can fail independently without hiding other results.
  useEffect(() => {
    const controller = new AbortController();
    const load = async (url: string, parser: (payload: unknown) => SearchEntry[]) => {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parser(await response.json() as unknown);
    };
    void Promise.allSettled([
      load(`${BASE}data/photos.json`, indexPhotos),
      load(`${BASE}data/films.json`, indexFilms),
    ]).then(([photoResult, filmResult]) => {
      if (controller.signal.aborted) return;
      const errors: string[] = [];
      if (photoResult.status === 'fulfilled') setPhotos(photoResult.value); else errors.push('PHOTO');
      if (filmResult.status === 'fulfilled') setFilms(filmResult.value); else errors.push('FILM');
      setFailedSections(errors);
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener('shion-focus-search', focus);
    return () => window.removeEventListener('shion-focus-search', focus);
  }, []);

  const catalogItems = catalogState.status === 'ready' ? catalogState.catalog.items : null;
  const objekts = useMemo(() => catalogItems ? indexObjekts(catalogItems) : [], [catalogItems]);
  const allEntries = useMemo(() => [PROFILE_ENTRY, ...photos, ...films, ...objekts], [photos, films, objekts]);
  const years = useMemo(() => [...new Set(allEntries.flatMap((entry) => entry.year ? [entry.year] : []))].sort().reverse(), [allEntries]);
  const counts = useMemo(() => {
    const result: Record<SearchFilter, number> = {all:allEntries.length, photos:0,film:0,collection:0,profile:0};
    for (const entry of allEntries) result[entry.category] += 1;
    return result;
  }, [allEntries]);
  const results = useMemo(() => searchArchive(allEntries, deferredQuery, activeFilter, year), [allEntries, deferredQuery, activeFilter, year]);
  const visible = results.slice(0, visibleCount);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [deferredQuery, activeFilter, year]);
  const showResult = (entry: SearchEntry) => setScreen(entry.category, entry.category === 'profile' ? undefined : entry.id);
  return <section className="shion-search-page animate-appear" aria-labelledby="shion-search-title">
    <header className="shion-search-heading">
      <p className="shion-search-kicker">YEONJI ARCHIVE / SEARCH</p>
      <h1 id="shion-search-title">{t('통합 검색')}</h1>
      <p>{t('사진·영상·오브젝트·프로필 검색')}</p>
    </header>
    <div className="shion-search-box">
      <div className="shion-search-input-row">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.7" cy="10.7" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>
        <input ref={inputRef} type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder={t('날짜, 이름, SIGNAL, 오브젝트 번호 검색')} aria-label={t('아카이브 통합 검색')}/>
        {query && <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label={t('검색어 지우기')}>×</button>}
      </div>
      <div className="shion-search-filter-row">
        <div className="shion-search-pills" role="group" aria-label={t('검색 유형')}>
          {FILTERS.map((filter) => <button type="button" key={filter.id} className={activeFilter === filter.id ? 'is-active' : ''} aria-pressed={activeFilter === filter.id} onClick={() => setActiveFilter(filter.id)}>{t(filter.label)} <span>{formatNumber(counts[filter.id])}</span></button>)}
        </div>
        <label className="shion-search-year"><span className="sr-only">{t('연도 선택')}</span><select value={year} onChange={(event) => setYear(event.target.value)}><option value="all">{t('전체 연도')}</option>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
    </div>
    <div className="shion-search-summary" aria-live="polite">
      <span>{loading ? t('목록을 불러오는 중') : `${formatNumber(results.length)} ${t('개 결과')}`}</span>
      <span>{query ? `“${query}”` : t('전체 아카이브 탐색')}</span>
    </div>
    {failedSections.length > 0 && <p className="shion-search-notice" role="status">{t('일부 자료를 불러오지 못했습니다')}: {failedSections.join(', ')}. {t('다시 접속하면 재시도합니다')}</p>}
    {catalogState.status === 'error' && <p className="shion-search-notice" role="status">OBJEKT: {t('목록을 불러오지 못했습니다')}</p>}
    {loading ? <div className="shion-search-placeholder" role="status">{t('사진과 영상 인덱스를 불러오는 중')}</div> : results.length === 0 ?
      <div className="shion-search-placeholder"><strong>{t('검색 결과가 없습니다')}</strong><p>{t('다른 검색어나 분류를 선택해 보세요')}</p><button type="button" onClick={() => { setQuery('');setYear('all');setActiveFilter('all'); }}>{t('필터 초기화')}</button></div> :
      <><div className="shion-search-results">
        {visible.map((entry) => <button type="button" key={entry.key} className="shion-search-result" onClick={() => showResult(entry)} aria-label={`${searchLabel(entry.title, language)} — ${CATEGORY_NAMES[entry.category]}`}>
          <ResultImage entry={entry} title={searchLabel(entry.title, language)}/>
          <span className="shion-search-result-text"><span className="shion-search-result-tag">{CATEGORY_NAMES[entry.category]}{entry.year ? ` / ${entry.year}` : ''}</span><strong>{searchLabel(entry.title, language)}</strong><small>{searchLabel(entry.description, language)}{entry.date ? ` · ${entry.date.replace(/-/g, '.')}` : ''}</small></span>
          <span className="shion-search-arrow" aria-hidden="true">↗</span>
        </button>)}
      </div>
      {visibleCount < results.length && <div className="shion-search-more"><button type="button" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>{t('더 보기')} <span>{formatNumber(visible.length)} / {formatNumber(results.length)}</span></button></div>}
      </>}
    <p className="shion-search-credit">ARCHIVED BY @bbangshion · YEONJI ARCHIVE</p>
  </section>;
}
