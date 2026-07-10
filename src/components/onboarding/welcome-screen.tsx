'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Bot, Check, Flame, ShoppingBag, Sparkles, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import IPhoneMockup from '@/components/ui/iphone-mockup'

/**
 * Écran de bienvenue CINÉMATIQUE, joué une seule fois à l'arrivée dans
 * l'onboarding. C'est une petite scène qui se DÉROULE seule (timeline `phase`) :
 *
 *   0  fond bleu nuit qui s'allume
 *   1  « XEYO.IO » se révèle net, en blanc CLAIR, plein écran
 *   2  il s'estompe (fond à peine visible) PUIS le téléphone monte et se révèle
 *   3  le grand mot fantôme + les cartes flottantes latérales entrent
 *   4  la conversation WhatsApp se tape toute seule (jusqu'au carrousel produits)
 *   5  titre de bienvenue + bouton « Configurer mon agent »
 *
 * Le téléphone réutilise le mockup maison `IPhoneMockup` (cadre titane, Dynamic
 * Island, reflet verre) et le vrai fond WhatsApp (`/whatsapp-bg.webp`).
 *
 * `prefers-reduced-motion` : on saute à l'état final (phase 5), sans mouvement.
 */

type Bubble =
  | { kind: 'them'; text: string }
  | { kind: 'ai'; text: string }
  | { kind: 'carousel' }

// Le fil de discussion, révélé bulle par bulle en phase 4. La dernière « bulle »
// est un carrousel de produits (façon WhatsApp catalog) — c'est l'accroche.
const CHAT: Bubble[] = [
  { kind: 'them', text: 'Bonjour ! Vous auriez une idée de cadeau à moins de 50 € ?' },
  { kind: 'ai', text: 'Avec plaisir 😊 Voici 3 best-sellers qui plaisent beaucoup en ce moment :' },
  { kind: 'carousel' },
  { kind: 'them', text: 'Le 2ᵉ est parfait, je le prends !' },
]

const PRODUCTS = [
  { name: 'Bougie Ambre', price: '24 €', emoji: '🕯️' },
  { name: 'Coffret Thé', price: '39 €', emoji: '🍵' },
  { name: 'Carnet cuir', price: '29 €', emoji: '📓' },
]

const FLOATERS = [
  { side: 'left' as const, icon: ShoppingBag, title: 'Commande suivie', sub: 'Réponse en 2 s', color: 'text-sky-400', top: '30%' },
  { side: 'right' as const, icon: Flame, title: '+38 % de ventes', sub: 'Paniers relancés', color: 'text-orange-400', top: '34%' },
  { side: 'right' as const, icon: Star, title: '4,9 / 5', sub: 'Clients satisfaits', color: 'text-amber-400', top: '58%' },
  { side: 'left' as const, icon: Bot, title: 'Agent IA actif', sub: '24 h/24', color: 'text-violet-400', top: '62%' },
]

export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState(reduced ? 5 : 0)
  const [msgs, setMsgs] = useState(reduced ? CHAT.length : 0)

  useEffect(() => {
    if (reduced) return
    const timers = [
      setTimeout(() => setPhase(1), 400), // XEYO.IO se révèle net
      setTimeout(() => setPhase(2), 2200), // il s'estompe + le téléphone arrive
      setTimeout(() => setPhase(3), 3100), // grand mot fantôme + cartes
      setTimeout(() => setPhase(4), 3800), // la conversation démarre
      setTimeout(() => setPhase(5), 8200), // titre + bouton
    ]
    return () => timers.forEach(clearTimeout)
  }, [reduced])

  // Phase 4 : bulles révélées une par une (le carrousel compte comme une bulle).
  useEffect(() => {
    if (reduced || phase < 4) return
    const timers = CHAT.map((_, i) => setTimeout(() => setMsgs(i + 1), i * 1000))
    return () => timers.forEach(clearTimeout)
  }, [phase, reduced])

  const showPhone = phase >= 2

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#0a0f1e] px-6 text-center">
      {/* Fond : dégradé bleu nuit + grille. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        style={{ background: 'radial-gradient(60% 50% at 50% 42%, #16264d 0%, #0b1122 55%, #060912 100%)' }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: 'linear-gradient(#4d6bff 1px, transparent 1px), linear-gradient(90deg, #4d6bff 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(70% 60% at 50% 45%, black, transparent)',
        }}
      />

      {/* ── « XEYO.IO » : d'abord PLEIN et net au centre (phase 1), puis il monte
          et s'estompe en fantôme derrière le téléphone (phase ≥ 2). Tout est piloté
          par motion (y en %, opacity, scale, blur) — pas de mélange avec une
          transition CSS. Ancré au centre vertical, on le décale via `y`. ── */}
      <motion.h1
        aria-hidden
        initial={reduced ? false : { opacity: 0, scale: 1.15, filter: 'blur(16px)', y: '-50%' }}
        animate={
          phase >= 2
            ? { opacity: 0.1, scale: 1, filter: 'blur(0px)', y: '-190%' } // fantôme, remonté
            : phase >= 1
              ? { opacity: 0.95, scale: 1, filter: 'blur(0px)', y: '-50%' } // net, centré
              : {}
        }
        transition={{ duration: 1.1, ease: 'easeOut' }}
        className="pointer-events-none absolute top-1/2 select-none bg-gradient-to-b from-white to-white/70 bg-clip-text text-[18vw] font-black leading-none tracking-tighter text-transparent md:text-[13rem]"
      >
        XEYO.IO
      </motion.h1>

      {/* ── Cartes flottantes latérales (phase 3) : entrent puis flottent en boucle. ── */}
      <div className="pointer-events-none absolute inset-0 hidden md:block">
        {FLOATERS.map((f, i) => (
          <motion.div
            key={i}
            initial={reduced ? false : { opacity: 0, x: f.side === 'left' ? -50 : 50 }}
            animate={
              phase >= 3
                ? {
                    opacity: 1,
                    x: 0,
                    y: reduced ? 0 : [0, -9, 0], // flottement continu
                  }
                : {}
            }
            transition={{
              opacity: { duration: 0.5, delay: 0.1 * i },
              x: { type: 'spring', stiffness: 200, damping: 22, delay: 0.1 * i },
              y: { duration: 4 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: 0.3 * i },
            }}
            className="absolute flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-2xl backdrop-blur-md"
            style={{ top: f.top, [f.side]: '7%' }}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ${f.color}`}>
              <f.icon className="h-4 w-4" />
            </span>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">{f.title}</p>
              <p className="text-xs text-white/50">{f.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Le téléphone (phase 2) ─────────────────────────────────────── */}
      <AnimatePresence>
        {showPhone && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 130, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 110, damping: 20 }}
            className="relative z-10 mt-6"
          >
            <WhatsAppPhone visibleCount={msgs} reduced={!!reduced} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Titre de bienvenue + bouton (phase 5) ──────────────────────── */}
      <AnimatePresence>
        {phase >= 5 && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            className="relative z-20 mt-8 flex flex-col items-center"
          >
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-white/40">
              <Sparkles className="h-3.5 w-3.5" /> Bienvenue sur Xeyo
            </p>
            <h2 className="mt-3 max-w-lg text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Une IA qui répond, conseille et vend sur WhatsApp — à partir de votre boutique.
            </h2>
            <Button
              size="lg"
              onClick={onStart}
              className="group mt-6 h-12 bg-white px-8 text-base text-black shadow-lg shadow-black/30 hover:bg-white/90"
            >
              Configurer mon agent
              <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Téléphone WhatsApp : réutilise IPhoneMockup + vrai fond WhatsApp. */
function WhatsAppPhone({ visibleCount, reduced }: { visibleCount: number; reduced: boolean }) {
  const shown = CHAT.slice(0, visibleCount)
  return (
    <IPhoneMockup model="15-pro" color="#3a4a63" scale={0.62} screenBg="#0b141a" glass>
      <div className="flex h-full flex-col">
        {/* Barre WhatsApp (sous la Dynamic Island). */}
        <div className="flex items-center gap-2 bg-[#075E54] px-3 pb-2.5 pt-12 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-[15px] font-medium">Xeyo · Assistant</p>
            <p className="text-[11px] text-white/70">en ligne</p>
          </div>
        </div>

        {/* Fil de discussion sur le vrai fond WhatsApp. */}
        <div
          className="flex flex-1 flex-col gap-2 overflow-hidden px-2.5 py-3"
          style={{ backgroundImage: 'url(/whatsapp-bg.webp)', backgroundSize: 'cover' }}
        >
          <AnimatePresence initial={false}>
            {shown.map((m, i) => (
              <motion.div
                key={i}
                initial={reduced ? false : { opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                className={m.kind === 'ai' ? 'flex justify-end' : m.kind === 'them' ? 'flex justify-start' : ''}
              >
                {m.kind === 'carousel' ? (
                  <ProductCarousel />
                ) : (
                  <div
                    className={`max-w-[82%] rounded-lg px-2.5 py-1.5 text-left text-[12px] leading-snug shadow-sm ${
                      m.kind === 'ai' ? 'rounded-tr-sm bg-[#dcf8c6] text-gray-800' : 'rounded-tl-sm bg-white text-gray-800'
                    }`}
                  >
                    {m.text}
                    <span className="ml-1 inline-block align-bottom text-[9px] text-gray-400">12:0{i}</span>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Barre de saisie (décorative). */}
        <div className="flex items-center gap-2 bg-[#0b141a] px-2.5 pb-3 pt-1.5">
          <div className="flex h-8 flex-1 items-center rounded-full bg-white/10 px-3 text-[10px] text-white/30">Message…</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#075E54] text-white">
            <Check className="h-4 w-4" />
          </div>
        </div>
      </div>
    </IPhoneMockup>
  )
}

/** Carrousel de produits (façon catalogue WhatsApp), scroll horizontal. */
function ProductCarousel() {
  return (
    <div className="flex w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {PRODUCTS.map((p, i) => (
        <div key={i} className="flex w-[92px] shrink-0 flex-col overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="flex h-[62px] items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-2xl">
            {p.emoji}
          </div>
          <div className="px-2 py-1.5 text-left">
            <p className="truncate text-[10px] font-semibold text-gray-800">{p.name}</p>
            <p className="text-[11px] font-bold text-[#075E54]">{p.price}</p>
            <div className="mt-1 rounded-md bg-[#075E54] py-0.5 text-center text-[9px] font-medium text-white">
              Voir
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
