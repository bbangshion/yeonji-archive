import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowIcon } from './Icons';
import { buildTimeline, loadOverview, retryOverview } from '../lib/overview';
import type { SearchEntry, SearchLabel } from '../lib/searchIndex';
import { searchLabel, normalizeSearchText } from '../lib/searchIndex';
import { useArchive } from '../state/ArchiveContext';
import { useI18n } from '../i18n/I18nContext';
import { currentLocalDate, loadActivityCatalog } from '../lib/activityCatalog';
import './timeline-refine.css';
import './yeonji-timeline-v3.css';

/** Activity dates are independently sourced; media dates reflect the indexed upload date. */
type Kind = 'milestone' | 'unit' | 'release' | 'concert' | 'appearance' | 'photos' | 'film';
type Filter = 'all' | Kind | 'signal' | 'planned';
type Item = {
  key: string;
  date: string;
  kind: Kind;
  title: SearchLabel;
  description: SearchLabel;
  entries: SearchEntry[];
  source?: string;
  sourceName?: string;
  scope?: string;
  scheduled?: boolean;
  featured?: boolean;
};
type OverviewData = Awaited<ReturnType<typeof loadOverview>>;
const PAGE_SIZE = 24;
const TABS: readonly Filter[] = ['all', 'release', 'unit', 'concert', 'appearance', 'milestone', 'signal', 'photos', 'film', 'planned'];
const isMedia = (item: Item) => item.kind === 'photos' || item.kind === 'film';
const isSignal = (item: Item) => item.scope?.toLowerCase() === 'signal' ||
  item.kind === 'film' && item.entries.some((entry) => /\bsignal\b|시그널|シグナル/i.test(entry.searchText));
const KIND_TAG: Record<string, string> = { milestone: 'MILESTONE', release: 'RELEASE', unit: 'UNIT', concert: 'LIVE', appearance: 'APPEARANCE', photos: 'PHOTO', film: 'FILM' };

const LABELS = {
  ko: {
    title: '연지의 시간', subtitle: 'YEONJI / A LIVING INDEX',
    intro: 'S12 첫 공개부터 유닛, 음반, 무대, SIGNAL까지. 확인된 활동과 아카이브 자료를 시간순으로 잇습니다.',
    story: '핵심 장면', chapter: '주요 챕터', explore: '연도에서 보기',
    all: '전체', release: '음반 · 음원', unit: '유닛', concert: '공연', appearance: '방송 · 콘텐츠', milestone: '주요 기록',
    photos: '사진', film: '영상', signal: 'SIGNAL', planned: '발표된 일정',
    search: '곡명, 활동, 멤버, 날짜 검색', years: '전체 연도', scopes: '전체 활동', recent: '최신순', old: '오래된순',
    activity: '확인된 활동', media: '사진 · 영상 기록', period: '기록 기간', results: '개의 기록',
    loading: '기록을 불러오는 중', error: '일부 자료를 불러오지 못했습니다.', retry: '다시 시도',
    clear: '조건 초기화', empty: '일치하는 기록이 없습니다.', more: '기록 더 보기',
    expand: '기록 자세히', collapse: '접기', source: '근거 자료', view: '아카이브로 이동',
    dayPhotos: '같은 날짜 사진', dayFilms: '같은 날짜 영상', dateHelp: '같은 날짜 자료가 반드시 같은 활동을 기록한 것은 아닙니다.',
    upcoming: '예정', plannedBadge: '미확인 일정', record: '활동 이정표', indexed: '날짜별 자료',
    note: '이 연대기는 출처가 확인된 주요 기록을 중심으로 정리합니다. 아직 모든 출연·공연을 망라하지 않습니다.',
    proof: '자료의 날짜는 업로드일일 수 있으며, 활동일과 다를 수 있습니다.',
  },
  en: {
    title: 'A YeonJi Timeline', subtitle: 'YEONJI / A LIVING INDEX',
    intro: 'From the S12 reveal to units, releases, stages and SIGNAL: sourced milestones alongside dated archive media.',
    story: 'Highlights', chapter: 'Key chapters', explore: 'Browse year',
    all: 'All', release: 'Releases', unit: 'Units', concert: 'Live', appearance: 'Media · events', milestone: 'Milestones',
    photos: 'Photos', film: 'Videos', signal: 'SIGNAL', planned: 'Announced',
    search: 'Search song, activity or date', years: 'All years', scopes: 'All activities', recent: 'Newest', old: 'Oldest',
    activity: 'Sourced activities', media: 'Photos · videos', period: 'Years indexed', results: 'records',
    loading: 'Loading the archive', error: 'Some records could not be loaded.', retry: 'Retry',
    clear: 'Clear filters', empty: 'No records match.', more: 'Load more',
    expand: 'Details', collapse: 'Less', source: 'View evidence', view: 'Open archive',
    dayPhotos: 'Photos on this date', dayFilms: 'Videos on this date', dateHelp: 'Media sharing a date may not depict this activity.',
    upcoming: 'Upcoming', plannedBadge: 'Unverified schedule', record: 'Activity milestone', indexed: 'Indexed media',
    note: 'A curated, sourced selection of milestones; not an exhaustive list of appearances.',
    proof: 'A media date may be its upload date, not the date of the activity.',
  },
  ja: {
    title: 'ヨンジの時間', subtitle: 'YEONJI / A LIVING INDEX',
    intro: 'S12公開からユニット、音源、公演、SIGNALまで。確認済みの活動と資料を時系列でつなぎます。',
    story: '主な場面', chapter: '主なチャプター', explore: 'この年を見る',
    all: 'すべて', release: '音楽', unit: 'ユニット', concert: '公演', appearance: '番組・コンテンツ', milestone: '主な記録',
    photos: '写真', film: '動画', signal: 'SIGNAL', planned: '発表済み',
    search: '活動・曲名・日付で検索', years: 'すべての年', scopes: 'すべての活動', recent: '新しい順', old: '古い順',
    activity: '出典のある活動', media: '写真・動画', period: '記録期間', results: '件の記録',
    loading: '読み込み中', error: '一部の資料を読み込めません。', retry: '再試行',
    clear: '条件をリセット', empty: '該当する記録はありません。', more: 'さらに表示',
    expand: '詳細', collapse: '閉じる', source: '出典を見る', view: 'アーカイブを開く',
    dayPhotos: '同じ日付の写真', dayFilms: '同じ日付の動画', dateHelp: '同じ日付の資料がこの活動を直接記録したとは限りません。',
    upcoming: '予定', plannedBadge: '未確認予定', record: '活動記録', indexed: '日付別資料',
    note: '出典のある主な活動を整理した年表です。すべての出演を網羅するものではありません。',
    proof: '資料の日付は活動日ではなく公開日である場合があります。',
  },
} as const;

async function loadActivities(refresh = false): Promise<Item[]> {
  const catalog = await loadActivityCatalog(refresh);
  return catalog.entries.map((row) => ({
    key: `activity:${row.id}`, date: row.date, kind: row.kind,
    title: row.title, description: row.description, entries: [], source: row.source,
    sourceName: row.sourceName, scope: row.scope, scheduled: row.scheduled,
    featured: row.featured,
  }));
}

export function TimelinePage() {
  const { language, formatNumber } = useI18n();
  const ui = LABELS[language];
  const { setScreen } = useArchive();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [activities, setActivities] = useState<Item[]>([]);
  const [activityError, setActivityError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState('all');
  const [scope, setScope] = useState('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'new' | 'old'>('new');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const load = async (refresh: boolean) => {
    setLoading(true);
    const [o, a] = await Promise.allSettled([refresh ? retryOverview() : loadOverview(), loadActivities(refresh)]);
    setOverview(o.status === 'fulfilled' ? o.value : null);
    setActivities(a.status === 'fulfilled' ? a.value : []);
    setActivityError(a.status === 'rejected');
    setLoading(false);
  };
  useEffect(() => {
    let active = true;
    Promise.allSettled([loadOverview(), loadActivities()]).then(([o, a]) => {
      if (!active) return;
      setOverview(o.status === 'fulfilled' ? o.value : null);
      setActivities(a.status === 'fulfilled' ? a.value : []);
      setActivityError(a.status === 'rejected');
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const timeline = useMemo<Item[]>(() => {
    const byKey = new Map<string, Item>();
    if (overview) {
      for (const entry of buildTimeline(overview)) {
        if (entry.kind === 'milestone') continue; // Catalog is authoritative for milestones.
        byKey.set(entry.key, { ...entry, kind: entry.kind });
      }
    }
    for (const activity of activities) byKey.set(activity.key, activity);
    return [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  }, [overview, activities]);

  const indexedByDate = useMemo(() => {
    const map = new Map<string, { photos: SearchEntry[]; films: SearchEntry[] }>();
    for (const [category, list] of [['photos', overview?.photos ?? []], ['films', overview?.films ?? []]] as const) {
      for (const item of list) {
        if (!item.date) continue;
        const value = map.get(item.date) ?? { photos: [], films: [] };
        value[category].push(item);
        map.set(item.date, value);
      }
    }
    return map;
  }, [overview]);

  const years = useMemo(() => [...new Set(timeline.map((item) => item.date.slice(0, 4)))].sort().reverse(), [timeline]);
  const scopes = useMemo(() => [...new Set(activities.map((item) => item.scope).filter((s): s is string => !!s))].sort(), [activities]);
  const featured = useMemo(() => activities.filter((item) => item.featured && !item.scheduled).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4), [activities]);
  const matches = useMemo(() => {
    const q = normalizeSearchText(search);
    const filtered = timeline.filter((item) => {
      if (filter === 'planned' ? !item.scheduled : !!item.scheduled) return false;
      if (year !== 'all' && !item.date.startsWith(year)) return false;
      if (scope !== 'all' && item.scope !== scope) return false;
      if (filter !== 'all' && filter !== 'planned' && (filter === 'signal' ? !isSignal(item) : item.kind !== filter)) return false;
      if (!q) return true;
      return normalizeSearchText([
        item.date, item.scope || '', ...Object.values(item.title), ...Object.values(item.description),
        ...item.entries.flatMap((entry) => [entry.searchText]),
      ].join(' ')).includes(q);
    });
    return sort === 'new' ? filtered : [...filtered].reverse();
  }, [timeline, year, scope, filter, search, sort]);

  const today = currentLocalDate();
  const stats = useMemo(() => ({
    activities: timeline.filter((item) => !isMedia(item) && !item.scheduled && item.date <= today).length,
    media: timeline.filter(isMedia).length,
  }), [timeline, today]);
  const resetPage = () => setVisible(PAGE_SIZE);
  const setYearFilter = (next: string) => { setYear(next); resetPage(); };
  const setTab = (next: Filter) => { setFilter(next); resetPage(); };
  const reset = () => { setYear('all'); setScope('all'); setFilter('all'); setSearch(''); setSort('new'); resetPage(); };
  const jumpTo = (item: Item) => {
    setYear('all'); setScope('all'); setFilter('all'); setSort('new');
    setSearch(searchLabel(item.title, language)); setVisible(PAGE_SIZE);
    document.getElementById('yeonji-timeline-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const toggle = (key: string) => setExpanded((old) => {
    const next = new Set(old);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const openMedia = (kind: 'photos' | 'film', entry?: SearchEntry) => setScreen(kind, entry?.id);

  return <main className="shion-timeline shion-timeline-refined yeonji-timeline-v3" aria-labelledby="yeonji-timeline-heading">
    <header className="shion-page-heading yeonji-timeline-hero">
      <span className="shion-page-kicker">KWAK YEONJI / S12</span>
      <div className="yeonji-timeline-hero-row"><div>
        <span className="yeonji-timeline-eyebrow">{ui.subtitle}</span>
        <h1 id="yeonji-timeline-heading">{ui.title}<span className="yeonji-timeline-period-mark">.</span></h1>
        <p>{ui.intro}</p>
      </div><span className="yeonji-timeline-monogram" aria-hidden="true">Y.</span></div>
    </header>

    <section className="yeonji-timeline-overview" aria-label={ui.record}>
      <div><small>01 / ACTIVITY</small><strong>{formatNumber(stats.activities)}</strong><span>{ui.activity}</span></div>
      <div><small>02 / ARCHIVE</small><strong>{formatNumber(stats.media)}</strong><span>{ui.media}</span></div>
      <div><small>03 / YEARS</small><strong>{years.length ? `${years[years.length - 1]}—${years[0]}` : '—'}</strong><span>{ui.period}</span></div>
    </section>

    {featured.length > 0 && <section className="yeonji-timeline-chapters" aria-label={ui.story}>
      <div className="yeonji-timeline-section-heading"><span>{ui.story.toUpperCase()} / 01</span><h2>{ui.chapter}</h2></div>
      <div className="yeonji-timeline-chapter-grid">{featured.map((item, i) => <button key={item.key} type="button" onClick={() => jumpTo(item)}
        aria-label={`${searchLabel(item.title, language)} — ${ui.explore}`}>
        <span className="yeonji-timeline-chapter-number">0{i+1} / {item.date.slice(0, 4)}</span>
        <strong>{searchLabel(item.title, language)}</strong>
        <span className="yeonji-timeline-chapter-bottom">{item.date.replace(/-/g, '.')} <ArrowIcon width={13} height={13}/></span>
      </button>)}</div>
    </section>}

    <section className="yeonji-timeline-index" aria-label={ui.indexed}>
      <div className="yeonji-timeline-section-heading"><span>ARCHIVE INDEX / 02</span><h2>{ui.record}</h2></div>
      <div className="yeonji-timeline-yearbar" role="group" aria-label={ui.years}>
        <button className={year === 'all' ? 'is-active' : ''} aria-pressed={year === 'all'} type="button" onClick={() => setYearFilter('all')}>{ui.all}</button>
        {years.map((v) => <button key={v} type="button" className={year === v ? 'is-active' : ''} aria-pressed={year === v} onClick={() => setYearFilter(v)}>{v}</button>)}
      </div>
      <div className="shion-timeline-filter-scroll" role="group" aria-label={ui.record}>
        {TABS.map((v) => <button key={v} className={filter === v ? 'is-active' : ''} aria-pressed={filter === v} type="button" onClick={() => setTab(v)}>{ui[v]}</button>)}
      </div>
      <div className="shion-timeline-filter-row yeonji-timeline-filters">
        <label className="shion-timeline-query"><span className="sr-only">{ui.search}</span><input value={search} type="search" maxLength={120} placeholder={ui.search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} /></label>
        <label className="shion-timeline-select"><span className="sr-only">{ui.years}</span><select value={year} onChange={(e) => setYearFilter(e.target.value)}><option value="all">{ui.years}</option>{years.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        <label className="shion-timeline-select"><span className="sr-only">{ui.scopes}</span><select value={scope} onChange={(e) => { setScope(e.target.value); resetPage(); }}><option value="all">{ui.scopes}</option>{scopes.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        <label className="shion-timeline-select shion-timeline-order"><span className="sr-only">{ui.recent}</span><select value={sort} onChange={(e) => { setSort(e.target.value as 'new' | 'old'); resetPage(); }}><option value="new">{ui.recent}</option><option value="old">{ui.old}</option></select></label>
      </div>
      <div className="shion-timeline-meta" id="yeonji-timeline-results"><span><b>{formatNumber(matches.length)}</b> {ui.results}</span>
        {(search || year !== 'all' || scope !== 'all' || filter !== 'all' || sort !== 'new') && <button type="button" onClick={reset}>{ui.clear}</button>}
      </div>

      {(activityError || overview?.photoError || overview?.filmError) && <div role="status" className="shion-overview-warning"><span>{ui.error}</span><button type="button" onClick={() => void load(true)}>{ui.retry}</button></div>}
      {loading ? <div className="shion-timeline-loading" role="status">{ui.loading}</div> : matches.length === 0 ?
        <div className="shion-timeline-empty">{ui.empty}</div> :
        <ol className="shion-timeline-list yeonji-timeline-list">
          {matches.slice(0, visible).map((item, index) => {
            const photo = item.kind === 'photos';
            const film = item.kind === 'film';
            const dated = !isMedia(item) ? indexedByDate.get(item.date) : undefined;
            const datePhotos = dated?.photos ?? [];
            const dateFilms = dated?.films ?? [];
            const isOpen = expanded.has(item.key);
            const monthKey = item.date.slice(0, 7);
            const prevKey = matches[index - 1]?.date.slice(0, 7);
            const yearKey = item.date.slice(0, 4);
            return <Fragment key={item.key}>
              {(index === 0 || monthKey !== prevKey) && <li className="yeonji-timeline-month-divider" aria-label={monthKey}>
                <span>{yearKey}</span><b>{monthKey.slice(5)}</b>
              </li>}
              <li className={`shion-timeline-entry yeonji-timeline-record is-${item.kind}${item.featured ? ' is-featured' : ''}${item.scheduled ? ' is-scheduled' : ''}`}>
                <time dateTime={item.date}>{item.date.slice(5).replace('-', '.')}</time>
                <article className="shion-timeline-entry-body">
                  <div className="shion-timeline-entry-top"><span className="shion-timeline-kind">{isSignal(item) ? 'SIGNAL' : KIND_TAG[item.kind]}</span>
                    {item.scope && <span className="shion-timeline-scope">{item.scope}</span>}
                    {item.scheduled && <span className="shion-timeline-future">{ui.plannedBadge}</span>}
                    {item.date > today && !item.scheduled && <span className="shion-timeline-future">{ui.upcoming}</span>}
                    {item.featured && <span className="yeonji-timeline-featured-marker" aria-hidden="true">◆</span>}
                  </div>
                  <h3>{searchLabel(item.title, language)}</h3>
                  <p>{searchLabel(item.description, language)}</p>
                  {item.entries.length > 0 && <div className="shion-timeline-media yeonji-timeline-media">
                    {item.entries.slice(0, photo ? 4 : 3).map((entry) => <button key={entry.key} type="button" aria-label={searchLabel(entry.title, language)} onClick={() => openMedia(photo ? 'photos' : 'film', entry)}>
                      {entry.image ? <img src={entry.image} alt="" loading="lazy" decoding="async" /> : <span>{photo ? 'PHOTO' : 'FILM'}</span>}
                    </button>)}
                  </div>}
                  <div className="shion-timeline-actions yeonji-timeline-actions">
                    {isMedia(item) && <button type="button" className="shion-timeline-open" onClick={() => openMedia(photo ? 'photos' : 'film', item.entries[0])}>{ui.view} <ArrowIcon width={13} height={13}/></button>}
                    {!isMedia(item) && <button type="button" className="yeonji-timeline-detail-button" aria-expanded={isOpen} aria-controls={`yeonji-detail-${item.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`} onClick={() => toggle(item.key)}>
                      {isOpen ? ui.collapse : ui.expand}<span aria-hidden="true">{isOpen ? '−' : '+'}</span>
                    </button>}
                  </div>
                  {!isMedia(item) && isOpen && <div className="yeonji-timeline-detail" id={`yeonji-detail-${item.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`}>
                    <span className="yeonji-timeline-detail-kicker">{ui.source}</span>
                    {item.source ? <a href={item.source} target="_blank" rel="noopener noreferrer">{item.sourceName || ui.source}<ArrowIcon width={12} height={12}/></a> : <span>—</span>}
                    {(datePhotos.length > 0 || dateFilms.length > 0) && <div className="yeonji-timeline-related-media">
                      {!!datePhotos.length && <button type="button" onClick={() => openMedia('photos', datePhotos[0])}>{ui.dayPhotos} · {formatNumber(datePhotos.length)} <ArrowIcon width={12} height={12}/></button>}
                      {!!dateFilms.length && <button type="button" onClick={() => openMedia('film', dateFilms[0])}>{ui.dayFilms} · {formatNumber(dateFilms.length)} <ArrowIcon width={12} height={12}/></button>}
                      <small>{ui.dateHelp}</small>
                    </div>}
                  </div>}
                </article>
              </li>
            </Fragment>;
          })}
        </ol>}
      {!loading && visible < matches.length && <div className="shion-timeline-more"><button type="button" onClick={() => setVisible((v) => v + PAGE_SIZE)}>{ui.more}<span>{Math.min(visible, matches.length)} / {matches.length}</span></button></div>}
    </section>
    <footer className="yeonji-timeline-footer"><p>{ui.note}</p><p>{ui.proof}</p><span>CREATED BY @bbangshion</span></footer>
  </main>;
}
