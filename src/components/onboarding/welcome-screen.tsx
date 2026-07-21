'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Bot, Camera, Contact, ExternalLink, Flame, MoreVertical,
  Paperclip, ShoppingBag, Smile, Sparkles, Star,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n/context'
import { Checkbox } from '@/components/ui/checkbox'
import IPhoneMockup from '@/components/ui/iphone-mockup'

/**
 * Écran de bienvenue CINÉMATIQUE, joué une seule fois à l'arrivée dans
 * l'onboarding. Scène auto-déroulante (timeline `phase`), une page sans scroll.
 *
 *   0  fond bleu nuit qui s'allume
 *   1  « XEYO.IO » se révèle net, blanc clair, au centre
 *   2  il monte et devient fantôme ; le téléphone se révèle
 *   3  cartes flottantes ancrées au téléphone (entrée + flottement continu)
 *   4  la conversation WhatsApp se tape seule et BOUCLE sur plusieurs
 *      scénarios (vente conseillée, suivi de commande, relance panier) :
 *      « … » puis message, le fil DÉFILE (animation layout), puis fondu et
 *      scénario suivant — l'écran vit tant qu'on n'a pas cliqué
 *   5  titre + bouton (tôt — la conversation continue derrière)
 *
 * WhatsApp = MODE SOMBRE Android répliqué d'une vraie capture : en-tête
 * #111b21, fond doodle sombre, client à DROITE en #005c4b (✓✓ bleus), agent à
 * GAUCHE en #202c33, boutons d'action verts #25d366, saisie #1f2c34 + micro
 * #00a884.
 *
 * `prefers-reduced-motion` : saut direct à l'état final, sans mouvement.
 */

type Bubble =
  | { kind: 'them'; text: string }
  | { kind: 'ai'; text: string; button?: string }
  | { kind: 'carousel' }

// Les scénarios joués en boucle. Chacun montre une facette du produit.
type TFn = (key: string, params?: Record<string, string | number>) => string

// Les scénarios joués en boucle, dans la langue du MARCHAND : c'est une démo
// d'interface, pas un message réellement envoyé à un client.
const scenarios = (t: TFn): Bubble[][] => [
  [
    { kind: 'them', text: t('welcome_screen.s1_1') },
    { kind: 'ai', text: t('welcome_screen.s1_2') },
    { kind: 'carousel' },
    { kind: 'them', text: t('welcome_screen.s1_3') },
    { kind: 'ai', text: t('welcome_screen.s1_4'), button: t('welcome_screen.s1_btn') },
  ],
  [
    { kind: 'them', text: t('welcome_screen.s2_1') },
    { kind: 'ai', text: t('welcome_screen.s2_2'), button: t('welcome_screen.s2_btn') },
    { kind: 'them', text: t('welcome_screen.s2_3') },
    { kind: 'ai', text: t('welcome_screen.s2_4') },
  ],
  [
    { kind: 'ai', text: t('welcome_screen.s3_1') },
    { kind: 'ai', text: t('welcome_screen.s3_2'), button: t('welcome_screen.s3_btn') },
    { kind: 'them', text: t('welcome_screen.s3_3') },
  ],
]

const products = (t: TFn) => [
  { name: t('welcome_screen.p1_name'), price: '24 €', emoji: '🕯️' },
  { name: t('welcome_screen.p2_name'), price: '39 €', emoji: '🍵' },
  { name: t('welcome_screen.p3_name'), price: '29 €', emoji: '📓' },
]

// Cartes flottantes ANCRÉES AU TÉLÉPHONE (right/left:100% du mockup).
const floaters = (t: TFn) => [
  { side: 'left' as const, icon: ShoppingBag, title: t('welcome_screen.floater_order_title'), sub: t('welcome_screen.floater_order_sub'), color: 'text-sky-400', top: '14%' },
  { side: 'right' as const, icon: Flame, title: t('welcome_screen.floater_sales_title'), sub: t('welcome_screen.floater_sales_sub'), color: 'text-orange-400', top: '24%' },
  { side: 'left' as const, icon: Bot, title: t('welcome_screen.floater_agent_title'), sub: t('welcome_screen.floater_agent_sub'), color: 'text-violet-400', top: '56%' },
  { side: 'right' as const, icon: Star, title: t('welcome_screen.floater_rating_title'), sub: t('welcome_screen.floater_rating_sub'), color: 'text-amber-400', top: '66%' },
]

// Rythme des bulles : rapide (retour utilisateur — la conversation traînait).
const TYPING_MS = 420
const READ_MS = 520
// Pause à la fin d'un scénario avant le fondu, puis délai avant le suivant.
const SCENARIO_HOLD_MS = 2600
const SCENARIO_FADE_MS = 550

// Dimensions nominales du mockup 15-pro (écran + bezels), pour le calcul du scale.
// ⚠️ IPhoneMockup scale via `transform` : sa BOÎTE DE LAYOUT reste 417×876 quelle
// que soit l'échelle — il faut donc réserver soi-même les dimensions réelles.
const PHONE_NOM_W = 417
const PHONE_NOM_H = 876

export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation()
  const SCENARIOS = scenarios(t)
  const FLOATERS = floaters(t)
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState(reduced ? 5 : 0)
  // Acceptation CGU + politique de confidentialité + traitement IA des messages.
  // Elle vivait sur la page d'inscription : on l'a déplacée ICI pour alléger le
  // formulaire de création de compte (email + mot de passe seulement). Le
  // consentement reste OBLIGATOIRE — c'est la base légale RGPD et l'opposabilité
  // des CGU — il est simplement recueilli au premier écran du produit, avant
  // toute configuration de l'agent.
  const [accepted, setAccepted] = useState(false)
  // Scénario courant + nombre de bulles visibles + « qui écrit ».
  const [scen, setScen] = useState(0)
  const [msgs, setMsgs] = useState(reduced ? SCENARIOS[0].length : 0)
  const [typing, setTyping] = useState<null | 'them' | 'ai'>(null)

  // Scale RESPONSIVE, borné par la hauteur ET la largeur du viewport.
  const [scale, setScale] = useState(0.62)
  useEffect(() => {
    const compute = () => {
      const byH = (window.innerHeight - 230) / PHONE_NOM_H
      const byW = (window.innerWidth - 32) / PHONE_NOM_W
      setScale(Math.min(0.68, Math.max(0.42, Math.min(byH, byW))))
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])

  useEffect(() => {
    if (reduced) return
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1900),
      setTimeout(() => setPhase(3), 2700),
      setTimeout(() => setPhase(4), 3200),
      setTimeout(() => setPhase(5), 4600),
    ]
    return () => timers.forEach(clearTimeout)
  }, [reduced])

  // Phase 4 : joue le scénario courant (« … » puis message, un à un ; le
  // carrousel suit sans « … »), puis pause, fondu (msgs=0 → exit des bulles)
  // et passe au scénario suivant — en boucle.
  useEffect(() => {
    if (reduced || phase < 4) return
    const chat = SCENARIOS[scen]
    const timers: ReturnType<typeof setTimeout>[] = []
    let t = 0
    chat.forEach((b, i) => {
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
    // Fin du scénario : on laisse lire, on vide (exit animé), on enchaîne.
    timers.push(setTimeout(() => setMsgs(0), t + SCENARIO_HOLD_MS))
    timers.push(setTimeout(() => setScen((s) => (s + 1) % SCENARIOS.length), t + SCENARIO_HOLD_MS + SCENARIO_FADE_MS))
    return () => timers.forEach(clearTimeout)
  }, [phase, scen, reduced])

  const showPhone = phase >= 2
  const phoneH = Math.round(PHONE_NOM_H * scale)
  const phoneW = Math.round(PHONE_NOM_W * scale)

  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#0a0f1e] px-6 text-center">
      {/* Fond : dégradé bleu nuit + grille. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        style={{ background: 'radial-gradient(60% 55% at 50% 42%, #16264d 0%, #0b1122 55%, #060912 100%)' }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: 'linear-gradient(#4d6bff 1px, transparent 1px), linear-gradient(90deg, #4d6bff 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(70% 60% at 50% 45%, black, transparent)',
        }}
      />

      {/* « XEYO.IO » : net et centré (phase 1) → monte + fantôme (phase ≥ 2). */}
      <motion.h1
        aria-hidden
        initial={reduced ? false : { opacity: 0, scale: 1.12, filter: 'blur(18px)', y: '-50%' }}
        animate={
          phase >= 2
            ? { opacity: 0.08, scale: 1, filter: 'blur(0px)', y: '-150%' }
            : phase >= 1
              ? { opacity: 0.96, scale: 1, filter: 'blur(0px)', y: '-50%' }
              : {}
        }
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute top-1/2 select-none bg-gradient-to-b from-white to-white/60 bg-clip-text text-[17vw] font-black leading-none tracking-tighter text-transparent md:text-[12rem]"
      >
        XEYO.IO
      </motion.h1>

      {/* ── Composition centrale : téléphone (+ cartes ancrées) + titre. ── */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Boîte aux dimensions RÉELLES du téléphone (le mockup scale via
            transform) ; sert aussi d'ANCRE aux cartes flottantes.
            `pointer-events-none` : la boîte de layout du mockup (876px, non
            scalée) DÉBORDE sous la zone réservée et recouvrait le bouton —
            tout ici est décoratif, on ne capte aucun clic. */}
        <div style={{ height: phoneH, width: phoneW }} className="pointer-events-none relative flex items-start justify-center">
          <AnimatePresence>
            {showPhone && (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 110, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 110, damping: 20 }}
              >
                <WhatsAppPhone
                  bubbles={SCENARIOS[scen].slice(0, msgs)}
                  scenKey={scen}
                  typing={typing}
                  scale={scale}
                  reduced={!!reduced}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Cartes flottantes COLLÉES au téléphone (phase 3). */}
          <div className="pointer-events-none absolute inset-0 hidden md:block">
            {FLOATERS.map((f, i) => (
              <motion.div
                key={i}
                initial={reduced ? false : { opacity: 0, x: f.side === 'left' ? -40 : 40 }}
                animate={phase >= 3 ? { opacity: 1, x: 0, y: reduced ? 0 : [0, -9, 0] } : {}}
                transition={{
                  opacity: { duration: 0.5, delay: 0.08 * i },
                  x: { type: 'spring', stiffness: 200, damping: 22, delay: 0.08 * i },
                  y: { duration: 4 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: 0.3 * i },
                }}
                className="absolute flex items-center gap-3 whitespace-nowrap rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-2xl backdrop-blur-md"
                style={
                  f.side === 'left'
                    ? { top: f.top, right: '100%', marginRight: 28 }
                    : { top: f.top, left: '100%', marginLeft: 28 }
                }
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
        </div>

        {/* Titre + bouton : hauteur réservée, apparition en phase 5.
            `relative z-20` : toujours AU-DESSUS du débord (invisible) du mockup. */}
        <div className="relative z-20 mt-4 flex min-h-[220px] flex-col items-center justify-start">
          <AnimatePresence>
            {phase >= 5 && (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                className="flex flex-col items-center"
              >
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
                  <Sparkles className="h-3.5 w-3.5" /> {t('welcome_screen.eyebrow')}
                </p>
                <h2 className="mt-2 max-w-xl text-lg font-bold tracking-tight text-white sm:text-xl">
                  {t('welcome_screen.headline')}
                </h2>

                {/* Consentement légal : sobre, lisible, mais pas envahissant. */}
                <div className="mt-4 flex max-w-lg items-start gap-2.5 text-left">
                  <Checkbox
                    id="onboarding-terms"
                    checked={accepted}
                    onCheckedChange={(checked) => setAccepted(checked === true)}
                    className="mt-0.5 border-white/30 bg-white/5 data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-black"
                  />
                  <label
                    htmlFor="onboarding-terms"
                    className="cursor-pointer text-[12px] leading-snug text-white/50"
                  >
                    {t('welcome_screen.consent')}{' '}
                    <Link href="/cgu" target="_blank" className="text-white/80 underline underline-offset-2 hover:text-white">
                      {t('welcome_screen.terms_link')}
                    </Link>{' '}
                    &amp;{' '}
                    <Link href="/privacy" target="_blank" className="text-white/80 underline underline-offset-2 hover:text-white">
                      {t('welcome_screen.privacy_link')}
                    </Link>
                  </label>
                </div>

                <Button
                  size="lg"
                  onClick={() => {
                    // ⚠️ PERSISTER l'acceptation, pas seulement débloquer le bouton.
                    // Une case cochée qui ne laisse aucune trace en base ne vaut rien
                    // en cas de contrôle RGPD — ni face à la question Shopify « avez-vous
                    // conclu des accords de confidentialité avec vos marchands ? ».
                    // Non-awaité : l'onboarding ne doit pas attendre le réseau. Un échec
                    // est loggué mais ne bloque pas le marchand (il a bien consenti).
                    fetch('/api/account/accept-terms', { method: 'POST' })
                      .catch((e) => console.error('[welcome] acceptation des CGU non enregistrée:', e))
                    onStart()
                  }}
                  disabled={!accepted}
                  className="group mt-4 h-11 bg-white px-8 text-base text-black shadow-lg shadow-black/30 hover:bg-white/90 disabled:opacity-40"
                >
                  {t('welcome_screen.cta')}
                  <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/** WhatsApp Android MODE SOMBRE, répliqué depuis une vraie capture. */
function WhatsAppPhone({
  bubbles,
  scenKey,
  typing,
  scale,
  reduced,
}: {
  bubbles: Bubble[]
  scenKey: number
  typing: null | 'them' | 'ai'
  scale: number
  reduced: boolean
}) {
  return (
    <IPhoneMockup model="15-pro" color="#3a4a63" scale={scale} screenBg="#0b141a" glass>
      <div className="flex h-full flex-col bg-[#0b141a]">
        {/* En-tête sombre : ← retour, avatar mascotte, nom, contact, ⋮. */}
        <div className="flex items-center gap-2 bg-[#111b21] px-2.5 pb-2.5 pt-12 text-white">
          <ArrowLeft className="h-5 w-5 shrink-0 text-[#e9edef]" />
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-400">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascots/peeking.png" alt="" className="mt-2 h-9 w-9 object-contain" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-[17px] font-medium leading-tight text-[#e9edef]">Xeyo · Assistant</p>
            <p className="text-[12px] leading-tight text-[#8696a0]">en ligne</p>
          </div>
          <Contact className="h-[22px] w-[22px] shrink-0 text-[#aebac1]" />
          <MoreVertical className="h-[22px] w-[22px] shrink-0 text-[#aebac1]" />
        </div>

        {/* Conversation : fond doodle SOMBRE, bulles empilées depuis le bas.
            `layout` : quand une bulle arrive, les précédentes GLISSENT vers le
            haut (défilement fluide) au lieu de sauter. Clés préfixées par le
            scénario pour que le changement de scénario déclenche les exits. */}
        <div
          className="flex flex-1 flex-col justify-end gap-1.5 overflow-hidden px-3 py-3"
          style={{ backgroundImage: 'url(/whatsapp-bg-dark.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {bubbles.map((m, i) => (
              <motion.div
                key={`${scenKey}-${i}`}
                layout
                initial={reduced ? false : { opacity: 0, y: 14, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, transition: { duration: 0.35 } }}
                transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                className={m.kind === 'them' ? 'flex justify-end pl-8' : m.kind === 'ai' ? 'flex justify-start pr-8' : ''}
              >
                {m.kind === 'carousel' ? (
                  <ProductCarousel />
                ) : (
                  <div
                    className={`overflow-hidden rounded-lg text-left shadow-md ${
                      m.kind === 'them' ? 'rounded-tr-none bg-[#005c4b]' : 'rounded-tl-none bg-[#202c33]'
                    }`}
                  >
                    <div className="px-3 pb-1.5 pt-2 text-[19px] leading-snug text-[#e9edef]">
                      {m.text}
                      <span className="ml-2 inline-flex translate-y-[3px] items-center gap-0.5 whitespace-nowrap text-[12px] text-[#8696a0]">
                        12:0{i}
                        {m.kind === 'them' && <span className="text-[#53bdeb]">✓✓</span>}
                      </span>
                    </div>
                    {/* Bouton d'action façon template WhatsApp : filet + texte vert. */}
                    {m.kind === 'ai' && m.button && (
                      <div className="flex items-center justify-center gap-1.5 border-t border-white/10 py-2 text-[16px] font-medium text-[#25d366]">
                        <ExternalLink className="h-4 w-4" /> {m.button}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}

            {/* Bulle « … » de saisie. « them » = client (droite, vert). */}
            {typing && (
              <motion.div
                key={`typing-${scenKey}`}
                layout
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                className={typing === 'them' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div className={`flex gap-1 rounded-lg px-3 py-2.5 shadow-md ${typing === 'them' ? 'rounded-tr-none bg-[#005c4b]' : 'rounded-tl-none bg-[#202c33]'}`}>
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="h-2 w-2 rounded-full bg-[#8696a0]"
                      animate={reduced ? undefined : { opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                      transition={reduced ? undefined : { duration: 0.9, repeat: Infinity, delay: d * 0.15 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Barre de saisie sombre : emoji, Message, trombone, caméra + micro vert. */}
        <div className="flex items-center gap-2 bg-[#0b141a] px-2.5 pb-3 pt-1.5">
          <div className="flex h-11 flex-1 items-center gap-2.5 rounded-full bg-[#1f2c34] px-3">
            <Smile className="h-[22px] w-[22px] shrink-0 text-[#8696a0]" />
            <span className="flex-1 text-left text-[15px] text-[#8696a0]">Message</span>
            <Paperclip className="h-5 w-5 shrink-0 rotate-45 text-[#8696a0]" />
            <Camera className="h-[22px] w-[22px] shrink-0 text-[#8696a0]" />
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" /></svg>
          </div>
        </div>
      </div>
    </IPhoneMockup>
  )
}

/** Carrousel de produits en mode sombre (cartes #1f2c34, prix et CTA verts). */
function ProductCarousel() {
  const { t } = useTranslation()
  const PRODUCTS = products(t)
  return (
    <div className="-mx-1 flex w-full gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {PRODUCTS.map((p, i) => (
        <div key={i} className="flex w-[128px] shrink-0 flex-col overflow-hidden rounded-lg bg-[#1f2c34] shadow-md">
          <div className="flex h-[84px] items-center justify-center bg-[#2a3942] text-4xl">{p.emoji}</div>
          <div className="px-2.5 pb-0 pt-2 text-left">
            <p className="truncate text-[15px] font-medium text-[#e9edef]">{p.name}</p>
            <p className="text-[16px] font-bold text-[#25d366]">{p.price}</p>
          </div>
          <div className="mt-1.5 flex items-center justify-center gap-1 border-t border-white/10 py-1.5 text-[14px] font-medium text-[#25d366]">
            <ExternalLink className="h-3.5 w-3.5" /> Voir
          </div>
        </div>
      ))}
    </div>
  )
}
