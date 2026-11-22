import { useEffect, useState } from 'react';
import { createCatalog } from '../lib/catalog';
import type { Catalog } from '../types/objekt';

type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; catalog: Catalog }
  | { status: 'error'; error: string };

export function useCatalog(): CatalogState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CatalogState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/objekt.json`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`데이터 요청 실패 (${response.status})`);
        const raw: unknown = await response.json();
        const catalog = createCatalog(raw);
        if (!controller.signal.aborted) setState({ status: 'ready', catalog });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: 'error', error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' });
        }
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
