'use client'

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Play, Clock, ShoppingBag, Reply, RotateCcw, FlaskConical, Plus, Smile, Mic } from 'lucide-react'
import IPhoneMockup from '@/components/ui/iphone-mockup'
import { cn } from '@/lib/utils'
import type { WorkflowGraph } from '@/lib/automations/graph-types'
import { startSim, clickButton, typeText, type SimTemplate, type SimState, type SimItem } from './phone-sim'

/**
 * Aperçu téléphone WhatsApp du builder d'automatisation.
 *
 * Deux modes :
 *  - AUTO (défaut) : un scénario animé qui défile en boucle (bulle événement →
 *    délai → message + ✓✓ qui bleuit). Purement décoratif/illustratif.
 *  - TEST : rejoue le GRAPHE réel pas à pas (simulateur client, aucun envoi). Les
 *    messages à boutons sont cliquables ; on peut taper un message. Boutons
 *    « Tester » / « Reset » sous le mockup.
 */

function renderFormat(text: string): React.ReactNode {
  if (!text) return null
  const parts = text.split(/(\*[^*]+\*|_[^_]+_|~[^~]+~)/g)
  return parts.map((part, i) => {
    if (/^\*[^*]+\*$/.test(part)) return <strong key={i}>{part.slice(1, -1)}</strong>
    if (/^_[^_]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>
    if (/^~[^~]+~$/.test(part)) return <s key={i}>{part.slice(1, -1)}</s>
    return <span key={i}>{part}</span>
  })
}

function resolvePreview(body: string, samples: string[]): string {
  let out = body || ''
  samples.forEach((s, i) => { out = out.replaceAll(`{{${i + 1}}}`, s || '…') })
  out = out.replace(/\{\{\d+\}\}/g, '…')
  return out
}

export function PhonePreview({
  storeName,
  eventLabel,
  conditionsText,
  delayLabel,
  headerText,
  bodyText,
  footerText,
  samples,
  mediaType,
  mediaUrl,
  scale = 0.74,
  mascot = false,
  graph,
  templates,
}: {
  storeName: string
  eventLabel: string
  conditionsText?: string
  delayLabel: string
  headerText?: string
  bodyText: string
  footerText?: string
  samples: string[]
  mediaType?: 'none' | 'text' | 'image' | 'video' | 'document'
  mediaUrl?: string
  scale?: number
  mascot?: boolean
  /** Graphe réel + modèles : requis pour le mode « Tester » (simulation). */
  graph?: WorkflowGraph
  templates?: SimTemplate[]
}) {
  const resolved = resolvePreview(bodyText, samples)
  const customerName = samples[0] || 'Marie'
  const immediate = /imm/i.test(delayLabel)

  // Mode d'affichage.
  const [mode, setMode] = useState<'auto' | 'test'>('auto')
  const canTest = !!graph && !!templates && templates.length > 0

  // ---- Mode AUTO : scénario animé en boucle ---------------------------------
  const [step, setStep] = useState(0)
  const [playKey, setPlayKey] = useState(0)
  useEffect(() => {
    if (mode !== 'auto') return
    const timers: ReturnType<typeof setTimeout>[] = []
    function runOnce() {
      setStep(0)
      timers.push(setTimeout(() => setStep(1), 1000))
      timers.push(setTimeout(() => setStep(2), immediate ? 1700 : 2600))
      timers.push(setTimeout(() => setStep(3), immediate ? 3000 : 3900))
      timers.push(setTimeout(runOnce, immediate ? 5200 : 6200))
    }
    runOnce()
    return () => timers.forEach(clearTimeout)
  }, [playKey, resolved, delayLabel, immediate, mode])

  // ---- Mode TEST : simulation interactive -----------------------------------
  const [sim, setSim] = useState<SimState | null>(null)
  const [draft, setDraft] = useState('')
  const startTest = () => {
    if (!graph || !templates) return
    setMode('test')
    setSim(startSim(graph, templates))
  }
  const resetTest = () => {
    setSim(null); setDraft(''); setMode('auto'); setPlayKey((k) => k + 1)
  }
  const onClickSimButton = (label: string) => {
    if (!graph || !templates || !sim) return
    setSim(clickButton(graph, templates, sim, label))
  }
  const onSendDraft = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    if (graph && templates && sim) setSim(typeText(graph, templates, sim, text))
  }
  // Scroll auto vers le bas quand la conversation grandit.
  const convRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (mode === 'test' && convRef.current) convRef.current.scrollTop = convRef.current.scrollHeight
  }, [sim, mode])

  // ---- Fit responsive du mockup ---------------------------------------------
  const NOM_W = 417, NOM_H = 876
  const MASCOT_W = 0.68, MASCOT_RATIO = 0.77, MASCOT_OVERLAP = 0.14
  const mascotOverhang = MASCOT_W * MASCOT_RATIO * (1 - MASCOT_OVERLAP)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(scale)
  useEffect(() => {
    const el = wrapRef.current?.parentElement
    if (!el) return
    const compute = () => {
      const availW = el.clientWidth - 24
      const H = el.clientHeight - 70
      const s = Math.min(
        H / (NOM_H + (mascot ? NOM_W * mascotOverhang : 0)),
        availW / NOM_W,
        0.95,
      )
      setFitScale(Math.max(0.5, s))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mascot, mascotOverhang])

  const realW = NOM_W * fitScale
  const realH = NOM_H * fitScale

  return (
    <div ref={wrapRef} className={cn('flex flex-col items-center gap-3', mascot && 'pt-2')}>
     <div className="relative flex justify-center" style={{ width: realW, height: realH }}>
      {mascot && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/mascots/peeking.png" alt="" aria-hidden
          className="pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 select-none drop-shadow-2xl"
          style={{ width: NOM_W * fitScale * MASCOT_W, top: -(NOM_W * fitScale * mascotOverhang) }}
        />
      )}
      <IPhoneMockup model="15-pro" color="#3a4a63" scale={fitScale} screenBg="#0b141a" glass>
        <div className="flex h-full flex-col">
          {/* Barre WhatsApp */}
          <div className="flex items-center gap-2 bg-[#075E54] px-3 pb-2.5 pt-12 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-base font-semibold">
              {(storeName || 'X').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-[15px] font-medium">{storeName || 'Votre boutique'}</p>
              <p className="text-[11px] text-white/70">{mode === 'test' ? 'test en cours…' : 'en ligne'}</p>
            </div>
          </div>

          {/* Conversation */}
          <div
            ref={convRef}
            className={cn(
              'relative flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-4 [scrollbar-width:thin]',
              mode === 'auto' && 'justify-center',
            )}
            style={{ backgroundImage: 'url(/whatsapp-bg.webp)', backgroundSize: 'cover' }}
          >
            {mode === 'test' && sim
              ? <SimConversation sim={sim} onClickButton={onClickSimButton} />
              : (
              <AnimatePresence>
                {step >= 0 && (
                  <motion.div key={`evt-${playKey}`}
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    className="mx-auto max-w-[90%] rounded-lg bg-[#fdf4c9] px-3 py-1.5 text-center shadow-sm">
                    <p className="flex items-center justify-center gap-1.5 text-[15px] font-medium text-amber-800">
                      <ShoppingBag className="h-3.5 w-3.5" />
                      {customerName}, {eventLabel.toLowerCase()}
                    </p>
                    {conditionsText && <p className="mt-0.5 text-[13px] text-amber-700/80">✓ {conditionsText}</p>}
                  </motion.div>
                )}
                {step >= 1 && (
                  <motion.div key={`clock-${playKey}`}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="mx-auto flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1.5 text-[14px] text-gray-700 backdrop-blur-sm">
                    <motion.span animate={{ rotate: immediate ? 0 : 360 }} transition={{ duration: 2, repeat: immediate ? 0 : Infinity, ease: 'linear' }}>
                      <Clock className="h-3.5 w-3.5" />
                    </motion.span>
                    {immediate ? 'Envoi immédiat' : `Attend ${delayLabel}`}
                  </motion.div>
                )}
                {step >= 2 && (
                  <motion.div key={`msg-${playKey}`}
                    initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className="ml-auto max-w-[88%] overflow-hidden rounded-xl rounded-tr-sm bg-[#dcf8c6] shadow-sm">
                    {mediaType === 'image' && (mediaUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={mediaUrl} alt="" className="h-24 w-full object-cover" />
                      : <div className="h-24 w-full bg-slate-300" />)}
                    {mediaType === 'video' && <div className="h-24 w-full bg-slate-800" />}
                    {mediaType === 'document' && <div className="bg-slate-100 px-2 py-2 text-xs text-slate-500">📄 Document.pdf</div>}
                    <div className="px-2.5 py-1.5">
                      {headerText && mediaType === 'text' && <p className="mb-0.5 text-[21px] font-semibold text-gray-900">{headerText}</p>}
                      <p className="whitespace-pre-wrap break-words text-[20px] leading-snug text-gray-800">
                        {renderFormat(resolved) || <span className="text-gray-400">Votre message…</span>}
                      </p>
                      {footerText && <p className="mt-1 text-[16px] text-gray-500">{footerText}</p>}
                      <div className="mt-0.5 flex items-center justify-end gap-0.5 text-[11px] text-gray-400">
                        <span>12:00</span>
                        <motion.span initial={{ color: '#9ca3af' }} animate={{ color: step >= 3 ? '#34b7f1' : '#9ca3af' }} transition={{ duration: 0.4 }} className="flex">
                          <Check className="h-3 w-3 -mr-1.5" strokeWidth={3} />
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </motion.span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>

          {/* Barre de saisie WhatsApp (bas) — réaliste. Active en mode test. */}
          <div className="flex items-center gap-1.5 bg-[#0b141a] px-2 py-2">
            <Plus className="h-5 w-5 shrink-0 text-white/50" />
            <Smile className="h-5 w-5 shrink-0 text-white/50" />
            <div className="flex flex-1 items-center rounded-full bg-white/10 px-3 py-1.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSendDraft() }}
                disabled={mode !== 'test'}
                placeholder={mode === 'test' ? 'Répondez au test…' : 'Entrez un message'}
                className="w-full bg-transparent text-[14px] text-white placeholder:text-white/40 outline-none disabled:cursor-default"
              />
            </div>
            <button
              onClick={onSendDraft}
              disabled={mode !== 'test' || !draft.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white disabled:opacity-50"
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>
        </div>
      </IPhoneMockup>
     </div>

      {/* Contrôles sous l'iPhone */}
      <div className="flex items-center gap-2">
        {mode === 'auto' ? (
          <>
            <button onClick={() => setPlayKey((k) => k + 1)}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted">
              <Play className="h-3 w-3" /> Rejouer
            </button>
            {canTest && (
              <button onClick={startTest}
                className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                <FlaskConical className="h-3 w-3" /> Tester l’automatisation
              </button>
            )}
          </>
        ) : (
          <button onClick={resetTest}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>
    </div>
  )
}

/** Rendu de la conversation simulée (mode test) : items + boutons cliquables. */
function SimConversation({ sim, onClickButton }: { sim: SimState; onClickButton: (label: string) => void }) {
  return (
    <>
      {sim.items.map((item, i) => <SimBubble key={i} item={item} last={i === sim.items.length - 1} onClickButton={onClickButton} waiting={sim.waitingNodeId != null} />)}
    </>
  )
}

function SimBubble({ item, last, onClickButton, waiting }: { item: SimItem; last: boolean; onClickButton: (label: string) => void; waiting: boolean }) {
  if (item.kind === 'system') {
    return (
      <div className="mx-auto max-w-[92%] rounded-lg bg-[#fdf4c9] px-3 py-1.5 text-center shadow-sm">
        <p className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-amber-800"><ShoppingBag className="h-3 w-3" /> {item.text}</p>
        {item.sub && <p className="mt-0.5 text-[11px] text-amber-700/80">{item.sub}</p>}
      </div>
    )
  }
  if (item.kind === 'delay') {
    return (
      <div className="mx-auto flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1 text-[12px] text-gray-700 backdrop-blur-sm">
        <Clock className="h-3 w-3" /> {item.immediate ? 'Envoi immédiat' : `Attend ${item.label}`}
      </div>
    )
  }
  if (item.kind === 'reply') {
    return (
      <div className="ml-auto max-w-[80%] rounded-xl rounded-tr-sm bg-[#005c4b] px-2.5 py-1.5 text-[14px] text-white shadow-sm">
        {item.text}
      </div>
    )
  }
  if (item.kind === 'end') {
    return <div className="mx-auto text-[11px] italic text-white/50">— {item.text} —</div>
  }
  // message
  return (
    <div className="mr-auto max-w-[88%] overflow-hidden rounded-xl rounded-tl-sm bg-white shadow-sm">
      <div className="px-2.5 py-1.5">
        {item.header && <p className="mb-0.5 text-[14px] font-semibold text-gray-900">{item.header}</p>}
        <p className="whitespace-pre-wrap break-words text-[13.5px] leading-snug text-gray-800">{renderFormat(item.body)}</p>
        {item.footer && <p className="mt-1 text-[11px] text-gray-400">{item.footer}</p>}
        <div className="mt-0.5 text-right text-[10px] text-gray-400">12:00</div>
      </div>
      {item.buttons.length > 0 && (
        <div className="border-t border-black/5">
          {item.buttons.map((b, i) => (
            <button
              key={b}
              onClick={() => last && waiting && onClickButton(b)}
              disabled={!(last && waiting)}
              className={cn(
                'flex w-full items-center justify-center gap-1.5 py-1.5 text-[13px] font-medium text-[#00a5f4] transition-colors',
                i > 0 && 'border-t border-black/5',
                last && waiting ? 'hover:bg-black/[0.03] cursor-pointer' : 'opacity-60 cursor-default',
              )}
            >
              <Reply className="h-3.5 w-3.5" /> {b}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
