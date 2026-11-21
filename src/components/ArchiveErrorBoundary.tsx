import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useI18n } from '../i18n/I18nContext';

type Props = { children: ReactNode };
type State = { failed: boolean };

/**
 * An error in a lazy-loaded page or its render tree should not blank the entire
 * website. Each menu mounts its own boundary, so switching menus resets it.
 */
export class ArchiveErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(_error: Error): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Local browser console only. No personal data or error telemetry is sent.
    console.error('[YEONJI ARCHIVE] section render failed', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.failed) return <ArchiveFailure />;
    return this.props.children;
  }
}

function ArchiveFailure() {
  const { language } = useI18n();
  const text = {
    ko: { title: '이 페이지를 불러오지 못했어요', body: '일시적인 오류일 수 있어요. 새로고침 후 다시 확인해 주세요.', retry: '페이지 새로고침' },
    en: { title: 'This page could not be loaded', body: 'A temporary error may have occurred. Refresh and try again.', retry: 'Refresh page' },
    ja: { title: 'ページを読み込めませんでした', body: '一時的なエラーの可能性があります。更新してもう一度お試しください。', retry: 'ページを更新' },
  }[language];

  return (
    <main id="main-content" className="shion-subpage">
      <div className="shion-content-width">
        <div role="alert" className="empty-box" style={{ maxWidth: 650, margin: '48px auto', textAlign: 'center' }}>
          <h1 className="text-lg font-semibold text-paper">{text.title}</h1>
          <p className="mt-3 text-sm leading-7 text-ash">{text.body}</p>
          <button className="btn-primary mt-6" type="button" onClick={() => window.location.reload()}>
            {text.retry}
          </button>
        </div>
      </div>
    </main>
  );
}
