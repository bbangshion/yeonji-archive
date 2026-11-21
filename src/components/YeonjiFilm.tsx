import { createPortal } from 'react-dom';
import '../i18n/yeonji-film-messages';
import { Trans, useI18n } from '../i18n/I18nContext';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowIcon } from './Icons';
import { filmEmbedUrl, filmThumbnail, filmYoutubeUrl, filmScopeLabel, filmPublisherLabel, normalizeFilms, readableFilmDate } from '../lib/films';
import type { Film, FilmPublisher } from '../lib/films';
import { clearRouteItem, getRouteItem } from '../lib/archiveRoute';
import './yeonji-film.css';

const DATA_PATH = `${import.meta.env.BASE_URL}data/films.json`;
const STORAGE_KEY = 'yeonji-archive-film-favorites-v1';
const PAGE_SIZE = 18;
type FilmFilter = 'all' | 'review' | 'fancam' | 'music' | 'signal' | 'performance' | 'live' | 'behind' | 'saved';
type PublisherFilter = 'all' | FilmPublisher;
type ScopeFilter = 'all' | Film['scope'];
const TABS: { id: FilmFilter; label: string }[] = [
  { id: 'all', label: '전체' }, { id: 'review', label: '검토 필요' }, { id: 'fancam', label: '연지 직캠' },
  { id: 'music', label: '공식 MV' }, { id: 'signal', label: 'SIGNAL' },
  { id: 'performance', label: '무대·안무' }, { id: 'live', label: '라이브' },
  { id: 'behind', label: '비하인드' }, { id: 'saved', label: '저장한 영상' },
];
const PUBLISHERS: { id: PublisherFilter; label: string }[] = [
  {id:'all',label:'전체 출처'}, {id:'official',label:'tripleS 공식'},
  {id:'broadcast',label:'방송사'}, {id:'fan',label:'팬 촬영'},
];
const getSavedIds = (): Set<string> => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string' && /^[\w-]{11}$/.test(id)) : []);
  } catch { return new Set(); }
};


/* Film quality v3 — title-only hints; never substitute for manual attendance checks */
const YEONJI_TITLE_MARKER = /곽\s*연지|#?연지|kwak[\s._-]*yeon[\s._-]*ji|yeon[\s._-]*ji/i;
const OTHER_MEMBER_IN_TITLE = /공유빈|김유연|김나경|정혜린|이지우|윤서연|김수민|김채연|김채원|정하연|박시온|김수민|김주빈|코토네|서다현|신위|니엔|마유|설린/i;
function filmNeedsReview(video: Film): boolean {
  const direct = YEONJI_TITLE_MARKER.test(video.title);
  // A group title may still contain YeonJi; only mark ambiguous solo metadata for review.
  return !direct || (video.scope === 'solo' && OTHER_MEMBER_IN_TITLE.test(video.title));
}
function filmBadgeText(video: Film): string {
  const title = video.title;
  if (/(?:#shorts|\bshorts\b|쇼츠)/i.test(title)) return 'SHORTS';
  if (video.kind === 'fancam' || /(?:직캠|fancam|focus\s*cam|최애직캠|입덕직캠|페이스캠)/i.test(title)) return 'FANCAM';
  if (video.kind === 'signal' || /(?:\bsignal\b|시그널)/i.test(title)) return 'SIGNAL';
  if (video.kind === 'dance' || /(?:dance\s*practice|안무\s*영상|안무\s*연습)/i.test(title)) return 'PRACTICE';
  if (video.kind === 'mv' || /(?:official\s*(?:mv|music\s*video)|\bm\/v\b|뮤직비디오)/i.test(title)) return 'MV';
  if (video.kind === 'behind' || /(?:behind|비하인드|making\s*film)/i.test(title)) return 'BEHIND';
  if (video.kind === 'live' || /(?:\blivestream\b|\blive\b|라이브)/i.test(title)) return 'LIVE';
  return 'VIDEO';
}

function FilmImage({video}: {video:Film}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false),[video.id]);
  return <div className="yfilm-image">
    {failed ? <span className="yfilm-image-fallback">YEONJI ARCHIVE<br/><small>WATCH ON YOUTUBE</small></span>
      : <img alt="" src={filmThumbnail(video.youtubeId)} width="480" height="270" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>}
    <span className="yfilm-play" aria-hidden="true">▶</span>
    <span className="yfilm-image-badge">{filmBadgeText(video)}</span>
  </div>;
}
function FilmCard({video,saved,onPlay,onSave}:{video:Film;saved:boolean;onPlay:()=>void;onSave:()=>void}) {
  const {t} = useI18n();
  return <article className="yfilm-card">
    <button className="yfilm-card-main" type="button" title={video.title} onClick={onPlay} aria-label={`${t(video.title)} · ${t('영상 재생')}`}>
      <FilmImage video={video}/>
      <div className="yfilm-card-info">
        <span className="yfilm-eyeline">{t(filmPublisherLabel(video.publisher))} <i>·</i> {readableFilmDate(video.publishedAt)}</span>
        <strong>{t(video.title)}</strong>{filmNeedsReview(video) && <span className="yfilm-review-flag">제목 기준 확인 필요</span>}
        <span className="yfilm-card-extra">{video.group} <i> / </i> {t(filmScopeLabel(video.scope))}{video.song ? ` · ${video.song}` : ''}</span>
      </div>
    </button>
    <button className={`yfilm-save${saved?' is-on':''}`} type="button" aria-pressed={saved} aria-label={`${t(video.title)} · ${t(saved?'저장 해제':'저장')}`} onClick={onSave} title={t(saved?'저장 해제':'저장')}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill={saved?'currentColor':'none'}><path d="M6.5 3.8h11v16L12 16l-5.5 3.8v-16Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
    </button>
  </article>;
}
function VideoDialog({video,onClose}:{video:Film;onClose:()=>void}) {
  const {t} = useI18n();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [copied,setCopied]=useState(false);
  const share=async()=>{
    const url=filmYoutubeUrl(video.youtubeId);
    try {
      if(navigator.share) await navigator.share({title:video.title,url});
      else if(navigator.clipboard?.writeText) {await navigator.clipboard.writeText(url);setCopied(true);}
      else window.prompt(t('영상 링크 복사'),url);
    } catch(error) {if(!(error instanceof DOMException && error.name==='AbortError')) window.prompt(t('영상 링크 복사'),url);}
  };
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeButton.current?.focus();
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key === 'Escape') { event.preventDefault(); onClose(); }
      if(event.key!=='Tab') return;
      const controls=panel.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
      if(!controls?.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(!first || !last) return;
      if(event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',onKeyDown);
    return ()=>{document.removeEventListener('keydown',onKeyDown);document.body.style.overflow=previousOverflow;previous?.focus();};
  },[onClose]);
  return createPortal(<div className="yfilm-modal-layer" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="yfilm-modal" ref={panel} role="dialog" aria-modal="true" aria-labelledby="yfilm-modal-title">
      <div className="yfilm-modal-top"><div><span className="yfilm-kicker">YEONJI FILM / {video.group}</span><h2 id="yfilm-modal-title">{t(video.title)}</h2></div><button ref={closeButton} className="yfilm-close" type="button" onClick={onClose} aria-label={t('닫기')}>×</button></div>
      <div className="yfilm-player"><iframe title={t(video.title)} src={filmEmbedUrl(video.youtubeId)} allow="autoplay; encrypted-media; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/></div>
      <div className="yfilm-modal-bottom"><span>{t(filmPublisherLabel(video.publisher))} · {readableFilmDate(video.publishedAt)} · {video.source}</span><div className="yfilm-modal-actions"><button type="button" onClick={share}>{t(copied?'링크 복사됨':'공유')}</button><a target="_blank" rel="noopener noreferrer" href={filmYoutubeUrl(video.youtubeId)}>{t('YouTube에서 보기')} <ArrowIcon width={15} height={15}/></a></div></div>
      <p className="yfilm-player-note">{t('재생되지 않는 영상은 YouTube에서 확인하세요')}</p>
    </div>
  </div>, document.body);
}
export default function YeonjiFilm(){
  const {t,formatNumber} = useI18n();
  const [films,setFilms]=useState<Film[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [filter,setFilter]=useState<FilmFilter>('all');
  const [publisher,setPublisher]=useState<PublisherFilter>('all');
  const [scope,setScope]=useState<ScopeFilter>('all');
  const [group,setGroup]=useState('all');
  const [year,setYear]=useState('all');
  const [sort,setSort]=useState<'newest'|'oldest'>('newest');
  const [query,setQuery]=useState('');
  const [visible,setVisible]=useState(PAGE_SIZE);
  const [playingId,setPlayingId]=useState<string|null>(null);
  const [saved,setSaved]=useState<Set<string>>(getSavedIds);
  const deferredQuery=useDeferredValue(query.trim().toLocaleLowerCase());
  const closePlayer=useCallback(()=>{setPlayingId(null);clearRouteItem('film');},[]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(DATA_PATH,{signal:controller.signal,cache:'no-cache'}).then(async response=>{
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const payload:unknown=await response.json();
      if(!controller.signal.aborted)setFilms(normalizeFilms(payload));
    }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:String(reason));})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{const id=getRouteItem('film');if(id && films.some(f=>f.id===id))setPlayingId(id);},[films]);
  useEffect(()=>setVisible(PAGE_SIZE),[filter,publisher,scope,group,year,sort,deferredQuery]);
  const years=useMemo(()=>[...new Set(films.map(f=>f.publishedAt?.slice(0,4)).filter((v):v is string=>!!v))].sort().reverse(),[films]);
  const groups=useMemo(()=>[...new Set(films.map(f=>f.group))].sort((a,b)=>a.localeCompare(b)),[films]);
  const stats=useMemo(()=>({total:films.length,fancams:films.filter(f=>f.kind==='fancam').length,official:films.filter(f=>f.publisher==='official').length, signal:films.filter(f=>f.category==='signal').length, behind:films.filter(f=>f.kind==='behind').length}),[films]);
  const filtered=useMemo(()=>films.filter(f=>
    (filter==='all'||filter==='review'&&filmNeedsReview(f)||filter==='saved'&&saved.has(f.id)||filter==='fancam'&&f.kind==='fancam'||filter==='music'&&f.category==='music'||filter==='signal'&&f.category==='signal'||filter==='performance'&&f.category==='performance'||filter==='live'&&f.category==='live'||filter==='behind'&&f.kind==='behind')&&
    (publisher==='all'||f.publisher===publisher)&&
    (scope==='all'||f.scope===scope)&&
    (group==='all'||f.group===group)&&
    (year==='all'||f.publishedAt?.startsWith(year))&&
    (!deferredQuery||[f.title,f.group,f.song,f.source,f.note,f.publishedAt].join(' ').toLocaleLowerCase().includes(deferredQuery))
  ).sort((a,b)=>sort==='newest'?(b.publishedAt??'').localeCompare(a.publishedAt??''):(a.publishedAt??'').localeCompare(b.publishedAt??'')),[films,filter,publisher,scope,group,year,sort,saved,deferredQuery]);
  const selected=films.find(f=>f.id===playingId)??null;
  const toggleSaved=(id:string)=>setSaved(prev=>{
    const next=new Set(prev); if(next.has(id))next.delete(id); else next.add(id);
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify([...next]));}catch{/* private browsing: in-memory selection remains */}
    return next;
  });
  const reset=()=>{setFilter('all');setPublisher('all');setScope('all');setGroup('all');setYear('all');setSort('newest');setQuery('');};
  return <section className="shion-film-page yfilm-page animate-appear">
    <header className="yeonji-page-heading yfilm-heading"><span className="yeonji-page-kicker">YEONJI FILM / S12</span><h1>{t('영상')}</h1><p>{t('곽연지의 공식 영상, 무대, 개인 직캠')}</p></header>
    <div className="yfilm-summary" aria-label={t('영상 통계')}><div><span>ALL FILMS</span><strong>{formatNumber(stats.total)}</strong></div><div><span>FANCAMS</span><strong>{formatNumber(stats.fancams)}</strong></div><div><span>TRIPLES OFFICIAL</span><strong>{formatNumber(stats.official)}</strong></div><div><span>SIGNAL</span><strong>{formatNumber(stats.signal)}</strong></div><div><span>BEHIND</span><strong>{formatNumber(stats.behind)}</strong></div></div>
    <div className="yfilm-controls">
      <div className="yfilm-tabs" role="group" aria-label={t('영상 종류')}>{TABS.map(tab=><button key={tab.id} type="button" aria-pressed={filter===tab.id} className={filter===tab.id?'is-active':''} onClick={()=>setFilter(tab.id)}>{t(tab.label)}</button>)}</div>
      <div className="yfilm-search"><label><span className="sr-only">{t('영상 검색')}</span><input value={query} type="search" onChange={e=>setQuery(e.target.value)} autoComplete="off" placeholder={t('곡명, 연도, 방송사, 영상 제목 검색')}/></label><button type="button" onClick={reset}>{t('초기화')}</button></div>
      <div className="yfilm-selects">
        <label><span>{t('출처')}</span><select value={publisher} onChange={e=>setPublisher(e.target.value as PublisherFilter)}>{PUBLISHERS.map(x=><option key={x.id} value={x.id}>{t(x.label)}</option>)}</select></label>
        <label><span>{t('출연 형태')}</span><select value={scope} onChange={e=>setScope(e.target.value as ScopeFilter)}><option value="all">{t('전체 형태')}</option><option value="solo">{t('개인')}</option><option value="unit">{t('유닛')}</option><option value="group">{t('완전체')}</option></select></label>
        <label><span>{t('활동')}</span><select value={group} onChange={e=>setGroup(e.target.value)}><option value="all">{t('모든 활동')}</option>{groups.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label><span>{t('연도')}</span><select value={year} onChange={e=>setYear(e.target.value)}><option value="all">{t('전체 연도')}</option>{years.map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span>{t('정렬')}</span><select value={sort} onChange={e=>setSort(e.target.value as 'newest'|'oldest')}><option value="newest">{t('최신순')}</option><option value="oldest">{t('오래된 순')}</option></select></label>
      </div>
    </div>
    <div className="yfilm-results"><span>{loading?t('불러오는 중'):`${formatNumber(filtered.length)} ${t('영상')}`}</span><span>{t('일괄 등록 영상 포함 · 출연 여부는 순차 검수 중')} · {t('검토 필요')} {formatNumber(films.filter(f=>filmNeedsReview(f)).length)}</span></div>
    {loading?<div className="yfilm-grid" role="status" aria-label={t('불러오는 중')}>{Array.from({length:6},(_,i)=><div key={i} className="yfilm-skeleton"><div/><span/></div>)}</div>:
      error?<div className="yfilm-empty" role="alert"><h2>{t('영상 데이터를 불러오지 못했습니다')}</h2><p>{error}</p><a target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/@triplescosmos">tripleS official ↗</a></div>:
      filtered.length?<><div className="yfilm-grid">{filtered.slice(0,visible).map(f=><FilmCard key={f.id} video={f} saved={saved.has(f.id)} onPlay={()=>setPlayingId(f.id)} onSave={()=>toggleSaved(f.id)}/>)}</div>{visible<filtered.length&&<div className="yfilm-more"><button type="button" onClick={()=>setVisible(v=>v+PAGE_SIZE)}>{t('더 보기')} <span>{Math.min(visible,filtered.length)} / {filtered.length}</span></button></div>}</>:
      <div className="yfilm-empty"><h2>{t('표시할 영상이 없습니다')}</h2><p>{t('검색어나 필터를 변경해 보세요')}</p><button type="button" onClick={reset}>{t('전체 보기')}</button></div>}
    <aside className="yfilm-note"><span>ARCHIVE NOTE</span><p>{t('검색 결과로 등록한 영상은 출연 여부를 확인하는 중입니다. 제목에 연지의 이름이 있어도 실제 출연은 별도 검수가 필요합니다. 원본 영상은 YouTube에서 재생합니다.')}</p><a target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/@triplescosmos">tripleS official ↗</a></aside>
    {selected&&<VideoDialog video={selected} onClose={closePlayer}/>}
  </section>;
}
