// ── i18n System ──
// Locale detection, switching, and React hook for bilingual support.
// Default: Vietnamese (vi). Supports: vi, en.

import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { vi, type TranslationKeys } from './vi';
import { en } from './en';

// ── Supported Locales ──

export type Locale = 'vi' | 'en';

const TRANSLATIONS: Record<Locale, TranslationKeys> = {
  vi,
  en: en as unknown as TranslationKeys,
};

const STORAGE_KEY = 'izzi-openclaw-locale';

// ── Detect default locale ──

function detectLocale(): Locale {
  // 1. Check localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'vi' || stored === 'en') return stored;
  } catch {
    // localStorage may not be available
  }

  // 2. Check navigator language
  try {
    const browserLang = navigator.language || (navigator as any).userLanguage || '';
    if (browserLang.startsWith('vi')) return 'vi';
    if (browserLang.startsWith('en')) return 'en';
  } catch {
    // navigator may not be available in some environments
  }

  // 3. Default to Vietnamese
  return 'vi';
}

// ── Context ──

interface I18nContextValue {
  locale: Locale;
  t: TranslationKeys;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'vi',
  t: vi,
  setLocale: () => {},
  toggleLocale: () => {},
});

// ── Provider Component ──

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch {
      // Ignore storage failures
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'vi' ? 'en' : 'vi');
  }, [locale, setLocale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    t: TRANSLATIONS[locale],
    setLocale,
    toggleLocale,
  }), [locale, setLocale, toggleLocale]);

  return React.createElement(I18nContext.Provider, { value }, children);
}

// ── Hook ──

/**
 * useI18n — Access translations and locale management.
 *
 * @example
 * ```tsx
 * const { t, locale, toggleLocale } = useI18n();
 * return <h1>{t.dashboard.title}</h1>;
 * ```
 */
export function useI18n() {
  return useContext(I18nContext);
}

// ── Locale Display Names ──

export const LOCALE_NAMES: Record<Locale, string> = {
  vi: '🇻🇳 Tiếng Việt',
  en: '🇬🇧 English',
};

// ── Re-exports ──

export { vi, en };
export type { TranslationKeys };
