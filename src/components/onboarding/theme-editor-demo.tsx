'use client'

import { useEffect, useRef, useState } from 'react'
import {
  MessageCircle, PartyPopper, Search, MousePointer2, Check,
  PanelLeft, Layers, Settings, Blocks, Home, Store, Plus, ChevronDown, X,
} from 'lucide-react'

/**
 * DÉMO ANIMÉE — « activer Xeyo dans l'éditeur de thème ».
 *
 * L'étape décrivait la manipulation en 4 phrases. Le marchand devait imaginer un écran
 * qu'il n'avait jamais vu — et se tromper d'onglet ou de bloc. On la lui MONTRE.
 *
 * Ce qui rend la démo utile : on reconstitue l'éditeur ENTIER, panneau à gauche ET
 * APERÇU DE LA BOUTIQUE à droite. Quand le curseur bascule un interrupteur, la bulle
 * WhatsApp apparaît vraiment dans l'aperçu, la popup surgit. Le marchand ne voit pas
 * seulement OÙ cliquer : il voit CE QUE ÇA FAIT.
 *
 * Fidèle au vrai éditeur : panneau CLAIR (pas sombre), rail d'icônes en haut à gauche,
 * popup ancrée en bas à droite de la vitrine.
 *
 * ⚠️ HAUTEUR FIXE (`h-[210px]` sur la scène). Les contenus des deux pages n'ont pas la
 * même longueur : sans hauteur fixe, le bloc se dilatait à chaque temps de l'animation
 * et faisait sauter toute la page de l'onboarding sous les yeux du marchand.
 *
 * ⚠️ `prefers-reduced-motion` : état FINAL figé. Les animations d'interface déclenchent
 * des troubles vestibulaires chez certaines personnes.
 */

type Beat = {
  page: 'accueil' | 'remerciements'
  /** Cible du curseur (attribut `data-t`). */
  target: string
  step: string
  caption: string
}

const BEATS: Beat[] = [
  { page: 'accueil', target: 'bubble', step: 'Applications', caption: 'Activez la Bulle WhatsApp' },
  { page: 'accueil', target: 'popup', step: 'Applications', caption: 'Activez la Popup opt-in' },
  { page: 'remerciements', target: 'pagesel', step: 'Changer de page', caption: 'Passez sur la page Remerciements' },
  { page: 'remerciements', target: 'thanks', step: 'Ajouter le bloc', caption: 'Ajoutez le bloc Opt-in WhatsApp' },
  { page: 'remerciements', target: 'save', step: 'Enregistrer', caption: 'Enregistrez, c’est en ligne' },
]

const BEAT_MS = 2100

export function ThemeEditorDemo() {
  const [i, setI] = useState(0)
  const [reduced, setReduced] = useState(false)
  const [clicking, setClicking] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    if (reduced) { setI(BEATS.length - 1); return }
    const t = setInterval(() => setI((n) => (n + 1) % BEATS.length), BEAT_MS)
    return () => clearInterval(t)
  }, [reduced])

  const beat = BEATS[i]

  /** Un état est acquis dès que son temps est passé — et le reste. */
  const done = (target: string) => {
    if (reduced) return true
    const at = BEATS.findIndex((b) => b.target === target)
    return at !== -1 && i >= at
  }

  // Le curseur rejoint sa cible, PUIS clique. Sans ce décalage, l'interrupteur
  // basculerait avant que le curseur l'ait atteint.
  useEffect(() => {
    if (reduced) { setCursor(null); return }
    const move = () => {
      const wrap = wrapRef.current
      const el = wrap?.querySelector<HTMLElement>(`[data-t="${beat.target}"]`)
      if (!wrap || !el) return
      const w = wrap.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      // Position RÉELLE mesurée dans le DOM : pas de coordonnées en dur, qui
      // casseraient au moindre changement de largeur, de police ou de zoom.
      setCursor({ x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2 })
    }
    const raf = requestAnimationFrame(move) // la cible n'existe qu'après repaint
    setClicking(false)
    const hit = setTimeout(() => setClicking(true), 640)
    const off = setTimeout(() => setClicking(false), 940)
    window.addEventListener('resize', move)
    return () => {
      cancelAnimationFrame(raf); clearTimeout(hit); clearTimeout(off)
      window.removeEventListener('resize', move)
    }
  }, [i, beat.target, reduced])

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#f6f6f7] shadow-xl shadow-black/30">
      {/* ═══ BARRE SUPÉRIEURE (claire, comme le vrai éditeur) ═══════════════ */}
      <div className="flex items-center gap-1.5 border-b border-black/[0.08] bg-white px-2 py-1.5">
        <PanelLeft className="h-3 w-3 text-neutral-400" />
        <div className="mx-auto flex items-center gap-2">
          <span className="flex items-center gap-1">
            <Layers className="h-2.5 w-2.5 text-neutral-400" />
            <span className="text-[9px] font-medium text-neutral-600">test-data</span>
            <span className="rounded bg-emerald-100 px-1 py-px text-[8px] font-semibold text-emerald-700">Actif</span>
          </span>
          <span className="flex items-center gap-1">
            <Home className="h-2.5 w-2.5 text-neutral-400" />
            <span className="text-[9px] text-neutral-500">
              {beat.page === 'accueil' ? 'Page d’accueil' : 'Remerciements'}
            </span>
          </span>
        </div>
        <span
          data-t="save"
          className={[
            'rounded-md px-2 py-1 text-[9px] font-semibold transition-all duration-300',
            done('bubble')
              ? 'bg-neutral-900 text-white'
              : 'bg-neutral-100 text-neutral-400',
            done('save') && !reduced ? 'ring-2 ring-primary/50' : '',
          ].join(' ')}
        >
          Enregistrer
        </span>
      </div>

      {/* La scène : HAUTEUR FIXE. Les deux pages n'ont pas le même contenu — sans ça,
          le bloc se dilate à chaque temps et fait sauter la page de l'onboarding. */}
      <div ref={wrapRef} className="relative flex h-[210px]">
        {/* ═══ PANNEAU DE GAUCHE (clair) ═════════════════════════════════════ */}
        <div className="flex w-[42%] shrink-0 flex-col border-r border-black/[0.08] bg-white">
          {/* Rail d'icônes — l'onglet « Applications » est celui où il faut être. */}
          <div className="flex items-center gap-1.5 border-b border-black/[0.06] px-2 py-1.5">
            <Layers className="h-3 w-3 text-neutral-300" />
            <Settings className="h-3 w-3 text-neutral-300" />
            <span className="rounded bg-primary/10 p-0.5 ring-1 ring-primary/30">
              <Blocks className="h-3 w-3 text-primary" />
            </span>
          </div>

          <div className="min-h-0 flex-1 p-2">
            <p className="mb-1.5 text-[9px] font-semibold text-neutral-700">
              {beat.page === 'accueil' ? 'Intégrations d’applications' : 'Applications'}
            </p>

            <div
              data-t="pagesel"
              className={[
                'mb-1.5 flex items-center gap-1 rounded-md border px-1.5 py-1 transition-colors duration-300',
                beat.target === 'pagesel' && !reduced
                  ? 'border-primary/40 bg-primary/[0.06]'
                  : 'border-black/[0.08] bg-white',
              ].join(' ')}
            >
              <Search className="h-2.5 w-2.5 text-neutral-300" />
              <span className="truncate text-[8px] text-neutral-400">Rechercher…</span>
              <ChevronDown className="ml-auto h-2.5 w-2.5 shrink-0 text-neutral-300" />
            </div>

            {beat.page === 'accueil' ? (
              <div className="space-y-1">
                <Row t="bubble" name="Bulle WhatsApp Xeyo" sub="Xeyo — WhatsApp Support…" on={done('bubble')} />
                <Row t="popup" name="Xeyo — Popup opt-in" sub="Xeyo — WhatsApp Support…" on={done('popup')} />
                {/* Les apps concurrentes du marchand : c'est ce qu'il voit vraiment,
                    et ça l'aide à repérer LESQUELLES activer parmi les autres. */}
                <Row t="other1" name="Kanal Widget" sub="KANAL — WhatsApp Mark…" on={false} dim />
                <Row t="other2" name="WhatsApp Widget" sub="Dondy: WhatsApp" on={false} dim />
              </div>
            ) : (
              /* Page Remerciements : PAS un interrupteur — un bloc à AJOUTER. Le geste
                 est différent, on le rend visuellement différent (bordure pointillée). */
              <div
                data-t="thanks"
                className={[
                  'flex items-center gap-1.5 rounded-md border p-1.5 transition-all duration-500',
                  done('thanks')
                    ? 'border-primary/40 bg-primary/[0.06]'
                    : 'border-dashed border-neutral-300 bg-neutral-50',
                ].join(' ')}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                  <PartyPopper className="h-2.5 w-2.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[9px] font-semibold text-neutral-800">Xeyo — Opt-in WhatsApp</p>
                  <p className="truncate text-[8px] text-neutral-400">Remerciements</p>
                </div>
                {done('thanks')
                  ? <Check className="h-3 w-3 shrink-0 text-primary" />
                  : <Plus className="h-3 w-3 shrink-0 text-neutral-400" />}
              </div>
            )}
          </div>
        </div>

        {/* ═══ APERÇU DE LA BOUTIQUE ═════════════════════════════════════════
            Le cœur de la démo : le marchand voit CE QUE ÇA FAIT. */}
        <div className="relative min-w-0 flex-1 overflow-hidden bg-white">
          {/* Barre de navigation de la vitrine (sombre, comme sur sa boutique). */}
          <div className="flex items-center gap-2 bg-neutral-900 px-2 py-1.5">
            <span className="text-[7px] font-medium text-white/70">Home</span>
            <span className="text-[7px] text-white/35">Catalog</span>
            <span className="ml-auto text-[7px] font-semibold text-white">Xeyo</span>
            <Store className="h-2.5 w-2.5 text-white/50" />
          </div>

          {beat.page === 'accueil' ? (
            <div className="relative h-full">
              {/* Héros — en gris : ce n'est pas le sujet, ça reste en arrière-plan. */}
              <div className="h-[86px] bg-gradient-to-br from-slate-300 to-slate-200 p-2.5">
                <div className="w-3/4 rounded bg-white/90 p-1.5 shadow-sm">
                  <div className="h-2 w-4/5 rounded-sm bg-neutral-800" />
                  <div className="mt-1 h-1 w-full rounded-full bg-neutral-300" />
                  <div className="mt-1.5 h-2.5 w-10 rounded-sm bg-neutral-900" />
                </div>
              </div>
              {/* Produits */}
              <div className="grid grid-cols-3 gap-1.5 p-2">
                {[0, 1, 2].map((n) => (
                  <div key={n} className="space-y-1">
                    <div className="h-7 rounded bg-neutral-100" />
                    <div className="h-1 w-2/3 rounded-full bg-neutral-100" />
                  </div>
                ))}
              </div>

              {/* LA POPUP — en bas à droite, comme dans le vrai éditeur. */}
              <div
                className={[
                  'absolute bottom-2 right-2 w-[62%] rounded-lg border border-black/10 bg-white p-2 shadow-xl transition-all duration-500',
                  done('popup') ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
                ].join(' ')}
              >
                <X className="absolute right-1.5 top-1.5 h-2 w-2 text-neutral-300" />
                <p className="pr-3 text-[7px] font-bold leading-tight text-neutral-800">
                  📦 Suivez votre commande sur WhatsApp
                </p>
                <p className="mt-0.5 text-[6px] leading-tight text-neutral-500">
                  Recevez le suivi et nos offres exclusives.
                </p>
                <div className="mt-1 flex gap-1">
                  <span className="h-3 w-6 rounded-sm border border-neutral-200 bg-white" />
                  <span className="h-3 flex-1 rounded-sm border border-neutral-200 bg-white" />
                </div>
                <div className="mt-1 flex h-3.5 items-center justify-center rounded-sm bg-[#25D366]">
                  <span className="text-[6px] font-bold text-white">Recevoir sur WhatsApp</span>
                </div>
              </div>

              {/* LA BULLE — le bouton flottant. */}
              <span
                className={[
                  'absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#25D366] shadow-lg transition-all duration-500',
                  done('bubble') ? 'scale-100 opacity-100' : 'scale-0 opacity-0',
                ].join(' ')}
              >
                <MessageCircle className="h-3 w-3 fill-white text-white" />
              </span>
            </div>
          ) : (
            /* Page Remerciements : confirmation de commande + case d'opt-in. */
            <div className="space-y-2 p-2.5">
              <div className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
                  <Check className="h-2.5 w-2.5 text-white" />
                </span>
                <p className="text-[9px] font-semibold text-neutral-800">Merci pour votre commande</p>
              </div>
              <div className="space-y-1 rounded-md border border-neutral-100 p-1.5">
                <div className="h-1 w-2/3 rounded-full bg-neutral-100" />
                <div className="h-1 w-1/2 rounded-full bg-neutral-100" />
                <div className="h-1 w-3/5 rounded-full bg-neutral-100" />
              </div>

              {/* LE BLOC D'OPT-IN — se pose sur la page quand il est ajouté. */}
              <div
                className={[
                  'flex items-start gap-1.5 rounded-md border p-2 transition-all duration-500',
                  done('thanks')
                    ? 'translate-y-0 border-[#25D366]/40 bg-[#25D366]/[0.06] opacity-100'
                    : 'pointer-events-none translate-y-2 border-transparent opacity-0',
                ].join(' ')}
              >
                <span className="mt-px h-2.5 w-2.5 shrink-0 rounded-sm border border-neutral-300 bg-white" />
                <p className="text-[7px] leading-snug text-neutral-700">
                  Recevoir le suivi de ma commande et les offres exclusives sur{' '}
                  <span className="font-semibold">WhatsApp</span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Le curseur. `pointer-events-none` : décoratif, il ne doit jamais
            intercepter un clic réel du marchand. */}
        {cursor && (
          <span
            aria-hidden
            className="pointer-events-none absolute z-20 transition-all duration-[650ms] ease-out"
            style={{ left: cursor.x, top: cursor.y }}
          >
            <span
              className={[
                'absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-primary/40 transition-all',
                clicking ? 'scale-[2.4] opacity-0 duration-300' : 'scale-50 opacity-0 duration-0',
              ].join(' ')}
            />
            <MousePointer2
              className={[
                'h-3.5 w-3.5 fill-white text-neutral-900 drop-shadow-md transition-transform duration-150',
                clicking ? 'scale-90' : 'scale-100',
              ].join(' ')}
            />
          </span>
        )}
      </div>

      {/* ═══ LÉGENDE ═══════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 border-t border-black/[0.08] bg-white px-2.5 py-1.5">
        <span className="flex gap-1">
          {BEATS.map((_, n) => (
            <span
              key={n}
              className={[
                'h-1 rounded-full transition-all duration-500',
                n === i && !reduced ? 'w-3.5 bg-primary' : 'w-1 bg-neutral-200',
              ].join(' ')}
            />
          ))}
        </span>
        <p className="min-w-0 truncate text-[10px] font-medium text-neutral-600">
          {reduced
            ? 'Activez les deux blocs, ajoutez l’opt-in sur la page Remerciements, puis enregistrez.'
            : beat.caption}
        </p>
        {!reduced && (
          <span className="ml-auto hidden shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-medium text-neutral-500 sm:block">
            {beat.step}
          </span>
        )}
      </div>
    </div>
  )
}

/** Une ligne d'app avec son interrupteur — le geste central de la manipulation. */
function Row({
  t, name, sub, on, dim,
}: {
  t: string
  name: string
  sub: string
  on: boolean
  /** App concurrente : présente pour le réalisme, mais jamais activée. */
  dim?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center gap-1.5 rounded-md border p-1.5 transition-colors duration-500',
        on ? 'border-primary/30 bg-primary/[0.05]' : 'border-black/[0.07] bg-white',
        dim ? 'opacity-45' : '',
      ].join(' ')}
    >
      <span
        className={[
          'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[7px] font-bold',
          dim ? 'bg-neutral-100 text-neutral-400' : 'bg-neutral-900 text-white',
        ].join(' ')}
      >
        {dim ? '•' : 'e'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[9px] font-semibold text-neutral-800">{name}</p>
        <p className="truncate text-[8px] text-neutral-400">{sub}</p>
      </div>

      {/* L'interrupteur Shopify : le pouce glisse, le rail s'allume. C'est LE geste. */}
      <span
        data-t={t}
        className={[
          'relative h-3 w-5 shrink-0 rounded-full transition-colors duration-500',
          on ? 'bg-neutral-900' : 'bg-neutral-200',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-2 w-2 rounded-full bg-white shadow-sm transition-all duration-500',
            on ? 'left-[10px]' : 'left-0.5',
          ].join(' ')}
        />
      </span>
    </div>
  )
}
