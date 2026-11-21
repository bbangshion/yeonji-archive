import { useEffect, useState } from 'react';

const STORAGE_KEY = 'yeonji-archive:favorites:v1';

function loadFavorites(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

export function useFavorites(): [Set<string>, (id: string) => void] {
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites])); }
    catch { /* Private mode/quota: keep in-memory state. */ }
  }, [favorites]);

  const toggle = (id: string) => setFavorites((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  return [favorites, toggle];
}
