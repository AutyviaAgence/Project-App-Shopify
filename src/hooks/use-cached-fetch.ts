'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// Cache mémoire partagé entre montages/navigations (persiste tant que l'app
// n'est pas rechargée). Évite le re-loader à chaque retour sur une page :
// on affiche immédiatement la donnée en cache puis on revalide en arrière-plan.

type CacheEntry<T> = { data: T; ts: number }
const store = new Map<string, CacheEntry<unknown>>()

/** Invalide une ou plusieurs clés de cache (après une mutation par ex.). */
export function invalidateCache(prefix?: string) {
  if (!prefix) { store.clear(); return }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** Écrit/maj manuellement une entrée de cache (utile après création/édition locale). */
export function setCache<T>(key: string, data: T) {
  store.set(key, { data, ts: Date.now() })
}

/** Lit une entrée de cache (undefined si absente). */
export function getCache<T>(key: string): T | undefined {
  return store.get(key)?.data as T | undefined
}

type Options = {
  /** Durée (ms) en-dessous de laquelle on ne revalide même pas en fond. Défaut 0 (toujours revalider). */
  staleMs?: number
  /** Désactive le fetch (ex: clé pas encore prête). */
  enabled?: boolean
}

/**
 * Fetch avec cache mémoire + revalidation en arrière-plan.
 * - 1er montage : loading=true, fetch, met en cache.
 * - retours suivants : data du cache immédiatement (loading=false), revalidation
 *   silencieuse en fond (refreshing=true) pour rafraîchir sans masquer l'UI.
 */
export function useCachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: Options = {},
) {
  const { staleMs = 0, enabled = true } = options
  const cached = store.get(key) as CacheEntry<T> | undefined

  const [data, setData] = useState<T | undefined>(cached?.data)
  const [loading, setLoading] = useState(!cached && enabled)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const revalidate = useCallback(async (silent: boolean) => {
    if (silent) setRefreshing(true); else setLoading(true)
    try {
      const fresh = await fetcherRef.current()
      store.set(key, { data: fresh, ts: Date.now() })
      setData(fresh)
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [key])

  useEffect(() => {
    if (!enabled) return
    const entry = store.get(key) as CacheEntry<T> | undefined
    if (entry) {
      // Donnée en cache → afficher tout de suite, revalider en fond si périmé
      setData(entry.data)
      setLoading(false)
      if (staleMs === 0 || Date.now() - entry.ts > staleMs) {
        revalidate(true)
      }
    } else {
      // Pas de cache → chargement plein
      revalidate(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])

  return {
    data,
    loading,      // true seulement quand aucune donnée à afficher
    refreshing,   // true pendant la revalidation silencieuse
    error,
    /** Force un rechargement (silencieux par défaut). */
    refetch: (silent = true) => revalidate(silent),
    /** Maj optimiste locale du cache + state. */
    mutate: (updater: T | ((prev: T | undefined) => T)) => {
      const next = typeof updater === 'function'
        ? (updater as (p: T | undefined) => T)(store.get(key)?.data as T | undefined)
        : updater
      store.set(key, { data: next, ts: Date.now() })
      setData(next)
    },
  }
}
