'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Camera, Clock, ExternalLink, MessageSquare, Paperclip, Smile, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import IPhoneMockup from '@/components/ui/iphone-mockup'

/**
 * Intro CINÉMATIQUE d'un module (agent / modèles / automatisations), jouée en
 * PLEINE SCÈNE (le panneau verre et le titre d'étape sont masqués pendant
 * l'intro), sur le modèle de l'accueil XEYO.IO :
 *
 *   0  le titre « C'est quoi, … ? » arrive EN GROS, seul au centre
 *   1  il se réduit et remonte (animation layout), l'ILLUSTRATION entre dans
 *      un emplacement à hauteur RÉSERVÉE (zéro saut de mise en page) :
 *        - agent : un grand iPhone WhatsApp où la conversation se joue
 *        - modèles : 4 cartes-exemples (dont un CARROUSEL produits) qui
 *          glissent depuis la droite
 *        - automatisations : pipeline qui se construit (fils tracés, aiguille
 *          qui tourne, ✓✓ qui bleuissent, point lumineux en boucle)
 *   2  le texte d'explication
 *   3  « C'est parti »
 *
 * `prefers-reduced-motion` : tout est affiché d'emblée, sans mouvement.
 */

export type IntroModule = 'agent' | 'templates' | 'automations'

const COPY: Record<IntroModule, { title: string; lines: string; illuH: number }> = {
  agent: {
    title: 'C’est quoi, un agent IA ?',
    lines:
      'C’est votre conseiller de vente et SAV, disponible 24h/24 sur WhatsApp. Lorsqu’un client vous pose une question, il répond avec les infos de VOTRE boutique : produits, commandes, politiques.',
    illuH: 500,
  },
  templates: {
    title: 'C’est quoi, un modèle de message ?',
    lines:
      'Un message pré-écrit et validé par WhatsApp, avec des variables remplies automatiquement pour chaque client : le prénom, le numéro de commande, le lien de suivi…',
    illuH: 300,
  },
  automations: {
    title: 'C’est quoi, une automatisation ?',
    lines:
      'Elle envoie le bon modèle au bon moment, toute seule : un événement se produit, un délai s’écoule, le message part. Vous n’avez rien à faire.',
    illuH: 220,
  },
}

export function ModuleIntro({ module, onStart }: { module: IntroModule; onStart: () => void }) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState(reduced ? 3 : 0)
  const meta = COPY[module]

  useEffect(() => {
    if (reduced) return
    const timers = [
      setTimeout(() => setPhase(1), 1600),
      setTimeout(() => setPhase(2), 2800),
      setTimeout(() => setPhase(3), 3600),
    ]
    return () => timers.forEach(clearTimeout)
  }, [reduced])

  return (
    <div className="flex min-h-[68vh] flex-col items-center justify-center gap-7 py-6 text-center">
      {/* Le titre : EN GROS seul (phase 0), puis réduit quand le reste entre. */}
      <motion.h2
        layout
        initial={reduced ? false : { opacity: 0, scale: 1.06, filter: 'blur(16px)' }}
        animate={{ opacity: 1, scale: phase >= 1 ? 1 : 1.35, filter: 'blur(0px)' }}
        transition={{ layout: { type: 'spring', stiffness: 170, damping: 24 }, duration: 1, ease: [0.22, 1, 0.36, 1] }}
        // leading + pb : sans ça, bg-clip-text coupe les jambages (le « g »).
        // ⚠️ Pas de marge négative en bas : elle tirait le titre DANS le mockup, qui
        // lui-même remontait par-dessus (-mt-12). Le téléphone passait au-dessus du
        // texte et le coupait en deux.
        className="-mt-8 bg-gradient-to-b from-white to-white/70 bg-clip-text px-4 pb-2 text-4xl font-bold leading-[1.2] tracking-tight text-transparent sm:text-5xl md:text-6xl"
      >
        {meta.title}
      </motion.h2>

      {/* Emplacement d'illustration à hauteur RÉSERVÉE. */}
      <AnimatePresence>
        {phase >= 1 && (
          <motion.div
            layout
            initial={reduced ? false : { opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 190, damping: 22 }}
            style={{ minHeight: meta.illuH }}
            // ⚠️ Aucune marge négative : le mockup remontait (-mt-12) par-dessus le
            // titre, et le téléphone lui passait DEVANT — le texte était coupé en deux.
            // L'illustration reste sous le titre ; le `gap` du parent les sépare.
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
            initial={reduced ? false : { opacity: 0, y: 16, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="max-w-xl text-[15px] leading-relaxed text-white/70"
          >
            {meta.lines}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase >= 3 && (
          <motion.div
            layout
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 22 }}
          >
            <Button size="lg" onClick={onStart} className="group h-12 px-10 text-base shadow-lg shadow-primary/25">
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

// Les scénarios de l'intro agent : ils BOUCLENT (fondu entre deux).
// side 'right' = le client (vert), 'left' = l'agent (gris).
const AGENT_SCENARIOS: { side: 'left' | 'right'; text: string }[][] = [
  [
    { side: 'right', text: 'Vous avez ma taille en 42 ?' },
    { side: 'left', text: 'Oui ! Il reste 3 paires en 42 🎿 Je vous envoie le lien ?' },
    { side: 'right', text: 'Parfait, je prends !' },
  ],
  [
    { side: 'right', text: 'Où en est ma commande #1024 ?' },
    { side: 'left', text: 'Expédiée hier 🚚 Livraison prévue jeudi. Voici le suivi.' },
    { side: 'right', text: 'Top, merci !' },
  ],
  [
    { side: 'right', text: 'C’est quoi votre politique de retour ?' },
    { side: 'left', text: '30 jours pour changer d’avis, retour gratuit 😊' },
  ],
]

const AGENT_TYPING_MS = 800
const AGENT_READ_MS = 1000
const AGENT_HOLD_MS = 2200
const AGENT_FADE_MS = 500

/** Agent : un GRAND iPhone WhatsApp fidèle (barre d'envoi comprise) où la
 *  conversation se joue, DÉFILE (layout) et CHANGE de scénario en boucle. */
function AgentScene({ reduced }: { reduced: boolean }) {
  const [scen, setScen] = useState(0)
  const [msgs, setMsgs] = useState(reduced ? AGENT_SCENARIOS[0].length : 0)
  const [typing, setTyping] = useState<null | 'left' | 'right'>(null)

  useEffect(() => {
    if (reduced) return
    const chat = AGENT_SCENARIOS[scen]
    const timers: ReturnType<typeof setTimeout>[] = []
    let t = 400
    chat.forEach((m, i) => {
      timers.push(setTimeout(() => setTyping(m.side), t))
      t += AGENT_TYPING_MS
      timers.push(setTimeout(() => { setTyping(null); setMsgs(i + 1) }, t))
      t += AGENT_READ_MS
    })
    // Fin : pause de lecture, fondu (exit), scénario suivant.
    timers.push(setTimeout(() => setMsgs(0), t + AGENT_HOLD_MS))
    timers.push(setTimeout(() => setScen((s) => (s + 1) % AGENT_SCENARIOS.length), t + AGENT_HOLD_MS + AGENT_FADE_MS))
    return () => timers.forEach(clearTimeout)
  }, [scen, reduced])

  const shown = AGENT_SCENARIOS[scen].slice(0, msgs)
  const SCALE = 0.58
  return (
    <div
      style={{ height: PHONE_NOM_H * SCALE, width: PHONE_NOM_W * SCALE }}
      className="pointer-events-none flex items-start justify-center"
    >
      <IPhoneMockup model="15-pro" color="#3a4a63" scale={SCALE} screenBg="#0b141a" glass>
        <div className="flex h-full flex-col bg-[#0b141a]">
          {/* En-tête WhatsApp */}
          <div className="flex items-center gap-2.5 bg-[#111b21] px-3 pb-3 pt-14">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-sky-400">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mascots/peeking.png" alt="" className="mt-2 h-10 w-10 object-contain" />
            </div>
            <div className="min-w-0 text-left">
              <p className="truncate text-[18px] font-medium leading-tight text-[#e9edef]">Xeyo · Assistant</p>
              <p className="text-[13px] leading-tight text-[#8696a0]">en ligne</p>
            </div>
          </div>

          {/* Fil : bulles ancrées en bas, DÉFILEMENT fluide (layout), fondu de
              sortie au changement de scénario (clés préfixées). */}
          <div
            className="flex flex-1 flex-col justify-end gap-2.5 overflow-hidden px-3 py-4"
            style={{ backgroundImage: 'url(/whatsapp-bg-dark.jpg)', backgroundSize: 'cover' }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {shown.map((m, i) => (
                <motion.div
                  key={`${scen}-${i}`}
                  layout
                  initial={reduced ? false : { opacity: 0, y: 14, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -14, transition: { duration: 0.35 } }}
                  transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                  className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-left text-[20px] leading-snug text-[#e9edef] shadow-md ${
                    m.side === 'right' ? 'self-end rounded-tr-none bg-[#005c4b]' : 'self-start rounded-tl-none bg-[#202c33]'
                  }`}
                >
                  {m.text}
                  <span className="ml-1.5 whitespace-nowrap text-[13px] text-[#8696a0]">
                    01:4{i}{m.side === 'right' && <span className="ml-0.5 text-[#53bdeb]">✓✓</span>}
                  </span>
                </motion.div>
              ))}
              {typing && (
                <motion.div
                  key={`typing-${scen}`}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                  className={`flex gap-1.5 rounded-lg px-3.5 py-3 shadow-md ${
                    typing === 'right' ? 'self-end rounded-tr-none bg-[#005c4b]' : 'self-start rounded-tl-none bg-[#202c33]'
                  }`}
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
            </AnimatePresence>
          </div>

          {/* Barre d'envoi WhatsApp (décorative mais fidèle). */}
          <div className="flex items-center gap-2 bg-[#0b141a] px-3 pb-4 pt-2">
            <div className="flex h-12 flex-1 items-center gap-2.5 rounded-full bg-[#1f2c34] px-4">
              <Smile className="h-6 w-6 shrink-0 text-[#8696a0]" />
              <span className="flex-1 text-left text-[15px] text-[#8696a0]">Message</span>
              <Paperclip className="h-5 w-5 shrink-0 rotate-45 text-[#8696a0]" />
              <Camera className="h-6 w-6 shrink-0 text-[#8696a0]" />
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white">
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" /></svg>
            </div>
          </div>
        </div>
      </IPhoneMockup>
    </div>
  )
}

// Les exemples de modèles : 2 classiques + 1 CARROUSEL produits.
const TEMPLATE_EXAMPLES = [
  { title: 'Commande expédiée 🚚', body: 'Bonjour Marie, votre commande #1024 est en route !', button: 'Suivre mon colis' },
  { title: 'Panier abandonné 🛒', body: 'Votre panier vous attend toujours, Marie 🙂', button: 'Finaliser ma commande' },
]
const CAROUSEL_EXAMPLE = {
  title: 'Carrousel produits 🛍️',
  body: 'Nos best-sellers du moment :',
  products: [
    { emoji: '🕯️', name: 'Bougie', price: '24 €' },
    { emoji: '🍵', name: 'Coffret', price: '39 €' },
    { emoji: '📓', name: 'Carnet', price: '29 €' },
  ],
}

/** Modèles : 4 cartes-exemples qui défilent depuis la droite. */
function TemplateScene({ reduced }: { reduced: boolean }) {
  return (
    <div className="flex w-full max-w-4xl flex-wrap items-stretch justify-center gap-3 px-2 py-2">
      {TEMPLATE_EXAMPLES.map((t, i) => (
        <motion.div
          key={i}
          initial={reduced ? false : { opacity: 0, x: 280, rotate: 4 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 22, delay: 0.15 + i * 0.2 }}
          className="flex w-[250px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0e1626] text-left shadow-[0_20px_45px_-12px_rgba(0,0,0,0.65)]"
        >
          <div className="border-b border-white/10 px-4 py-2.5">
            <p className="truncate text-[14px] font-semibold text-white">{t.title}</p>
          </div>
          <div className="flex-1 px-4 py-3">
            <div className="rounded-lg rounded-tl-none bg-[#202c33] px-3 py-2.5 text-[14px] leading-snug text-[#e9edef] shadow-sm">
              {t.body}
              <span className="ml-1 text-[10px] text-[#8696a0]">01:42</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 border-t border-white/10 py-2 text-[13px] font-medium text-[#25d366]">
            <ExternalLink className="h-3.5 w-3.5" /> {t.button}
          </div>
        </motion.div>
      ))}

      {/* La carte CARROUSEL : la bulle d'intro + 3 mini-produits. */}
      <motion.div
        initial={reduced ? false : { opacity: 0, x: 280, rotate: 4 }}
        animate={{ opacity: 1, x: 0, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 160, damping: 22, delay: 0.55 }}
        className="flex w-[290px] shrink-0 flex-col overflow-hidden rounded-2xl border border-primary/25 bg-[#0e1626] text-left shadow-[0_20px_45px_-12px_rgba(0,0,0,0.65)]"
      >
        <div className="border-b border-white/10 px-4 py-2.5">
          <p className="truncate text-[14px] font-semibold text-white">{CAROUSEL_EXAMPLE.title}</p>
        </div>
        <div className="flex-1 space-y-2.5 px-4 py-3">
          <div className="w-fit rounded-lg rounded-tl-none bg-[#202c33] px-3 py-2 text-[14px] text-[#e9edef] shadow-sm">
            {CAROUSEL_EXAMPLE.body}
          </div>
          <div className="flex gap-2">
            {CAROUSEL_EXAMPLE.products.map((p, i) => (
              <motion.div
                key={i}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + i * 0.15, type: 'spring', stiffness: 260, damping: 20 }}
                className="w-[80px] overflow-hidden rounded-lg bg-[#202c33]"
              >
                <div className="flex h-12 items-center justify-center bg-[#2a3942] text-2xl">{p.emoji}</div>
                <p className="truncate px-1.5 pt-1 text-[11px] text-[#e9edef]">{p.name}</p>
                <p className="px-1.5 pb-1.5 text-[12px] font-bold text-[#25d366]">{p.price}</p>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5 border-t border-white/10 py-2 text-[13px] font-medium text-[#25d366]">
          <ExternalLink className="h-3.5 w-3.5" /> Voir
        </div>
      </motion.div>
    </div>
  )
}

/** Automatisations : le pipeline SE CONSTRUIT, puis un point lumineux voyage. */
function AutomationScene({ reduced }: { reduced: boolean }) {
  return (
    <div className="flex w-full max-w-2xl items-center justify-center py-2">
      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 16, delay: 0.15 }}
        className="relative flex w-[140px] flex-col items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-5 shadow-[0_0_35px_-8px] shadow-amber-400/30"
      >
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-2xl border-2 border-amber-400/50"
          animate={reduced ? undefined : { scale: [1, 1.16], opacity: [0.6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
        />
        <Zap className="h-7 w-7 text-amber-400" />
        <p className="text-center text-[13px] font-medium leading-tight text-white">Commande<br />expédiée</p>
      </motion.div>

      <ConnectorLine delay={0.6} reduced={reduced} />

      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 16, delay: 0.9 }}
        className="flex w-[125px] flex-col items-center gap-2 rounded-2xl border border-sky-400/30 bg-sky-400/10 px-3 py-5 shadow-[0_0_35px_-8px] shadow-sky-400/30"
      >
        <motion.span
          animate={reduced ? undefined : { rotate: 360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'linear', delay: 1.1 }}
        >
          <Clock className="h-7 w-7 text-sky-400" />
        </motion.span>
        <p className="text-center text-[13px] font-medium leading-tight text-white">Attend 1 h</p>
      </motion.div>

      <ConnectorLine delay={1.3} reduced={reduced} />

      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 16, delay: 1.65 }}
        className="flex w-[170px] flex-col items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-4 shadow-[0_0_35px_-8px] shadow-emerald-400/30"
      >
        <MessageSquare className="h-7 w-7 text-emerald-400" />
        <div className="rounded-lg bg-[#005c4b] px-2.5 py-1.5 text-[12px] leading-tight text-white shadow-sm">
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
    <div className="relative h-px w-10 shrink-0 sm:w-16">
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
