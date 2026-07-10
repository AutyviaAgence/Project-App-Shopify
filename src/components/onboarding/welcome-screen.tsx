'use client'

import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { ArrowRight, Bot, Check, CheckCheck, Flame, ShoppingBag, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Écran de bienvenue CINÉMATIQUE, joué une seule fois à l'arrivée dans
 * l'onboarding. Contrairement à une simple apparition, c'est une petite scène
 * qui se DÉROULE toute seule (timeline `phase`), façon hero de landing :
 *
 *   0  fondu depuis le noir + halo qui s'allume
 *   1  le téléphone (conversation WhatsApp Xeyo) monte et se révèle en zoom
 *   2  le grand mot « XEYO » se révèle net derrière le téléphone + cartes
 *      flottantes qui entrent sur les côtés
 *   3  la conversation « se tape » toute seule (bulles qui apparaissent)
 *   4  titre de bienvenue + bouton « Configurer mon agent »
 *
 * Aucune image externe : le téléphone et son écran sont 100 % HTML/CSS, donc
 * theme-proof et sans asset à charger. La scène est volontairement sur fond
 * sombre (comme une intro de film) quel que soit le thème de l'app.
 *
 * `prefers-reduced-motion` : on saute directement à l'état final (phase 4),
 * tout est affiché d'un coup, sans mouvement.
 */

// Les bulles de la conversation démo, révélées une à une en phase 3.
const CHAT: { from: 'them' | 'ai'; text: string }[] = [
  { from: 'them', text: 'Bonjour, où en est ma commande #1024 ?' },
  { from: 'ai', text: 'Bonjour ! 😊 Votre commande #1024 a été expédiée hier, livraison prévue jeudi. Voici le suivi 📦' },
  { from: 'them', text: 'Super, merci !' },
  { from: 'ai', text: 'Avec plaisir. Autre chose pour vous ?' },
]

const FLOATERS = [
  { side: 'left' as const, icon: ShoppingBag, title: 'Commande suivie', sub: 'Réponse en 2 s', color: 'text-sky-400', delay: 0 },
  { side: 'right' as const, icon: Flame, title: '+38 % de ventes', sub: 'Paniers relancés', color: 'text-orange-400', delay: 0.25 },
  { side: 'left' as const, icon: Bot, title: 'Agent IA actif', sub: '24 h/24', color: 'text-violet-400', delay: 0.5 },
]

export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState(reduced ? 4 : 0)
  // Nombre de bulles visibles dans la conversation (révélées une à une).
  const [msgs, setMsgs] = useState(reduced ? CHAT.length : 0)

  useEffect(() => {
    if (reduced) return
    const timers = [
      setTimeout(() => setPhase(1), 500), // le téléphone se révèle
      setTimeout(() => setPhase(2), 1500), // le grand titre + cartes
      setTimeout(() => setPhase(3), 2400), // la conversation démarre
      setTimeout(() => setPhase(4), 5600), // titre de bienvenue + bouton
    ]
    return () => timers.forEach(clearTimeout)
  }, [reduced])

  // Phase 3 : on fait apparaître les bulles une par une, comme si ça se tapait.
  useEffect(() => {
    if (reduced || phase < 3) return
    const timers = CHAT.map((_, i) => setTimeout(() => setMsgs(i + 1), i * 750))
    return () => timers.forEach(clearTimeout)
  }, [phase, reduced])

  const bigTitle: Variants = {
    hidden: { opacity: 0, scale: 1.15, filter: 'blur(14px)' },
    show: { opacity: 0.14, scale: 1, filter: 'blur(0px)', transition: { duration: 1.1, ease: 'easeOut' } },
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#0a0f1e] px-6 text-center">
      {/* Fond : dégradé bleu nuit + halo qui s'allume à la phase 1. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        style={{
          background:
            'radial-gradient(60% 50% at 50% 42%, #16264d 0%, #0b1122 55%, #060912 100%)',
        }}
      />
      {/* Grille discrète en fond. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(#4d6bff 1px, transparent 1px), linear-gradient(90deg, #4d6bff 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(70% 60% at 50% 45%, black, transparent)',
        }}
      />

      {/* Grand mot en arrière-plan (phase 2). */}
      <motion.h1
        aria-hidden
        variants={bigTitle}
        initial={reduced ? false : 'hidden'}
        animate={phase >= 2 ? 'show' : 'hidden'}
        className="pointer-events-none absolute top-[16%] select-none text-[22vw] font-black leading-none tracking-tighter text-white md:text-[16rem]"
      >
        XEYO
      </motion.h1>

      {/* Cartes flottantes latérales (phase 2). */}
      <div className="pointer-events-none absolute inset-0 hidden md:block">
        {FLOATERS.map((f, i) => (
          <motion.div
            key={i}
            initial={reduced ? false : { opacity: 0, x: f.side === 'left' ? -40 : 40, y: 10 }}
            animate={phase >= 2 ? { opacity: 1, x: 0, y: 0 } : {}}
            transition={{ type: 'spring', stiffness: 200, damping: 22, delay: 0.3 + f.delay }}
            className="absolute flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-2xl backdrop-blur-md"
            style={{
              top: `${34 + i * 22}%`,
              [f.side]: '8%',
            }}
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

      {/* ── Le téléphone (phase 1) ─────────────────────────────────────── */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 120, scale: 0.9 }}
        animate={phase >= 1 ? { opacity: 1, y: 0, scale: 1 } : {}}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        className="relative z-10 mt-10"
      >
        <PhoneMock messages={CHAT.slice(0, msgs)} reduced={!!reduced} />
      </motion.div>

      {/* ── Titre de bienvenue + bouton (phase 4) ──────────────────────── */}
      <AnimatePresence>
        {phase >= 4 && (
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
              Une IA qui répond à vos clients sur WhatsApp, à partir de votre boutique.
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

/** Maquette de téléphone (100 % CSS) affichant une conversation WhatsApp Xeyo. */
function PhoneMock({ messages, reduced }: { messages: typeof CHAT; reduced: boolean }) {
  return (
    <div className="relative h-[440px] w-[248px] rounded-[42px] border-[3px] border-[#2a2f3e] bg-[#0d1117] p-2.5 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] sm:h-[500px] sm:w-[280px]">
      {/* Dynamic island */}
      <div className="absolute left-1/2 top-3.5 z-20 flex h-6 w-24 -translate-x-1/2 items-center justify-end rounded-full bg-black px-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </div>

      {/* Écran */}
      <div className="flex h-full w-full flex-col overflow-hidden rounded-[34px] bg-[#0b141a]">
        {/* En-tête WhatsApp */}
        <div className="flex items-center gap-2.5 bg-[#1f2c34] px-3.5 pb-2.5 pt-9">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <Bot className="h-4 w-4" />
          </div>
          <div className="text-left">
            <p className="text-[13px] font-semibold leading-tight text-white">Xeyo · Assistant</p>
            <p className="text-[10px] leading-tight text-emerald-400">en ligne</p>
          </div>
        </div>

        {/* Fil de discussion */}
        <div
          className="flex flex-1 flex-col gap-2 overflow-hidden px-3 py-3"
          style={{
            backgroundColor: '#0b141a',
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '16px 16px',
          }}
        >
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={reduced ? false : { opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className={`flex ${m.from === 'ai' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-left text-[11px] leading-snug shadow-sm ${
                    m.from === 'ai'
                      ? 'rounded-br-sm bg-[#005c4b] text-white'
                      : 'rounded-bl-sm bg-[#1f2c34] text-white/90'
                  }`}
                >
                  {m.text}
                  {m.from === 'ai' && (
                    <CheckCheck className="ml-1 inline-block h-3 w-3 translate-y-[1px] text-sky-300" />
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Barre de saisie (décorative) */}
        <div className="flex items-center gap-2 bg-[#0b141a] px-3 pb-3 pt-1">
          <div className="flex h-8 flex-1 items-center rounded-full bg-[#1f2c34] px-3 text-[10px] text-white/30">
            Message…
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  )
}
