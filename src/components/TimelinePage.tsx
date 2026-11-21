import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowIcon } from './Icons';
import { buildTimeline, loadOverview, retryOverview } from '../lib/overview';
import type { SearchEntry, SearchLabel } from '../lib/searchIndex';
import { searchLabel, normalizeSearchText } from '../lib/searchIndex';
import { useArchive } from '../state/ArchiveContext';
import { useI18n } from '../i18n/I18nContext';
import { currentLocalDate, loadActivityCatalog } from '../lib/activityCatalog';
import './timeline-refine.css';

/**
 * Local presentation types deliberately do not depend on older/newer
 * TimelineKind / TimelineEntry / Overview contracts in src/lib/overview.ts.
 * This keeps the timeline usable while other archive modules are updated.
 */
type ActivityKind = 'milestone' | 'unit' | 'release' | 'concert' | 'appearance';
type ViewKind = ActivityKind | 'photos' | 'film';
type FilterKind = 'all' | ViewKind | 'signal' | 'planned';
type ViewEntry = {
  key: string;
  date: string;
  kind: ViewKind;
  title: SearchLabel;
  description: SearchLabel;
  entries: SearchEntry[];
  source?: string;
  sourceName?: string;
  scope?: string;
  scheduled?: boolean;
};
type OverviewData = Awaited<ReturnType<typeof loadOverview>>;
/** Keep historical activity data shared with the profile page. */
async function loadActivityEntries(refresh = false): Promise<ViewEntry[]> {
  const catalog = await loadActivityCatalog(refresh);
  return catalog.entries.map((row) => ({
    key: `activity:${row.id}`, date: row.date, kind: row.kind,
    title: row.title, description: row.description, entries: [], source: row.source,
    sourceName: row.sourceName, scope: row.scope, scheduled: row.scheduled,
  }));
}
const PAGE_SIZE = 24;
const LABELS = {
  ko: {
    title: '활동 타임라인', intro: '곽연지이 함께한 활동과 남겨진 기록',
    all: '전체', release: '음반 · 음원', unit: '유닛', concert: '공연',
    appearance: '방송 · 행사', milestone: '기록', photos: '사진', film: '영상', signal: 'SIGNAL',
    search: '활동명, 유닛, 날짜 검색', years: '전체 연도', allScope: '등록된 참여 활동',
    recent: '최신순', old: '오래된순', results: '개의 기록',
    activity: '참여 활동', indexed: '사진 · 영상', loading: '기록을 불러오는 중',
    error: '일부 목록을 불러오지 못했습니다', retry: '다시 시도',
    empty: '해당 조건의 기록이 없습니다', clear: '필터 초기화', more: '더 보기',
    view: '자료 보기', source: '출처 확인', upcoming: '예정', planned: '발표 일정', scopes: '전체 활동',
    dayPhotos: '같은 날짜 사진', about: '활동 자료는 출처 링크와 함께 기록합니다. 같은 날짜 사진은 해당 활동과 직접 관련되지 않을 수 있습니다.',
    notes: '개별 방송·행사 등은 확인된 자료부터 계속 추가합니다.',
  },
  en: {
    title: 'Activity timeline', intro: 'Activities and archive records featuring YeonJi',
    all: 'All', release: 'Releases', unit: 'Units', concert: 'Live',
    appearance: 'Media · Events', milestone: 'Milestones', photos: 'Photos', film: 'Videos', signal: 'SIGNAL',
    search: 'Search activity, unit or date', years: 'All years', allScope: 'Indexed activities',
    recent: 'Newest first', old: 'Oldest first', results: 'records',
    activity: 'Activities', indexed: 'Photos · videos', loading: 'Loading timeline',
    error: 'Some archive data could not be loaded', retry: 'Retry',
    empty: 'No records match these filters', clear: 'Clear filters', more: 'Load more',
    view: 'Open archive', source: 'View source', upcoming: 'Scheduled', planned: 'Announced', scopes: 'All activities',
    dayPhotos: 'Photos on this date', about: 'Activity records include source links. Photos with matching dates are not necessarily from the same event.',
    notes: 'Additional broadcasts and events are added as their sources are verified.',
  },
  ja: {
    title: '活動タイムライン', intro: 'ヨンジが参加した活動とアーカイブ記録',
    all: 'すべて', release: '音楽', unit: 'ユニット', concert: '公演',
    appearance: '番組・イベント', milestone: '記録', photos: '写真', film: '動画', signal: 'SIGNAL',
    search: '活動名・ユニット・日付で検索', years: 'すべての年', allScope: '登録された参加活動',
    recent: '新しい順', old: '古い順', results: '件の記録',
    activity: '活動記録', indexed: '写真・動画', loading: 'タイムラインを読み込み中',
    error: '一部の記録を読み込めませんでした', retry: '再試行',
    empty: '条件に一致する記録がありません', clear: '条件をリセット', more: 'もっと見る',
    view: '資料を見る', source: '出典を見る', upcoming: '予定', planned: '発表済み日程', scopes: 'すべての活動',
    dayPhotos: '同じ日付の写真', about: '活動記録には出典があります。同じ日付の写真が当該イベントと直接関連するとは限りません。',
    notes: '番組・イベントなどは出典を確認しながら追加します。',
  },
} as const;
const TABS: readonly FilterKind[] = ['all', 'release', 'unit', 'concert', 'appearance', 'milestone', 'planned', 'signal', 'photos', 'film'];
const isActivity = (kind: ViewKind) => kind !== 'photos' && kind !== 'film';
const isSignal = (item: ViewEntry): boolean =>
  item.kind === 'film' && item.entries.some((entry) => /\bsignal\b|시그널|シグナル/i.test(entry.searchText));

export function TimelinePage() {
  const { language, formatNumber } = useI18n();
  const ui = LABELS[language as keyof typeof LABELS] ?? LABELS.ko;
  const { setScreen } = useArchive();
  const [data, setData] = useState<OverviewData | null>(null);
  const [activities, setActivities] = useState<ViewEntry[]>([]);
  const [activityError, setActivityError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState('all');
  const [scope, setScope] = useState('all');
  const [filter, setFilter] = useState<FilterKind>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'new' | 'old'>('new');
  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => {
    let active = true;
    void Promise.allSettled([loadOverview(), loadActivityEntries()]).then(([overviewResult, activityResult]) => {
      if (!active) return;
      setData(overviewResult.status === 'fulfilled' ? overviewResult.value : null);
      setActivities(activityResult.status === 'fulfilled' ? activityResult.value : []);
      setActivityError(activityResult.status === 'rejected');
      setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const timeline = useMemo<ViewEntry[]>(() => {
    const merged = new Map<string, ViewEntry>();
    if (data) for (const item of buildTimeline(data)) {
      // The activity catalogue owns milestones; don't double-count legacy overview milestones.
      if (item.kind === 'milestone') continue;
      const kind = item.kind as ViewKind;
      merged.set(item.key, {
        key: item.key, date: item.date, kind, title: item.title,
        description: item.description, entries: item.entries,
        source: item.source,
      });
    }
    // Where overview.ts has already imported activities, override by key;
    // otherwise merge them here. The same activity never appears twice.
    for (const entry of activities) merged.set(entry.key, entry);
    return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  }, [data, activities]);
  const sameDayPhotos = useMemo(() => {
    const result = new Map<string, SearchEntry[]>();
    for (const photo of data?.photos ?? []) {
      if (!photo.date) continue;
      const group = result.get(photo.date) ?? [];
      group.push(photo);
      result.set(photo.date, group);
    }
    return result;
  }, [data]);
  const years = useMemo(() => Array.from(new Set(timeline.map((item) => item.date.slice(0, 4)))).sort().reverse(), [timeline]);
  const scopes = useMemo(() => Array.from(new Set(activities.map((entry) => entry.scope).filter((entry): entry is string => !!entry))).sort(), [activities]);
  const matches = useMemo(() => {
    const q = normalizeSearchText(search);
    const filtered = timeline.filter((item) => {
      // Published activities and announced-but-unverified shows must not be mixed.
      if (filter === 'planned' ? !item.scheduled : Boolean(item.scheduled)) return false;
      if (year !== 'all' && !item.date.startsWith(year)) return false;
      if (scope !== 'all' && item.scope !== scope) return false;
      if (filter !== 'planned' && (filter === 'signal' ? !isSignal(item) : filter !== 'all' && item.kind !== filter)) return false;
      if (!q) return true;
      const haystack = normalizeSearchText([
        item.date, item.scope ?? '', ...Object.values(item.title), ...Object.values(item.description),
        ...item.entries.map((entry) => entry.searchText),
      ].join(' '));
      return haystack.includes(q);
    });
    return sort === 'old' ? [...filtered].reverse() : filtered;
  }, [timeline, year, scope, filter, search, sort]);
  const counts = useMemo(() => ({
    activity: timeline.filter((item) => isActivity(item.kind) && !item.scheduled && item.date <= currentLocalDate()).length,
    media: timeline.filter((item) => !isActivity(item.kind)).length,
  }), [timeline]);
  const selectFilter = (next: FilterKind) => { setFilter(next); setVisible(PAGE_SIZE); };
  const selectYear = (next: string) => { setYear(next); setVisible(PAGE_SIZE); };
  const refresh = () => {
    setLoading(true);
    void Promise.allSettled([retryOverview(), loadActivityEntries(true)]).then(([overviewResult, activityResult]) => {
      setData(overviewResult.status === 'fulfilled' ? overviewResult.value : null);
      setActivities(activityResult.status === 'fulfilled' ? activityResult.value : []);
      setActivityError(activityResult.status === 'rejected');
      setLoading(false);
    });
  };
  const reset = () => { setYear('all'); setScope('all'); setFilter('all'); setSearch(''); setSort('new'); setVisible(PAGE_SIZE); };
  const today = currentLocalDate();

  return <div className="shion-timeline shion-timeline-refined" aria-labelledby="shion-timeline-title">
    <header className="shion-page-heading shion-timeline-header">
      <span className="shion-page-kicker">KWAK YEONJI / S12</span>
      <h1 id="shion-timeline-title">{ui.title}</h1>
      <p>{ui.intro}</p>
    </header>

    <div className="shion-timeline-quickstats" aria-label={ui.allScope}>
      <div><span>ACTIVITY</span><strong>{formatNumber(counts.activity)}</strong><small>{ui.activity}</small></div>
      <div><span>ARCHIVE</span><strong>{formatNumber(counts.media)}</strong><small>{ui.indexed}</small></div>
      <div><span>PERIOD</span><strong>{years[years.length - 1] ?? '—'}<i>—</i>{years[0] ?? '—'}</strong><small>{ui.allScope}</small></div>
    </div>

    <div className="shion-timeline-refine-controls">
      <div className="shion-timeline-filter-scroll" role="group" aria-label={ui.allScope}>
        {TABS.map((key) => <button type="button" key={key} className={filter === key ? 'is-active' : ''}
          aria-pressed={filter === key} onClick={() => selectFilter(key)}>{ui[key]}</button>)}
      </div>
      <div className="shion-timeline-filter-row">
        <label className="shion-timeline-query">
          <span className="sr-only">{ui.search}</span>
          <input type="search" value={search} placeholder={ui.search} maxLength={120}
            onChange={(event: { target: { value: string } }) => { setSearch(event.target.value); setVisible(PAGE_SIZE); }} />
        </label>
        <label className="shion-timeline-select">
          <span className="sr-only">{ui.years}</span>
          <select value={year} onChange={(event: { target: { value: string } }) => selectYear(event.target.value)}>
            <option value="all">{ui.years}</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="shion-timeline-select shion-timeline-scope-select">
          <span className="sr-only">{ui.scopes}</span>
          <select value={scope} onChange={(event: { target: { value: string } }) => { setScope(event.target.value); setVisible(PAGE_SIZE); }}>
            <option value="all">{ui.scopes}</option>
            {scopes.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <label className="shion-timeline-select shion-timeline-order">
          <span className="sr-only">{ui.recent}</span>
          <select value={sort} onChange={(event: { target: { value: string } }) => { setSort(event.target.value as 'new' | 'old'); setVisible(PAGE_SIZE); }}>
            <option value="new">{ui.recent}</option><option value="old">{ui.old}</option>
          </select>
        </label>
      </div>
    </div>
    <div className="shion-timeline-meta"><span>{formatNumber(matches.length)} {ui.results}</span>
      {(search || year !== 'all' || scope !== 'all' || filter !== 'all' || sort !== 'new') &&
        <button type="button" onClick={reset}>{ui.clear}</button>}
    </div>
    {(activityError || (data && (data.photoError || data.filmError))) &&
      <div role="status" className="shion-overview-warning"><span>{ui.error}</span>
        <button type="button" onClick={refresh}>{ui.retry}</button></div>}
    {loading ? <div className="shion-timeline-loading" role="status">{ui.loading}</div> : matches.length ?
      <ol className="shion-timeline-list">
        {matches.slice(0, visible).map((item, index) => {
          const photos = item.kind === 'photos';
          const videos = item.kind === 'film';
          const datePhotos = isActivity(item.kind) ? sameDayPhotos.get(item.date) ?? [] : [];
          return <Fragment key={item.key}>
            {(index === 0 || matches[index - 1]?.date.slice(0, 4) !== item.date.slice(0, 4)) &&
              <li className="shion-timeline-year-divider" aria-label={item.date.slice(0, 4)}>{item.date.slice(0, 4)}</li>}
            <li className={`shion-timeline-entry is-${item.kind}${item.scheduled ? ' is-scheduled' : ''}`}>
            <time dateTime={item.date}>{item.date.replace(/-/g, '.')}</time>
            <article className="shion-timeline-entry-body">
              <div className="shion-timeline-entry-top">
                <span className="shion-timeline-kind">{isSignal(item) ? 'SIGNAL' : ui[item.kind]}</span>
                {item.scope && <span className="shion-timeline-scope">{item.scope}</span>}
                {(item.scheduled || item.date > today) && <span className="shion-timeline-future">{item.scheduled ? ui.planned : ui.upcoming}</span>}
              </div>
              <h2>{searchLabel(item.title, language)}</h2>
              <p>{searchLabel(item.description, language)}</p>
              {item.entries.length > 0 && <div className="shion-timeline-media">
                {item.entries.slice(0, photos ? 4 : 2).map((entry) => <button key={entry.key} type="button"
                  aria-label={searchLabel(entry.title, language)} onClick={() => setScreen(photos ? 'photos' : 'film', entry.id)}>
                  {entry.image ? <img src={entry.image} alt="" loading="lazy" decoding="async" /> :
                    <span>{photos ? 'PHOTO' : 'FILM'}</span>}
                </button>)}
              </div>}
              <div className="shion-timeline-actions">
                {(photos || videos) && <button className="shion-timeline-open" type="button"
                  onClick={() => setScreen(photos ? 'photos' : 'film', item.entries[0]?.id)}>
                  {ui.view} <ArrowIcon width={14} height={14}/></button>}
                {datePhotos.length > 0 && <button className="shion-timeline-open shion-timeline-related" type="button"
                  onClick={() => setScreen('photos', datePhotos[0]?.id)}>{ui.dayPhotos} · {formatNumber(datePhotos.length)} <ArrowIcon width={14} height={14}/></button>}
                {item.source && <a className="shion-timeline-open" href={item.source} target="_blank" rel="noopener noreferrer">
                  {ui.source}{item.sourceName ? ` · ${item.sourceName}` : ''} <ArrowIcon width={14} height={14}/></a>}
              </div>
            </article>
          </li></Fragment>;
        })}
      </ol> : <div className="shion-timeline-empty">{ui.empty}</div>}

    {!loading && visible < matches.length && <div className="shion-timeline-more"><button type="button"
      onClick={() => setVisible((count) => count + PAGE_SIZE)}>{ui.more}<span>{Math.min(visible, matches.length)} / {matches.length}</span></button></div>}
    <footer className="shion-timeline-editorial"><p>{ui.about}</p><p>{ui.notes}</p><span>ARCHIVED BY @bbangshion</span></footer>
  </div>;
}
