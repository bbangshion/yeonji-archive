import { I18nProvider, Trans, useI18n } from './i18n/I18nContext';
import { AppearanceControls } from './i18n/AppearanceControls';
import { lazy, Suspense, useEffect, useState } from 'react';




import { ArrowIcon } from './components/Icons';
import { ArchiveProvider, useArchive } from './state/ArchiveContext';
import type { ArchiveScreen } from './state/ArchiveContext';
import { ArchiveErrorBoundary } from './components/ArchiveErrorBoundary';
import ScrollReveal from './components/ScrollReveal';
// 1.8: Do not include every archive screen in the initial HOME bundle.
// Modules are loaded only when their menu is opened; the data and UX remain unchanged.
const YeonjiFilm = lazy(() => import('./components/YeonjiFilm'));
const Collection = lazy(() => import('./components/Collection').then((module) => ({ default: module.Collection })));
const TournamentArena = lazy(() => import('./components/TournamentArena').then((module) => ({ default: module.TournamentArena })));
const ProfilePage = lazy(() => import('./components/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const PhotoArchive = lazy(() => import('./components/PhotoArchive').then((module) => ({ default: module.PhotoArchive })));
const SearchPage = lazy(() => import('./components/SearchPage'));
const TimelinePage = lazy(() => import('./components/TimelinePage').then((module) => ({ default: module.TimelinePage })));
const HomeUpdates = lazy(() => import('./components/HomeUpdates'));
const PHOTO_URL = `${import.meta.env.BASE_URL}images/yeonji-home.jpg`;
const MENU: readonly {
    key: ArchiveScreen;
    label: string;
    number: string;
}[] = [
    { key: 'home', label: '홈', number: '01' },
    { key: 'profile', label: '프로필', number: '02' },
    { key: 'photos', label: '사진', number: '03' },
    { key: 'film', label: '영상', number: '04' },
    { key: 'timeline', label: '타임라인', number: '05' },
    { key: 'collection', label: '오브젝트', number: '06' },
    { key: 'worldcup', label: '월드컵', number: '07' },
    { key: 'search', label: '통합 검색', number: '08' },
];
function SiteHeader() {
    const { screen, setScreen } = useArchive();
    const { t } = useI18n();
    const [menuOpen, setMenuOpen] = useState(false);
    useEffect(() => { setMenuOpen(false); }, [screen]);
    useEffect(() => {
        if (!menuOpen)
            return;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                setMenuOpen(false);
        };
        document.addEventListener('keydown', handleEscape);
        document.body.classList.add('shion-menu-open');
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.classList.remove('shion-menu-open');
        };
    }, [menuOpen]);
    const navigate = (next: ArchiveScreen) => {
        setScreen(next);
        setMenuOpen(false);
    };
    return (<>
      <header className={`shion-site-header ${screen === 'home' ? 'on-home' : 'on-subpage'}`}>
        <div className="shion-header-inner">
          <a className="shion-brand" href={import.meta.env.BASE_URL} onClick={(event) => { event.preventDefault(); navigate('home'); }} aria-label={t("YEONJI ARCHIVE 홈으로")}>
            <span className="shion-brand-mark" aria-hidden="true">Y</span>
            <span className="shion-brand-name">YEONJI <span>ARCHIVE</span></span>
          </a>

          <nav className="shion-desktop-nav" aria-label={t("주 메뉴")}>
            {MENU.map((item) => (<button key={item.key} type="button" className={screen === item.key ? 'is-active' : ''} aria-current={screen === item.key ? 'page' : undefined} onClick={() => navigate(item.key)}>{t(item.label)}</button>))}
          </nav>
          <div className="shion-header-right">
            <span className="shion-header-tag">TRIPLES S12</span>
            <AppearanceControls/>
            <button type="button" className={`shion-menu-toggle ${menuOpen ? 'is-open' : ''}`} aria-label={t(menuOpen ? '메뉴 닫기' : '메뉴 열기')} aria-expanded={menuOpen} aria-controls="shion-mobile-menu" onClick={() => setMenuOpen((open) => !open)}>
              <span /><span />
            </button>
          </div>
        </div>
      </header>

      {menuOpen && <button type="button" className="shion-menu-backdrop" aria-label={t("메뉴 닫기")} onClick={() => setMenuOpen(false)}/>}
      <nav id="shion-mobile-menu" aria-label={t("모바일 메뉴")} className={`shion-mobile-menu ${menuOpen ? 'is-open' : ''}`} aria-hidden={!menuOpen} hidden={!menuOpen}>
        <div className="shion-menu-eyebrow">YEONJI ARCHIVE</div>
        {MENU.map((item) => (<button key={item.key} type="button" className={`shion-mobile-link ${screen === item.key ? 'is-active' : ''}`} aria-current={screen === item.key ? 'page' : undefined} onClick={() => navigate(item.key)}>
            <span className="shion-mobile-index">{item.number}</span>
            <span>{t(item.label)}</span>
            <ArrowIcon width={19} height={19}/>
          </button>))}
        <p><Trans value="tripleS 곽연지 팬 아카이브"/></p>
      </nav>
    </>);
}
function Home() {
    const { setScreen, catalogState, favorites } = useArchive();
    const { t, formatNumber } = useI18n();
    const count = catalogState.status === 'ready' ? formatNumber(catalogState.catalog.items.length) : '—';
    return (<main id="main-content" className="shion-home">
      <section className="shion-hero" aria-labelledby="shion-hero-title">
        <div className="shion-hero-image">
          <img src={PHOTO_URL} alt={t("곽연지 아카이브 메인 사진")} width="1152" height="1536" fetchPriority="high" decoding="async"/>
        </div>
        <div className="shion-hero-gradient" aria-hidden="true"/>
        <div className="shion-hero-inner">
          <div className="shion-hero-copy">
            <p className="shion-hero-overline">TRIPLES S12 <span /> KWAK YEONJI</p>
            <h1 id="shion-hero-title">KWAK<br />YEONJI</h1>
            <p className="shion-hero-ko"><Trans value="곽연지"/></p>
            <div className="shion-hero-rule"/>
            <p className="shion-hero-description"><Trans value="곽연지의 사진과 기록을 모아둔 팬 아카이브"/></p>
            <div className="shion-hero-actions">
              <button type="button" className="shion-hero-primary" onClick={() => setScreen('profile')}><Trans value="프로필 보기 "/><ArrowIcon width={17} height={17}/></button>
              <button type="button" className="shion-hero-secondary" onClick={() => setScreen('photos')}><Trans value="사진 보기 "/><ArrowIcon width={17} height={17}/></button>
            </div>
          </div>
          <span className="shion-hero-side" aria-hidden="true">YEONJI ARCHIVE — S12</span>
        </div>
        <div className="shion-scroll-note" aria-hidden="true"><span /> <Trans value="SCROLL TO EXPLORE"/></div>
      </section>

      <Suspense fallback={<div className="shion-overview-loading shion-content-width" role="status"><Trans value="최신 자료를 불러오는 중"/></div>}><HomeUpdates /></Suspense>

      <section className="shion-home-explore" aria-labelledby="shion-explore-title">
        <div className="shion-content-width">
          <div className="shion-section-lead">
            <div>
              <p className="shion-section-eyebrow">ARCHIVE / S12</p>
              <h2 id="shion-explore-title"><Trans value="둘러보기"/></h2>
            </div>
            <p><Trans value="프로필과 사진, 영상, 오브젝트를 둘러보세요"/></p>
          </div>
          <div className="shion-feature-grid">
            <button type="button" className="shion-feature-card" onClick={() => setScreen('profile')}>
              <span className="shion-feature-top"><span>01 / PROFILE</span><ArrowIcon width={21} height={21}/></span>
              <span className="shion-feature-bottom"><strong><Trans value="프로필"/></strong><span><Trans value="기본 정보와 활동 유닛"/></span></span>
            </button>
            <button type="button" className="shion-feature-card" onClick={() => setScreen('photos')}>
              <span className="shion-feature-top"><span>02 / PHOTO</span><ArrowIcon width={21} height={21}/></span>
              <span className="shion-feature-bottom"><strong><Trans value="사진"/></strong><span><Trans value="곽연지 사진과 날짜별 앨범"/></span></span>
            </button>
            <button type="button" className="shion-feature-card" onClick={() => setScreen('film')}>
              <span className="shion-feature-top"><span>03 / FILM</span><ArrowIcon width={21} height={21}/></span>
              <span className="shion-feature-bottom"><strong><Trans value="영상"/></strong><span><Trans value="SIGNAL과 공식 영상"/></span></span>
            </button>
            <button type="button" className="shion-feature-card" onClick={() => setScreen('timeline')}>
              <span className="shion-feature-top"><span>04 / TIMELINE</span><ArrowIcon width={21} height={21}/></span>
              <span className="shion-feature-bottom"><strong><Trans value="활동 타임라인"/></strong><span><Trans value="곽연지의 주요 활동과 날짜별 기록"/></span></span>
            </button>
            <button type="button" className="shion-feature-card" onClick={() => setScreen('collection')}>
              <span className="shion-feature-top"><span>05 / COLLECTION</span><ArrowIcon width={21} height={21}/></span>
              <span className="shion-feature-bottom"><strong><Trans value="오브젝트 컬렉션"/></strong><span><Trans value="시즌별 카드 검색과 즐겨찾기"/></span><small>{catalogState.status === 'loading' ? t('불러오는 중') : `${count} ${t('개')}`}</small></span>
            </button>
            <button type="button" className="shion-feature-card" onClick={() => setScreen('worldcup')}>
              <span className="shion-feature-top"><span>06 / WORLD CUP</span><ArrowIcon width={21} height={21}/></span>
              <span className="shion-feature-bottom"><strong><Trans value="오브젝트 월드컵"/></strong><span><Trans value="두 장씩 비교하며 최애 카드 고르기"/></span><small><Trans value="즐겨찾기 "/>{formatNumber(favorites.size)}<Trans value="개"/></small></span>
            </button>
            <button type="button" className="shion-feature-card" onClick={() => setScreen('search')}>
              <span className="shion-feature-top"><span>07 / SEARCH OS</span><ArrowIcon width={21} height={21}/></span>
              <span className="shion-feature-bottom"><strong><Trans value="통합 검색"/></strong><span><Trans value="모든 아카이브를 한 번에 검색"/></span></span>
            </button>
          </div>
          <div className="shion-home-footnote"><span>S12 · KWAK YEONJI</span><span>CREATED BY @bbangshion</span></div>
        </div>
      </section>
    </main>);
}
function LoadingView() {
    const { t } = useI18n();
    return <div role="status" aria-label={t("오브젝트 불러오는 중")} className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <div key={i}><div className="aspect-[3/4] animate-pulse rounded-lg bg-raised"/><div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-raised"/></div>)}</div>;
}
function ArchivePage() {
    const { screen, setScreen, catalogState: state, favorites, toggleFavorite } = useArchive();
    const { t } = useI18n();
    const catalog = state.status === 'ready' ? state.catalog : null;
    const items = catalog?.items ?? [];
    return (<main id="main-content" className="shion-subpage">
      <div className="shion-content-width">
        <div className="shion-page-crumb">
          <button type="button" onClick={() => setScreen('home')}><Trans value="홈"/></button>
          <span aria-hidden="true">/</span>
          <span>{t(screen === 'collection' ? '오브젝트' : screen === 'worldcup' ? '월드컵' : screen === 'profile' ? '프로필' : screen === 'film' ? '영상' : screen === 'search' ? '통합 검색' : screen === 'timeline' ? '타임라인' : '사진')}</span>
        </div>
        {screen === 'timeline' ? <TimelinePage /> : screen === 'search' ? <SearchPage /> : screen === 'profile' ? <ProfilePage /> : screen === 'film' ? <Suspense fallback={<LoadingView />}><YeonjiFilm /></Suspense> : screen === 'photos' ? <PhotoArchive/> : state.status === 'loading' ? <LoadingView /> : state.status === 'error' ? (<div role="alert" className="empty-box"><p className="text-lg font-medium text-paper"><Trans value="오브젝트를 불러오지 못했어요"/></p><p className="mt-3 max-w-xl break-words text-sm leading-7 text-ash">{t(state.error)}</p><button type="button" className="btn-primary mt-6 gap-2" onClick={state.retry}><Trans value="다시 시도 "/><ArrowIcon width={16} height={16}/></button></div>) : items.length === 0 ? (<div className="empty-box"><p className="text-lg font-medium text-paper"><Trans value="표시할 카드가 없어요"/></p><p className="mt-3 max-w-xl text-sm leading-7 text-ash"><Trans value="연결된 데이터에서 곽연지 카드를 찾지 못했습니다"/></p><button type="button" className="btn-ghost mt-6" onClick={state.retry}><Trans value="다시 확인"/></button></div>) : (<>
            {catalog?.isDemo && <div role="note" className="mb-6 rounded-lg border border-white/10 bg-surface px-4 py-3 text-xs text-ash"><Trans value="미리보기 데이터입니다 · 실제 카드 데이터가 연결되면 자동으로 바뀝니다"/></div>}
            {screen === 'collection' ? <Collection items={items} favorites={favorites} onToggleFavorite={toggleFavorite}/> : <TournamentArena items={items} isDemo={!!catalog?.isDemo} favorites={favorites} onToggleFavorite={toggleFavorite}/>}
          </>)}
      </div>
    </main>);
}
function ArchiveApp() {
    const { screen } = useArchive();
    return (<div className="min-h-dvh bg-canvas text-paper">
      <a className="shion-skip-link" href="#main-content"><Trans value="본문으로 건너뛰기"/></a>
      <SiteHeader />
      <ScrollReveal />
      {screen === 'home' ? <Home /> : (
        <ArchiveErrorBoundary key={screen}>
          <Suspense fallback={<main id="main-content" className="shion-subpage"><div className="shion-content-width"><LoadingView /></div></main>}>
            <ArchivePage />
          </Suspense>
        </ArchiveErrorBoundary>
      )}
      <footer className="shion-footer"><div className="shion-content-width shion-footer-inner"><span>YEONJI ARCHIVE</span><span><Trans value="tripleS S12 곽연지 팬 아카이브"/></span><span>CREATED BY @bbangshion</span></div></footer>
    </div>);
}
export default function App() {
    return <I18nProvider><ArchiveProvider><ArchiveApp /></ArchiveProvider></I18nProvider>;
}
