'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Bot, Flame, MoreVertical, Phone, ShoppingBag, Sparkles, Star, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import IPhoneMockup from '@/components/ui/iphone-mockup'

/**
 * Écran de bienvenue CINÉMATIQUE, joué une seule fois à l'arrivée dans
 * l'onboarding. Une scène qui se DÉROULE seule (timeline `phase`), pensée pour
 * tenir sur UN écran sans scroll : le téléphone est mis à l'échelle de la
 * hauteur du viewport (responsive), le titre + bouton sont DANS le flux sous
 * le téléphone (placement v1), avec une hauteur réservée pour éviter tout saut.
 *
 *   0  fond bleu nuit qui s'allume
 *   1  « XEYO.IO » se révèle net, blanc clair, au centre
 *   2  il monte et devient fantôme ; le téléphone se révèle
 *   3  cartes flottantes latérales (entrée + flottement continu)
 *   4  la conversation WhatsApp se tape seule (« … » puis message)
 *   5  titre + bouton — SANS attendre la fin de la conversation, qui continue
 *      de vivre derrière (l'utilisateur peut cliquer tôt)
 *
 * `prefers-reduced-motion` : saut direct à l'état final, sans mouvement.
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
  { side: 'left' as const, icon: ShoppingBag, title: 'Commande suivie', sub: 'Réponse en 2 s', color: 'text-sky-400', top: '26%' },
  { side: 'right' as const, icon: Flame, title: '+38 % de ventes', sub: 'Paniers relancés', color: 'text-orange-400', top: '30%' },
  { side: 'left' as const, icon: Bot, title: 'Agent IA actif', sub: '24 h/24', color: 'text-violet-400', top: '52%' },
  { side: 'right' as const, icon: Star, title: '4,9 / 5', sub: 'Clients satisfaits', color: 'text-amber-400', top: '56%' },
]

const TYPING_MS = 750
const READ_MS = 850

// Dimensions nominales du mockup 15-pro (écran + bezels), pour le calcul du scale.
// ⚠️ IPhoneMockup scale via `transform` : sa BOÎTE DE LAYOUT reste 417×876 quelle
// que soit l'échelle — il faut donc réserver soi-même les dimensions réelles.
const PHONE_NOM_W = 417
const PHONE_NOM_H = 876

export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState(reduced ? 5 : 0)
  const [msgs, setMsgs] = useState(reduced ? CHAT.length : 0)
  const [typing, setTyping] = useState<null | 'them' | 'ai'>(null)

  // Scale RESPONSIVE, borné par la hauteur ET la largeur du viewport :
  //  - hauteur : viewport moins le bloc titre réservé (~166px) et le souffle ;
  //  - largeur : le téléphone (417px nominal) doit tenir avec 32px de marge.
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
      // Titre + bouton TÔT (pendant que la conversation continue) : cliquable vite.
      setTimeout(() => setPhase(5), 4600),
    ]
    return () => timers.forEach(clearTimeout)
  }, [reduced])

  // Phase 4 : « … » puis message, un à un ; le carrousel suit sans « … ».
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
    return () => timers.forEach(clearTimeout)
  }, [phase, reduced])

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

      {/* « XEYO.IO » : net et centré (phase 1) → monte + fantôme (phase ≥ 2),
          transition longue et douce. */}
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

      {/* Cartes flottantes latérales (phase 3) : entrée + flottement continu. */}
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

      {/* ── Composition centrale : téléphone + (dessous) titre + bouton.
          Les hauteurs sont RÉSERVÉES dès le départ (placement v1, zéro saut,
          zéro scroll) ; seuls l'opacité/le mouvement changent. ── */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Le mockup scale via transform (origin top center) : sa boîte de layout
            reste 417×876. On réserve ses dimensions RÉELLES (scalées) pour que le
            centrage et le titre en dessous soient exacts. */}
        <div style={{ height: phoneH, width: phoneW }} className="flex items-start justify-center">
          <AnimatePresence>
            {showPhone && (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 110, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 110, damping: 20 }}
              >
                <WhatsAppPhone visibleCount={msgs} typing={typing} scale={scale} reduced={!!reduced} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Titre + bouton : hauteur réservée (min-h), apparition en phase 5. */}
        <div className="mt-4 flex min-h-[150px] flex-col items-center justify-start">
          <AnimatePresence>
            {phase >= 5 && (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                className="flex flex-col items-center"
              >
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
                  <Sparkles className="h-3.5 w-3.5" /> Bienvenue sur Xeyo
                </p>
                <h2 className="mt-2 max-w-xl text-lg font-bold tracking-tight text-white sm:text-xl">
                  Une IA qui répond, conseille et vend sur WhatsApp — à partir de votre boutique.
                </h2>
                <Button
                  size="lg"
                  onClick={onStart}
                  className="group mt-4 h-11 bg-white px-8 text-base text-black shadow-lg shadow-black/30 hover:bg-white/90"
                >
                  Configurer mon agent
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

/** Téléphone WhatsApp fidèle : IPhoneMockup + vrai fond + chrome WhatsApp. */
function WhatsAppPhone({
  visibleCount,
  typing,
  scale,
  reduced,
}: {
  visibleCount: number
  typing: null | 'them' | 'ai'
  scale: number
  reduced: boolean
}) {
  const shown = CHAT.slice(0, visibleCount)
  return (
    <IPhoneMockup model="15-pro" color="#3a4a63" scale={scale} screenBg="#0b141a" glass>
      <div className="flex h-full flex-col">
        {/* En-tête WhatsApp : avatar, nom, « en ligne », icônes appel. */}
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

        {/* Conversation : bulles empilées depuis le BAS (comme la vraie app).
            `max-w` généreux + marges latérales symétriques : les bulles gauche/
            droite restent PROCHES du centre, pas collées aux bords opposés. */}
        <div
          className="flex flex-1 flex-col justify-end gap-2 overflow-hidden px-4 py-3"
          style={{ backgroundImage: 'url(/whatsapp-bg.webp)', backgroundSize: 'cover' }}
        >
          <AnimatePresence initial={false}>
            {shown.map((m, i) => (
              <motion.div
                key={i}
                initial={reduced ? false : { opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                className={m.kind === 'ai' ? 'flex justify-end pl-8' : m.kind === 'them' ? 'flex justify-start pr-8' : ''}
              >
                {m.kind === 'carousel' ? (
                  <ProductCarousel />
                ) : (
                  <div
                    className={`relative rounded-lg px-3 py-2 text-left text-[15px] leading-snug shadow-sm ${
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
