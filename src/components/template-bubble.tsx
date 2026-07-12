'use client'

import React, { useEffect, useState } from 'react'
import { ExternalLink, Phone, Copy, Clock, Image as ImageIcon } from 'lucide-react'
import type { WhatsAppTemplate, TemplateButton, TemplateCard } from '@/types/database'

/** Image d'une carte de carrousel. Gère une URL http directe (Shopify) OU un
 *  chemin storage Supabase (résolu en URL signée via /api/templates/media/preview). */
function CardImage({ url }: { url: string | null | undefined }) {
  const [src, setSrc] = useState<string | null>(url && /^https?:\/\//i.test(url) ? url : null)
  useEffect(() => {
    if (!url) { setSrc(null); return }
    if (/^https?:\/\//i.test(url)) { setSrc(url); return }
    // Chemin storage → URL signée.
    let cancelled = false
    fetch(`/api/templates/media/preview?path=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.data?.signed_url) setSrc(j.data.signed_url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [url])
  if (!src) return <div className="flex h-[62px] items-center justify-center bg-slate-100 text-slate-300"><ImageIcon className="h-5 w-5" /></div>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-[62px] w-full object-cover" />
}

/**
 * Rend le formatage WhatsApp (*gras*, _italique_, ~barré~) et remplace les
 * variables {{n}} par des pastilles portant le libellé de la variable.
 */
export function renderWhatsAppFormat(text: string, labels?: string[]): React.ReactNode {
  if (!text) return null
  const chunks = text.split(/(\{\{\s*\d+\s*\}\})/g)
  return chunks.map((chunk, ci) => {
    const vm = chunk.match(/^\{\{\s*(\d+)\s*\}\}$/)
    if (vm && labels) {
      const n = parseInt(vm[1], 10)
      return (
        <span key={`v${ci}`} className="rounded bg-primary/15 px-1 py-0.5 text-[0.92em] font-medium text-primary">
          {labels[n - 1] || `{{${n}}}`}
        </span>
      )
    }
    if (vm) return <span key={`v${ci}`}>{chunk}</span>
    const parts = chunk.split(/(\*[^*]+\*|_[^_]+_|~[^~]+~)/g)
    return parts.map((part, i) => {
      if (/^\*[^*]+\*$/.test(part)) return <strong key={`${ci}-${i}`}>{part.slice(1, -1)}</strong>
      if (/^_[^_]+_$/.test(part)) return <em key={`${ci}-${i}`}>{part.slice(1, -1)}</em>
      if (/^~[^~]+~$/.test(part)) return <s key={`${ci}-${i}`}>{part.slice(1, -1)}</s>
      return <span key={`${ci}-${i}`}>{part}</span>
    })
  })
}

const httpUrl = /^https?:\/\//i

function ButtonRow({ b }: { b: TemplateButton }) {
  const icon = b.type === 'URL' ? <ExternalLink className="h-3.5 w-3.5" />
    : b.type === 'PHONE_NUMBER' ? <Phone className="h-3.5 w-3.5" />
    : b.type === 'COPY_CODE' ? <Copy className="h-3.5 w-3.5" />
    : null
  return (
    <div className="flex items-center justify-center gap-1.5 border-t border-slate-100 py-1.5 text-[13px] font-medium text-[#1ca5e0] first:border-t-0">
      {icon}{b.text || 'Bouton'}
    </div>
  )
}

/**
 * Bulle WhatsApp complète (texte + bandeau LTO + boutons + carrousel) pour un
 * template approuvé. Composant partagé (page templates, automatisations…).
 */
export function TemplateBubble({ template, labels, className }: {
  template: Pick<WhatsAppTemplate,
    'body_text' | 'header_text' | 'footer_text' | 'template_type' | 'buttons'
    | 'carousel_cards' | 'lto_title' | 'lto_default_hours'>
  labels?: string[]
  className?: string
}) {
  const buttons = (Array.isArray(template.buttons) ? template.buttons : []) as TemplateButton[]
  const cards = (Array.isArray(template.carousel_cards) ? template.carousel_cards : []) as TemplateCard[]
  const isCarousel = template.template_type === 'carousel'
  const isLto = template.template_type === 'limited_time_offer'

  return (
    <div className={`overflow-hidden rounded-2xl rounded-tr-sm bg-white shadow-sm ring-1 ring-black/5 ${className || ''}`}>
      <div className="px-3 py-2">
        {template.header_text && (
          <p className="mb-0.5 text-[14px] font-semibold text-gray-900">{template.header_text}</p>
        )}
        <p className="whitespace-pre-wrap break-words text-[14px] leading-snug text-gray-800">
          {renderWhatsAppFormat(template.body_text, labels)}
        </p>
        {isLto && template.lto_title && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded bg-rose-50 px-2 py-1 text-[12px] font-medium text-rose-600">
            <Clock className="h-3.5 w-3.5" /> {template.lto_title} · expire dans {template.lto_default_hours ?? 24}h
          </div>
        )}
        {template.footer_text && !isCarousel && (
          <p className="mt-1.5 text-[11px] text-gray-400">{template.footer_text}</p>
        )}
        <div className="mt-0.5 text-right text-[10px] text-gray-400">12:00 ✓✓</div>
      </div>

      {/* Cartes carrousel */}
      {isCarousel && cards.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-t border-slate-100 p-2">
          {cards.map((c, i) => (
            <div key={i} className="w-[100px] shrink-0 overflow-hidden rounded-lg border">
              <CardImage url={c.header_media_url} />
              <p className="truncate px-1.5 py-1 text-[11px] font-medium text-gray-700">{c.body_text || `Carte ${i + 1}`}</p>
            </div>
          ))}
        </div>
      )}

      {/* Boutons globaux (non carrousel) */}
      {!isCarousel && buttons.length > 0 && (
        <div className="border-t border-slate-100">
          {buttons.map((b, i) => <ButtonRow key={i} b={b} />)}
        </div>
      )}
    </div>
  )
}
