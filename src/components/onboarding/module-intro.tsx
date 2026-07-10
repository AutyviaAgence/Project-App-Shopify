'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Bot, Clock, FileText, MessageSquare, Sparkles, Workflow, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Écran d'introduction ANIMÉ affiché avant les étapes agent / modèles /
 * automatisations : une mini-scène qui montre ce que FAIT le module (plutôt
 * qu'un paragraphe), un titre, deux lignes d'explication, « C'est parti ».
 * Affiché une fois par module (état de session côté parent).
 */

const COPY: Record<IntroModule, { icon: React.ComponentType<{ className?: string }>; title: string; lines: string }> = {
  agent: {
    icon: Bot,
    title: 'C’est quoi, un agent IA ?',
    lines:
      'Votre conseiller de vente et SAV, disponible 24h/24 sur WhatsApp : il lit la question du client et répond avec les infos de VOTRE boutique (produits, commandes, politiques).',
  },
  templates: {
    icon: FileText,
    title: 'C’est quoi, un modèle de message ?',
    lines:
      'Un message pré-écrit et validé par WhatsApp, avec des variables remplies automatiquement pour chaque client : {{prénom}} devient Marie, {{commande}} devient #1024.',
  },
  automations: {
    icon: Workflow,
    title: 'C’est quoi, une automatisation ?',
    lines:
      'Elle envoie le bon modèle au bon moment, toute seule : un événement se produit (commande expédiée), un délai s’écoule, le message part. Vous n’avez rien à faire.',
  },
}

export type IntroModule = 'agent' | 'templates' | 'automations'

export function ModuleIntro({ module, onStart }: { module: IntroModule; onStart: () => void }) {
  const meta = COPY[module]
  const Icon = meta.icon
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      {/* Pastille du module, avec anneau qui pulse. */}
      <div className="relative">
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-2xl border-2 border-primary/40"
          animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
        <motion.span
          initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 16 }}
          className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-[0_0_30px_-6px] shadow-primary/50"
        >
          <Icon className="h-7 w-7" />
        </motion.span>
      </div>

      {/* La mini-scène animée du module. */}
      <div className="flex h-36 w-full max-w-md items-center justify-center">
        {module === 'agent' && <AgentScene />}
        {module === 'templates' && <TemplateScene />}
        {module === 'automations' && <AutomationScene />}
      </div>

      <div className="max-w-lg space-y-2">
        <motion.h2
          initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.15, duration: 0.45 }}
          className="text-xl font-bold tracking-tight text-white sm:text-2xl"
        >
          {meta.title}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.45 }}
          className="text-sm leading-relaxed text-muted-foreground"
        >
          {meta.lines}
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 240, damping: 22 }}
      >
        <Button size="lg" onClick={onStart} className="group h-11 px-8">
          C’est parti
          <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </motion.div>
    </div>
  )
}

/** Agent : question client → l'IA « réfléchit » → réponse, en boucle. */
function AgentScene() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <motion.div
        initial={{ opacity: 0, x: -18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 22 }}
        className="max-w-[75%] self-start rounded-xl rounded-tl-sm bg-white/10 px-3 py-2 text-left text-[13px] text-white/90"
      >
        Vous avez ma taille en 42 ?
      </motion.div>
      {/* L'IA « réfléchit » puis répond (boucle discrète sur les points). */}
      <motion.div
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.1, type: 'spring', stiffness: 260, damping: 22 }}
        className="flex max-w-[80%] items-start gap-2 self-end"
      >
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="rounded-xl rounded-tr-sm bg-primary/20 px-3 py-2 text-left text-[13px] text-white">
          Oui ! Il reste 3 paires en 42. Je vous envoie le lien ?
        </div>
      </motion.div>
    </div>
  )
}

/** Modèles : les variables {{…}} se transforment en vraies valeurs. */
function TemplateScene() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-[13px] leading-relaxed text-white/85">
      Bonjour <MorphVar from="{{prénom}}" to="Marie" delay={0.9} />, votre commande{' '}
      <MorphVar from="{{commande}}" to="#1024" delay={1.5} /> vient d’être expédiée 🚚
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.4 }}
        className="mt-2 text-[11px] text-primary"
      >
        ✓ Rempli automatiquement pour chaque client
      </motion.p>
    </div>
  )
}

/** Une variable qui se retourne en vraie valeur. */
function MorphVar({ from, to, delay }: { from: string; to: string; delay: number }) {
  return (
    <span className="relative inline-block align-baseline">
      <motion.span
        initial={{ opacity: 1 }}
        animate={{ opacity: 0, y: -8 }}
        transition={{ delay, duration: 0.3 }}
        className="rounded bg-white/10 px-1 font-mono text-[12px] text-sky-300"
      >
        {from}
      </motion.span>
      <motion.span
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay + 0.15, type: 'spring', stiffness: 300, damping: 20 }}
        className="absolute inset-0 flex items-center justify-center rounded bg-primary/20 px-1 font-semibold text-primary"
      >
        {to}
      </motion.span>
    </span>
  )
}

/** Automatisations : événement → délai → message, un point voyage le long du fil. */
function AutomationScene() {
  const NODES = [
    { icon: Zap, label: 'Commande expédiée', color: 'text-amber-400', delay: 0.2 },
    { icon: Clock, label: 'Attend 1 h', color: 'text-sky-400', delay: 0.8 },
    { icon: MessageSquare, label: 'Message envoyé ✓✓', color: 'text-emerald-400', delay: 1.4 },
  ]
  return (
    <div className="flex w-full max-w-md items-center justify-center gap-1">
      {NODES.map((n, i) => (
        <div key={i} className="flex items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: n.delay, type: 'spring', stiffness: 280, damping: 18 }}
            className="flex w-[104px] flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-3"
          >
            <n.icon className={`h-5 w-5 ${n.color}`} />
            <p className="text-center text-[11px] leading-tight text-white/75">{n.label}</p>
          </motion.div>
          {i < NODES.length - 1 && (
            <div className="relative h-px w-8 bg-white/15">
              {/* Point qui voyage le long du fil, en boucle. */}
              <motion.span
                className="absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-primary shadow-[0_0_8px_2px] shadow-primary/60"
                animate={{ left: ['-10%', '95%'], opacity: [0, 1, 0] }}
                transition={{ duration: 1.1, repeat: Infinity, delay: n.delay + 0.5, repeatDelay: 1.2, ease: 'easeInOut' }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
