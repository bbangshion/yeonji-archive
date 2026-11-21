import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { useArchive } from '../state/ArchiveContext';
import { loadActivityCatalog, currentLocalDate } from '../lib/activityCatalog';
import type { ActivityCatalog, ActivityKind, ActivityRecord } from '../lib/activityCatalog';
import { normalizeSearchText, searchLabel } from '../lib/searchIndex';
import { ArrowIcon } from './Icons';
import './timeline-refine.css';

type Filter = 'all' | ActivityKind;
const FILTERS: Filter[] = ['all', 'release', 'unit', 'concert', 'appearance', 'milestone'];
const PAGE_SIZE = 12;
const I18N = {
  ko: {
    kicker: 'HISTORY / S12', title: '활동 연대기', lead: '첫 공개부터 음반, 유닛, 무대까지. 출처로 확인할 수 있는 기록을 날짜 순서로 정리했습니다.',
    all: '전체', release: '음반 · 음원', unit: '유닛', concert: '공연', appearance: '콘텐츠 · 행사', milestone: '주요 기록',
    allYears: '모든 연도', allUnits: '모든 활동', newest: '최신순', oldest: '오래된순', search: '곡, 공연, 유닛 검색',
    entryCount: '등록 기록', yearCount: '활동 연도', unitCount: '활동 범위', itemCount: '건', latest: '최근 활동',
    scheduled: '발표된 일정', more: '기록 더 보기', allTimeline: '전체 타임라인', source: '자료 확인',
    empty: '선택한 조건의 기록이 없습니다.', reset: '조건 초기화', error: '활동 기록을 불러올 수 없습니다.', retry: '다시 시도',
    loading: '활동을 불러오는 중', note: '공연 일정과 실제 출연은 서로 구분합니다. 이 목록은 계속 보완하는 공개 기록이며 전체 출연 목록을 의미하지 않습니다.',
  },
  en: {
    kicker: 'HISTORY / S12', title: 'Activity history', lead: 'A source-linked record of releases, units, stages and milestones, from the first reveal onward.',
    all: 'All', release: 'Releases', unit: 'Units', concert: 'Live', appearance: 'Media · Events', milestone: 'Milestones',
    allYears: 'All years', allUnits: 'All activities', newest: 'Newest first', oldest: 'Oldest first', search: 'Search music, shows or units',
    entryCount: 'Recorded events', yearCount: 'Years indexed', unitCount: 'Activity scopes', itemCount: 'records', latest: 'Latest activity',
    scheduled: 'Announced schedule', more: 'Show more', allTimeline: 'Full timeline', source: 'View source',
    empty: 'No matching entries.', reset: 'Reset filters', error: 'Unable to load activity records.', retry: 'Retry',
    loading: 'Loading activities', note: 'Tour announcements are kept separate from confirmed appearances. This evolving index is not exhaustive.',
  },
  ja: {
    kicker: 'HISTORY / S12', title: '活動年表', lead: '公開から音楽、ユニット、公演まで。出典のある記録を日付順に掲載しています。',
    all: 'すべて', release: '音楽', unit: 'ユニット', concert: '公演', appearance: '映像・イベント', milestone: '主な記録',
    allYears: 'すべての年', allUnits: 'すべての活動', newest: '新しい順', oldest: '古い順', search: '楽曲・公演・ユニットを検索',
    entryCount: '登録記録', yearCount: '活動年数', unitCount: '活動分野', itemCount: '件', latest: '最近の活動',
    scheduled: '発表済み日程', more: 'さらに表示', allTimeline: '全タイムライン', source: '出典を見る',
    empty: '該当する記録はありません。', reset: '条件をリセット', error: '活動記録を読み込めませんでした。', retry: '再試行',
    loading: '活動記録を読み込み中', note: '公演予定と出演実績は別に記録しています。全出演を網羅するリストではありません。',
  },
} as const;

export function ProfileHistory() {
  const { language, formatNumber } = useI18n();
  const { setScreen } = useArchive();
  const labels = I18N[language];
  const [catalog, setCatalog] = useState<ActivityCatalog | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [year, setYear] = useState('all');
  const [scope, setScope] = useState('all');
  const [sort, setSort] = useState<'new' | 'old'>('new');
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const load = (refresh: boolean = false): void => {
    setLoading(true);
    loadActivityCatalog(refresh).then((result: ActivityCatalog) => { setCatalog(result); setError(false); })
      .catch(() => { setError(true); }).finally(() => setLoading(false));
  };
  useEffect(() => {
    let active = true;
    loadActivityCatalog().then((result: ActivityCatalog) => { if (active) { setCatalog(result); setError(false); } })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const today = currentLocalDate();
  const records = useMemo<ActivityRecord[]>(() => (catalog?.entries ?? []).filter((entry: ActivityRecord) => !entry.scheduled && entry.date <= today), [catalog, today]);
  const years = useMemo<string[]>(() => Array.from(new Set(records.map((item: ActivityRecord) => item.date.slice(0, 4)))).sort().reverse(), [records]);
  const scopes = useMemo<string[]>(() => Array.from(new Set(records.map((item: ActivityRecord) => item.scope).filter((item): item is string => !!item))).sort(), [records]);
  const matches = useMemo<ActivityRecord[]>(() => {
    const q = normalizeSearchText(query);
    const list = records.filter((item: ActivityRecord) => {
      if (filter !== 'all' && item.kind !== filter) return false;
      if (year !== 'all' && !item.date.startsWith(year)) return false;
      if (scope !== 'all' && item.scope !== scope) return false;
      if (!q) return true;
      return normalizeSearchText([item.date, item.scope ?? '', ...Object.values(item.title), ...Object.values(item.description)].join(' ')).includes(q);
    });
    return sort === 'old' ? [...list].reverse() : list;
  }, [records, filter, year, scope, query, sort]);
  const reset = () => { setFilter('all'); setYear('all'); setScope('all'); setSort('new'); setQuery(''); setVisible(PAGE_SIZE); };
  const showing = matches.slice(0, visible);
  const latest = records[0];
  return <section id="profile-history" className="shion-profile-history mt-20 scroll-mt-28 sm:mt-28" aria-labelledby="profile-history-heading">
    <div className="shion-profile-history-intro">
      <div><span className="shion-page-kicker">{labels.kicker}</span><h2 id="profile-history-heading">{labels.title}</h2><p>{labels.lead}</p></div>
      <button type="button" className="shion-history-full" onClick={() => setScreen('timeline')}>{labels.allTimeline} <ArrowIcon width={15} height={15}/></button>
    </div>
    <div className="shion-history-stats">
      <div><span>{labels.entryCount}</span><strong>{loading ? '—' : formatNumber(records.length)}</strong></div>
      <div><span>{labels.yearCount}</span><strong>{loading ? '—' : formatNumber(years.length)}</strong></div>
      <div><span>{labels.unitCount}</span><strong>{loading ? '—' : formatNumber(scopes.length)}</strong></div>
    </div>
    {!loading && latest && <div className="shion-history-latest">
      <div className="shion-history-latest-label"><span>RECENT</span><span>{labels.latest}</span></div>
      <div><time dateTime={latest.date}>{latest.date.replace(/-/g, '.')}</time>
        <h3>{searchLabel(latest.title, language)}</h3>
        <p>{searchLabel(latest.description, language)}</p></div>
      <a href={latest.source} target="_blank" rel="noopener noreferrer">{labels.source}<ArrowIcon width={12} height={12}/></a>
    </div>}
    <div className="shion-history-controls">
      <div className="shion-history-tabs" role="group" aria-label={labels.title}>
        {FILTERS.map((kind: Filter) => <button key={kind} type="button" className={filter === kind ? 'is-active' : ''} aria-pressed={filter === kind} onClick={() => { setFilter(kind); setVisible(PAGE_SIZE); }}>{labels[kind]}</button>)}
      </div>
      <div className="shion-history-filterrow">
        <label className="shion-history-search"><span className="sr-only">{labels.search}</span><input type="search" value={query} placeholder={labels.search} onChange={(event: { target: { value: string } }) => { setQuery(event.target.value); setVisible(PAGE_SIZE); }} maxLength={120}/></label>
        <label className="shion-history-select"><span className="sr-only">{labels.allYears}</span><select value={year} onChange={(event: { target: { value: string } }) => { setYear(event.target.value); setVisible(PAGE_SIZE); }}><option value="all">{labels.allYears}</option>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="shion-history-select"><span className="sr-only">{labels.allUnits}</span><select value={scope} onChange={(event: { target: { value: string } }) => { setScope(event.target.value); setVisible(PAGE_SIZE); }}><option value="all">{labels.allUnits}</option>{scopes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="shion-history-select shion-history-order"><span className="sr-only">{labels.newest}</span><select value={sort} onChange={(event: { target: { value: string } }) => { setSort(event.target.value as 'old' | 'new'); setVisible(PAGE_SIZE); }}><option value="new">{labels.newest}</option><option value="old">{labels.oldest}</option></select></label>
      </div>
      <div className="shion-history-count"><span>{formatNumber(matches.length)} {labels.itemCount}</span>{(filter !== 'all' || scope !== 'all' || year !== 'all' || !!query || sort !== 'new') && <button type="button" onClick={reset}>{labels.reset}</button>}</div>
    </div>
    {loading && <div className="shion-history-state" role="status">{labels.loading}</div>}
    {!loading && error && <div className="shion-history-state" role="alert">{labels.error}<button type="button" onClick={() => load(true)}>{labels.retry}</button></div>}
    {!loading && !error && matches.length === 0 && <div className="shion-history-state">{labels.empty}</div>}
    {!loading && !error && matches.length > 0 && <ol className="shion-history-list">
      {showing.map((event: ActivityRecord, index: number) => <li className="shion-history-event" key={event.id}>
        {(index === 0 || showing[index - 1]?.date.slice(0, 4) !== event.date.slice(0, 4)) && <div className="shion-history-year" aria-label={event.date.slice(0, 4)}>{event.date.slice(0, 4)}</div>}
        <article className="shion-history-event-inner">
          <time dateTime={event.date}>{event.date.slice(5).replace('-', '.')}</time>
          <div className="shion-history-event-content"><div className="shion-history-event-meta"><span>{labels[event.kind]}</span>{event.scope && <span>{event.scope}</span>}</div>
            <h3>{searchLabel(event.title, language)}</h3><p>{searchLabel(event.description, language)}</p>
            <a href={event.source} target="_blank" rel="noopener noreferrer">{labels.source}{event.sourceName ? ` · ${event.sourceName}` : ''}<ArrowIcon width={12} height={12}/></a>
          </div>
        </article>
      </li>)}
    </ol>}
    {!loading && !error && matches.length > visible && <button type="button" className="shion-history-more" onClick={() => setVisible((count) => count + PAGE_SIZE)}>{labels.more}<span>{Math.min(visible, matches.length)} / {matches.length}</span></button>}
    <p className="shion-history-footnote">{labels.note}</p>
  </section>;
}
