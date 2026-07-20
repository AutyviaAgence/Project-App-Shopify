'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import fr from './fr.json'
import en from './en.json'

export type Locale = 'fr' | 'en'

const translations: Record<Locale, Record<string, unknown>> = { fr, en }
const LS_KEY = 'autyvia-lang'

type TranslationContextType = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const LanguageContext = createContext<TranslationContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key: string) => key,
})

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'string' ? current : undefined
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // ⚠️ ANGLAIS PAR DÉFAUT — c'est la langue de la majorité des marchands
  // Shopify ET celle de la review App Store. Le français était imposé à tout le
  // monde jusqu'à un changement manuel.
  const [locale, setLocaleState] = useState<Locale>('en')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Priorité : choix explicite du marchand > langue du navigateur > anglais.
    const saved = localStorage.getItem(LS_KEY)
    if (saved === 'en' || saved === 'fr') {
      setLocaleState(saved)
    } else if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr')) {
      // Un marchand francophone garde le français sans rien régler.
      setLocaleState('fr')
    }
    setMounted(true)
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    localStorage.setItem(LS_KEY, l)
    document.documentElement.lang = l
  }, [])

  useEffect(() => {
    if (mounted) {
      document.documentElement.lang = locale
    }
  }, [locale, mounted])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const dict = translations[locale]
      let value = getNestedValue(dict, key)
      if (value === undefined) {
        // Fallback to French
        value = getNestedValue(translations.fr, key)
      }
      if (value === undefined) {
        return key
      }
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        }
      }
      return value
    },
    [locale]
  )

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  return useContext(LanguageContext)
}
