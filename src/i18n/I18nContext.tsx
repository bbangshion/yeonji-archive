import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DICTIONARY } from './messages';
import type { Language } from './messages';

export type Theme = 'obsidian' | 'violet' | 'navy' | 'rose' | 'aqua';
const LANG_KEY = 'yeonji-archive-lang-v1';
const THEME_KEY = 'yeonji-archive-theme-v1';
const THEMES: readonly Theme[] = ['obsidian', 'violet', 'navy', 'rose', 'aqua'];

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'ko' || saved === 'en' || saved === 'ja') return saved;
    const preferred = navigator.language.toLowerCase();
    if (preferred.startsWith('ja')) return 'ja';
    if (preferred.startsWith('en')) return 'en';
  } catch { /* private browsing */ }
  return 'ko';
}
function initialTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value && THEMES.some((theme) => theme === value)) return value as Theme;
  } catch { /* private browsing */ }
  return 'obsidian';
}
function translate(source: string, language: Language): string {
  if (language === 'ko') return source;
  const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const leading = match?.[1] ?? '';
  const content = match?.[2] ?? source;
  const trailing = match?.[3] ?? '';
  let localized = DICTIONARY[content]?.[language] ?? content;
  if (localized === content && content.startsWith('데이터 요청 실패 (')) {
    localized = `${DICTIONARY['데이터 요청 실패']?.[language] ?? 'Data error'} ${content.slice('데이터 요청 실패'.length)}`;
  }
  if (localized === content && /^\d+강을 시작하려면/.test(content)) {
    localized = language === 'en' ? 'Not enough distinct cards for this bracket.' : 'この対戦には異なるカードが足りません。';
  }
  return leading + localized + trailing;
}

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  t: (source: string) => string;
  formatNumber: (n: number) => string;
};
const Context = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* optional persistence */ }
  }, []);
  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* optional persistence */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.lang = language;
  }, [language]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const colors: Record<Theme, string> = { obsidian: '#0C0D11', violet: '#110d1e', navy: '#0a1426', rose: '#141620', aqua: '#091b20' };
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[theme]);
  }, [theme]);
  const t = useCallback((source: string) => translate(source, language), [language]);
  const formatNumber = useCallback((n: number) => new Intl.NumberFormat(language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : 'en-US').format(n), [language]);
  const value = useMemo(() => ({ language, setLanguage, theme, setTheme, t, formatNumber }), [language, setLanguage, theme, setTheme, t, formatNumber]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n(): I18nContextValue {
  const result = useContext(Context);
  if (!result) throw new Error('I18nProvider is required');
  return result;
}
export function Trans({ value }: { value: string }) {
  const { t } = useI18n();
  return <>{t(value)}</>;
}
