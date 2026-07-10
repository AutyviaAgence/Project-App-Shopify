'use client'

import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import { Check, Loader2, Pencil, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Sélection des modèles façon « Tinder », PAR GROUPE (Commande, Contact,
 * Conversation, Planifié…) — 15 cartes une à une, c'était trop. Chaque carte
 * est un groupe : swipe À DROITE pour garder, À GAUCHE pour écarter tout le
 * groupe. À l'intérieur, chaque modèle a sa case (affinage individuel) et son
 * crayon (édition du texte à même la carte). Tampons GARDER/ÉCARTER révélés
 * pendant le drag, boutons ✗/✓, retour arrière, puis récapitulatif + validation.
 *
 * Les aperçus substituent les valeurs d'exemple ({{1}} → « Marie »…) ;
 * l'édition travaille sur le texte brut (variables apparentes).
 */

export type SwipeItem = {
  trigger: string
  label: string
  category: string
  header_text: string | null
  body_text: string
  sample_values: string[]
  variable_keys: string[]
}

export type SwipeGroup = { key: string; title: string; items: SwipeItem[] }

const SWIPE_THRESHOLD = 110

function fillSamples(body: string, samples: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n) => samples[Number(n) - 1] || m)
}

// Variants de la carte : la sortie part du côté du swipe (custom = direction).
const cardVariants = {
  enter: { scale: 0.95, y: 14, opacity: 0 },
  center: { scale: 1, y: 0, x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * 520, rotate: dir * 20, opacity: 0, transition: { duration: 0.3, ease: 'easeIn' as const } }),
}

export function TemplateSwiper({
  groups,
  selected,
  editedBodies,
  onDecide,
  onEditBody,
  onValidate,
  busy,
}: {
  groups: SwipeGroup[]
  selected: Set<string>
  editedBodies: Record<string, string>
  onDecide: (trigger: string, keep: boolean) => void
  onEditBody: (trigger: string, body: string) => void
  onValidate: () => void
  busy: boolean
}) {
  const [index, setIndex] = useState(0)
  const [lastDir, setLastDir] = useState(1)
  // Modèles décochés DANS la carte courante (exclus même si le groupe est gardé).
  const [rowOff, setRowOff] = useState<Set<string>>(new Set())
  // Modèle en cours d'édition (drag désactivé pendant la frappe).
  const [editing, setEditing] = useState<string | null>(null)

  const x = useMotionValue(0)
  const rotate = useTransform(x, [-260, 260], [-14, 14])
  const likeOpacity = useTransform(x, [40, SWIPE_THRESHOLD], [0, 1])
  const nopeOpacity = useTransform(x, [-SWIPE_THRESHOLD, -40], [1, 0])

  const done = index >= groups.length
  const current = groups[index]
  const totalTemplates = groups.reduce((n, g) => n + g.items.length, 0)
  const keptCount = selected.size

  function decide(keep: boolean) {
    if (!current || busy) return
    current.items.forEach((it) => onDecide(it.trigger, keep && !rowOff.has(it.trigger)))
    setLastDir(keep ? 1 : -1)
    setRowOff(new Set())
    setEditing(null)
    x.set(0)
    setIndex((i) => i + 1)
  }

  function undo() {
    if (index === 0 || busy) return
    setRowOff(new Set())
    setEditing(null)
    x.set(0)
    setIndex((i) => i - 1)
  }

  function keepAllRemaining() {
    for (let g = index; g < groups.length; g++) {
      groups[g].items.forEach((it) => onDecide(it.trigger, g === index ? !rowOff.has(it.trigger) : true))
    }
    setLastDir(1)
    setRowOff(new Set())
    setEditing(null)
    x.set(0)
    setIndex(groups.length)
  }

  // ── Récapitulatif final ──────────────────────────────────────────────
  if (done) {
    const dropped = totalTemplates - keptCount
    return (
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-sky-500 shadow-[0_10px_30px_-6px] shadow-primary/50">
          <Check className="h-7 w-7 text-white" strokeWidth={3} />
        </span>
        <div>
          <p className="text-lg font-bold text-white">
            {keptCount} modèle{keptCount > 1 ? 's' : ''} gardé{keptCount > 1 ? 's' : ''}
          </p>
          {dropped > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {dropped} écarté{dropped > 1 ? 's' : ''} — récupérables plus tard depuis le dashboard
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setIndex(0)}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Revoir
          </Button>
          <Button disabled={busy || keptCount === 0} onClick={onValidate}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
            Valider ces modèles
          </Button>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Progression par groupe */}
      <div className="flex w-full max-w-lg items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-sky-400"
            animate={{ width: `${(index / groups.length) * 100}%` }}
            transition={{ type: 'spring', stiffness: 160, damping: 24 }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          Groupe {index + 1} / {groups.length}
        </span>
      </div>

      {/* Pile de cartes */}
      <div className="relative h-[400px] w-full max-w-lg select-none">
        {groups.slice(index + 1, index + 3).map((g, i) => (
          <div
            key={g.key}
            className="absolute inset-0 rounded-2xl border border-white/10 bg-[#0e1626]"
            style={{ transform: `translateY(${(i + 1) * 10}px) scale(${1 - (i + 1) * 0.04})`, zIndex: 2 - i, opacity: 0.7 - i * 0.25 }}
          />
        ))}

        <AnimatePresence initial={false} custom={lastDir}>
          <motion.div
            key={current.key}
            custom={lastDir}
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0 z-10 flex cursor-grab flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0e1626] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] active:cursor-grabbing"
            style={{ x, rotate }}
            drag={editing ? false : 'x'}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.9}
            onDragEnd={(_, info) => {
              if (info.offset.x > SWIPE_THRESHOLD) decide(true)
              else if (info.offset.x < -SWIPE_THRESHOLD) decide(false)
            }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            {/* Tampons GARDER / ÉCARTER révélés par le drag */}
            <motion.span
              style={{ opacity: likeOpacity }}
              className="pointer-events-none absolute left-4 top-4 z-20 -rotate-12 rounded-lg border-4 border-emerald-400 px-3 py-1 text-xl font-black tracking-widest text-emerald-400"
            >
              GARDER
            </motion.span>
            <motion.span
              style={{ opacity: nopeOpacity }}
              className="pointer-events-none absolute right-4 top-4 z-20 rotate-12 rounded-lg border-4 border-red-400 px-3 py-1 text-xl font-black tracking-widest text-red-400"
            >
              ÉCARTER
            </motion.span>

            {/* En-tête du groupe */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <p className="truncate text-[15px] font-semibold text-white">{current.title}</p>
              <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/70">
                {current.items.length} modèle{current.items.length > 1 ? 's' : ''}
              </span>
            </div>

            {/* Les modèles du groupe : case (affinage) + aperçu + crayon (édition). */}
            <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {current.items.map((it) => {
                const isEditing = editing === it.trigger
                const off = rowOff.has(it.trigger)
                const body = editedBodies[it.trigger] ?? it.body_text
                return (
                  <div
                    key={it.trigger}
                    className={cn(
                      'rounded-xl border transition-colors',
                      off ? 'border-white/5 opacity-45' : 'border-white/10 bg-white/[0.03]',
                    )}
                  >
                    <div className="flex items-center gap-2.5 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={!off}
                        className="h-4 w-4 shrink-0 accent-primary"
                        onChange={() =>
                          setRowOff((prev) => {
                            const s = new Set(prev)
                            if (s.has(it.trigger)) s.delete(it.trigger)
                            else s.add(it.trigger)
                            return s
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-white">{it.label}</p>
                        {!isEditing && (
                          <p className="truncate text-xs text-muted-foreground">
                            {fillSamples(body, it.sample_values).slice(0, 80)}…
                          </p>
                        )}
                      </div>
                      <span className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                        it.category === 'UTILITY' ? 'bg-sky-500/15 text-sky-400' : 'bg-violet-500/15 text-violet-400',
                      )}>
                        {it.category === 'UTILITY' ? 'Transac.' : 'Mkt'}
                      </span>
                      <button
                        aria-label={`Modifier ${it.label}`}
                        onClick={() => setEditing(isEditing ? null : it.trigger)}
                        className={cn('shrink-0 rounded-md p-1.5 transition-colors', isEditing ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-white')}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {isEditing && (
                      <div className="border-t border-white/10 p-2.5">
                        <textarea
                          value={body}
                          onChange={(e) => onEditBody(it.trigger, e.target.value)}
                          rows={4}
                          autoFocus
                          className="w-full resize-y rounded-lg border border-white/15 bg-black/30 p-2 text-xs leading-relaxed text-white"
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Variables : {it.variable_keys.map((k, i) => `{{${i + 1}}} = ${k}`).join(' · ')}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <p className="border-t border-white/10 py-1.5 text-center text-[11px] text-muted-foreground">
              Glissez la carte → garder · ← écarter
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Boutons d'action */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => decide(false)}
          disabled={busy}
          aria-label="Écarter ce groupe"
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-400/50 bg-red-500/10 text-red-400 transition-transform hover:scale-110 active:scale-95"
        >
          <X className="h-7 w-7" strokeWidth={2.5} />
        </button>
        <button
          onClick={undo}
          disabled={busy || index === 0}
          aria-label="Revenir au groupe précédent"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-muted-foreground transition-transform hover:scale-110 active:scale-95 disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={() => decide(true)}
          disabled={busy}
          aria-label="Garder ce groupe"
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-400/50 bg-emerald-500/10 text-emerald-400 transition-transform hover:scale-110 active:scale-95"
        >
          <Check className="h-7 w-7" strokeWidth={2.5} />
        </button>
      </div>

      <button onClick={keepAllRemaining} disabled={busy} className="text-xs text-muted-foreground underline-offset-4 hover:text-white hover:underline">
        Tout garder et passer au récapitulatif
      </button>
    </div>
  )
}
