import { Trans, useI18n } from '../i18n/I18nContext';
import { useState } from 'react';
import type { Objekt } from '../types/objekt';
type Props = {
    item: Objekt;
    eager?: boolean;
    large?: boolean;
};
/** Present only the actual card identifier, without duplicated artist names. */
export function objektLabel(item: Objekt): string {
    const serial = item.serial?.trim().replace(/^#+\s*/, '');
    if (serial)
        return `#${serial}`;
    const title = item.title
        .replace(/^\s*(?:YEONJI|KWAK\s+YEONJI|곽연지|S12)\s*[·:|—–-]\s*/i, '')
        .replace(/\.+\s*$/, '')
        .trim();
    return title || 'Objekt';
}
/** Keeps each card at a fixed aspect ratio and never substitutes a made-up image. */
export function ObjektArtwork({ item, eager = false, large = false }: Props) {
    const { t } = useI18n();
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const imageUrl = item.imageUrl?.trim() || null;
    const available = imageUrl !== null && imageUrl !== failedUrl;
    return (<div className={`relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-white/[.06] bg-[#222127] ${large ? 'shadow-ambient' : ''}`}>
      {available ? (<img src={imageUrl ?? undefined} alt={`${item.season} ${objektLabel(item)} ${t("오브젝트")}`} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailedUrl(imageUrl)} className="block h-full w-full object-contain"/>) : (<div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
          <span className="text-[25px] font-light tracking-[-.055em] text-paper/75">YEONJI</span>
          <span className="text-[11px] text-ash"><Trans value="이미지 없음"/></span>
        </div>)}
      {item.isDemo && (<span className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[10px] text-white"><Trans value="&#xA;          미리보기&#xA;        "/></span>)}
    </div>);
}
