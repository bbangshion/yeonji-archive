import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import './recent-photos.css';

type Language = 'ko' | 'en' | 'ja';
type Label = Record<Language, string>;
type Collection = {
  id: string;
  date: string;
  title: Label;
  label: Label;
  description: Label;
  url: string;
  type: 'official' | 'secondary' | 'fan';
  status: 'in-gallery' | 'reference-only';
};
const UI = {
  ko: { title: '최근 사진', caption: '출처가 확인된 게시물을 최신순으로 표시합니다',
    original: '출처 보기', included: '사진 등록', reference: '외부 자료', more: '더 보기', less: '접기',
    disclaimer: '외부 자료는 사진 장수에 포함하지 않습니다. 단체 게시물의 전체 사진 수는 연지 단독 사진 수와 다를 수 있습니다' },
  en: { title: 'Latest photos', caption: 'Latest posts with source links',
    original: 'Open source', included: 'In gallery', reference: 'External', more: 'More sources', less: 'Show less',
    disclaimer: 'External sources do not count as gallery images. Mixed-member gallery totals are not YeonJi-only counts' },
  ja: { title: '最近の写真資料', caption: '確認できた投稿を新しい順に掲載しています。',
    original: '出典を見る', included: '登録済み', reference: '外部資料', more: 'もっと見る', less: '閉じる',
    disclaimer: '外部資料はギャラリーの写真枚数に含みません。複数メンバーの総枚数はヨンジ単独写真の枚数ではありません。' },
} as const;
const isLabel = (value: unknown): value is Label => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (['ko','en','ja'] as const).every((key) => typeof row[key] === 'string' && Boolean(row[key]));
};
const parseCollections = (data: unknown): Collection[] => {
  const root = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  if (!Array.isArray(root.collections)) return [];
  const seen = new Set<string>();
  return root.collections.flatMap((item: unknown): Collection[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || seen.has(row.id) ||
        typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
        !isLabel(row.title) || !isLabel(row.label) || !isLabel(row.description) ||
        typeof row.url !== 'string' || !/^https:\/\//.test(row.url) ||
        (row.status !== 'in-gallery' && row.status !== 'reference-only') ||
        (row.type !== 'official' && row.type !== 'secondary' && row.type !== 'fan')) return [];
    seen.add(row.id);
    return [{ id: row.id, date: row.date, title: row.title, label: row.label,
      description: row.description, url: row.url, status: row.status, type: row.type }];
  }).sort((a,b) => b.date.localeCompare(a.date));
};
export function RecentPhotoSources() {
  const { language } = useI18n();
  const lang = language as Language;
  const t = UI[lang] ?? UI.ko;
  const [items, setItems] = useState<Collection[]>([]);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/recent-photo-collections.json`, { signal: abort.signal })
      .then((response) => { if (!response.ok) throw Error('Photo source list unavailable'); return response.json(); })
      .then((data: unknown) => { if (!abort.signal.aborted) setItems(parseCollections(data)); })
      .catch(() => { /* Optional external references must never block the photo gallery. */ });
    return () => abort.abort();
  }, []);
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, 3);
  return <section className="shion-photo-sources" aria-labelledby="recent-photo-heading">
    <div className="shion-photo-sources-heading">
      <div><span>PHOTO SOURCES</span><h2 id="recent-photo-heading">{t.title}</h2><p>{t.caption}</p></div>
    </div>
    <div className="shion-photo-sources-list">
      {shown.map((item) => <a key={item.id} className="shion-photo-source-row"
        href={item.url} target="_blank" rel="noopener noreferrer">
        <time dateTime={item.date}>{item.date.replace(/-/g, '.')}</time>
        <span className="shion-photo-source-description">
          <strong>{item.title[lang] || item.title.ko}</strong>
          <small>{item.description[lang] || item.description.ko}</small>
        </span>
        <span className="shion-photo-source-label">{item.label[lang] || item.label.ko}<b>{item.status === 'in-gallery' ? t.included : t.reference}</b></span>
        <span className="shion-photo-source-link" aria-hidden="true">↗</span>
      </a>)}
    </div>
    <div className="shion-photo-sources-bottom">
      <p>{t.disclaimer}</p>
      {items.length > 3 && <button type="button" onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}>{expanded ? t.less : t.more} <span aria-hidden="true">{expanded ? '−' : '+'}</span></button>}
    </div>
  </section>;
}
