'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Clock, ExternalLink, MessageSquare, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import IPhoneMockup from '@/components/ui/iphone-mockup'

/**
 * Intro CINÉMATIQUE d'un module (agent / modèles / automatisations), sur le
 * modèle de l'animation d'accueil XEYO.IO :
 *
 *   0  le titre « C'est quoi, … ? » arrive EN GROS, seul au centre
 *   1  il se réduit et remonte (animation layout), l'ILLUSTRATION entre :
 *        - agent : un iPhone WhatsApp où la conversation se joue
 *        - modèles : 3 cartes-exemples qui GLISSENT depuis la droite
 *        - automatisations : pipeline événement → délai → message qui se
 *          construit (lignes qui se tracent, aiguille qui tourne, ✓✓)
 *   2  le texte d'explication se révèle
 *   3  le bouton « C'est parti »
 *
 * `prefers-reduced-motion` : tout est affiché d'emblée, sans mouvement.
 */

export type IntroModule = 'agent' | 'templates' | 'automations'

const COPY: Record<IntroModule, { title: string; lines: string }> = {
  agent: {
    title: 'C’est quoi, un agent IA ?',
    lines:
      'C’est votre conseiller de vente et SAV, disponible 24h/24 sur WhatsApp. Lorsqu’un client vous pose une question, il répond avec les infos de VOTRE boutique : produits, commandes, politiques.',
  },
  templates: {
    title: 'C’est quoi, un modèle de message ?',
    lines:
      'Un message pré-écrit et validé par WhatsApp, avec des variables remplies automatiquement pour chaque client : le prénom, le numéro de commande, le lien de suivi…',
  },
  automations: {
    title: 'C’est quoi, une automatisation ?',
    lines:
      'Elle envoie le bon modèle au bon moment, toute seule : un événement se produit, un délai s’écoule, le message part. Vous n’avez rien à faire.',
  },
}

export function ModuleIntro({ module, onStart }: { module: IntroModule; onStart: () => void }) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState(reduced ? 3 : 0)
  const meta = COPY[module]

  useEffect(() => {
    if (reduced) return
    const timers = [
      setTimeout(() => setPhase(1), 1500), // le titre se réduit, l'illustration entre
      setTimeout(() => setPhase(2), 2600), // le texte
      setTimeout(() => setPhase(3), 3400), // le bouton
    ]
    return () => timers.forEach(clearTimeout)
  }, [reduced])

  return (
    <div className="flex min-h-[430px] flex-col items-center justify-center gap-5 py-4 text-center">
      {/* Le titre : EN GROS seul (phase 0), puis réduit quand le reste entre.
          `layout` : la remontée est animée quand les frères montent. */}
      <motion.h2
        layout
        initial={reduced ? false : { opacity: 0, scale: 1.1, filter: 'blur(14px)' }}
        animate={{ opacity: 1, scale: phase >= 1 ? 1 : 1.65, filter: 'blur(0px)' }}
        transition={{ layout: { type: 'spring', stiffness: 180, damping: 24 }, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="bg-gradient-to-b from-white to-white/70 bg-clip-text px-4 text-2xl font-bold tracking-tight text-transparent sm:text-3xl"
      >
        {meta.title}
      </motion.h2>

      <AnimatePresence>
        {phase >= 1 && (
          <motion.div
            layout
            initial={reduced ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
            className="flex w-full items-center justify-center"
          >
            {module === 'agent' && <AgentScene reduced={!!reduced} />}
            {module === 'templates' && <TemplateScene reduced={!!reduced} />}
            {module === 'automations' && <AutomationScene reduced={!!reduced} />}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase >= 2 && (
          <motion.p
            layout
            initial={reduced ? false : { opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="max-w-lg text-sm leading-relaxed text-muted-foreground"
          >
            {meta.lines}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase >= 3 && (
          <motion.div
            layout
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 22 }}
          >
            <Button size="lg" onClick={onStart} className="group h-11 px-8">
              C’est parti
              <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Dimensions nominales du mockup (boîte de layout non scalée par transform).
const PHONE_NOM_W = 417
const PHONE_NOM_H = 876

/** Agent : un iPhone WhatsApp où la conversation se joue toute seule. */
function AgentScene({ reduced }: { reduced: boolean }) {
  // 0 = rien, 1 = question client, 2 = « … », 3 = réponse IA
  const [beat, setBeat] = useState(reduced ? 3 : 0)
  useEffect(() => {
    if (reduced) return
    const timers = [
      setTimeout(() => setBeat(1), 500),
      setTimeout(() => setBeat(2), 1200),
      setTimeout(() => setBeat(3), 2100),
    ]
    return () => timers.forEach(clearTimeout)
  }, [reduced])

  const SCALE = 0.34
  return (
    <div style={{ height: PHONE_NOM_H * SCALE, width: PHONE_NOM_W * SCALE }} className="pointer-events-none flex items-start justify-center">
      <IPhoneMockup model="15-pro" color="#3a4a63" scale={SCALE} screenBg="#0b141a" glass>
        <div className="flex h-full flex-col bg-[#0b141a]">
          <div className="flex items-center gap-2.5 bg-[#111b21] px-3 pb-3 pt-14">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-sky-400">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mascots/peeking.png" alt="" className="mt-2 h-10 w-10 object-contain" />
            </div>
            <div className="min-w-0 text-left">
              <p className="truncate text-[19px] font-medium leading-tight text-[#e9edef]">Xeyo · Assistant</p>
              <p className="text-[14px] leading-tight text-[#8696a0]">en ligne</p>
            </div>
          </div>
          <div
            className="flex flex-1 flex-col justify-end gap-2.5 px-3 py-4"
            style={{ backgroundImage: 'url(/whatsapp-bg-dark.jpg)', backgroundSize: 'cover' }}
          >
            {beat >= 1 && (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="max-w-[85%] self-end rounded-lg rounded-tr-none bg-[#005c4b] px-3 py-2 text-left text-[17px] leading-snug text-[#e9edef] shadow-md"
              >
                Vous avez ma taille en 42 ?
              </motion.div>
            )}
            {beat === 2 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex gap-1.5 self-start rounded-lg rounded-tl-none bg-[#202c33] px-3.5 py-3 shadow-md"
              >
                {[0, 1, 2].map((d) => (
                  <motion.span
                    key={d}
                    className="h-2.5 w-2.5 rounded-full bg-[#8696a0]"
                    animate={reduced ? undefined : { opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: d * 0.15 }}
                  />
                ))}
              </motion.div>
            )}
            {beat >= 3 && (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="max-w-[85%] self-start rounded-lg rounded-tl-none bg-[#202c33] px-3 py-2 text-left text-[17px] leading-snug text-[#e9edef] shadow-md"
              >
                Oui ! Il reste 3 paires en 42 🎿 Je vous envoie le lien ?
              </motion.div>
            )}
          </div>
        </div>
      </IPhoneMockup>
    </div>
  )
}

// Les 3 exemples de modèles (cartes qui glissent depuis la droite).
const TEMPLATE_EXAMPLES = [
  { title: 'Commande expédiée 🚚', body: 'Bonjour Marie, votre commande #1024 est en route !', button: 'Suivre mon colis' },
  { title: 'Panier abandonné 🛒', body: 'Votre panier vous attend toujours, Marie 🙂', button: 'Finaliser ma commande' },
  { title: 'Anniversaire 🎂', body: 'Joyeux anniversaire Marie ! Un petit cadeau : -10 %.', button: 'Me faire plaisir' },
]

/** Modèles : 3 cartes-exemples qui défilent depuis la droite, en éventail. */
function TemplateScene({ reduced }: { reduced: boolean }) {
  return (
    <div className="flex w-full max-w-2xl items-stretch justify-center gap-3 overflow-hidden px-2 py-2">
      {TEMPLATE_EXAMPLES.map((t, i) => (
        <motion.div
          key={i}
          initial={reduced ? false : { opacity: 0, x: 260, rotate: 4 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 170, damping: 22, delay: 0.15 + i * 0.22 }}
          className="w-[180px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0e1626] text-left shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)]"
        >
          <div className="border-b border-white/10 px-3 py-2">
            <p className="truncate text-[12px] font-semibold text-white">{t.title}</p>
          </div>
          <div className="px-3 py-2.5">
            <div className="rounded-lg rounded-tl-none bg-[#202c33] px-2.5 py-2 text-[11px] leading-snug text-[#e9edef] shadow-sm">
              {t.body}
              <span className="ml-1 text-[9px] text-[#8696a0]">01:42</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1 border-t border-white/10 py-1.5 text-[11px] font-medium text-[#25d366]">
            <ExternalLink className="h-3 w-3" /> {t.button}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

/** Automatisations : le pipeline SE CONSTRUIT (lignes tracées, aiguille qui
 *  tourne, message qui part avec ✓✓ qui bleuissent), puis un point lumineux
 *  voyage en boucle le long du fil. */
function AutomationScene({ reduced }: { reduced: boolean }) {
  return (
    <div className="flex w-full max-w-xl items-center justify-center py-2">
      {/* Événement */}
      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 16, delay: 0.15 }}
        className="relative flex w-[120px] flex-col items-center gap-1.5 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-2 py-3.5"
      >
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-2xl border-2 border-amber-400/50"
          animate={reduced ? undefined : { scale: [1, 1.18], opacity: [0.6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
        />
        <Zap className="h-6 w-6 text-amber-400" />
        <p className="text-center text-[12px] font-medium leading-tight text-white">Commande<br />expédiée</p>
      </motion.div>

      <ConnectorLine delay={0.6} reduced={reduced} />

      {/* Délai : l'aiguille tourne. */}
      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 16, delay: 0.9 }}
        className="flex w-[110px] flex-col items-center gap-1.5 rounded-2xl border border-sky-400/30 bg-sky-400/10 px-2 py-3.5"
      >
        <motion.span
          animate={reduced ? undefined : { rotate: 360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'linear', delay: 1.1 }}
        >
          <Clock className="h-6 w-6 text-sky-400" />
        </motion.span>
        <p className="text-center text-[12px] font-medium leading-tight text-white">Attend 1 h</p>
      </motion.div>

      <ConnectorLine delay={1.3} reduced={reduced} />

      {/* Message : pop + ✓✓ qui bleuissent. */}
      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 16, delay: 1.65 }}
        className="flex w-[140px] flex-col items-center gap-1.5 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-2 py-3"
      >
        <MessageSquare className="h-6 w-6 text-emerald-400" />
        <div className="rounded-lg bg-[#005c4b] px-2 py-1 text-[11px] leading-tight text-white shadow-sm">
          Votre colis est en route !
          <motion.span
            initial={{ color: '#9ca3af' }}
            animate={{ color: reduced ? '#53bdeb' : ['#9ca3af', '#9ca3af', '#53bdeb'] }}
            transition={{ duration: 1.2, delay: 2.2 }}
            className="ml-1 text-[10px]"
          >
            ✓✓
          </motion.span>
        </div>
      </motion.div>
    </div>
  )
}

/** Fil entre deux nœuds : il SE TRACE, puis un point lumineux y voyage. */
function ConnectorLine({ delay, reduced }: { delay: number; reduced: boolean }) {
  return (
    <div className="relative h-px w-8 shrink-0 sm:w-12">
      <motion.span
        className="absolute inset-y-0 left-0 w-full origin-left bg-white/20"
        initial={reduced ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      />
      {!reduced && (
        <motion.span
          className="absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-primary shadow-[0_0_8px_2px] shadow-primary/60"
          animate={{ left: ['-8%', '92%'], opacity: [0, 1, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: delay + 1.6, repeatDelay: 1.4, ease: 'easeInOut' }}
        />
      )}
    </div>
  )
}
