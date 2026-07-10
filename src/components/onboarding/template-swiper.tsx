'use client'

import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import { Check, Copy, ExternalLink, Heart, Loader2, Pencil, Reply, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Sélection des modèles façon TINDER, par groupe. Chaque carte est un « profil »
 * au design Xeyo : visuel plein cadre = les modèles rendus comme dans le vrai
 * WhatsApp sombre (bulles #202c33 sur fond doodle), infos en bas sur dégradé,
 * gros boutons ronds ✗ / ⟲ / ♥.
 *
 * ⚠️ Chaque carte (SwipeCard) possède SES PROPRES MotionValues de drag : une
 * valeur partagée entre les cartes faisait hériter à la carte suivante la
 * position/rotation de la sortie précédente (carte « coincée » de travers).
 * Le clic ✗/♥ joue la même animation d'envol que le swipe (variants exit).
 */

export type SwipeItem = {
  trigger: string
  label: string
  category: string
  header_text: string | null
  body_text: string
  sample_values: string[]
  variable_keys: string[]
  /** Boutons du modèle (aperçu fidèle : rangées vertes façon WhatsApp). */
  buttons?: { type: string; text: string; url?: string }[] | null
  /** Carrousel produits : cartes affichées sous la bulle (images réelles). */
  template_type?: 'standard' | 'carousel'
  carousel_cards?: { header_media_url: string | null; body_text: string }[] | null
}

export type SwipeGroup = { key: string; title: string; pitch?: string; items: SwipeItem[] }

const SWIPE_THRESHOLD = 110

function fillSamples(body: string, samples: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n) => samples[Number(n) - 1] || m)
}

// La sortie part du côté du choix (custom = direction : 1 gardé, -1 écarté).
const cardVariants = {
  enter: { scale: 0.95, y: 14, opacity: 0 },
  center: { scale: 1, y: 0, x: 0, rotate: 0, opacity: 1 },
  exit: (dir: number) => ({
    x: dir * 520,
    rotate: dir * 20,
    opacity: 0,
    transition: { duration: 0.35, ease: 'easeIn' as const },
  }),
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
  // Modèles exclus DANS la carte courante (hors du lot même si « like »).
  const [rowOff, setRowOff] = useState<Set<string>>(new Set())
  // Modèle en cours d'édition (drag désactivé pendant la frappe).
  const [editing, setEditing] = useState<string | null>(null)

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
    setIndex((i) => i + 1)
  }

  function undo() {
    if (index === 0 || busy) return
    setRowOff(new Set())
    setEditing(null)
    setIndex((i) => i - 1)
  }

  function keepAllRemaining() {
    for (let g = index; g < groups.length; g++) {
      groups[g].items.forEach((it) => onDecide(it.trigger, g === index ? !rowOff.has(it.trigger) : true))
    }
    setLastDir(1)
    setRowOff(new Set())
    setEditing(null)
    setIndex(groups.length)
  }

  // ── Récapitulatif final (avec retour pour revenir sur ses choix) ─────
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
              {dropped} écarté{dropped > 1 ? 's' : ''}, récupérables plus tard depuis le dashboard
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setIndex(groups.length - 1)}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Revenir au dernier groupe
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
      {/* Déroulé par TYPE de modèles : on voit ce qui arrive (Commandes,
          Contacts, Conversation, Marketing…). Les puces passées sont cochées
          et CLIQUABLES pour revenir sur ses choix. */}
      <div className="flex w-full max-w-md flex-wrap items-center justify-center gap-1.5">
        {groups.map((g, i) => (
          <button
            key={g.key}
            disabled={i >= index || busy}
            onClick={() => { setRowOff(new Set()); setEditing(null); setIndex(i) }}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
              i === index
                ? 'border-primary/60 bg-primary/15 text-primary'
                : i < index
                  ? 'border-white/10 bg-white/5 text-white/50 hover:border-white/25 hover:text-white'
                  : 'border-white/10 text-white/30',
            )}
          >
            {i < index && <Check className="h-3 w-3" strokeWidth={3} />}
            {g.title}
          </button>
        ))}
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
          <SwipeCard
            key={current.key}
            group={current}
            dir={lastDir}
            disabled={busy}
            editing={editing}
            setEditing={setEditing}
            rowOff={rowOff}
            setRowOff={setRowOff}
            editedBodies={editedBodies}
            onEditBody={onEditBody}
            onSwipe={decide}
          />
        </AnimatePresence>
      </div>

      {/* Boutons ronds façon Tinder : le clic joue la même animation d'envol. */}
      <div className="flex items-center gap-5">
        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={() => decide(false)}
          disabled={busy}
          aria-label="Écarter ce groupe"
          className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-[#0e1626] text-red-400 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)] transition-transform hover:scale-110"
        >
          <X className="h-8 w-8" strokeWidth={2.5} />
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={undo}
          disabled={busy || index === 0}
          aria-label="Revenir au groupe précédent"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#0e1626] text-amber-400 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)] transition-transform hover:scale-110 disabled:opacity-40"
        >
          <RotateCcw className="h-5 w-5" />
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={() => decide(true)}
          disabled={busy}
          aria-label="Garder ce groupe"
          className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-[#0e1626] text-emerald-400 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)] transition-transform hover:scale-110"
        >
          <Heart className="h-8 w-8 fill-current" strokeWidth={0} />
        </motion.button>
      </div>

      <button onClick={keepAllRemaining} disabled={busy} className="text-xs text-muted-foreground underline-offset-4 hover:text-white hover:underline">
        Tout garder et passer au récapitulatif
      </button>
    </div>
  )
}

/**
 * Une carte draggable. Composant DÉDIÉ pour que chaque carte ait ses propres
 * MotionValues (x/rotation/tampons) — remontés de zéro à chaque carte via la
 * `key` du parent, aucune valeur partagée entre cartes.
 */
function SwipeCard({
  group,
  dir,
  disabled,
  editing,
  setEditing,
  rowOff,
  setRowOff,
  editedBodies,
  onEditBody,
  onSwipe,
}: {
  group: SwipeGroup
  dir: number
  disabled: boolean
  editing: string | null
  setEditing: (t: string | null) => void
  rowOff: Set<string>
  setRowOff: React.Dispatch<React.SetStateAction<Set<string>>>
  editedBodies: Record<string, string>
  onEditBody: (trigger: string, body: string) => void
  onSwipe: (keep: boolean) => void
}) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-260, 260], [-14, 14])
  const likeOpacity = useTransform(x, [40, SWIPE_THRESHOLD], [0, 1])
  const nopeOpacity = useTransform(x, [-SWIPE_THRESHOLD, -40], [1, 0])

  // Une modification vient d'être refusée car elle touchait une variable.
  const [varWarn, setVarWarn] = useState(false)

  /** Édition GARDÉE : le texte est libre, mais chaque variable {{n}} du modèle
   *  d'origine doit rester présente à l'identique (même nombre d'occurrences).
   *  Le champ étant contrôlé, une frappe qui casse une variable est simplement
   *  ignorée — impossible de les supprimer ou de taper dedans. */
  function guardedEdit(it: SwipeItem, next: string) {
    const tokens = it.body_text.match(/\{\{\d+\}\}/g) ?? []
    const intact = tokens.every(
      (tok) => next.split(tok).length === it.body_text.split(tok).length,
    )
    if (intact) {
      onEditBody(it.trigger, next)
      setVarWarn(false)
    } else {
      setVarWarn(true)
    }
  }

  return (
    <motion.div
      custom={dir}
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
        if (disabled) return
        if (info.offset.x > SWIPE_THRESHOLD) onSwipe(true)
        else if (info.offset.x < -SWIPE_THRESHOLD) onSwipe(false)
      }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    >
      {/* ── Le VISUEL plein cadre : WhatsApp sombre authentique. ── */}
      <div
        className="absolute inset-0 overflow-y-auto px-3 pb-28 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ backgroundImage: 'url(/whatsapp-bg-dark.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#0b141a' }}
      >
        <div className="flex flex-col gap-2">
          {group.items.map((it) => {
            const isEditing = editing === it.trigger
            const off = rowOff.has(it.trigger)
            const body = editedBodies[it.trigger] ?? it.body_text
            return (
              <div key={it.trigger} className={cn('flex max-w-[88%] items-start gap-1.5 transition-opacity', off && !isEditing && 'opacity-35')}>
                <div className="min-w-0 flex-1">
                {/* Bulle WhatsApp sombre fidèle (entrante : #202c33). */}
                <div className="overflow-hidden rounded-lg rounded-tl-none bg-[#202c33] shadow-md">
                  {isEditing ? (
                    <div className="p-2">
                      <textarea
                        value={body}
                        onChange={(e) => guardedEdit(it, e.target.value)}
                        rows={5}
                        autoFocus
                        className="w-full resize-none rounded-md border border-white/15 bg-black/40 p-2 text-[12px] leading-relaxed text-[#e9edef]"
                      />
                      {varWarn ? (
                        <p className="mt-1 text-[10px] font-medium text-red-400">
                          Les variables {'{{x}}'} sont verrouillées, modifiez le texte autour, pas dedans.
                        </p>
                      ) : (
                        <p className="mt-1 text-[10px] text-[#8696a0]">
                          Variables (verrouillées) : {it.variable_keys.map((k, i) => `{{${i + 1}}} = ${k}`).join(' · ')}
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
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
                      {/* Boutons du modèle, façon WhatsApp : filet + rangée verte. */}
                      {(it.buttons ?? []).map((b, i) => (
                        <div key={i} className="flex items-center justify-center gap-1.5 border-t border-white/10 py-1.5 text-[12px] font-medium text-[#25d366]">
                          {b.type === 'URL' ? <ExternalLink className="h-3.5 w-3.5" />
                            : b.type === 'COPY_CODE' ? <Copy className="h-3.5 w-3.5" />
                            : <Reply className="h-3.5 w-3.5" />}
                          {b.text}
                        </div>
                      ))}
                    </>
                  )}
                </div>
                {/* Carrousel produits sous la bulle (vraies images boutique). */}
                {!isEditing && (it.carousel_cards?.length ?? 0) > 0 && (
                  <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {it.carousel_cards!.map((card, ci) => (
                      <div key={ci} className="w-[104px] shrink-0 overflow-hidden rounded-lg bg-[#202c33] shadow-md">
                        {card.header_media_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={card.header_media_url} alt="" className="h-[68px] w-full object-cover" />
                        ) : (
                          <div className="h-[68px] w-full bg-[#2a3942]" />
                        )}
                        <p className="truncate px-2 py-1 text-[11px] text-[#e9edef]">{card.body_text}</p>
                        <div className="flex items-center justify-center gap-1 border-t border-white/10 py-1 text-[11px] font-medium text-[#25d366]">
                          <ExternalLink className="h-3 w-3" /> Voir
                        </div>
                      </div>
                    ))}
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
          {group.title}
          <span className="ml-2 align-middle text-base font-medium text-white/50">{group.items.length} modèles</span>
        </p>
        {group.pitch && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/60">{group.pitch}</p>}
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
  )
}
