#!/usr/bin/env python3
"""Idempotent, minimal, fail-closed PhotoArchive UI migration. No photo records edited."""
from pathlib import Path
import re

component = Path('src/components/PhotoArchive.tsx')
if not component.exists():
    raise SystemExit('PhotoArchive.tsx not found: aborting without any modifications')
s = component.read_text(encoding='utf-8')
original = s
if 'YEONJI_PHOTO_V4' in s:
    print('YEONJI PHOTO V4 already installed, no UI changes')
    raise SystemExit(0)

if 'const years = useMemo(' not in s or '<RecentPhotoSources />' not in s:
    raise SystemExit('PhotoArchive signature changed; aborting rather than damaging component')

# Import only one scoped stylesheet.
anchor = "import { RecentPhotoSources } from './RecentPhotoSources';"
if anchor not in s:
    raise SystemExit('PhotoArchive import anchor missing')
s = s.replace(anchor, anchor + "\nimport './yeonji-photo-v4.css';", 1)

# Only UI labels and display copy, not source credit or metadata.
s = s.replace("'빵연지'", "'빵시온'")
s = s.replace('"빵연지"', '"빵시온"')
# The gallery snippet uses this function; adjust only when legacy branch was present.
s = s.replace("const text = (label: LocalizedText): string => label[language] || t(label.ko);",
              "const text = (label: LocalizedText): string => (label[language] || t(label.ko)).replace(/빵연지/g, '빵시온');")
# Replace only the card's subordinate caption, not album/filter metadata.
s = s.replace('<span>{album}</span></span>', '<span>{album && "빵시온"}</span></span>')

# Inline year overview from the entries actually registered in photos.json.
# S12-only filtering happens in readPhotos(), so no other member data appear.
years_start = s.index('  const years = useMemo(')
years_end = s.find('\n', years_start)
if years_end < 0:
    raise SystemExit('Could not locate years declaration')
append_stats = '''
  // YEONJI_PHOTO_V4 — actual indexed photos only; external reference links are not counted.
  const yearCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const photo of photos) if (photo.date) {
      const y = photo.date.slice(0, 4);
      result[y] = (result[y] ?? 0) + 1;
    }
    return result;
  }, [photos]);
  const latestRegisteredDate = useMemo(() => photos.reduce<string | null>((latest, photo) =>
    photo.date && (!latest || photo.date > latest) ? photo.date : latest, null), [photos]);
'''
s = s[:years_end] + '\n' + append_stats.rstrip('\n') + s[years_end:]

quick_nav = '''<RecentPhotoSources />
    {/* YEONJI_PHOTO_V4 — date chips reflect only real gallery entries */}
    <div className="yeonji-photo-index" aria-label={language === 'en' ? 'Photo year index' : language === 'ja' ? '写真の年別索引' : '사진 연도별 바로가기'}>
      <div className="yeonji-photo-index-heading">
        <span>YEONJI PHOTO INDEX</span>
        <p>{latestRegisteredDate
          ? (language === 'en' ? `Latest archived date ${latestRegisteredDate.replace(/-/g, '.')}`
            : language === 'ja' ? `最新登録日 ${latestRegisteredDate.replace(/-/g, '.')}`
            : `최근 등록 사진 날짜 ${latestRegisteredDate.replace(/-/g, '.')}`)
          : (language === 'en' ? 'No dated photos registered yet'
            : language === 'ja' ? '日付付き写真は未登録'
            : '날짜가 확인된 사진이 아직 없습니다')}</p>
      </div>
      <div className="yeonji-photo-years" role="group" aria-label={language === 'en' ? 'Year' : '연도'}>
        <button type="button" className={year === 'all' && !recentOnly ? 'is-active' : ''}
          aria-pressed={year === 'all' && !recentOnly} onClick={() => { setYear('all'); setMonth('all'); setRecentOnly(false); }}>
          ALL <small>{formatNumber(photos.length)}</small></button>
        {['2026', '2025', '2024', '2023'].map((y) =>
          <button type="button" key={y} disabled={!yearCounts[y]} className={year === y && !recentOnly ? 'is-active' : ''}
            aria-pressed={year === y && !recentOnly} onClick={() => { setYear(y); setMonth('all'); setRecentOnly(false); }}>
            {y} <small>{formatNumber(yearCounts[y] ?? 0)}</small></button>)}
      </div>
      <p className="yeonji-photo-index-hint">{language === 'en'
        ? 'Counts are registered images, not the number of photos listed in external posts'
        : language === 'ja' ? '件数は登録済み画像のみを集計し、外部投稿の総数は含みません'
        : '등록된 사진만 집계하며 외부 게시물의 전체 사진 수는 포함하지 않습니다'}</p>
    </div>'''
s = s.replace('<RecentPhotoSources />', quick_nav, 1)

# Prefer simple and unintrusive status copy for empty 2026, not fake "latest" rows.
needle = "<div className=\"shion-photo-empty\">{t('조건에 맞는 사진이 없습니다')}</div>"
replacement = "<div className=\"shion-photo-empty\">{year === '2026' && !yearCounts['2026'] ? (language === 'en' ? 'No verified 2026 photos are registered yet' : language === 'ja' ? '2026年の確認済み写真はまだ登録されていません' : '2026년 등록 사진이 아직 없습니다') : t('조건에 맞는 사진이 없습니다')}</div>"
if needle in s:
    s = s.replace(needle, replacement, 1)

if s == original:
    raise SystemExit('No changes applied')
component.write_text(s, encoding='utf-8')
print('Updated PhotoArchive UI. Photo data were not changed.')
