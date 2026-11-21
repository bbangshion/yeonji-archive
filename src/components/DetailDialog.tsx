import { Trans, useI18n } from '../i18n/I18nContext';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Objekt } from '../types/objekt';
import { CloseIcon, HeartIcon } from './Icons';
import { ObjektArtwork, objektLabel } from './ObjektArtwork';
type Props = {
    item: Objekt | null;
    isFavorite: boolean;
    onToggleFavorite: (id: string) => void;
    onClose: () => void;
};
export function DetailDialog({ item, isFavorite, onToggleFavorite, onClose }: Props) {
    const closeButton = useRef<HTMLButtonElement>(null);
    const { t } = useI18n();
    useEffect(() => {
        if (!item)
            return;
        const focusedBefore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButton.current?.focus();
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab')
                return;
            const dialog = document.querySelector<HTMLElement>('[data-shion-dialog]');
            const controls = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]');
            if (!controls?.length)
                return;
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            }
            else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKey);
            focusedBefore?.focus();
        };
    }, [item, onClose]);
    if (!item)
        return null;
    const details = [
        ['멤버', '곽연지 (S12)'],
        ['시즌', item.season],
        ['시리즈', item.series],
        ['클래스', item.className],
        ['카드 번호', item.serial || '—'],
        ['발행일', item.issuedAt || '—'],
    ];
    return createPortal(<div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget)
        onClose(); }}>
      <div data-shion-dialog role="dialog" aria-modal="true" aria-labelledby="shion-dialog-title" className="max-h-[94dvh] w-full max-w-[760px] overflow-y-auto overscroll-contain rounded-t-2xl border border-white/[.08] bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-ambient sm:rounded-2xl sm:p-8">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-ash">{item.season}</p>
            <h2 id="shion-dialog-title" className="mt-1 break-words text-2xl font-semibold tracking-[-.045em] text-paper">
              {objektLabel(item)}
            </h2>
          </div>
          <button ref={closeButton} type="button" onClick={onClose} aria-label={t("닫기")} className="icon-button">
            <CloseIcon />
          </button>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
          <div className="mx-auto w-full max-w-[350px]"><ObjektArtwork item={item} eager large/></div>
          <div className="flex flex-col">
            {item.description && <p className="mb-4 text-sm leading-6 text-ash"><Trans value={item.description}/></p>}
            <dl className="divide-y divide-white/[.07] border-y border-white/[.09]">
              {details.map(([label, value]) => (<div key={label} className="flex items-start justify-between gap-3 py-3">
                  <dt className="text-xs text-ash">{t(label ?? "")}</dt>
                  <dd className="max-w-[65%] break-words text-right text-xs text-paper/90">{t(value ?? "")}</dd>
                </div>))}
            </dl>
            <button type="button" onClick={() => onToggleFavorite(item.id)} className="btn-primary mt-6 w-full gap-2">
              <HeartIcon width={17} height={17} fill={isFavorite ? 'currentColor' : 'none'}/>
              {t(isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가')}
            </button>
            {item.isDemo && <p className="mt-3 text-xs text-ash"><Trans value="미리보기용 카드입니다"/></p>}
          </div>
        </div>
      </div>
    </div>, document.body);
}
