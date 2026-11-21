import { Trans, useI18n } from '../i18n/I18nContext';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowIcon } from './Icons';
import { filmEmbedUrl, filmThumbnail, filmYoutubeUrl, normalizeFilms, readableFilmDate, filmScopeLabel } from '../lib/films';
import type { Film, FilmCategory } from '../lib/films';
import { clearRouteItem, getRouteItem } from '../lib/archiveRoute';
const DATA_PATH = `${import.meta.env.BASE_URL}data/films.json`;
const STORAGE_KEY = 'yeonji-archive-film-favorites-v1';
const PAGE_SIZE = 24;
type FilmFilter = 'all' | FilmCategory | 'saved';
const FILTERS: readonly {
    id: FilmFilter;
    text: string;
}[] = [
    { id: 'all', text: '전체' },
    { id: 'signal', text: 'SIGNAL' },
    { id: 'music', text: '뮤직비디오' },
    { id: 'performance', text: '무대·직캠' },
    { id: 'live', text: '라이브' },
    { id: 'other', text: '기타' },
    { id: 'saved', text: '저장한 영상' },
];
function getSavedIds(): Set<string> {
    try {
        const data: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
        if (!Array.isArray(data))
            return new Set();
        return new Set(data.filter((id): id is string => typeof id === 'string' && /^[\w-]{11}$/.test(id)));
    }
    catch {
        return new Set();
    }
}
function FilmImage({ video }: {
    video: Film;
}) {
    const [broken, setBroken] = useState(false);
    useEffect(() => setBroken(false), [video.id]);
    return <div className="shion-film-poster">
    {broken ? <span className="shion-film-noimage"><Trans value="영상 미리보기를 표시할 수 없습니다"/></span> :
            <img src={filmThumbnail(video.youtubeId)} alt="" width="480" height="360" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)}/>}
    <span className="shion-film-play-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" width="25" height="25"><path d="m9 6 9 6-9 6V6Z" fill="currentColor"/></svg></span>
  </div>;
}
function FilmCard({ video, saved, onPlay, onSave }: {
    video: Film;
    saved: boolean;
    onPlay: () => void;
    onSave: () => void;
}) {
    const { t } = useI18n();
    return <article className="shion-film-card">
    <button className="shion-film-card-main" type="button" onClick={onPlay} aria-label={`${t(video.title)} ${t("영상")}`}>
      <FilmImage video={video}/>
      <span className="shion-film-card-details">
        <span className="shion-film-category">{t(filmScopeLabel(video.scope))} · {video.group} <span aria-hidden="true">/</span> {readableFilmDate(video.publishedAt)}</span>
        <strong><Trans value={video.title}/></strong>
        <span className="shion-film-caption"><Trans value={video.note || video.source}/></span>
      </span>
    </button>
    <button className={`shion-film-save ${saved ? 'is-active' : ''}`} type="button" onClick={onSave} aria-pressed={saved} aria-label={`${video.title} ${t(saved ? '저장 해제' : '저장')}`} title={t(saved ? '저장 해제' : '저장')}>
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill={saved ? 'currentColor' : 'none'}><path d="M6.5 3.7h11a.7.7 0 0 1 .7.7v16L12 16.1l-6.2 4.3v-16a.7.7 0 0 1 .7-.7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
    </button>
  </article>;
}
function PlayerDialog({ video, onClose }: {
    video: Film;
    onClose: () => void;
}) {
    const closeRef = useRef<HTMLButtonElement>(null);
    const { t } = useI18n();
    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const oldOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                onClose();
            if (event.key === 'Tab') {
                const root = document.getElementById('shion-film-dialog');
                const controls = root?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
                if (!controls?.length)
                    return;
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (!first || !last) return;
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                }
                else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = oldOverflow;
            previous?.focus();
        };
    }, [onClose]);
    return <div className="shion-film-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget)
        onClose(); }}>
    <div id="shion-film-dialog" className="shion-film-dialog" role="dialog" aria-modal="true" aria-labelledby="shion-film-dialog-title">
      <div className="shion-film-dialog-head">
        <div><span>YEONJI FILM</span><h2 id="shion-film-dialog-title"><Trans value={video.title}/></h2></div>
        <button type="button" className="shion-film-dialog-close" ref={closeRef} onClick={onClose} aria-label={t("영상 닫기")}><Trans value="닫기 "/><span aria-hidden="true">×</span></button>
      </div>
      <div className="shion-film-player">
        <iframe title={`${t(video.title)} YouTube ${t("영상")}`} src={filmEmbedUrl(video.youtubeId)} referrerPolicy="strict-origin-when-cross-origin" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/>
      </div>
      <div className="shion-film-dialog-foot">
        <p>{t(filmScopeLabel(video.scope))} · {video.group} · {readableFilmDate(video.publishedAt)}</p>
        <a href={filmYoutubeUrl(video.youtubeId)} target="_blank" rel="noopener noreferrer"><Trans value="YouTube에서 보기 "/><ArrowIcon width={16} height={16}/></a>
      </div>
    </div>
  </div>;
}
export default function YeonjiFilm() {
    const { t, formatNumber } = useI18n();
    const [films, setFilms] = useState<Film[]>([]);
    const [syncMessage, setSyncMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState<FilmFilter>('all');
    const [query, setQuery] = useState('');
    const [year, setYear] = useState('all');
    const [visible, setVisible] = useState(PAGE_SIZE);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [saved, setSaved] = useState<Set<string>>(getSavedIds);
    const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            try {
                setLoading(true);
                setError('');
                const response = await fetch(DATA_PATH, { signal: controller.signal, cache: 'no-cache' });
                if (!response.ok)
                    throw new Error(`영상 목록을 불러오지 못했습니다 (${response.status})`);
                const payload: unknown = await response.json();
                if (!controller.signal.aborted) {
                    setFilms(normalizeFilms(payload));
                    const report = (payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as {
                        coverage?: {
                            wav?: {
                                status?: string;
                            };
                            official?: {
                                status?: string;
                            };
                        };
                        generatedAt?: string;
                    }) : null);
                    const youtube = report?.coverage?.official?.status;
                    setSyncMessage(youtube === 'no-api-key' ? '공식 채널 전체 자동 검색은 미연결' : youtube === 'ok' ? '공식 채널 목록과 동기화' : '공식 링크를 기준으로 정리');
                }
            }
            catch (reason) {
                if (!controller.signal.aborted)
                    setError(reason instanceof Error ? reason.message : '영상 목록을 불러오지 못했습니다');
            }
            finally {
                if (!controller.signal.aborted)
                    setLoading(false);
            }
        };
        void load();
        return () => controller.abort();
    }, []);
    useEffect(() => {
        const id = getRouteItem('film');
        if (id && films.some((film) => film.id === id)) setPlayingId(id);
    }, [films]);
    const years = useMemo(() => Array.from(new Set(films.flatMap((film) => film.publishedAt ? [film.publishedAt.slice(0, 4)] : []))).sort((a, b) => b.localeCompare(a)), [films]);
    const filtered = useMemo(() => films.filter((film) => (filter === 'all' || (filter === 'saved' ? saved.has(film.id) : film.category === filter)) &&
        (year === 'all' || film.publishedAt?.startsWith(year)) &&
        (!deferredQuery || `${film.title} ${film.group} ${film.note} ${film.publishedAt ?? ''}`.toLocaleLowerCase().includes(deferredQuery))), [films, filter, saved, year, deferredQuery]);
    const selected = useMemo(() => films.find((film) => film.id === playingId) ?? null, [films, playingId]);
    useEffect(() => setVisible(PAGE_SIZE), [filter, query, year]);
    const toggleSaved = (id: string) => {
        setSaved((previous) => {
            const next = new Set(previous);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
            }
            catch { /* browsing remains available */ }
            return next;
        });
    };
    return <div className="shion-film-page animate-appear">
    <header className="yeonji-page-heading">
      <span className="yeonji-page-kicker">YEONJI FILM</span>
      <h1><Trans value="영상"/></h1>
      <p><Trans value="곽연지 개인, 유닛, 완전체 공식 영상"/></p>
    </header>

    <div className="shion-film-controls">
      <div className="shion-film-tabs" role="group" aria-label={t("영상 종류")}>
        {FILTERS.map((item) => <button key={item.id} type="button" className={filter === item.id ? 'is-active' : ''} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{t(item.text)}</button>)}
      </div>
      <div className="shion-film-search-row">
        <label className="shion-film-search"><span className="sr-only"><Trans value="영상 검색"/></span><input type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("영상 제목 검색")}/></label>
        <label className="shion-film-year"><span className="sr-only"><Trans value="연도"/></span><select value={year} onChange={(event) => setYear(event.target.value)}><option value="all">{t('전체 연도')}</option>{years.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
      </div>
    </div>

    <div className="shion-film-result"><span>{loading ? t('불러오는 중') : `${formatNumber(filtered.length)} ${t('영상')}`}</span><span>{t(syncMessage)}</span></div>
    {loading ? <div className="shion-film-grid" role="status" aria-label={t("영상 불러오는 중")}>{Array.from({ length: 6 }, (_, index) => <div className="shion-film-skeleton" key={index}><div /><span /></div>)}</div> : error ?
            <div className="shion-film-empty" role="alert"><h2><Trans value="영상 목록을 불러오지 못했어요"/></h2><p>{t(error)}</p><a href="https://www.youtube.com/@triplescosmos" target="_blank" rel="noopener noreferrer"><Trans value="tripleS 공식 YouTube 열기"/></a></div> : filtered.length ?
            <><div className="shion-film-grid">{filtered.slice(0, visible).map((video) => <FilmCard key={video.id} video={video} saved={saved.has(video.id)} onPlay={() => setPlayingId(video.id)} onSave={() => toggleSaved(video.id)}/>)}</div>
        {visible < filtered.length && <div className="shion-film-more"><button type="button" onClick={() => setVisible((size) => size + PAGE_SIZE)}><Trans value="더 보기 "/><span>{visible} / {filtered.length}</span></button></div>}
      </> : <div className="shion-film-empty"><h2><Trans value="표시할 영상이 없습니다"/></h2><p><Trans value="다른 분류를 선택하거나 검색어를 바꿔보세요"/></p>{(filter !== 'all' || query || year !== 'all') && <button type="button" onClick={() => { setFilter('all'); setQuery(''); setYear('all'); }}><Trans value="전체 보기"/></button>}</div>}

    <aside className="shion-film-note"><span><Trans value="영상 안내"/></span><p><Trans value="공식 채널과 방송사에서 공개한 영상 링크를 정리합니다. 출연 여부가 확인된 영상부터 등록하며, 전체 영상이 모두 수록된 것은 아닙니다. 재생은 YouTube에서 이루어집니다."/></p><a href="https://www.youtube.com/@triplescosmos" target="_blank" rel="noopener noreferrer"><Trans value="tripleS 공식 채널 "/><ArrowIcon width={14} height={14}/></a></aside>
    {selected && <PlayerDialog video={selected} onClose={() => { setPlayingId(null); clearRouteItem('film'); }}/>}
  </div>;
}
