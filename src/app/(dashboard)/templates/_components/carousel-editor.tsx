'use client'

import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, Loader2, Image as ImageIcon, Video, ExternalLink, GripVertical, Braces } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { TemplateCard, CardButton } from '@/types/database'
import { TEMPLATE_VARIABLES, VARIABLE_BY_KEY, VARIABLE_GROUPS } from '@/lib/templates/variables'
import { useTranslation } from '@/i18n/context'

/** Resynchronise les clés de variables d'une carte avec les {{n}} présents. */
function syncCardKeys(text: string, keys: string[]): string[] {
  const present = (text.match(/\{\{(\d+)\}\}/g) || []).map((v) => parseInt(v.replace(/\D/g, ''), 10))
  const maxNum = present.length ? Math.max(...present) : 0
  return keys.slice(0, maxNum)
}

/**
 * Éditeur des cartes d'un carrousel WhatsApp.
 *
 * Contraintes Meta importantes (validées ici de façon souple, et strictement au
 * submit côté serveur) :
 *  - 1 à 10 cartes
 *  - toutes les cartes ont le MÊME type de média (toutes image OU toutes vidéo)
 *  - chaque carte : média + texte (≤ 160 car.) + 1 à 2 boutons (URL / réponse rapide)
 *
 * Le composant gère lui-même l'upload média par carte (vers /api/templates/media)
 * et conserve une URL signée pour l'aperçu. Les cartes sont remontées via onChange.
 */

type PreviewMap = Record<number, string> // index carte → URL signée d'aperçu

export function CarouselEditor({
  cards,
  onChange,
  mediaKind,
  onMediaKindChange,
  initialPreviews,
}: {
  cards: TemplateCard[]
  onChange: (cards: TemplateCard[]) => void
  mediaKind: 'image' | 'video'
  onMediaKindChange: (k: 'image' | 'video') => void
  initialPreviews?: PreviewMap
}) {
  const { t } = useTranslation()
  const [previews, setPreviews] = useState<PreviewMap>(initialPreviews || {})
  const [uploading, setUploading] = useState<number | null>(null)
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({})
  const bodyRefs = useRef<Record<number, HTMLTextAreaElement | null>>({})

  // Si le parent fournit des aperçus (édition d'un carrousel existant), on les
  // adopte une fois.
  useEffect(() => {
    if (initialPreviews) setPreviews((p) => ({ ...initialPreviews, ...p }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function patchCard(i: number, patch: Partial<TemplateCard>) {
    onChange(cards.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }

  // Insère une variable nommée dans le texte de la carte i : ajoute sa clé au
  // mapping de la carte (→ numéro {{n}}) et insère le token à la position du curseur.
  function insertCardVariable(i: number, key: string) {
    const card = cards[i]
    const keys = card.body_variable_keys || []
    const token = `{{${keys.length + 1}}}`
    const ta = bodyRefs.current[i]
    const pos = ta ? ta.selectionStart : card.body_text.length
    const nextText = card.body_text.slice(0, pos) + token + card.body_text.slice(pos)
    patchCard(i, { body_text: nextText, body_variable_keys: [...keys, key] })
    if (ta) requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos + token.length, pos + token.length) })
  }

  function addCard() {
    if (cards.length >= 10) { toast.error(t('templates.toast_max_cards')); return }
    const next: TemplateCard = {
      header_type: mediaKind,
      header_media_url: null,
      body_text: '',
      buttons: [{ type: 'URL', text: t('templates.card_btn_default'), url: 'https://' }],
      body_variable_keys: [],
    }
    onChange([...cards, next])
  }

  function removeCard(i: number) {
    onChange(cards.filter((_, idx) => idx !== i))
    setPreviews((p) => {
      const next: PreviewMap = {}
      // ré-indexe les aperçus après suppression
      Object.entries(p).forEach(([k, v]) => {
        const n = Number(k)
        if (n < i) next[n] = v
        else if (n > i) next[n - 1] = v
      })
      return next
    })
  }

  async function uploadFor(i: number, file: File) {
    setUploading(i)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', mediaKind)
      const res = await fetch('/api/templates/media', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('templates.toast_upload_failed'))
      patchCard(i, { header_media_url: json.data.storage_path, header_type: mediaKind })
      setPreviews((p) => ({ ...p, [i]: json.data.signed_url || '' }))
      toast.success(t('templates.toast_card_media_imported', { n: i + 1 }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('templates.toast_error'))
    } finally {
      setUploading(null)
    }
  }

  // Boutons d'une carte (1 à 2 : URL ou réponse rapide)
  function addCardButton(i: number, type: CardButton['type']) {
    const card = cards[i]
    if (card.buttons.length >= 2) { toast.error(t('templates.toast_max_card_buttons')); return }
    const base: CardButton = type === 'URL'
      ? { type: 'URL', text: t('templates.card_btn_default'), url: 'https://' }
      : { type: 'QUICK_REPLY', text: t('templates.btn_default_reply') }
    patchCard(i, { buttons: [...card.buttons, base] })
  }
  function updateCardButton(i: number, bi: number, patch: Partial<CardButton>) {
    const card = cards[i]
    patchCard(i, { buttons: card.buttons.map((b, idx) => idx === bi ? { ...b, ...patch } as CardButton : b) })
  }
  function removeCardButton(i: number, bi: number) {
    const card = cards[i]
    patchCard(i, { buttons: card.buttons.filter((_, idx) => idx !== bi) })
  }

  const ACCEPT = mediaKind === 'image' ? 'image/jpeg,image/png' : 'video/mp4'

  return (
    <div className="space-y-3">
      {/* Type de média commun à toutes les cartes */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t('templates.carousel_cards')}</span>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-xs">
            {(['image', 'video'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onMediaKindChange(k)}
                className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors',
                  mediaKind === k ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {k === 'image' ? <ImageIcon className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
                {k === 'image' ? t('templates.images') : t('templates.videos')}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t('templates.carousel_media_hint')}
        </p>
      </div>

      {cards.map((card, i) => (
        <div key={i} className="space-y-2.5 rounded-xl border p-3">
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
            <span className="text-sm font-medium">{t('templates.card_n', { n: i + 1 })}</span>
            <button type="button" onClick={() => removeCard(i)} className="ml-auto text-destructive hover:opacity-70">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* Média de la carte */}
          <input
            ref={(el) => { fileInputs.current[i] = el }}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFor(i, f); e.target.value = '' }}
          />
          {!card.header_media_url ? (
            <button
              type="button"
              disabled={uploading === i}
              onClick={() => fileInputs.current[i]?.click()}
              className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-60"
            >
              {uploading === i ? <Loader2 className="h-5 w-5 animate-spin" /> : (mediaKind === 'image' ? <ImageIcon className="h-5 w-5" /> : <Video className="h-5 w-5" />)}
              <span>{uploading === i ? t('templates.importing_short') : (mediaKind === 'image' ? t('templates.import_image') : t('templates.import_video'))}</span>
              <span className="text-[11px] text-muted-foreground/70">{mediaKind === 'image' ? t('templates.media_hint_image') : t('templates.media_hint_video')}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border p-2">
              {mediaKind === 'image' && previews[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[i]} alt="" className="h-12 w-12 rounded object-cover" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded bg-muted text-muted-foreground">
                  {mediaKind === 'video' ? <Video className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                </span>
              )}
              <span className="flex-1 truncate text-xs text-muted-foreground">{t('templates.media_imported')}</span>
              <Button type="button" size="sm" variant="ghost" disabled={uploading === i} onClick={() => fileInputs.current[i]?.click()}>
                {uploading === i ? <Loader2 className="h-4 w-4 animate-spin" /> : t('templates.replace')}
              </Button>
              <button type="button" onClick={() => { patchCard(i, { header_media_url: null }); setPreviews((p) => ({ ...p, [i]: '' })) }} className="text-destructive hover:opacity-70">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Texte de la carte */}
          <div className="space-y-1">
            <Textarea
              ref={(el) => { bodyRefs.current[i] = el }}
              value={card.body_text}
              onChange={(e) => patchCard(i, { body_text: e.target.value, body_variable_keys: syncCardKeys(e.target.value, card.body_variable_keys || []) })}
              rows={2}
              maxLength={160}
              placeholder={t('templates.card_body_placeholder')}
            />
            <div className="flex items-center justify-between">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-muted">
                    <Braces className="h-3 w-3" /> {t('templates.variable')}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                  {VARIABLE_GROUPS.map((group, gi) => (
                    <div key={group}>
                      {gi > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">{group}</DropdownMenuLabel>
                      {TEMPLATE_VARIABLES.filter((v) => v.group === group).map((v) => (
                        <DropdownMenuItem key={v.key} onClick={() => insertCardVariable(i, v.key)} className="text-sm">
                          {v.label}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-[11px] text-muted-foreground">{card.body_text.length}/160</span>
            </div>
            {/* Légende des variables de la carte */}
            {(card.body_variable_keys || []).length > 0 && (
              <div className="space-y-0.5 rounded-md border bg-muted/30 p-1.5">
                {(card.body_variable_keys || []).map((key, vi) => (
                  <div key={vi} className="flex items-center gap-1.5 text-[11px]">
                    <code className="rounded bg-background px-1 py-0.5">{`{{${vi + 1}}}`}</code>
                    <span className="text-muted-foreground">=</span>
                    <span>{VARIABLE_BY_KEY[key]?.label || key}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Boutons de la carte */}
          <div className="space-y-1.5">
            {card.buttons.map((b, bi) => (
              <div key={bi} className="flex items-center gap-2 rounded-lg border p-1.5">
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  {b.type === 'URL' ? t('templates.card_button_site') : t('templates.card_button_reply')}
                </span>
                <Input value={b.text} onChange={(e) => updateCardButton(i, bi, { text: e.target.value })} placeholder={t('templates.btn_label_placeholder')} className="h-8 flex-1" maxLength={25} />
                {b.type === 'URL' && (
                  <Input value={b.url} onChange={(e) => updateCardButton(i, bi, { url: e.target.value } as Partial<CardButton>)} placeholder="https://…" className="h-8 flex-1" />
                )}
                <button type="button" onClick={() => removeCardButton(i, bi)} className="shrink-0 text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {card.buttons.length < 2 && (
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => addCardButton(i, 'URL')} className="rounded-lg border px-2 py-1.5 text-xs hover:bg-muted">{t('templates.add_link')}</button>
                <button type="button" onClick={() => addCardButton(i, 'QUICK_REPLY')} className="rounded-lg border px-2 py-1.5 text-xs hover:bg-muted">{t('templates.add_quick_reply')}</button>
              </div>
            )}
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" className="w-full" onClick={addCard} disabled={cards.length >= 10}>
        <Plus className="mr-1 h-4 w-4" /> {t('templates.add_card', { count: cards.length })}
      </Button>
    </div>
  )
}

/**
 * Aperçu du carrousel façon WhatsApp : message d'intro (body) puis cartes
 * défilables horizontalement (image + texte + boutons).
 */
export function CarouselPreview({
  cards,
  previews,
}: {
  cards: TemplateCard[]
  previews: PreviewMap
}) {
  const { t } = useTranslation()
  if (cards.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">{t('templates.carousel_preview_empty')}</p>
  }
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {cards.map((card, i) => (
        <div key={i} className="w-44 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          {card.header_type === 'image' && previews[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previews[i]} alt="" className="h-28 w-full object-cover" />
          ) : (
            <div className="flex h-28 w-full items-center justify-center bg-slate-200 text-slate-400">
              {card.header_type === 'video' ? <Video className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />}
            </div>
          )}
          <div className="px-2.5 py-2">
            <p className="line-clamp-3 text-[13px] leading-snug text-gray-800">
              {card.body_text || <span className="text-gray-400">{t('templates.card_text_placeholder')}</span>}
            </p>
          </div>
          {card.buttons.length > 0 && (
            <div className="border-t border-slate-100">
              {card.buttons.map((b, bi) => (
                <div key={bi} className="flex items-center justify-center gap-1.5 border-t border-slate-100 py-1.5 text-[13px] font-medium text-[#1ca5e0] first:border-t-0">
                  {b.type === 'URL' && <ExternalLink className="h-3.5 w-3.5" />}
                  {b.text || t('templates.button_fallback')}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
