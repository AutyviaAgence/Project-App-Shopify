'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * PERSISTANCE D'INTERFACE PENDANT LA SESSION.
 *
 * ── LE BESOIN ────────────────────────────────────────────────────────────────
 *
 * Next App Router démonte le composant d'une page quand on la quitte : tout son
 * `useState` est perdu. En revenant, on retombe sur l'état initial (conversation
 * refermée, onglet/filtre réinitialisés, scroll en haut). Le marchand veut
 * retrouver la page « là où il l'avait laissée ».
 *
 * ── LA SOLUTION ──────────────────────────────────────────────────────────────
 *
 * `useSessionState(key, initial)` : un drop-in de `useState` qui MÉMORISE sa
 * valeur dans `sessionStorage`. Au montage, il repart de la dernière valeur ;
 * quand elle change, il la ré-écrit. La clé est namespacée par page (passer une
 * clé du genre "conversations.selectedId").
 *
 * ── PORTÉE : LA SESSION, PAS PLUS ────────────────────────────────────────────
 *
 * On utilise `sessionStorage` (et non `localStorage`) VOLONTAIREMENT : l'état
 * survit à la navigation entre pages et aux allers-retours, mais un F5 ou la
 * fermeture de l'onglet repart PROPRE. C'est le choix validé — il évite les
 * données périmées et les brouillons fantômes d'une session à l'autre.
 *
 * ── À N'UTILISER QUE POUR L'ÉTAT « OÙ J'EN ÉTAIS » ───────────────────────────
 *
 * Onglet actif, filtres, id sélectionné, brouillon de formulaire, position de
 * scroll. JAMAIS pour des données fraîches du serveur (elles doivent se
 * recharger), ni pour des états transitoires (chargement, dialogue ouvert) —
 * restaurer un spinner ou une modale au retour serait un bug.
 */

const NS = 'xeyo_session_ui:'

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.sessionStorage.getItem(NS + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(NS + key, JSON.stringify(value))
  } catch {
    // Quota plein / mode privé : on ignore, la persistance est un confort.
  }
}

/**
 * Comme `useState`, mais persisté en `sessionStorage` sous `key`.
 *
 * ⚠️ HYDRATATION SSR-SAFE. Au tout premier rendu (serveur + hydratation client)
 * on renvoie `initial` pour éviter un décalage d'hydratation, puis on lit la
 * valeur mémorisée juste après le montage. Un composant purement client (nos
 * pages dashboard le sont) ne verra en pratique qu'un flash imperceptible, mais
 * cette précaution évite tout warning React.
 */
export function useSessionState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial)
  const hydrated = useRef(false)

  // Hydrate depuis sessionStorage après le montage (client uniquement).
  useEffect(() => {
    const stored = read<T | undefined>(key, undefined as unknown as T)
    if (stored !== undefined) setValue(stored)
    hydrated.current = true
    // On ne veut relire QUE au montage (changement de `key` = autre état).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Persiste à chaque changement — mais pas avant d'avoir hydraté (sinon on
  // écraserait la valeur mémorisée avec `initial` au premier rendu).
  useEffect(() => {
    if (!hydrated.current) return
    write(key, value)
  }, [key, value])

  return [value, setValue]
}

/**
 * Persiste la POSITION DE SCROLL d'un conteneur pendant la session.
 * Renvoie un callback `ref` à poser sur l'élément scrollable.
 */
export function useScrollRestoration(key: string) {
  const elRef = useRef<HTMLElement | null>(null)

  const ref = useCallback((node: HTMLElement | null) => {
    elRef.current = node
    if (!node) return
    // Restaure la position mémorisée au montage.
    const top = read<number>('scroll:' + key, 0)
    if (top > 0) requestAnimationFrame(() => { node.scrollTop = top })
  }, [key])

  // Mémorise à chaque scroll (throttlé par rAF pour ne pas écrire trop souvent).
  useEffect(() => {
    const node = elRef.current
    if (!node) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        write('scroll:' + key, node.scrollTop)
        raf = 0
      })
    }
    node.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      node.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [key])

  return ref
}
