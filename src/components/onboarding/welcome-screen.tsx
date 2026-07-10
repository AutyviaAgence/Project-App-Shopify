'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Bot, Flame, MoreVertical, Phone, ShoppingBag, Sparkles, Star, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import IPhoneMockup from '@/components/ui/iphone-mockup'

/**
 * Écran de bienvenue CINÉMATIQUE, joué une seule fois à l'arrivée dans
 * l'onboarding. Une scène qui se DÉROULE seule (timeline `phase`), pensée pour
 * tenir sur UN écran sans scroll (h-screen + overflow-hidden) :
 *
 *   0  fond bleu nuit qui s'allume
 *   1  « XEYO.IO » se révèle net, blanc clair, au centre
 *   2  il se déplace vers le haut et devient transparent (fantôme), le
 *      téléphone monte et se révèle en dessous
 *   3  cartes flottantes latérales (entrée + flottement continu)
 *   4  la conversation WhatsApp se tape seule : indicateur « … » puis message,
 *      jusqu'au carrousel produits
 *   5  titre de bienvenue + bouton « Configurer mon agent »
 *
 * Téléphone = mockup maison `IPhoneMockup` + vrai fond WhatsApp.
 * `prefers-reduced-motion` : saut direct à l'état final (phase 5), sans mouvement.
 */

type Bubble =
  | { kind: 'them'; text: string }
  | { kind: 'ai'; text: string }
  | { kind: 'carousel' }

const CHAT: Bubble[] = [
  { kind: 'them', text: 'Bonjour ! Une idée de cadeau à moins de 50 € ? 🎁' },
  { kind: 'ai', text: 'Avec plaisir 😊 Voici 3 best-sellers du moment :' },
  { kind: 'carousel' },
  { kind: 'them', text: 'Le 2ᵉ est parfait, je le prends !' },
  { kind: 'ai', text: 'Excellent choix 🙌 Je vous envoie le lien de paiement.' },
]

const PRODUCTS = [
  { name: 'Bougie Ambre', price: '24 €', emoji: '🕯️' },
  { name: 'Coffret Thé', price: '39 €', emoji: '🍵' },
  { name: 'Carnet cuir', price: '29 €', emoji: '📓' },
]

const FLOATERS = [
  { side: 'left' as const, icon: ShoppingBag, title: 'Commande suivie', sub: 'Réponse en 2 s', color: 'text-sky-400', top: '30%' },
  { side: 'right' as const, icon: Flame, title: '+38 % de ventes', sub: 'Paniers relancés', color: 'text-orange-400', top: '32%' },
  { side: 'left' as const, icon: Bot, title: 'Agent IA actif', sub: '24 h/24', color: 'text-violet-400', top: '56%' },
  { side: 'right' as const, icon: Star, title: '4,9 / 5', sub: 'Clients satisfaits', color: 'text-amber-400', top: '58%' },
]

// Chaque message est précédé d'un indicateur de saisie « … » (sauf le carrousel,
// enchaîné juste après le message de l'IA). Rythme (ms) : durée du « … », puis le
// message reste affiché avant le suivant.
const TYPING_MS = 850
const READ_MS = 950

export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState(reduced ? 5 : 0)
  const [msgs, setMsgs] = useState(reduced ? CHAT.length : 0)
  // Indique si un interlocuteur « écrit » (bulle … avant le prochain message).
  const [typing, setTyping] = useState<null | 'them' | 'ai'>(null)

  useEffect(() => {
    if (reduced) return
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 2900),
      setTimeout(() => setPhase(4), 3500),
    ]
    return () => timers.forEach(clearTimeout)
  }, [reduced])

  // Phase 4 : on enchaîne « … » (du bon côté) puis le message, un à un. Le
  // carrousel n'a pas de « … » (il suit le message de l'IA). À la fin → phase 5.
  useEffect(() => {
    if (reduced || phase < 4) return
    const timers: ReturnType<typeof setTimeout>[] = []
    let t = 0
    CHAT.forEach((b, i) => {
      if (b.kind === 'carousel') {
        timers.push(setTimeout(() => setMsgs(i + 1), t))
        t += READ_MS
        return
      }
      const who = b.kind
      timers.push(setTimeout(() => setTyping(who), t))
      t += TYPING_MS
      timers.push(setTimeout(() => { setTyping(null); setMsgs(i + 1) }, t))
      t += READ_MS
    })
    timers.push(setTimeout(() => setPhase(5), t + 300))
    return () => timers.forEach(clearTimeout)
  }, [phase, reduced])

  const showPhone = phase >= 2

  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-start overflow-hidden bg-[#0a0f1e] px-6">
      {/* Fond : dégradé bleu nuit + grille. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        style={{ background: 'radial-gradient(60% 55% at 50% 40%, #16264d 0%, #0b1122 55%, #060912 100%)' }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: 'linear-gradient(#4d6bff 1px, transparent 1px), linear-gradient(90deg, #4d6bff 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(70% 60% at 50% 42%, black, transparent)',
        }}
      />

      {/* ── « XEYO.IO » : net et centré (phase 1) → monte + devient fantôme
          (phase ≥ 2). Transition longue et douce (cubic-bezier) pour un
          déplacement fluide, pas sec. ── */}
      <motion.h1
        aria-hidden
        initial={reduced ? false : { opacity: 0, scale: 1.12, filter: 'blur(18px)', y: '-50%' }}
        animate={
          phase >= 2
            ? { opacity: 0.08, scale: 1, filter: 'blur(0px)', y: '-205%' }
            : phase >= 1
              ? { opacity: 0.96, scale: 1, filter: 'blur(0px)', y: '-50%' }
              : {}
        }
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute top-1/2 select-none bg-gradient-to-b from-white to-white/60 bg-clip-text text-[17vw] font-black leading-none tracking-tighter text-transparent md:text-[12rem]"
      >
        XEYO.IO
      </motion.h1>

      {/* ── Cartes flottantes latérales (phase 3) : entrée + flottement continu. ── */}
      <div className="pointer-events-none absolute inset-0 hidden md:block">
        {FLOATERS.map((f, i) => (
          <motion.div
            key={i}
            initial={reduced ? false : { opacity: 0, x: f.side === 'left' ? -50 : 50 }}
            animate={phase >= 3 ? { opacity: 1, x: 0, y: reduced ? 0 : [0, -9, 0] } : {}}
            transition={{
              opacity: { duration: 0.5, delay: 0.08 * i },
              x: { type: 'spring', stiffness: 200, damping: 22, delay: 0.08 * i },
              y: { duration: 4 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: 0.3 * i },
            }}
            className="absolute flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-2xl backdrop-blur-md"
            style={{ top: f.top, [f.side]: '6%' }}
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

      {/* ── Le téléphone (phase 2), positionné un peu bas et centré. ── */}
      <AnimatePresence>
        {showPhone && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 130, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 110, damping: 20 }}
            className="relative z-10 mt-[7vh]"
          >
            <WhatsAppPhone visibleCount={msgs} typing={typing} reduced={!!reduced} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Titre + bouton (phase 5), en bas, superposé (pas de scroll). ── */}
      <AnimatePresence>
        {phase >= 5 && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center bg-gradient-to-t from-[#0a0f1e] via-[#0a0f1e]/95 to-transparent px-6 pb-7 pt-10 text-center"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
              <Sparkles className="h-3.5 w-3.5" /> Bienvenue sur Xeyo
            </p>
            <h2 className="mt-2 max-w-xl text-xl font-bold tracking-tight text-white sm:text-2xl">
              Une IA qui répond, conseille et vend sur WhatsApp — à partir de votre boutique.
            </h2>
            <Button
              size="lg"
              onClick={onStart}
              className="group mt-4 h-12 bg-white px-8 text-base text-black shadow-lg shadow-black/30 hover:bg-white/90"
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

/** Téléphone WhatsApp fidèle : IPhoneMockup + vrai fond + chrome WhatsApp. */
function WhatsAppPhone({ visibleCount, typing, reduced }: { visibleCount: number; typing: null | 'them' | 'ai'; reduced: boolean }) {
  const shown = CHAT.slice(0, visibleCount)
  return (
    <IPhoneMockup model="15-pro" color="#3a4a63" scale={0.68} screenBg="#0b141a" glass>
      <div className="flex h-full flex-col">
        {/* En-tête WhatsApp fidèle : avatar, nom, « en ligne », icônes appel. */}
        <div className="flex items-center gap-2.5 bg-[#008069] px-3 pb-2.5 pt-12 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-[17px] font-semibold leading-tight">Xeyo · Assistant</p>
            <p className="text-[12px] leading-tight text-white/80">en ligne</p>
          </div>
          <Video className="h-5 w-5 text-white/90" />
          <Phone className="h-[18px] w-[18px] text-white/90" />
          <MoreVertical className="h-5 w-5 text-white/90" />
        </div>

        {/* Conversation sur le vrai fond WhatsApp. `justify-end` : les bulles
            s'empilent depuis le BAS (comme la vraie app), le dernier message
            reste toujours visible même si le fil dépasse. */}
        <div
          className="flex flex-1 flex-col justify-end gap-2 overflow-hidden px-3 py-3"
          style={{ backgroundImage: 'url(/whatsapp-bg.webp)', backgroundSize: 'cover' }}
        >
          <AnimatePresence initial={false}>
            {shown.map((m, i) => (
              <motion.div
                key={i}
                initial={reduced ? false : { opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                className={m.kind === 'ai' ? 'flex justify-end' : m.kind === 'them' ? 'flex justify-start' : ''}
              >
                {m.kind === 'carousel' ? (
                  <ProductCarousel />
                ) : (
                  <div
                    className={`relative max-w-[84%] rounded-lg px-3 py-2 text-left text-[15px] leading-snug shadow-sm ${
                      m.kind === 'ai' ? 'rounded-tr-none bg-[#d9fdd3] text-gray-900' : 'rounded-tl-none bg-white text-gray-900'
                    }`}
                  >
                    {m.text}
                    <span className="ml-1.5 inline-block align-bottom text-[11px] text-gray-400">
                      12:0{i}
                      {m.kind === 'ai' && <span className="ml-0.5 text-[#53bdeb]">✓✓</span>}
                    </span>
                  </div>
                )}
              </motion.div>
            ))}

            {/* Bulle « … » de saisie (du bon côté selon qui écrit). */}
            {typing && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={typing === 'ai' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div className={`flex gap-1 rounded-lg px-3 py-2.5 shadow-sm ${typing === 'ai' ? 'rounded-tr-none bg-[#d9fdd3]' : 'rounded-tl-none bg-white'}`}>
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="h-2 w-2 rounded-full bg-gray-400"
                      animate={reduced ? undefined : { opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                      transition={reduced ? undefined : { duration: 0.9, repeat: Infinity, delay: d * 0.15 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Barre de saisie WhatsApp (décorative). */}
        <div className="flex items-center gap-2 bg-[#0b141a] px-3 pb-3 pt-2">
          <div className="flex h-9 flex-1 items-center rounded-full bg-white/10 px-4 text-[13px] text-white/35">Message</div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#008069] text-white">
            <ArrowRight className="h-5 w-5" />
          </div>
        </div>
      </div>
    </IPhoneMockup>
  )
}

/** Carrousel de produits (façon catalogue WhatsApp), scroll horizontal. */
function ProductCarousel() {
  return (
    <div className="-mx-1 flex w-full gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {PRODUCTS.map((p, i) => (
        <div key={i} className="flex w-[112px] shrink-0 flex-col overflow-hidden rounded-xl bg-white shadow-md">
          <div className="flex h-[76px] items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-3xl">
            {p.emoji}
          </div>
          <div className="px-2.5 py-2 text-left">
            <p className="truncate text-[13px] font-semibold text-gray-900">{p.name}</p>
            <p className="text-[14px] font-bold text-[#008069]">{p.price}</p>
            <div className="mt-1.5 rounded-md bg-[#008069] py-1 text-center text-[12px] font-semibold text-white">Voir</div>
          </div>
        </div>
      ))}
    </div>
  )
}
