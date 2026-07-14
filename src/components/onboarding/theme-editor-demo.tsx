'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, PartyPopper, Search, UserPlus, MousePointer2, Check } from 'lucide-react'

/**
 * DÉMO ANIMÉE — « comment activer Xeyo dans l'éditeur de thème ».
 *
 * L'étape décrivait la manipulation en 4 phrases. Le marchand devait imaginer un
 * écran qu'il n'avait jamais vu, et se tromper d'onglet ou de bloc. On la lui MONTRE :
 * une reconstitution du panneau Shopify où un curseur bascule les interrupteurs, puis
 * change de page pour ajouter le bloc de remerciement.
 *
 * Ce n'est PAS une capture d'écran : c'est du DOM. Donc net à toutes les tailles,
 * lisible en sombre comme en clair, et sans image à re-shooter quand Shopify
 * repeint son interface.
 *
 * La boucle tourne en continu tant que le marchand est sur l'étape — il peut la
 * regarder autant de fois qu'il veut sans rien cliquer.
 *
 * ⚠️ `prefers-reduced-motion` : on affiche l'état FINAL, sans mouvement (les
 * animations d'interface déclenchent des troubles vestibulaires chez certaines
 * personnes — et l'utilisateur a explicitement demandé à son OS de les éviter).
 */

/** Les 3 temps de la manipulation. */
type Beat = {
  /** Onglet de l'éditeur affiché à ce moment. */
  page: 'accueil' | 'remerciements'
  /** Ce que le curseur vise (id de la cible). */
  target: string
  caption: string
}

const BEATS: Beat[] = [
  { page: 'accueil', target: 'bubble', caption: 'Activez la Bulle WhatsApp' },
  { page: 'accueil', target: 'popup', caption: 'Activez la Popup opt-in' },
  { page: 'remerciements', target: 'thanks', caption: 'Page Remerciements : ajoutez le bloc opt-in' },
  { page: 'remerciements', target: 'save', caption: 'Enregistrez' },
]

const BEAT_MS = 2100

export function ThemeEditorDemo() {
  const [i, setI] = useState(0)
  const [reduced, setReduced] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // La boucle. En mouvement réduit : on fige sur le dernier temps (tout est activé).
  useEffect(() => {
    if (reduced) { setI(BEATS.length - 1); return }
    const t = setInterval(() => setI((n) => (n + 1) % BEATS.length), BEAT_MS)
    return () => clearInterval(t)
  }, [reduced])

  const beat = BEATS[i]

  // Le curseur suit la cible du temps courant. On mesure la position RÉELLE de
  // l'élément : pas de coordonnées en dur, qui casseraient au moindre changement de
  // taille de police ou de largeur.
  useEffect(() => {
    if (reduced) { setCursor(null); return }
    const move = () => {
      const wrap = wrapRef.current
      const el = wrap?.querySelector<HTMLElement>(`[data-t="${beat.target}"]`)
      if (!wrap || !el) return
      const w = wrap.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      setCursor({ x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2 })
    }
    // Après le repaint : la cible du temps 3 n'existe pas encore au temps 2.
    const raf = requestAnimationFrame(move)
    window.addEventListener('resize', move)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', move) }
  }, [i, beat.target, reduced])

  /** Un interrupteur est allumé dès que son temps est passé (et le reste). */
  const done = (target: string) => {
    if (reduced) return true
    const at = BEATS.findIndex((b) => b.target === target)
    return at !== -1 && i >= at
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
      {/* Barre de titre : rappelle qu'on est bien dans l'éditeur de thème Shopify. */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2">
        <span className="flex gap-1">
          <span className="h-2 w-2 rounded-full bg-white/15" />
          <span className="h-2 w-2 rounded-full bg-white/15" />
          <span className="h-2 w-2 rounded-full bg-white/15" />
        </span>
        <span className="text-[11px] text-muted-foreground">Éditeur de thème Shopify</span>
        <span
          data-t="save"
          className={[
            'ml-auto rounded-md px-2 py-1 text-[10px] font-semibold transition-colors duration-300',
            done('save') ? 'bg-primary text-primary-foreground' : 'bg-white/10 text-white/40',
          ].join(' ')}
        >
          Enregistrer
        </span>
      </div>

      <div ref={wrapRef} className="relative">
        {/* Sélecteur de page — il CHANGE au 3e temps : c'est l'étape que les
            marchands ratent le plus (le bloc de remerciement n'existe que là). */}
        <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
          {(['accueil', 'remerciements'] as const).map((p) => (
            <span
              key={p}
              className={[
                'rounded-md px-2 py-1 text-[10px] font-medium capitalize transition-all duration-500',
                beat.page === p
                  ? 'bg-white/10 text-white ring-1 ring-primary/40'
                  : 'text-white/35',
              ].join(' ')}
            >
              {p === 'accueil' ? 'Page d’accueil' : 'Remerciements'}
            </span>
          ))}
        </div>

        {/* Panneau « Applications » — la reconstitution du vrai panneau Shopify. */}
        <div className="p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/40">
            {beat.page === 'accueil' ? 'Intégrations d’applications' : 'Applications'}
          </p>

          <div className="mb-2.5 flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5">
            <Search className="h-3 w-3 text-white/30" />
            <span className="text-[10px] text-white/30">Rechercher…</span>
          </div>

          {beat.page === 'accueil' ? (
            <div className="space-y-1.5">
              <Row t="bubble" icon={MessageCircle} name="Bulle WhatsApp Xeyo" sub="Xeyo — WhatsApp Support" on={done('bubble')} />
              <Row t="popup" icon={UserPlus} name="Xeyo — Popup opt-in" sub="Xeyo — WhatsApp Support" on={done('popup')} />
            </div>
          ) : (
            /* Page Remerciements : ce n'est pas un interrupteur mais un bloc à AJOUTER. */
            <div
              data-t="thanks"
              className={[
                'flex items-center gap-2.5 rounded-lg border p-2.5 transition-all duration-500',
                done('thanks')
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-dashed border-white/15 bg-white/[0.02]',
              ].join(' ')}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <PartyPopper className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-white">Xeyo — Opt-in WhatsApp</p>
                <p className="text-[10px] text-white/40">Page de remerciement</p>
              </div>
              {done('thanks') && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </div>
          )}
        </div>

        {/* Le curseur. `pointer-events-none` : purement décoratif, il ne doit jamais
            intercepter un clic réel du marchand. */}
        {cursor && (
          <MousePointer2
            aria-hidden
            className="pointer-events-none absolute h-4 w-4 fill-white text-black drop-shadow-lg transition-all duration-700 ease-in-out"
            style={{ left: cursor.x, top: cursor.y }}
          />
        )}
      </div>

      {/* Légende du temps courant — dit ce que le curseur est en train de faire. */}
      <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.03] px-3 py-2">
        <span className="flex gap-1">
          {BEATS.map((_, n) => (
            <span
              key={n}
              className={[
                'h-1 rounded-full transition-all duration-500',
                n === i && !reduced ? 'w-4 bg-primary' : 'w-1 bg-white/20',
              ].join(' ')}
            />
          ))}
        </span>
        <p className="text-[11px] text-muted-foreground">
          {reduced ? 'Activez les blocs, puis enregistrez.' : beat.caption}
        </p>
      </div>
    </div>
  )
}

/** Une ligne d'app avec son interrupteur — le geste central de la manipulation. */
function Row({
  t, icon: Icon, name, sub, on,
}: {
  t: string
  icon: typeof MessageCircle
  name: string
  sub: string
  on: boolean
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-white">{name}</p>
        <p className="truncate text-[10px] text-white/40">{sub}</p>
      </div>
      {/* L'interrupteur Shopify. C'est LE geste : le pouce glisse, le rail s'allume. */}
      <span
        data-t={t}
        className={[
          'relative h-4 w-7 shrink-0 rounded-full transition-colors duration-500',
          on ? 'bg-primary' : 'bg-white/15',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all duration-500',
            on ? 'left-[14px]' : 'left-0.5',
          ].join(' ')}
        />
      </span>
    </div>
  )
}
