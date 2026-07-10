'use client'

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Play, Clock, ShoppingBag } from 'lucide-react'
import IPhoneMockup from '@/components/ui/iphone-mockup'
import { cn } from '@/lib/utils'

/**
 * Aperçu téléphone WhatsApp animé — façon "story" dans une conversation :
 *   1) bulle système : l'événement déclencheur (ex: "Marie a passé commande")
 *      + les conditions remplies
 *   2) horloge : le délai d'attente
 *   3) le message WhatsApp réel (avec variables résolues) + ✓✓ qui bleuit
 *
 * Les 3 étapes apparaissent en séquence (animées).
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
}: {
  storeName: string
  eventLabel: string        // ex: "Commande expédiée"
  conditionsText?: string   // ex: "montant > 50€"
  delayLabel: string        // ex: "1 heure" / "Immédiat"
  headerText?: string
  bodyText: string
  footerText?: string
  samples: string[]
  mediaType?: 'none' | 'text' | 'image' | 'video' | 'document'
  mediaUrl?: string
  scale?: number
  mascot?: boolean
}) {
  const resolved = resolvePreview(bodyText, samples)
  const customerName = samples[0] || 'Marie'
  const immediate = /imm/i.test(delayLabel)

  // Séquence d'apparition : 0 = événement, 1 = horloge, 2 = message, 3 = ✓✓ bleu
  const [step, setStep] = useState(0)
  const [playKey, setPlayKey] = useState(0)

  useEffect(() => {
    // Scénario un peu plus lent, qui se REJOUE en boucle.
    const timers: ReturnType<typeof setTimeout>[] = []
    function runOnce() {
      setStep(0)
      timers.push(setTimeout(() => setStep(1), 1000))
      timers.push(setTimeout(() => setStep(2), immediate ? 1700 : 2600))
      timers.push(setTimeout(() => setStep(3), immediate ? 3000 : 3900))
      // Pause puis relance (boucle infinie)
      timers.push(setTimeout(runOnce, immediate ? 5200 : 6200))
    }
    runOnce()
    return () => timers.forEach(clearTimeout)
  }, [playKey, resolved, delayLabel, immediate])

  // Responsive : le mockup s'adapte à la HAUTEUR disponible de son conteneur.
  // On mesure le parent et on calcule un scale (borné) pour qu'il rentre sans
  // scroll. Dimensions nominales du mockup : 417 × 876 (incl. bezels).
  const NOM_W = 417, NOM_H = 876
  // Mascotte "peeking" (recadrée) : ratio hauteur/largeur ≈ 0.77, largeur ≈ 0.86×mockup.
  // Les mains chevauchent le bord supérieur ; ~12% de l'image passe SOUS ce bord,
  // donc le débord visible au-dessus du mockup ≈ hauteurImage × 0.88.
  const MASCOT_W = 0.68               // largeur image / largeur mockup
  const MASCOT_RATIO = 0.77           // hauteur image / largeur image
  const MASCOT_OVERLAP = 0.14         // part de l'image qui chevauche le mockup
  const mascotOverhang = MASCOT_W * MASCOT_RATIO * (1 - MASCOT_OVERLAP) // ×largeur mockup
  const wrapRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(scale)
  useEffect(() => {
    const el = wrapRef.current?.parentElement
    if (!el) return
    const compute = () => {
      const availW = el.clientWidth - 24
      // hauteur dispo : s*NOM_H + débordMascotte(s) + bouton "Rejouer" <= H
      const H = el.clientHeight - 60
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
  }, [mascot])

  const realW = NOM_W * fitScale
  const realH = NOM_H * fitScale

  return (
    <div ref={wrapRef} className={cn('flex flex-col items-center gap-3', mascot && 'pt-2')}>
     <div className="relative flex justify-center" style={{ width: realW, height: realH }}>
      {/* Mascotte Xeyo posée SUR le haut du téléphone. Sa hauteur visible
          (~58% de sa largeur) déborde au-dessus ; les mains chevauchent le bord
          du mockup. z-50 = au premier plan. */}
      {mascot && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/mascots/peeking.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 select-none drop-shadow-2xl"
          // Grosse mascotte : largeur ~86% du téléphone. On la remonte pour que
          // la tête + cornes soient visibles et que les mains chevauchent le bord
          // supérieur du mockup (≈12% de l'image passe sous le bord).
          style={{
            width: NOM_W * fitScale * MASCOT_W,
            top: -(NOM_W * fitScale * mascotOverhang),
          }}
        />
      )}
      <IPhoneMockup model="15-pro" color="#3a4a63" scale={fitScale} screenBg="#0b141a" glass>
        <div className="flex h-full flex-col">
          {/* Barre WhatsApp (sous la Dynamic Island) */}
          <div className="flex items-center gap-2 bg-[#075E54] px-3 pb-2.5 pt-12 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-base font-semibold">
              {(storeName || 'X').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-[15px] font-medium">{storeName || 'Votre boutique'}</p>
              <p className="text-[11px] text-white/70">en ligne</p>
            </div>
          </div>

          {/* Conversation (fond WhatsApp), les bulles se remplissent par le bas */}
          <div
            className="relative flex flex-1 flex-col justify-center gap-2.5 px-3 py-4"
            style={{ backgroundImage: 'url(/whatsapp-bg.webp)', backgroundSize: 'cover' }}
          >
            <AnimatePresence>
              {/* 1) Bulle système : l'événement + conditions */}
              {step >= 0 && (
                <motion.div
                  key={`evt-${playKey}`}
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="mx-auto max-w-[90%] rounded-lg bg-[#fdf4c9] px-3 py-1.5 text-center shadow-sm"
                >
                  <p className="flex items-center justify-center gap-1.5 text-[15px] font-medium text-amber-800">
                    <ShoppingBag className="h-3.5 w-3.5" />
                    {customerName}, {eventLabel.toLowerCase()}
                  </p>
                  {conditionsText && (
                    <p className="mt-0.5 text-[13px] text-amber-700/80">✓ {conditionsText}</p>
                  )}
                </motion.div>
              )}

              {/* 2) Horloge : le délai */}
              {step >= 1 && (
                <motion.div
                  key={`clock-${playKey}`}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="mx-auto flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1.5 text-[14px] text-gray-700 backdrop-blur-sm"
                >
                  <motion.span
                    animate={{ rotate: immediate ? 0 : 360 }}
                    transition={{ duration: 2, repeat: immediate ? 0 : Infinity, ease: 'linear' }}
                  >
                    <Clock className="h-3.5 w-3.5" />
                  </motion.span>
                  {immediate ? 'Envoi immédiat' : `Attend ${delayLabel}`}
                </motion.div>
              )}

              {/* 3) Le message WhatsApp réel */}
              {step >= 2 && (
                <motion.div
                  key={`msg-${playKey}`}
                  initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  className="ml-auto max-w-[88%] overflow-hidden rounded-xl rounded-tr-sm bg-[#dcf8c6] shadow-sm"
                >
                  {mediaType === 'image' && (
                    mediaUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={mediaUrl} alt="" className="h-24 w-full object-cover" />
                      : <div className="h-24 w-full bg-slate-300" />
                  )}
                  {mediaType === 'video' && <div className="h-24 w-full bg-slate-800" />}
                  {mediaType === 'document' && <div className="bg-slate-100 px-2 py-2 text-xs text-slate-500">📄 Document.pdf</div>}
                  <div className="px-2.5 py-1.5">
                    {headerText && mediaType === 'text' && (
                      <p className="mb-0.5 text-[21px] font-semibold text-gray-900">{headerText}</p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-[20px] leading-snug text-gray-800">
                      {renderFormat(resolved) || <span className="text-gray-400">Votre message…</span>}
                    </p>
                    {footerText && <p className="mt-1 text-[16px] text-gray-500">{footerText}</p>}
                    <div className="mt-0.5 flex items-center justify-end gap-0.5 text-[11px] text-gray-400">
                      <span>12:00</span>
                      <motion.span
                        initial={{ color: '#9ca3af' }}
                        animate={{ color: step >= 3 ? '#34b7f1' : '#9ca3af' }}
                        transition={{ duration: 0.4 }}
                        className="flex"
                      >
                        <Check className="h-3 w-3 -mr-1.5" strokeWidth={3} />
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </motion.span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </IPhoneMockup>
     </div>

      <button
        onClick={() => setPlayKey((k) => k + 1)}
        className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
      >
        <Play className="h-3 w-3" /> Rejouer le scénario
      </button>
    </div>
  )
}
