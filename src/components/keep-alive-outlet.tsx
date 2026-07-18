'use client'

import { Suspense, useEffect, useRef, useState, createContext, useContext } from 'react'
import { usePathname } from 'next/navigation'

/**
 * KEEP-ALIVE : GARDER LES PAGES MONTÉES ENTRE LES NAVIGATIONS.
 *
 * ── LE PROBLÈME ──────────────────────────────────────────────────────────────
 *
 * Next App Router DÉMONTE la page qu'on quitte : son état vivant, son scroll, sa
 * conversation ouverte, ses données déjà chargées — tout est perdu. En revenant,
 * la page se remonte et re-fetch : impression de rechargement complet. La
 * persistance par `useState` aide les valeurs, mais pas ce ressenti.
 *
 * ── LA SOLUTION ──────────────────────────────────────────────────────────────
 *
 * On monte les pages « persistantes » DANS le layout (pas via le routing), et on
 * NAVIGUE en masquant/affichant au lieu de démonter. Une page visitée reste
 * vivante : y revenir est instantané, tout est intact.
 *
 * ── ÉCONOME PAR DÉFAUT ───────────────────────────────────────────────────────
 *
 * MONTAGE PARESSEUX : une page n'est montée qu'à sa PREMIÈRE visite (pas les 6
 * d'un coup au chargement). Ensuite elle reste. On masque via `hidden` (display:
 * none) : le DOM survit, l'état React aussi, mais rien ne s'affiche ni ne peint.
 *
 * ── L'URL RESTE LA VÉRITÉ ────────────────────────────────────────────────────
 *
 * Le routing Next continue de piloter `pathname` ; on se contente d'afficher la
 * page qui lui correspond. Les liens, le bouton retour, le partage d'URL marchent
 * comme avant. Les routes NON listées ici (Admin, Logs, Réglages…) suivent le
 * chemin normal (via `children` du layout) et se remontent — c'est voulu : pages
 * lourdes et rares, pas besoin de les garder en mémoire.
 */

export type KeepAlivePage = {
  /** Le chemin exact qui active cette page (ex. '/conversations'). */
  path: string
  /** Le composant de la page (client). */
  Component: React.ComponentType
}

/**
 * Contexte : le chemin ACTUELLEMENT actif + un compteur qui s'incrémente à chaque
 * (re)activation. Une page keep-alive s'y abonne (useKeepAliveFocus) pour se
 * resynchroniser quand on revient dessus — sans se recharger de zéro.
 */
const KeepAliveContext = createContext<{ activePath: string; focusTick: number }>({
  activePath: '',
  focusTick: 0,
})

/**
 * Exécute `onFocus` chaque fois que la page `path` REDEVIENT active (retour sur
 * l'onglet), PAS à son premier montage (elle vient déjà de charger ses données).
 *
 * Usage dans une page keep-alive :
 *   useKeepAliveFocus('/templates', () => { fetchTemplates() })
 */
export function useKeepAliveFocus(path: string, onFocus: () => void) {
  const { activePath, focusTick } = useContext(KeepAliveContext)
  const firstRef = useRef(true)
  const cbRef = useRef(onFocus)
  cbRef.current = onFocus
  useEffect(() => {
    if (activePath !== path) return
    // On saute la 1re activation (= le montage initial) : inutile de re-fetch ce
    // qu'on vient de charger.
    if (firstRef.current) { firstRef.current = false; return }
    cbRef.current()
    // focusTick change à chaque réactivation → l'effet re-tourne au retour.
  }, [activePath, focusTick, path])
}

export function KeepAliveOutlet({ pages }: { pages: KeepAlivePage[] }) {
  const pathname = usePathname()

  // Ensemble des chemins DÉJÀ visités (donc montés). On n'ajoute jamais avant la
  // 1re visite (montage paresseux), et on ne retire jamais (keep-alive).
  const mountedRef = useRef<Set<string>>(new Set())
  const [, force] = useState(0)

  const active = pages.find((p) => pathname === p.path || pathname.startsWith(p.path + '/'))
  if (active && !mountedRef.current.has(active.path)) {
    mountedRef.current.add(active.path)
  }

  // `focusTick` s'incrémente à chaque changement de page active → sert de signal
  // « on vient de revenir » aux pages abonnées (useKeepAliveFocus).
  const [focusTick, setFocusTick] = useState(0)

  // Re-render quand on entre/sort d'une page persistante (pour basculer `hidden`).
  useEffect(() => { force((n) => n + 1); setFocusTick((n) => n + 1) }, [pathname])

  return (
    <KeepAliveContext.Provider value={{ activePath: active?.path ?? '', focusTick }}>
      {pages.map((p) => {
        if (!mountedRef.current.has(p.path)) return null // pas encore visitée
        const isActive = active?.path === p.path
        const P = p.Component
        return (
          <div
            key={p.path}
            // `hidden` = display:none : le composant reste MONTÉ (état vivant) mais
            // n'occupe pas d'espace et ne peint pas quand ce n'est pas sa page.
            // On garde h-full en permanence : quand la page redevient active, elle
            // retrouve immédiatement sa hauteur (pas de saut de layout).
            hidden={!isActive}
            className="h-full w-full"
          >
            {/* Certaines pages utilisent useSearchParams → Suspense obligatoire. */}
            <Suspense fallback={null}>
              <P />
            </Suspense>
          </div>
        )
      })}
    </KeepAliveContext.Provider>
  )
}

/**
 * Vrai si le chemin courant est géré par le keep-alive (donc le layout NE doit
 * PAS aussi rendre `children`, sinon la page s'afficherait en double).
 */
export function isKeepAlivePath(pathname: string, pages: KeepAlivePage[]): boolean {
  return pages.some((p) => pathname === p.path || pathname.startsWith(p.path + '/'))
}
