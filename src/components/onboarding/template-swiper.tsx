'use client'

import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import { Check, Heart, Loader2, Pencil, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Sélection des modèles façon TINDER, par groupe. Chaque carte est construite
 * comme une vraie carte Tinder, au design Xeyo :
 *  - le VISUEL plein cadre = les modèles du groupe rendus comme dans le vrai
 *    WhatsApp sombre (bulles #202c33 sur le fond doodle, heure, en-tête gras)
 *  - les infos en bas, sur un dégradé noir (nom de la catégorie + compteur +
 *    pitch), comme le nom/l'âge sur Tinder
 *  - gros boutons ronds ✗ / ⟲ / ♥, tampons GARDER/ÉCARTER révélés au drag
 *
 * Sur chaque bulle : une pastille ✓/○ pour exclure ce modèle du groupe, et un
 * crayon pour ÉDITER le texte à même la carte. Les aperçus substituent les
 * valeurs d'exemple ({{1}} → « Marie »).
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

export type SwipeGroup = { key: string; title: string; pitch?: string; items: SwipeItem[] }

const SWIPE_THRESHOLD = 110

function fillSamples(body: string, samples: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n) => samples[Number(n) - 1] || m)
}

// La sortie de carte part du côté du swipe (custom = direction).
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
  // Modèles exclus DANS la carte courante (gardés hors du lot même si « like »).
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

  function resetCardState() {
    setRowOff(new Set())
    setEditing(null)
    x.set(0)
  }

  function decide(keep: boolean) {
    if (!current || busy) return
    current.items.forEach((it) => onDecide(it.trigger, keep && !rowOff.has(it.trigger)))
    setLastDir(keep ? 1 : -1)
    resetCardState()
    setIndex((i) => i + 1)
  }

  function undo() {
    if (index === 0 || busy) return
    resetCardState()
    setIndex((i) => i - 1)
  }

  function keepAllRemaining() {
    for (let g = index; g < groups.length; g++) {
      groups[g].items.forEach((it) => onDecide(it.trigger, g === index ? !rowOff.has(it.trigger) : true))
    }
    setLastDir(1)
    resetCardState()
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
      {/* Progression */}
      <div className="flex w-full max-w-sm items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-sky-400"
            animate={{ width: `${(index / groups.length) * 100}%` }}
            transition={{ type: 'spring', stiffness: 160, damping: 24 }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1} / {groups.length}</span>
      </div>

      {/* Pile de cartes, format portrait comme Tinder. */}
      <div className="relative h-[480px] w-full max-w-sm select-none">
        {groups.slice(index + 1, index + 3).map((g, i) => (
          <div
            key={g.key}
            className="absolute inset-0 rounded-[24px] border border-white/10 bg-[#0e1626]"
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
            className="absolute inset-0 z-10 cursor-grab overflow-hidden rounded-[24px] border border-white/12 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.75)] active:cursor-grabbing"
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
            {/* ── Le VISUEL plein cadre : WhatsApp sombre authentique. ── */}
            <div
              className="absolute inset-0 overflow-y-auto px-3 pb-28 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ backgroundImage: 'url(/whatsapp-bg-dark.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#0b141a' }}
            >
              <div className="flex flex-col gap-2">
                {current.items.map((it) => {
                  const isEditing = editing === it.trigger
                  const off = rowOff.has(it.trigger)
                  const body = editedBodies[it.trigger] ?? it.body_text
                  return (
                    <div key={it.trigger} className={cn('flex max-w-[88%] items-start gap-1.5 transition-opacity', off && !isEditing && 'opacity-35')}>
                      {/* Bulle WhatsApp sombre fidèle (entrante : #202c33). */}
                      <div className="min-w-0 flex-1 overflow-hidden rounded-lg rounded-tl-none bg-[#202c33] shadow-md">
                        {isEditing ? (
                          <div className="p-2">
                            <textarea
                              value={body}
                              onChange={(e) => onEditBody(it.trigger, e.target.value)}
                              rows={5}
                              autoFocus
                              className="w-full resize-none rounded-md border border-white/15 bg-black/40 p-2 text-[12px] leading-relaxed text-[#e9edef]"
                            />
                            <p className="mt-1 text-[10px] text-[#8696a0]">
                              {it.variable_keys.map((k, i) => `{{${i + 1}}} = ${k}`).join(' · ')}
                            </p>
                          </div>
                        ) : (
                          <div className="px-2.5 pb-1.5 pt-2">
                            {it.header_text && (
                              <p className="mb-0.5 text-[13px] font-semibold text-[#e9edef]">
                                {fillSamples(it.header_text, it.sample_values)}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap text-[13px] leading-snug text-[#e9edef]">
                              {fillSamples(body, it.sample_values)}
                            </p>
                            <p className="mt-0.5 text-right text-[10px] text-[#8696a0]">01:42</p>
                          </div>
                        )}
                      </div>
                      {/* Pastille inclure/exclure + crayon, à côté de la bulle. */}
                      <div className="flex shrink-0 flex-col gap-1 pt-1">
                        <button
                          aria-label={off ? `Inclure ${it.label}` : `Exclure ${it.label}`}
                          onClick={() => setRowOff((prev) => { const s = new Set(prev); if (s.has(it.trigger)) s.delete(it.trigger); else s.add(it.trigger); return s })}
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                            off ? 'border-white/25 bg-black/40 text-white/30' : 'border-primary/60 bg-primary/25 text-primary',
                          )}
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </button>
                        <button
                          aria-label={`Modifier ${it.label}`}
                          onClick={() => setEditing(isEditing ? null : it.trigger)}
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                            isEditing ? 'border-primary/60 bg-primary/25 text-primary' : 'border-white/20 bg-black/40 text-white/50 hover:text-white',
                          )}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Infos en bas sur dégradé, façon Tinder. ── */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-5 pb-4 pt-14 text-left">
              <p className="text-2xl font-bold tracking-tight text-white">
                {current.title}
                <span className="ml-2 align-middle text-base font-medium text-white/50">{current.items.length} modèles</span>
              </p>
              {current.pitch && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/60">{current.pitch}</p>}
            </div>

            {/* Tampons GARDER / ÉCARTER révélés par le drag. */}
            <motion.span
              style={{ opacity: likeOpacity }}
              className="pointer-events-none absolute left-4 top-4 z-20 -rotate-12 rounded-lg border-4 border-emerald-400 px-3 py-1 text-2xl font-black tracking-widest text-emerald-400"
            >
              GARDER
            </motion.span>
            <motion.span
              style={{ opacity: nopeOpacity }}
              className="pointer-events-none absolute right-4 top-4 z-20 rotate-12 rounded-lg border-4 border-red-400 px-3 py-1 text-2xl font-black tracking-widest text-red-400"
            >
              ÉCARTER
            </motion.span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Boutons ronds façon Tinder : ✗ / ⟲ / ♥. */}
      <div className="flex items-center gap-5">
        <button
          onClick={() => decide(false)}
          disabled={busy}
          aria-label="Écarter ce groupe"
          className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-[#0e1626] text-red-400 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)] transition-transform hover:scale-110 active:scale-95"
        >
          <X className="h-8 w-8" strokeWidth={2.5} />
        </button>
        <button
          onClick={undo}
          disabled={busy || index === 0}
          aria-label="Revenir au groupe précédent"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#0e1626] text-amber-400 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)] transition-transform hover:scale-110 active:scale-95 disabled:opacity-40"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        <button
          onClick={() => decide(true)}
          disabled={busy}
          aria-label="Garder ce groupe"
          className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-[#0e1626] text-emerald-400 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)] transition-transform hover:scale-110 active:scale-95"
        >
          <Heart className="h-8 w-8 fill-current" strokeWidth={0} />
        </button>
      </div>

      <button onClick={keepAllRemaining} disabled={busy} className="text-xs text-muted-foreground underline-offset-4 hover:text-white hover:underline">
        Tout garder et passer au récapitulatif
      </button>
    </div>
  )
}
