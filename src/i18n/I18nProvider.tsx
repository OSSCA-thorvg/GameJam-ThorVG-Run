import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LANG,
  MESSAGES,
  formatMessage,
  type Lang,
  type MessageParams,
  type Messages,
} from './messages';

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Messages;
  format: (template: string, params?: MessageParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Provides the active language. Always starts in English and is intentionally
 * not persisted: every fresh page load begins in `DEFAULT_LANG`.
 */
export function I18nProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  const setLang = useCallback((next: Lang) => setLangState(next), []);
  const t = MESSAGES[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t.app.title;
  }, [lang, t]);

  const value = useMemo<I18nContextValue>(
    () => ({ lang, setLang, t, format: formatMessage }),
    [lang, setLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return ctx;
}
