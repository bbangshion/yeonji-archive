import { useEffect, useState } from 'react';
import { ArrowIcon } from './Icons';
import { loadOverview, retryOverview } from '../lib/overview';
import type { Overview } from '../lib/overview';
import { searchLabel } from '../lib/searchIndex';
import { useArchive } from '../state/ArchiveContext';
import { Trans, useI18n } from '../i18n/I18nContext';

/** HOME summary. No version/phase labels are exposed to visitors. */
export default function HomeUpdates() {
  const { language, t, formatNumber } = useI18n();
  const { setScreen, catalogState } = useArchive();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void loadOverview().then((result) => { if (alive) { setData(result); setLoading(false); } });
    return () => { alive = false; };
  }, []);
  const refresh = () => {
    setLoading(true);
    void retryOverview().then((result) => { setData(result); setLoading(false); });
  };
  const photos = data?.photos.slice(0, 6) ?? [];
  const films = data?.films.slice(0, 3) ?? [];
  const objektCount = catalogState.status === 'ready' ? formatNumber(catalogState.catalog.items.length) : '—';
  return <section className="shion-overview" aria-labelledby="shion-overview-title">
    <div className="shion-content-width">
      <div className="shion-section-lead shion-overview-lead">
        <div><p className="shion-section-eyebrow">YEONJI ARCHIVE</p><h2 id="shion-overview-title"><Trans value="최근 기록" /></h2></div>
        <button type="button" className="shion-overview-timeline-link" onClick={() => setScreen('timeline')}>
          <Trans value="활동 타임라인" /> <ArrowIcon width={16} height={16}/></button>
      </div>
      <div className="shion-overview-stats" aria-label={t('아카이브 등록 현황')}>
        <div><span>PHOTO</span><strong>{!loading && !data?.photoError ? formatNumber(data?.photos.length ?? 0) : '—'}</strong><small><Trans value="등록된 사진" /></small></div>
        <div><span>FILM</span><strong>{!loading && !data?.filmError ? formatNumber(data?.films.length ?? 0) : '—'}</strong><small><Trans value="등록된 영상" /></small></div>
        <div><span>OBJEKT</span><strong>{objektCount}</strong><small><Trans value="등록된 카드" /></small></div>
      </div>
      {loading ? <p className="shion-overview-status" role="status"><Trans value="최신 자료를 불러오는 중" /></p> : null}
      {data && (data.photoError || data.filmError) ? <div className="shion-overview-warning" role="status">
        <span><Trans value="일부 목록을 불러오지 못했습니다" /></span>
        <button onClick={refresh} type="button"><Trans value="다시 시도" /></button></div> : null}
      {!loading && photos.length > 0 ? <div className="shion-overview-group">
        <div className="shion-overview-heading"><div><span>PHOTO</span><h3><Trans value="최근 사진" /></h3></div>
          <button type="button" onClick={() => setScreen('photos')}><Trans value="모두 보기" /><ArrowIcon width={16} height={16}/></button></div>
        <div className="shion-overview-photo-grid">{photos.map((photo) => <button type="button" key={photo.key} className="shion-overview-photo"
          onClick={() => setScreen('photos', photo.id)} aria-label={searchLabel(photo.title, language)}>
          {photo.image && <img src={photo.image} alt="" loading="lazy" decoding="async" />}
          <span>{searchLabel(photo.title, language)}<small>{photo.date || t('날짜 미등록')}</small></span>
        </button>)}</div>
      </div> : null}
      {!loading && films.length > 0 ? <div className="shion-overview-group">
        <div className="shion-overview-heading"><div><span>FILM</span><h3><Trans value="최근 영상" /></h3></div>
          <button type="button" onClick={() => setScreen('film')}><Trans value="모두 보기" /><ArrowIcon width={16} height={16}/></button></div>
        <div className="shion-overview-film-grid">{films.map((film) => <button type="button" key={film.key} className="shion-overview-film" onClick={() => setScreen('film', film.id)}>
          <span className="shion-overview-film-image">{film.image && <img src={film.image} loading="lazy" decoding="async" alt="" />}<b aria-hidden="true">▶</b></span>
          <span className="shion-overview-film-info"><strong>{searchLabel(film.title, language)}</strong><small>{film.date || t('날짜 미등록')}</small></span>
        </button>)}</div>
      </div> : null}
      <p className="shion-overview-foot"><Trans value="등록된 데이터에서 자동으로 표시하며 원본 자료의 날짜를 사용합니다" /></p>
    </div>
  </section>;
}
