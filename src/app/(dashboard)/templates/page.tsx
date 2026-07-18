'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useSessionState } from '@/hooks/use-session-state'
import { useKeepAliveFocus } from '@/components/keep-alive-outlet'
import type { WhatsAppTemplate, TemplateButton, TemplateCard } from '@/types/database'
import { track } from '@/lib/posthog/events'
import { useSubscription } from '@/hooks/use-subscription'
import { UpgradeBadge } from '@/components/upgrade-badge'
import { CarouselEditor, CarouselPreview } from './_components/carousel-editor'
import { VariableTextarea, type VariableTextareaHandle } from './_components/variable-textarea'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Loader2, Trash2, Send, RefreshCw, FileText, Sparkles, Bold, Italic, Strikethrough, Braces, Image as ImageIcon, Video, ExternalLink, Phone, Copy, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { TEMPLATE_VARIABLES, VARIABLE_BY_KEY, VARIABLE_GROUPS } from '@/lib/templates/variables'
import { TEMPLATE_LANGUAGES, TEMPLATE_LANGUAGE_LABELS } from '@/lib/i18n/contact-language'
import { USE_CASES, USE_CASE_BY_KEY, guessUseCase, type UseCaseKey } from '@/lib/templates/use-cases'
import { Package, ShoppingCart, Megaphone, MessageCircle, CreditCard, Smartphone, ChevronDown, Check } from 'lucide-react'
import Link from 'next/link'

/** Résout l'icône lucide d'un use_case (les noms viennent de use-cases.ts). */
const USE_CASE_ICONS: Record<string, typeof Package> = {
  Package, ShoppingCart, Megaphone, MessageCircle, CreditCard,
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'bg-muted text-muted-foreground' },
  pending: { label: 'En attente Meta', cls: 'bg-amber-500/15 text-amber-500' },
  approved: { label: 'Approuvé', cls: 'bg-green-500/15 text-green-500' },
  rejected: { label: 'Refusé', cls: 'bg-red-500/15 text-red-500' },
  // Template approuvé chez Meta, mais avec des modifications locales non soumises.
  modified: { label: 'Modifié, à resoumettre', cls: 'bg-orange-500/15 text-orange-600' },
}

/**
 * Statut "effectif" affiché : un template approuvé qui a des modifications
 * locales non soumises est présenté comme « Modifié — à resoumettre » (le badge
 * "Approuvé" seul serait trompeur, car la version approuvée chez Meta ne reflète
 * pas encore les changements).
 */
function effectiveStatus(t: Pick<WhatsAppTemplate, 'status' | 'has_pending_changes'>): string {
  if (t.status === 'approved' && t.has_pending_changes) return 'modified'
  return t.status
}

const LANGUAGES = TEMPLATE_LANGUAGES.map((v) => ({ value: v, label: TEMPLATE_LANGUAGE_LABELS[v] || v }))

/**
 * Rend le formatage WhatsApp (*gras*, _italique_, ~barré~) en vrai style dans
 * l'aperçu. Si `labels` est fourni, chaque {{n}} est affiché comme une pastille
 * portant le NOM de la variable (« Prénom client »…) au lieu du numéro brut.
 */
function renderWhatsAppFormat(text: string, labels?: string[]): React.ReactNode {
  if (!text) return null
  // 1) On découpe d'abord sur les variables {{n}} pour les rendre en pastilles.
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
    // 2) Sinon, formatage gras/italique/barré sur le segment de texte.
    const parts = chunk.split(/(\*[^*]+\*|_[^_]+_|~[^~]+~)/g)
    return parts.map((part, i) => {
      if (/^\*[^*]+\*$/.test(part)) return <strong key={`${ci}-${i}`}>{part.slice(1, -1)}</strong>
      if (/^_[^_]+_$/.test(part)) return <em key={`${ci}-${i}`}>{part.slice(1, -1)}</em>
      if (/^~[^~]+~$/.test(part)) return <s key={`${ci}-${i}`}>{part.slice(1, -1)}</s>
      return <span key={`${ci}-${i}`}>{part}</span>
    })
  })
}

/**
 * Détecte une variable {{n}} COLLÉE à une lettre/chiffre (ex. « {{1}}mot » ou
 * « mot{{1}} »). Meta APPROUVE ce format mais le REFUSE à l'envoi (erreur 132012)
 * → on prévient l'utilisateur en direct dans l'éditeur. Renvoie le 1er extrait
 * fautif (pour le message) ou null si tout va bien.
 */
function findGluedVariable(text: string): string | null {
  const t = text || ''
  const after = t.match(/\{\{\s*\d+\s*\}\}[\p{L}\p{N}]/u)   // {{1}}f
  if (after) return after[0]
  const before = t.match(/[\p{L}\p{N}]\{\{\s*\d+\s*\}\}/u)  // f{{1}}
  if (before) return before[0]
  return null
}

export default function TemplatesPage() {
  const { subscription } = useSubscription()
  // La création de modèles (manuelle ou IA) est réservée aux plans payants.
  const aiEnabled = subscription?.aiEnabled !== false
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [loading, setLoading] = useState(true)
  // Un WhatsApp connecté est requis pour créer/soumettre/envoyer des modèles.
  const [hasWhatsApp, setHasWhatsApp] = useState<boolean | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [submittingAll, setSubmittingAll] = useState(false)
  const [mode, setMode] = useState<'idle' | 'edit' | 'choose' | 'ai'>('idle')

  // Génération IA : questionnaire + propositions.
  const [aiObjective, setAiObjective] = useState('')
  const [aiTone, setAiTone] = useState<'professional' | 'friendly' | 'casual'>('professional')
  const [aiUseCase, setAiUseCase] = useState<UseCaseKey>('marketing')
  const [aiVarKeys, setAiVarKeys] = useState<string[]>([])
  // Assistant conversationnel : fil de discussion + question courante + saisie.
  type ChatMsg = { role: 'user' | 'assistant'; content: string }
  const [aiChat, setAiChat] = useState<ChatMsg[]>([])
  const [aiOptions, setAiOptions] = useState<string[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiThinking, setAiThinking] = useState(false)
  type AiProposal = {
    template_type: 'standard' | 'limited_time_offer' | 'carousel'
    body_text: string
    variable_keys: string[]
    buttons: ({ type: 'URL'; text: string; url: string } | { type: 'COPY_CODE'; text: string; code: string })[]
    lto_title?: string | null
    lto_hours?: number | null
    cards?: { title: string; body: string; image_url: string | null; url: string | null }[]
  }
  const [aiProposals, setAiProposals] = useState<AiProposal[]>([])
  const [editing, setEditing] = useState<WhatsAppTemplate | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Filtres de la liste : catégorie e-commerce (use_case) + recherche par nom.
  // Persistés pour la session (retrouvés en revenant sur la page Modèles).
  const [useCaseFilter, setUseCaseFilter] = useSessionState<UseCaseKey | 'all'>('templates.useCaseFilter', 'all')
  const [search, setSearch] = useSessionState<string>('templates.search', '')

  // Galerie de modèles suggérés (bibliothèque prête à l'emploi).
  type LibraryItem = { key: string; label: string; description: string; name: string; language: string; use_case: UseCaseKey; body_text: string; added: boolean }
  const [library, setLibrary] = useState<LibraryItem[]>([])
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [addingKey, setAddingKey] = useState<string | null>(null)

  // Form
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('fr')
  const [category, setCategory] = useState('UTILITY')
  const [useCase, setUseCase] = useState<UseCaseKey>('support')
  const [bodyText, setBodyText] = useState('')
  // Clés des variables nommées, dans l'ordre : variableKeys[0] = {{1}}, etc.
  const [variableKeys, setVariableKeys] = useState<string[]>([])
  const [headerText, setHeaderText] = useState('')
  const [footerText, setFooterText] = useState('')
  const [headerType, setHeaderType] = useState<'none' | 'text' | 'image' | 'video' | 'document'>('none')
  const [headerMediaUrl, setHeaderMediaUrl] = useState('') // storage_path (privé) ou URL externe
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('') // URL signée pour l'aperçu
  const [mediaFilename, setMediaFilename] = useState('')
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [buttons, setButtons] = useState<TemplateButton[]>([])
  // Carrousel
  const [templateType, setTemplateType] = useState<'standard' | 'carousel' | 'limited_time_offer'>('standard')
  const [carouselCards, setCarouselCards] = useState<TemplateCard[]>([])
  const [cardMediaKind, setCardMediaKind] = useState<'image' | 'video'>('image')
  const [cardPreviews, setCardPreviews] = useState<Record<number, string>>({})
  // Offre à durée limitée
  const [ltoTitle, setLtoTitle] = useState('')
  const [ltoHours, setLtoHours] = useState(24)
  // Confirmation de suppression
  const [confirmDelete, setConfirmDelete] = useState<WhatsAppTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const bodyRef = useRef<VariableTextareaHandle>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)

  // Formats acceptés par type d'en-tête (limites Meta).
  const MEDIA_ACCEPT = {
    image: 'image/jpeg,image/png',
    video: 'video/mp4',
    document: 'application/pdf',
  } as const

  // Upload du média d'en-tête vers le bucket privé.
  async function handleMediaUpload(file: File) {
    if (headerType === 'none' || headerType === 'text') return
    setUploadingMedia(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', headerType)
      const res = await fetch('/api/templates/media', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload échoué')
      setHeaderMediaUrl(json.data.storage_path)
      setMediaPreviewUrl(json.data.signed_url || '')
      setMediaFilename(json.data.filename || file.name)
      toast.success('Média importé')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setUploadingMedia(false)
    }
  }

  // Gestion des boutons
  function addButton(type: TemplateButton['type']) {
    if (buttons.length >= 3) { toast.error('Maximum 3 boutons'); return }
    const base = { URL: { type, text: 'Voir le site', url: 'https://' }, PHONE_NUMBER: { type, text: 'Appeler', phone: '+33' }, COPY_CODE: { type, text: 'Copier le code', code: 'PROMO10' }, QUICK_REPLY: { type, text: 'Oui' } }[type]
    setButtons([...buttons, base as TemplateButton])
  }
  function updateButton(i: number, patch: Partial<TemplateButton>) {
    setButtons(buttons.map((b, idx) => idx === i ? { ...b, ...patch } as TemplateButton : b))
  }
  function removeButton(i: number) { setButtons(buttons.filter((_, idx) => idx !== i)) }

  // Entoure la sélection du textarea avec un marqueur WhatsApp (*gras*, _italique_, ~barré~)
  function wrapSelection(mark: string) {
    const ta = bodyRef.current
    if (!ta) return
    const start = ta.selectionStart, end = ta.selectionEnd
    const sel = bodyText.slice(start, end) || 'texte'
    const next = bodyText.slice(0, start) + mark + sel + mark + bodyText.slice(end)
    setBodyText(next)
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + 1, start + 1 + sel.length) })
  }

  // Insère une variable nommée : ajoute sa clé au mapping (→ numéro {{n}}) et
  // insère le token {{n}} à la position du curseur.
  function insertVariable(key: string) {
    const nextNum = variableKeys.length + 1
    const token = `{{${nextNum}}}`
    setVariableKeys((prev) => [...prev, key])
    const ta = bodyRef.current
    if (!ta) { setBodyText(bodyText + token); return }
    const pos = ta.selectionStart
    setBodyText(bodyText.slice(0, pos) + token + bodyText.slice(pos))
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos + token.length, pos + token.length) })
  }

  // Resynchronise variableKeys avec les {{n}} réellement présents dans le texte
  // (si l'utilisateur supprime un {{n}} à la main, on retire la clé en trop).
  function syncVariableKeys(text: string, keys: string[]): string[] {
    const present = (text.match(/\{\{(\d+)\}\}/g) || []).map((v) => parseInt(v.replace(/\D/g, ''), 10))
    const maxNum = present.length ? Math.max(...present) : 0
    return keys.slice(0, maxNum)
  }

  // Renumérote les {{n}} pour qu'ils soient CONTIGUS à partir de 1, dans l'ordre
  // d'apparition (Meta l'exige : {{1}},{{2}},{{3}}… sans trou). Remappe les clés
  // de variables en conséquence. Ex : "{{3}} {{4}}" + [a,b,c,d] → "{{1}} {{2}}" + [c,d].
  function normalizeVariables(text: string, keys: string[]): { text: string; keys: string[] } {
    const order: number[] = [] // numéros d'origine, dans l'ordre d'apparition (1ère occurrence)
    const seen = new Set<number>()
    for (const m of text.match(/\{\{\s*\d+\s*\}\}/g) || []) {
      const n = parseInt(m.replace(/\D/g, ''), 10)
      if (!seen.has(n)) { seen.add(n); order.push(n) }
    }
    // Mapping ancien numéro → nouveau (1-indexé, contigu)
    const remap = new Map<number, number>()
    order.forEach((oldN, i) => remap.set(oldN, i + 1))
    // Réécrit le texte
    const newText = text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, d) => `{{${remap.get(parseInt(d, 10))}}}`)
    // Réaligne les clés : nouvelle position i ← clé de l'ancien numéro order[i]
    const newKeys = order.map((oldN) => keys[oldN - 1]).filter((k): k is string => !!k)
    return { text: newText, keys: newKeys }
  }

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates')
      const json = await res.json()
      if (res.ok) setTemplates(json.data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/templates/library')
      const json = await res.json()
      if (res.ok) setLibrary(json.data || [])
    } catch { /* silencieux */ }
  }, [])

  // Ajoute un modèle de la galerie en 1 clic (crée le brouillon).
  async function addFromLibrary(key: string) {
    setAddingKey(key)
    try {
      const res = await fetch('/api/templates/seed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await Promise.all([fetchTemplates(), fetchLibrary()])
      track('template_created', { source: 'library', key })
      toast.success('Modèle ajouté à vos brouillons')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setAddingKey(null)
    }
  }

  useEffect(() => {
    // Y a-t-il au moins une session WhatsApp connectée ? (prérequis aux modèles)
    fetch('/api/sessions')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        const sessions = Array.isArray(j.data) ? j.data : []
        const connected = sessions.some((s: { status?: string }) => s.status === 'connected')
        setHasWhatsApp(connected)
        if (connected) fetchLibrary()
      })
      .catch(() => setHasWhatsApp(false))

    // Charge la liste puis auto-synchronise le statut Meta en arrière-plan
    // (pas de bouton manuel obligatoire — comme Respond.io).
    fetchTemplates().then(() => {
      fetch('/api/templates/sync', { method: 'POST' })
        .then((r) => r.json())
        .then((j) => { if (j.data?.synced > 0) fetchTemplates() })
        .catch(() => {})
    })
  }, [fetchTemplates, fetchLibrary])

  // Re-synchronise quand l'onglet redevient visible : un modèle édité ailleurs
  // (ex. ajout de boutons depuis le builder d'automatisation) est reflété ici
  // sans rechargement manuel. Même source DB → une seule vérité, on refetch.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchTemplates() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchTemplates])

  // ⚠️ KEEP-ALIVE : la page reste MONTÉE quand on navigue ailleurs → le
  // visibilitychange ci-dessus ne suffit plus (l'onglet ne perd pas le focus).
  // On resynchronise donc quand on REVIENT sur Modèles : un modèle créé ailleurs
  // (assistant IA, builder…) apparaît alors sans rechargement manuel.
  useKeepAliveFocus('/templates', () => { fetchTemplates() })

  async function handleSeedDefaults() {
    setSeeding(true)
    try {
      const res = await fetch('/api/templates/seed', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await fetchTemplates()
      const n = json.data?.created ?? 0
      toast.success(n > 0 ? `${n} modèle(s) ajouté(s)` : 'Vous avez déjà tous les modèles par défaut')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSeeding(false)
    }
  }

  function openCreate() {
    setEditing(null)
    setSelectedId(null)
    setName(''); setLanguage('fr'); setCategory('UTILITY'); setUseCase('support')
    setBodyText(''); setVariableKeys([]); setHeaderText(''); setFooterText('Powered by Xeyo.io')
    setHeaderType('none'); setHeaderMediaUrl(''); setButtons([])
    setMediaPreviewUrl(''); setMediaFilename('')
    setTemplateType('standard'); setCarouselCards([]); setCardMediaKind('image'); setCardPreviews({})
    setLtoTitle(''); setLtoHours(24)
    setMode('edit')
  }

  // Au clic « Nouveau modèle » : écran de choix (manuel vs IA).
  function openChoose() {
    setEditing(null); setSelectedId(null)
    setAiProposals([]); setAiObjective(''); setAiVarKeys([]); setAiTone('professional'); setAiUseCase('marketing')
    setAiChat([]); setAiOptions([]); setAiInput('')
    setMode('choose')
  }

  // Assistant conversationnel : envoie le fil, reçoit une question OU les propositions.
  async function converse(nextChat: ChatMsg[]) {
    setAiThinking(true)
    setAiOptions([])
    try {
      const res = await fetch('/api/templates/converse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextChat }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      if (json.mode === 'ready') {
        // L'IA a assez d'infos → propositions générées (variables auto).
        if (json.meta?.use_case) setAiUseCase(json.meta.use_case)
        if (json.meta?.tone) setAiTone(json.meta.tone)
        if (json.meta?.objective) setAiObjective(json.meta.objective)
        setAiProposals(json.proposals || [])
        setAiChat((c) => [...c, { role: 'assistant', content: 'Voici 3 propositions basées sur votre demande 👇' }])
        if (!json.proposals?.length) toast.error('Aucune proposition, précisez votre demande.')
      } else {
        // Question suivante.
        setAiChat((c) => [...c, { role: 'assistant', content: json.question }])
        setAiOptions(Array.isArray(json.options) ? json.options : [])
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setAiThinking(false)
    }
  }

  // Envoie une réponse du marchand (saisie libre ou puce d'option).
  function sendAiAnswer(text: string) {
    const t = text.trim()
    if (!t || aiThinking) return
    const next: ChatMsg[] = [...aiChat, { role: 'user', content: t }]
    setAiChat(next)
    setAiInput('')
    setAiProposals([])
    converse(next)
  }

  // Choisit une proposition → pré-remplit l'éditeur en brouillon (avec format riche).
  function chooseProposal(p: AiProposal) {
    const uc = USE_CASE_BY_KEY[aiUseCase]
    const slug = aiObjective.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'modele_ia'
    setEditing(null); setSelectedId(null)
    setName(slug)
    setLanguage('fr')
    setUseCase(aiUseCase)
    // LTO impose MARKETING ; sinon catégorie du use_case.
    setCategory(p.template_type === 'limited_time_offer' ? 'MARKETING' : (uc?.metaCategory || 'MARKETING'))
    setBodyText(p.body_text)
    setVariableKeys(p.variable_keys)
    setHeaderText(''); setFooterText(p.template_type === 'standard' ? 'Powered by Xeyo.io' : '')
    setHeaderType('none'); setHeaderMediaUrl('')
    setMediaPreviewUrl(''); setMediaFilename('')
    setCardMediaKind('image'); setCardPreviews({})

    // Boutons (mappés vers TemplateButton de l'éditeur).
    const mappedButtons = (p.buttons || []).map((b) =>
      b.type === 'URL' ? { type: 'URL' as const, text: b.text, url: b.url }
        : { type: 'COPY_CODE' as const, text: b.text, code: b.code }
    )
    setButtons(mappedButtons)

    // Type + champs spécifiques.
    setTemplateType(p.template_type)
    if (p.template_type === 'limited_time_offer') {
      setLtoTitle(p.lto_title || ''); setLtoHours(p.lto_hours || 24)
      setCarouselCards([])
    } else if (p.template_type === 'carousel' && p.cards) {
      setLtoTitle(''); setLtoHours(24)
      // Chaque carte : image (URL Shopify) + texte + bouton lien vers le produit.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cards: any[] = p.cards.map((c) => ({
        header_type: 'image',
        header_media_url: c.image_url || '',
        body_text: c.body || c.title,
        buttons: c.url ? [{ type: 'URL', text: 'Voir', url: c.url }] : [],
        body_variable_keys: [],
      }))
      setCarouselCards(cards)
      setCardPreviews(Object.fromEntries(p.cards.map((c, i) => [i, c.image_url || ''])))
    } else {
      setLtoTitle(''); setLtoHours(24); setCarouselCards([])
    }
    setMode('edit')
    toast.success('Modèle pré-rempli, personnalisez puis enregistrez')
  }

  function openEdit(t: WhatsAppTemplate) {
    setEditing(t)
    setSelectedId(t.id)
    setName(t.name); setLanguage(t.language); setCategory(t.category)
    setUseCase((t.use_case as UseCaseKey) || guessUseCase(t.name, t.category))
    setBodyText(t.body_text)
    // Mapping des variables : on aligne sur le nombre de {{n}} présents.
    setVariableKeys(syncVariableKeys(t.body_text, (t.variable_keys as string[]) || []))
    setHeaderText(t.header_text || ''); setFooterText(t.footer_text || '')
    setHeaderType(t.header_type || (t.header_text ? 'text' : 'none'))
    setHeaderMediaUrl(t.header_media_url || '')
    setButtons(Array.isArray(t.buttons) ? t.buttons : [])
    // Aperçu du média existant : génère une URL signée si c'est un chemin privé.
    setMediaFilename(''); setMediaPreviewUrl('')
    if (t.header_media_url && !/^https?:\/\//i.test(t.header_media_url)) {
      fetch(`/api/templates/media/preview?path=${encodeURIComponent(t.header_media_url)}`)
        .then((r) => r.ok ? r.json() : null)
        .then((j) => { if (j?.data?.signed_url) setMediaPreviewUrl(j.data.signed_url) })
        .catch(() => {})
    } else if (t.header_media_url) {
      setMediaPreviewUrl(t.header_media_url)
    }
    // Type de modèle + champs spécifiques.
    const tt = (t.template_type === 'carousel' ? 'carousel' : t.template_type === 'limited_time_offer' ? 'limited_time_offer' : 'standard') as 'standard' | 'carousel' | 'limited_time_offer'
    setTemplateType(tt)
    setLtoTitle(t.lto_title || ''); setLtoHours(t.lto_default_hours || 24)
    // ⚠️ CARTES À L'ANCIENNE FORME → L'ÉDITEUR PLANTAIT À L'OUVERTURE.
    //
    // L'assistant IA a créé des carrousels avec la forme du générateur
    // ({ title, body, image_url, url }) au lieu de celle de la base
    // ({ header_media_url, body_text, buttons }). Ces lignes existent en prod.
    // L'éditeur lisait `card.buttons.length` et `card.body_text.length` sans
    // garde : « Cannot read properties of undefined (reading 'length') », page
    // blanche, modèle impossible à ouvrir — donc impossible à corriger.
    //
    // On normalise à l'ouverture plutôt que de garder chaque `.length` : le
    // marchand récupère un carrousel réparé (image + texte + lien produit)
    // qu'il peut relire et soumettre. La correction à la source est faite
    // (from-suggestion), mais les lignes déjà créées, elles, restent.
    const rawCards = Array.isArray(t.carousel_cards) ? t.carousel_cards : []
    const cards = rawCards.map((c) => {
      const legacy = c as Partial<TemplateCard> & { title?: string; body?: string; image_url?: string; url?: string }
      return {
        header_type: (legacy.header_type === 'video' ? 'video' : 'image') as 'image' | 'video',
        header_media_url: legacy.header_media_url ?? legacy.image_url ?? null,
        body_text: legacy.body_text || [legacy.title, legacy.body].filter(Boolean).join(' — ') || '',
        buttons: Array.isArray(legacy.buttons) && legacy.buttons.length > 0
          ? legacy.buttons
          : legacy.url
            ? [{ type: 'URL' as const, text: 'Voir le produit', url: legacy.url }]
            : [],
        body_variable_keys: Array.isArray(legacy.body_variable_keys) ? legacy.body_variable_keys : [],
      } as TemplateCard
    })
    setCarouselCards(cards)
    setCardMediaKind((cards[0]?.header_type as 'image' | 'video') || 'image')
    setCardPreviews({})
    cards.forEach((card, i) => {
      if (!card.header_media_url) return
      if (/^https?:\/\//i.test(card.header_media_url)) {
        setCardPreviews((p) => ({ ...p, [i]: card.header_media_url as string }))
      } else {
        fetch(`/api/templates/media/preview?path=${encodeURIComponent(card.header_media_url)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => { if (j?.data?.signed_url) setCardPreviews((p) => ({ ...p, [i]: j.data.signed_url })) })
          .catch(() => {})
      }
    })
    setMode('edit')
  }

  // Switch de langue : si une variante (même nom) existe déjà dans la langue
  // choisie, on l'ouvre. Sinon on bascule juste le champ langue (création, ou
  // langue pas encore traduite — sera générée à l'enregistrement de la source).
  function switchLanguage(lang: string) {
    if (lang === language) return
    if (editing) {
      const sibling = templates.find((t) => t.name === editing.name && t.language === lang)
      if (sibling) { openEdit(sibling); return }
    }
    setLanguage(lang)
  }

  // Langues déjà créées pour le modèle en cours d'édition (pour le sélecteur).
  const existingLangs = editing
    ? templates.filter((t) => t.name === editing.name).map((t) => t.language)
    : [language]

  // Le formulaire diffère-t-il du template chargé ? (pour avertir avant de repasser en brouillon)
  const isDirty = !!editing && (
    name !== editing.name ||
    language !== editing.language ||
    category !== editing.category ||
    useCase !== (editing.use_case || guessUseCase(editing.name, editing.category)) ||
    bodyText !== editing.body_text ||
    headerText !== (editing.header_text || '') ||
    footerText !== (editing.footer_text || '') ||
    headerType !== (editing.header_type || (editing.header_text ? 'text' : 'none')) ||
    headerMediaUrl !== (editing.header_media_url || '') ||
    JSON.stringify(buttons) !== JSON.stringify(editing.buttons || []) ||
    templateType !== (editing.template_type || 'standard') ||
    JSON.stringify(carouselCards) !== JSON.stringify(editing.carousel_cards || []) ||
    ltoTitle !== (editing.lto_title || '') ||
    ltoHours !== (editing.lto_default_hours || 24)
  )

  // Règle Meta : le message ne peut pas COMMENCER ni FINIR par une variable {{n}}.
  // On le signale en direct (même logique que la validation de soumission).
  const trimmedBody = bodyText.trim()
  // Meta refuse une variable au bord, même suivie/précédée seulement de ponctuation.
  const bodyStartsWithVar = /^[\s\p{P}]*\{\{\s*\d+\s*\}\}/u.test(trimmedBody)
  const bodyEndsWithVar = /\{\{\s*\d+\s*\}\}[\s\p{P}]*$/u.test(trimmedBody)
  // Variable collée à du texte (« {{1}}mot ») : Meta l'accepte à la validation mais
  // la refuse à l'envoi (132012). On bloque dès l'édition.
  const gluedVar = findGluedVariable(bodyText)
  const bodyEdgeError = (bodyStartsWithVar || bodyEndsWithVar)
    ? `Le message ne peut pas ${bodyStartsWithVar && bodyEndsWithVar ? 'commencer ni finir' : bodyStartsWithVar ? 'commencer' : 'finir'} par une variable. Ajoutez du texte ${bodyStartsWithVar && bodyEndsWithVar ? 'avant et après' : bodyStartsWithVar ? 'avant' : 'après'}.`
    : gluedVar
      ? `Une variable est collée à du texte (« ${gluedVar} »). Meta refuse l'envoi : ajoutez un espace avant et après la variable.`
      : null

  // Recharge les valeurs d'origine du template (annule les modifications en cours)
  function revertChanges() {
    if (editing) openEdit(editing)
  }

  // Revenir à la dernière version VALIDÉE par Meta (restaure le snapshot approuvé).
  async function restoreApproved(t: WhatsAppTemplate) {
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/templates/${t.id}`, { method: 'PUT' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      const updated = json.data as WhatsAppTemplate
      // Met à jour la liste EN MÉMOIRE immédiatement (le badge/statut affiché en
      // dépend) puis recharge le formulaire — pas besoin de refresh manuel.
      if (updated) {
        setTemplates((prev) => prev.map((x) => x.id === updated.id ? updated : x))
        openEdit(updated)
      }
      fetchTemplates() // resync en arrière-plan
      toast.success('Version approuvée restaurée')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSave() {
    if (!name.trim() || !bodyText.trim()) { toast.error('Nom et message requis'); return }
    setSaving(true)
    try {
      // Renumérote les variables pour qu'elles soient contiguës à partir de 1
      // (Meta refuse les trous : "{{3}} {{4}}" sans {{1}}/{{2}} → example invalide).
      const norm = normalizeVariables(bodyText, variableKeys)
      // Reflète la normalisation dans l'éditeur (texte + mapping) pour cohérence.
      if (norm.text !== bodyText) setBodyText(norm.text)
      if (JSON.stringify(norm.keys) !== JSON.stringify(variableKeys)) setVariableKeys(norm.keys)
      const url = editing ? `/api/templates/${editing.id}` : '/api/templates'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, language, category, use_case: useCase,
          body_text: norm.text,
          // En carrousel, l'en-tête média et les boutons globaux sont portés par
          // les cartes → on neutralise l'en-tête/les boutons du message d'intro.
          header_text: templateType === 'standard' && headerType === 'text' ? headerText : '',
          // Un carrousel ne peut pas avoir de pied de page sur le message d'intro (règle Meta).
          // Footer interdit par Meta sur carrousel ET offre limitée.
          footer_text: (templateType === 'carousel' || templateType === 'limited_time_offer') ? '' : footerText,
          header_type: templateType === 'carousel' ? 'none' : headerType,
          header_media_url: templateType === 'standard' && (headerType === 'image' || headerType === 'video' || headerType === 'document') ? headerMediaUrl : null,
          // Boutons : pour standard ET offre limitée (LTO exige un bouton CODE/lien).
          // Le carrousel porte ses boutons dans les cartes → pas de boutons globaux.
          buttons: templateType !== 'carousel' && buttons.length > 0 ? buttons : null,
          template_type: templateType,
          carousel_cards: templateType === 'carousel' && carouselCards.length > 0 ? carouselCards : null,
          lto_title: templateType === 'limited_time_offer' ? ltoTitle : null,
          lto_default_hours: templateType === 'limited_time_offer' ? ltoHours : null,
          // Mapping des variables (normalisé) + exemples Meta dérivés des clés.
          variable_keys: norm.keys,
          sample_values: norm.keys.map((k) => VARIABLE_BY_KEY[k]?.sample || 'exemple'),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      const saved = json.data as WhatsAppTemplate | undefined
      const wasSubmitted = editing && editing.status !== 'draft'
      const nowDraft = saved?.status === 'draft'
      const nowModified = saved?.status === 'approved' && saved?.has_pending_changes

      // MULTILINGUE : on ne génère les traductions QUE pour la langue source.
      // - création (pas de `editing`) → la langue tapée devient la source
      // - édition d'une ligne qui EST sa propre langue source
      // On ne (re)traduit pas en éditant une langue auto-traduite ou non-source.
      const isSourceSave = saved && (
        !editing || (editing.source_language ? editing.source_language === saved.language : true)
      ) && !saved.is_auto_translated
      let translateMsg = ''
      if (isSourceSave && saved?.id) {
        const tId = toast.loading('Traduction dans les autres langues…')
        try {
          const tr = await fetch('/api/templates/translate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_template_id: saved.id }),
          })
          const tj = await tr.json().catch(() => ({}))
          if (tr.ok && Array.isArray(tj.created) && tj.created.length > 0) {
            translateMsg = ` Traduit en ${tj.created.join(', ').toUpperCase()}.`
          }
        } catch { /* non bloquant : la langue source est sauvée */ }
        finally { toast.dismiss(tId) }
      }

      await fetchTemplates()
      // Reste en mode édition sur le modèle (re)sauvegardé pour un flux maître-détail fluide.
      if (saved?.id) { setEditing(saved); setSelectedId(saved.id) }
      if (wasSubmitted && nowModified) {
        toast.success('Modèle modifié, « à resoumettre ». La version approuvée reste active ; resoumettez à Meta pour activer vos changements.', { duration: 6000 })
      } else if (wasSubmitted && nowDraft) {
        toast.success('Modèle modifié, repassé en brouillon. Resoumettez-le à Meta pour activer les changements.', { duration: 6000 })
      } else {
        toast.success((editing ? 'Modèle modifié' : 'Modèle créé') + translateMsg, translateMsg ? { duration: 5000 } : undefined)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(t: WhatsAppTemplate) {
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/templates/${t.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      track('template_submitted', { template_id: t.id, template_type: t.template_type || 'standard' })
      await fetchTemplates()
      toast.success('Soumis à Meta pour approbation')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusyId(null)
    }
  }

  /**
   * Soumet à Meta TOUS les brouillons en un clic.
   *
   * Créer dix modèles puis les soumettre un par un est fastidieux — surtout après
   * un pack d'onboarding ou une série générée par l'IA.
   *
   * ⚠️ Ne touche QUE les brouillons. Les modèles déjà approuvés ou en attente ne
   * sont pas renvoyés (inutile), et les REFUSÉS non plus : les resoumettre sans
   * les avoir corrigés reproduit le même refus, et les refus répétés dégradent la
   * réputation du compte WhatsApp — ce qui se paie sur les envois réels.
   */
  async function handleSubmitAllDrafts() {
    // Un modèle = plusieurs lignes (une par langue) partageant le même `name` ;
    // submit-group les traite ensemble. On dédoublonne donc par nom.
    const names = Array.from(new Set(
      templates.filter((t) => t.status === 'draft').map((t) => t.name)
    ))
    if (names.length === 0) { toast.info('Aucun brouillon à soumettre.'); return }

    setSubmittingAll(true)
    const tId = toast.loading(`Soumission de ${names.length} modèle(s) à Meta…`)
    let ok = 0
    const failures: string[] = []
    try {
      // En séquence, pas en parallèle : Meta limite les créations de templates,
      // et une rafale ferait échouer des soumissions pour rien.
      for (const name of names) {
        try {
          const res = await fetch('/api/templates/submit-group', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          })
          const json = await res.json()
          if (res.ok && json.ok) ok++
          else failures.push(`${name} (${json.error || 'refusé'})`)
        } catch {
          failures.push(`${name} (réseau)`)
        }
      }
      await fetchTemplates()
      if (failures.length === 0) {
        toast.success(`${ok} modèle(s) envoyé(s) en revue chez Meta.`, { duration: 6000 })
      } else {
        toast.warning(
          `${ok} soumis. Échecs : ${failures.slice(0, 3).join(' · ')}${failures.length > 3 ? ` (+${failures.length - 3})` : ''}`,
          { duration: 9000 }
        )
      }
    } finally {
      toast.dismiss(tId)
      setSubmittingAll(false)
    }
  }

  // Soumet à Meta TOUTES les langues du modèle en un clic (résultat par langue).
  async function handleSubmitGroup(t: WhatsAppTemplate) {
    setBusyId(t.id)
    const tId = toast.loading('Soumission de toutes les langues à Meta…')
    try {
      const res = await fetch('/api/templates/submit-group', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: t.name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await fetchTemplates()
      const results = (json.results || []) as { language: string; ok: boolean; error?: string }[]
      const ok = results.filter((r) => r.ok).map((r) => r.language.toUpperCase())
      const ko = results.filter((r) => !r.ok)
      if (ko.length === 0) {
        toast.success(`Toutes les langues soumises (${ok.join(', ')}).`, { duration: 5000 })
      } else {
        toast.warning(
          `Soumises : ${ok.join(', ') || '—'}. Échecs : ${ko.map((r) => `${r.language.toUpperCase()} (${r.error})`).join(' · ')}`,
          { duration: 9000 }
        )
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      toast.dismiss(tId)
      setBusyId(null)
    }
  }

  async function handleDelete(t: WhatsAppTemplate) {
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/templates/${t.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      // Quitte l'édition si on supprimait le modèle ouvert.
      if (selectedId === t.id) { setSelectedId(null); setEditing(null); setMode('idle') }
      await fetchTemplates()
      toast.success('Modèle supprimé')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusyId(null)
      setConfirmDelete(null)
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/templates/sync', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        await fetchTemplates()
        toast.success(`${json.data?.synced ?? 0} statut(s) mis à jour`)
      } else throw new Error(json.error || 'Erreur')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <BlobLoaderScreen />

  // Modèle sélectionné (uniquement si explicitement choisi)
  const selectedTemplate = templates.find((t) => t.id === selectedId) || null
  // Le formulaire d'édition est intégré dans la colonne de droite (layout maître-détail).
  const showForm = mode === 'edit'

  // Groupement par NOM : un modèle = N langues (lignes séparées). La liste de
  // gauche affiche UNE entrée par nom (pas 5). Statut agrégé = "pire-cas".
  const STATUS_RANK: Record<string, number> = { rejected: 0, draft: 1, modified: 2, pending: 3, approved: 4 }
  const groups = Object.values(
    templates.reduce((acc, t) => {
      (acc[t.name] ||= []).push(t)
      return acc
    }, {} as Record<string, WhatsAppTemplate[]>)
  ).map((rows) => {
    // Ligne "principale" = la langue source si connue, sinon 'fr', sinon la 1re.
    const src = rows.find((r) => r.source_language && r.language === r.source_language)
    const main = src || rows.find((r) => r.language === 'fr') || rows[0]
    // Statut affiché = le plus faible (si une langue est en draft, le groupe l'est).
    const worst = rows.reduce((w, r) => {
      const s = effectiveStatus(r)
      return STATUS_RANK[s] < STATUS_RANK[effectiveStatus(w)] ? r : w
    }, rows[0])
    const langs = rows.map((r) => r.language)
    const uc = (main.use_case as UseCaseKey) || guessUseCase(main.name, main.category)
    return { name: main.name, rows, main, worst, langs, useCase: uc }
  })

  // Brouillons à soumettre. Compté par NOM et non par ligne : un modèle décliné
  // en 3 langues est 3 lignes mais UN seul modèle pour le marchand — annoncer
  // « 3 brouillons » pour un seul message serait faux.
  const draftCount = new Set(
    templates.filter((t) => t.status === 'draft').map((t) => t.name)
  ).size

  // Filtrage par onglet de catégorie + recherche par nom.
  const filteredGroups = groups.filter((g) => {
    if (useCaseFilter !== 'all' && g.useCase !== useCaseFilter) return false
    if (search.trim() && !g.name.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })
  // Compte par catégorie pour les onglets.
  const useCaseCounts = groups.reduce((acc, g) => {
    acc[g.useCase] = (acc[g.useCase] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="flex h-full flex-col p-4 md:p-6 gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 data-tour="templates-header" className="text-xl font-semibold">Modèles de messages</h1>
          <p className="text-sm text-muted-foreground">
            Messages pré-approuvés par Meta, requis pour relancer un client hors fenêtre de 24h.
          </p>
        </div>
        {/* Actions masquées tant qu'aucun WhatsApp n'est connecté (rien à faire). */}
        <div className={cn('flex items-center gap-2 flex-wrap', hasWhatsApp === false && 'hidden')}>
          <Button variant="outline" size="sm" onClick={handleSeedDefaults} disabled={seeding || !aiEnabled}>
            {seeding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            Modèles par défaut
          </Button>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={cn('mr-1 h-4 w-4', syncing && 'animate-spin')} />
            Synchroniser
          </Button>
          {/* N'apparaît QUE s'il y a des brouillons : un bouton « tout soumettre »
              affiché en permanence alors qu'il n'y a rien à soumettre est un
              piège à clic. Le compte annoncé évite aussi la mauvaise surprise. */}
          {draftCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleSubmitAllDrafts} disabled={submittingAll}>
              {submittingAll
                ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                : <Send className="mr-1 h-4 w-4" />}
              Soumettre les {draftCount} brouillon{draftCount > 1 ? 's' : ''}
            </Button>
          )}
          {aiEnabled ? (
            <Button data-tour="template-new-btn" size="sm" onClick={openChoose}>
              <Plus className="mr-1 h-4 w-4" />Nouveau modèle
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button data-tour="template-new-btn" size="sm" disabled className="cursor-not-allowed opacity-60">
                <Plus className="mr-1 h-4 w-4" />Nouveau modèle
              </Button>
              <UpgradeBadge />
            </div>
          )}
        </div>
      </div>

      {/* Onglets par catégorie e-commerce + recherche (cachés si aucun modèle). */}
      {hasWhatsApp !== false && templates.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setUseCaseFilter('all')}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                useCaseFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              Tous ({groups.length})
            </button>
            {USE_CASES.map((u) => {
              const Icon = USE_CASE_ICONS[u.icon] || FileText
              const count = useCaseCounts[u.key] || 0
              if (count === 0) return null
              return (
                <button
                  key={u.key}
                  type="button"
                  onClick={() => setUseCaseFilter(u.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    useCaseFilter === u.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {u.label} ({count})
                </button>
              )
            })}
          </div>
          <div className="relative sm:w-56">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un modèle…"
              className="w-full rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
      )}

      {/* Galerie de modèles suggérés (prêts à ajouter en 1 clic). Filtrée par
          l'onglet actif ; on n'affiche que les modèles pas encore ajoutés. */}
      {hasWhatsApp !== false && (() => {
        const suggestions = library.filter((l) =>
          !l.added && (useCaseFilter === 'all' || l.use_case === useCaseFilter)
        )
        if (suggestions.length === 0) return null
        return (
          <div className="rounded-xl border bg-muted/20">
            <button
              type="button"
              onClick={() => setLibraryOpen((o) => !o)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              Modèles suggérés
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary">{suggestions.length}</span>
              <ChevronDown className={cn('ml-auto h-4 w-4 text-muted-foreground transition-transform', !libraryOpen && '-rotate-90')} />
            </button>
            {libraryOpen && (
              <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                {suggestions.map((l) => {
                  const uc = USE_CASE_BY_KEY[l.use_case]
                  const Icon = uc ? (USE_CASE_ICONS[uc.icon] || FileText) : FileText
                  return (
                    <div key={l.key} className="flex flex-col rounded-lg border bg-card p-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">{l.label}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 flex-1 text-xs text-muted-foreground">{l.description}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2.5 h-7 w-full"
                        disabled={addingKey === l.key}
                        onClick={() => addFromLibrary(l.key)}
                      >
                        {addingKey === l.key ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                        Ajouter
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {hasWhatsApp === false ? (
        /* Prérequis : sans WhatsApp connecté, impossible de créer/soumettre/envoyer. */
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed p-10 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
            <Smartphone className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold">Connectez d&apos;abord votre WhatsApp</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Les modèles de messages sont liés à votre compte WhatsApp Business : ils y sont soumis pour approbation par Meta.
            Connectez votre WhatsApp depuis le tableau de bord pour commencer à créer vos modèles.
          </p>
          <Link href="/dashboard" className="mt-6">
            <Button>
              <Smartphone className="mr-1 h-4 w-4" /> Connecter mon WhatsApp
            </Button>
          </Link>
        </div>
      ) : templates.length === 0 && mode === 'idle' ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed p-10 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Créez vos premiers modèles</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Les modèles sont des messages pré-approuvés par Meta (confirmation de commande, panier abandonné, promo…),
            indispensables pour recontacter un client hors de la fenêtre de 24h.
          </p>
          {/* Aperçu des catégories e-commerce disponibles */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {USE_CASES.map((u) => {
              const Icon = USE_CASE_ICONS[u.icon] || FileText
              return (
                <span key={u.key} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" /> {u.label}
                </span>
              )
            })}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={handleSeedDefaults} disabled={seeding}>
              {seeding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              Ajouter les modèles prêts à l&apos;emploi
            </Button>
            <Button variant="outline" onClick={openChoose}>
              <Plus className="mr-1 h-4 w-4" /> Créer un modèle
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 min-h-0 gap-4 md:grid-cols-[320px_1fr]">
          {/* Sidebar gauche : un modèle = une entrée (toutes langues regroupées) */}
          <div className="space-y-1.5 overflow-y-auto rounded-xl border p-2">
            {filteredGroups.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun modèle dans cette catégorie.</p>
            )}
            {filteredGroups.map((g) => {
              const st = STATUS_STYLE[effectiveStatus(g.worst)] || STATUS_STYLE.draft
              const active = !!selectedTemplate && g.rows.some((r) => r.id === selectedTemplate.id)
              const ucMeta = USE_CASE_BY_KEY[g.useCase]
              const UcIcon = ucMeta ? (USE_CASE_ICONS[ucMeta.icon] || FileText) : FileText
              // Au clic : ouvrir la variante de la langue déjà sélectionnée si ce
              // groupe la possède, sinon sa langue principale.
              const openLang = g.rows.find((r) => r.language === language) || g.main
              return (
                <div
                  key={g.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEdit(openLang)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(openLang) } }}
                  className={cn(
                    'w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors',
                    active ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <UcIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <code className="truncate text-sm font-medium">{g.name}</code>
                    <span className={cn('ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px]', st.cls)}>{st.label}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{g.main.body_text}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {TEMPLATE_LANGUAGES.filter((l) => g.langs.includes(l)).map((l) => {
                      const row = g.rows.find((r) => r.language === l)!
                      const rs = effectiveStatus(row)
                      const isOpen = !!selectedTemplate && selectedTemplate.id === row.id
                      return (
                        <button
                          key={l}
                          type="button"
                          // Clic sur un badge de langue → ouvre CETTE variante pour l'éditer.
                          onClick={(e) => { e.stopPropagation(); openEdit(row) }}
                          title={`Modifier ${TEMPLATE_LANGUAGE_LABELS[l] || l} · ${(STATUS_STYLE[rs] || STATUS_STYLE.draft).label}`}
                          className={cn(
                            'rounded px-1 py-0.5 text-[9px] font-semibold uppercase transition-all hover:ring-1 hover:ring-primary/50',
                            isOpen && 'ring-1 ring-primary',
                            rs === 'approved' ? 'bg-green-500/15 text-green-600'
                              : rs === 'pending' ? 'bg-amber-500/15 text-amber-600'
                              : rs === 'rejected' ? 'bg-red-500/15 text-red-600'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {l}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Droite : formulaire d'édition intégré (layout maître-détail) */}
          <div className="flex flex-col rounded-xl border overflow-hidden min-h-0">
            {showForm ? (
              <>
                {/* Barre d'actions */}
                <div className="flex items-center justify-between gap-2 border-b bg-background px-4 py-2.5">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium">{editing ? 'Modifier le modèle' : 'Nouveau modèle'}</span>
                    {selectedTemplate && (
                      <span className={cn('mt-0.5 w-fit rounded-full px-2 py-0.5 text-[11px]', (STATUS_STYLE[effectiveStatus(selectedTemplate)] || STATUS_STYLE.draft).cls)}>
                        {(STATUS_STYLE[effectiveStatus(selectedTemplate)] || STATUS_STYLE.draft).label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Revenir à la dernière version approuvée par Meta. Affiché si
                        une version validée existe (meta_id + snapshot) ET que l'état
                        courant n'est pas déjà "approuvé sans modif" (draft, rejeté,
                        ou approuvé avec modifications non soumises). */}
                    {selectedTemplate?.meta_id && selectedTemplate?.approved_body_text &&
                      (selectedTemplate.status !== 'approved' || selectedTemplate.has_pending_changes) && (
                      <Button size="sm" variant="outline" disabled={busyId === selectedTemplate.id} onClick={() => restoreApproved(selectedTemplate)}>
                        {busyId === selectedTemplate.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
                        Version approuvée
                      </Button>
                    )}
                    {(selectedTemplate?.status === 'draft' || selectedTemplate?.status === 'rejected' ||
                      (selectedTemplate?.status === 'approved' && selectedTemplate?.has_pending_changes)) && (
                      <Button data-tour="template-submit-btn" size="sm" variant="outline" disabled={busyId === selectedTemplate.id} onClick={() => handleSubmit(selectedTemplate)}>
                        {busyId === selectedTemplate.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                        {selectedTemplate.status === 'draft' ? 'Soumettre' : 'Resoumettre'}
                      </Button>
                    )}
                    {/* Soumettre toutes les langues en un clic (si le modèle est multilingue). */}
                    {selectedTemplate && templates.filter((t) => t.name === selectedTemplate.name).length > 1 && (
                      <Button size="sm" disabled={busyId === selectedTemplate.id} onClick={() => handleSubmitGroup(selectedTemplate)}>
                        {busyId === selectedTemplate.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                        Toutes les langues
                      </Button>
                    )}
                    <Button size="sm" disabled={saving || !name.trim() || !bodyText.trim() || !!bodyEdgeError} onClick={handleSave} title={bodyEdgeError || undefined}>
                      {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                      {editing ? 'Enregistrer' : 'Créer'}
                    </Button>
                    {selectedTemplate && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={busyId === selectedTemplate.id} onClick={() => setConfirmDelete(selectedTemplate)}>
                        {busyId === selectedTemplate.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Avertissement : modifier un modèle approuvé crée des modifications
                    à resoumettre (la version approuvée reste active en attendant). */}
                {editing && editing.status !== 'draft' && isDirty && (
                  <div className="flex items-start gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="flex-1 text-xs text-amber-600 dark:text-amber-400">
                      {editing.meta_id ? (
                        <>La version <strong>approuvée</strong> reste active chez Meta et continue d&apos;être envoyée.
                        Vos changements passeront en <strong>« Modifié, à resoumettre »</strong> : <strong>resoumettez à Meta</strong> pour les activer.</>
                      ) : (
                        <>Ce modèle est <strong>{(STATUS_STYLE[editing.status] || STATUS_STYLE.draft).label.toLowerCase()}</strong> chez Meta.
                        Si vous enregistrez, il repassera en <strong>brouillon</strong> et devra être <strong>resoumis à Meta</strong>.</>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="h-7 shrink-0 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400" onClick={revertChanges}>
                      Annuler mes modifications
                    </Button>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  <div className="grid gap-6 p-4 lg:grid-cols-[minmax(340px,420px)_1fr]">
                  <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom technique</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="confirmation_commande" />
              <p className="text-xs text-muted-foreground">Minuscules, chiffres et _ uniquement.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Langue</Label>
                <Select value={language} onValueChange={switchLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LANGUAGES.map(l => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}{existingLangs.includes(l.value) ? '' : ', à traduire'}
                    </SelectItem>
                  ))}</SelectContent>
                </Select>
                {editing?.source_language && editing.language === editing.source_language && (
                  <p className="text-[11px] text-muted-foreground">Langue source (les autres en sont traduites).</p>
                )}
                {editing?.is_auto_translated && (
                  <p className="text-[11px] text-amber-600">Traduit automatiquement, modifiez librement.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Catégorie</Label>
                <Select
                  value={useCase}
                  onValueChange={(v) => {
                    const uc = USE_CASE_BY_KEY[v]
                    setUseCase(v as UseCaseKey)
                    // Le use_case fixe la catégorie Meta (sauf LTO qui force MARKETING).
                    if (templateType !== 'limited_time_offer' && uc) setCategory(uc.metaCategory)
                  }}
                  disabled={!!editing?.meta_id || templateType === 'limited_time_offer'}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {USE_CASES.map((u) => {
                      const Icon = USE_CASE_ICONS[u.icon] || FileText
                      return (
                        <SelectItem key={u.key} value={u.key}>
                          <span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" /> {u.label}</span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                {editing?.meta_id && (
                  <p className="text-[11px] text-muted-foreground">La catégorie d’un modèle déjà soumis ne peut pas être modifiée (règle Meta).</p>
                )}
              </div>
            </div>
            {/* Type de modèle : standard / carrousel / offre limitée */}
            <div className="space-y-1.5">
              <Label>Type de modèle</Label>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs">
                {([
                  { v: 'standard', l: 'Standard' },
                  { v: 'carousel', l: 'Carrousel' },
                  { v: 'limited_time_offer', l: 'Offre limitée' },
                ] as const).map(({ v, l }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setTemplateType(v)
                      // L'offre limitée impose la catégorie MARKETING (règle Meta).
                      if (v === 'limited_time_offer') setCategory('MARKETING')
                    }}
                    disabled={!!editing?.meta_id}
                    className={cn('rounded-md py-1.5 font-medium transition-colors disabled:opacity-50',
                      templateType === v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >{l}</button>
                ))}
              </div>
              {editing?.meta_id ? (
                <p className="text-[11px] text-muted-foreground">Le type d&apos;un modèle déjà soumis ne peut pas être changé.</p>
              ) : templateType === 'carousel' ? (
                <p className="text-[11px] text-muted-foreground">Message d&apos;introduction + cartes produit défilables (1 à 10).</p>
              ) : templateType === 'limited_time_offer' ? (
                <p className="text-[11px] text-muted-foreground">Compte à rebours + code promo. Catégorie Marketing obligatoire.</p>
              ) : null}
            </div>

            {/* Paramètres de l'offre à durée limitée */}
            {templateType === 'limited_time_offer' && (
              <div className="space-y-3 rounded-xl border p-3">
                <div className="space-y-1.5">
                  <Label>Titre de l&apos;offre</Label>
                  <Input value={ltoTitle} onChange={(e) => setLtoTitle(e.target.value)} placeholder="-10% pendant 2h" maxLength={16} />
                  <p className="text-[11px] text-muted-foreground">{ltoTitle.length}/16, affiché au-dessus du compte à rebours.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Durée du compte à rebours</Label>
                  <Select value={String(ltoHours)} onValueChange={(v) => setLtoHours(parseInt(v, 10))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 heure</SelectItem>
                      <SelectItem value="2">2 heures</SelectItem>
                      <SelectItem value="6">6 heures</SelectItem>
                      <SelectItem value="12">12 heures</SelectItem>
                      <SelectItem value="24">24 heures</SelectItem>
                      <SelectItem value="48">48 heures</SelectItem>
                      <SelectItem value="72">72 heures</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">L&apos;expiration est calculée à l&apos;envoi (maintenant + durée).</p>
                </div>
                <p className="rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
                  Ajoutez OBLIGATOIREMENT les deux boutons ci-dessous (exigés par Meta) :
                  <strong>« Copier le code »</strong> (code promo) <strong>ET</strong> un bouton <strong>lien « Visiter le site »</strong>.
                </p>
              </div>
            )}

            {/* En-tête : pour standard et offre limitée (le carrousel porte ses
                médias sur les cartes). */}
            {templateType !== 'carousel' && (
            <div className="space-y-2">
              <Label>En-tête (optionnel)</Label>
              {/* Sélecteur de type d'en-tête */}
              <div className="grid grid-cols-5 gap-1 rounded-lg bg-muted p-1 text-xs">
                {([
                  { v: 'none', l: 'Aucun' },
                  { v: 'text', l: 'Texte' },
                  { v: 'image', l: 'Image' },
                  { v: 'video', l: 'Vidéo' },
                  { v: 'document', l: 'Doc' },
                ] as const).map(({ v, l }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setHeaderType(v)}
                    className={cn('rounded-md py-1.5 font-medium transition-colors', headerType === v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >{l}</button>
                ))}
              </div>
              {headerType === 'text' && (
                <Input value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Votre commande est confirmée" maxLength={60} />
              )}
              {(headerType === 'image' || headerType === 'video' || headerType === 'document') && (
                <div className="space-y-2">
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept={MEDIA_ACCEPT[headerType]}
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMediaUpload(f); e.target.value = '' }}
                  />
                  {!headerMediaUrl ? (
                    <button
                      type="button"
                      disabled={uploadingMedia}
                      onClick={() => mediaInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-6 text-sm text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-60"
                    >
                      {uploadingMedia ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                        headerType === 'image' ? <ImageIcon className="h-5 w-5" /> : headerType === 'video' ? <Video className="h-5 w-5" /> : <FileText className="h-5 w-5" />
                      )}
                      <span>{uploadingMedia ? 'Import en cours…' : 'Importer un fichier'}</span>
                      <span className="text-[11px] text-muted-foreground/70">
                        {headerType === 'image' ? 'JPG ou PNG · max 5 Mo' : headerType === 'video' ? 'MP4 · max 16 Mo' : 'PDF · max 100 Mo'}
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border p-2">
                      {headerType === 'image' && mediaPreviewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaPreviewUrl} alt="" className="h-12 w-12 rounded object-cover" />
                      ) : (
                        <span className="flex h-12 w-12 items-center justify-center rounded bg-muted text-muted-foreground">
                          {headerType === 'video' ? <Video className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                        </span>
                      )}
                      <span className="flex-1 truncate text-xs">{mediaFilename || 'Fichier importé'}</span>
                      <Button type="button" size="sm" variant="ghost" onClick={() => mediaInputRef.current?.click()} disabled={uploadingMedia}>
                        {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remplacer'}
                      </Button>
                      <button type="button" onClick={() => { setHeaderMediaUrl(''); setMediaPreviewUrl(''); setMediaFilename('') }} className="text-destructive hover:opacity-70">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}
            <div className="space-y-1.5">
              <Label>{templateType === 'carousel' ? 'Message d’introduction' : 'Message'} <span className="text-destructive">*</span></Label>
              <VariableTextarea
                ref={bodyRef}
                value={bodyText}
                onChange={(v) => { setBodyText(v); setVariableKeys((prev) => syncVariableKeys(v, prev)) }}
                labels={variableKeys.map((k) => VARIABLE_BY_KEY[k]?.label || k)}
                rows={5}
                maxLength={1024}
                placeholder={'Bonjour {{1}}, votre commande #{{2}} est confirmée ! Livraison prévue le {{3}}.'}
              />
              {/* Barre d'outils : formatage WhatsApp + variable */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{bodyText.length}/1024</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => wrapSelection('*')} title="Gras" className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"><Bold className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => wrapSelection('_')} title="Italique" className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"><Italic className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => wrapSelection('~')} title="Barré" className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"><Strikethrough className="h-3.5 w-3.5" /></button>
                  <span className="mx-1 h-4 w-px bg-border" />
                  {/* Menu déroulant de variables nommées (groupées) */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button data-tour="template-variables" type="button" className="flex h-7 items-center gap-1 rounded px-2 text-xs hover:bg-muted"><Braces className="h-3.5 w-3.5" /> Variable</button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                      {VARIABLE_GROUPS.map((group, gi) => (
                        <div key={group}>
                          {gi > 0 && <DropdownMenuSeparator />}
                          <DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">{group}</DropdownMenuLabel>
                          {TEMPLATE_VARIABLES.filter((v) => v.group === group).map((v) => (
                            <DropdownMenuItem key={v.key} onClick={() => insertVariable(v.key)} className="text-sm">
                              {v.label}
                            </DropdownMenuItem>
                          ))}
                        </div>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {/* Message d'erreur en direct : variable en début/fin (refusé par Meta). */}
              {bodyEdgeError && (
                <p className="flex items-start gap-1.5 text-[12px] text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {bodyEdgeError}
                </p>
              )}
              {/* Légende : quelle variable correspond à quel {{n}} */}
              {variableKeys.length > 0 && (
                <div className="space-y-1 rounded-lg border bg-muted/30 p-2">
                  <p className="text-[11px] font-medium text-muted-foreground">Variables utilisées</p>
                  {variableKeys.map((key, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <code className="rounded bg-background px-1.5 py-0.5 text-[11px]">{`{{${i + 1}}}`}</code>
                      <span className="text-muted-foreground">=</span>
                      <span>{VARIABLE_BY_KEY[key]?.label || key}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Pied de page : interdit par Meta sur carrousel ET offre limitée. */}
            {templateType !== 'carousel' && templateType !== 'limited_time_offer' && (
              <div className="space-y-1.5">
                <Label>Pied de page (optionnel)</Label>
                <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Powered by Xeyo.io" maxLength={60} />
              </div>
            )}

            {/* Éditeur des cartes du carrousel (uniquement en mode carrousel) */}
            {templateType === 'carousel' && (
              <CarouselEditor
                cards={carouselCards}
                onChange={setCarouselCards}
                mediaKind={cardMediaKind}
                onMediaKindChange={(k) => {
                  setCardMediaKind(k)
                  // aligne le type de média de toutes les cartes existantes
                  setCarouselCards((prev) => prev.map((c) => ({ ...c, header_type: k })))
                }}
                initialPreviews={cardPreviews}
              />
            )}

            {/* Boutons, standard et offre limitée (pas le carrousel, qui a ses
                boutons par carte) */}
            {templateType !== 'carousel' && (
            <div className="space-y-2" data-tour="template-buttons">
              <Label>Boutons (optionnel)</Label>
              {buttons.map((b, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {b.type === 'URL' ? 'Site' : b.type === 'PHONE_NUMBER' ? 'Appel' : b.type === 'COPY_CODE' ? 'Code' : 'Réponse'}
                  </span>
                  <Input value={b.text} onChange={(e) => updateButton(i, { text: e.target.value })} placeholder="Libellé" className="h-8 flex-1" maxLength={25} />
                  {b.type === 'URL' && <Input value={b.url} onChange={(e) => updateButton(i, { url: e.target.value } as Partial<TemplateButton>)} placeholder="https://…" className="h-8 flex-1" />}
                  {b.type === 'PHONE_NUMBER' && <Input value={b.phone} onChange={(e) => updateButton(i, { phone: e.target.value } as Partial<TemplateButton>)} placeholder="+33…" className="h-8 flex-1" />}
                  {b.type === 'COPY_CODE' && <Input value={b.code} onChange={(e) => updateButton(i, { code: e.target.value } as Partial<TemplateButton>)} placeholder="PROMO10" className="h-8 flex-1" />}
                  <button type="button" onClick={() => removeButton(i)} className="shrink-0 text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {buttons.length < 3 && (
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => addButton('URL')} className="rounded-lg border px-2 py-1.5 text-xs hover:bg-muted">Visiter le site</button>
                  <button type="button" onClick={() => addButton('PHONE_NUMBER')} className="rounded-lg border px-2 py-1.5 text-xs hover:bg-muted">Appeler</button>
                  <button type="button" onClick={() => addButton('COPY_CODE')} className="rounded-lg border px-2 py-1.5 text-xs hover:bg-muted">Copier un code</button>
                  <button type="button" onClick={() => addButton('QUICK_REPLY')} className="rounded-lg border px-2 py-1.5 text-xs hover:bg-muted">Réponse rapide</button>
                </div>
              )}
            </div>
            )}
          </div>

          {/* Aperçu WhatsApp en direct */}
          <div className="space-y-2 lg:sticky lg:top-4 lg:self-start">
            <Label className="text-xs text-muted-foreground">Aperçu</Label>
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 p-8 dark:from-slate-800 dark:via-slate-800/80 dark:to-slate-900">
              <div className="w-full max-w-md overflow-hidden rounded-2xl rounded-tr-sm bg-white shadow-md ring-1 ring-black/5">
                {/* Header média */}
                {headerType === 'image' && (
                  mediaPreviewUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={mediaPreviewUrl} alt="" className="h-32 w-full object-cover" />
                    : <div className="flex h-32 items-center justify-center bg-slate-200 text-slate-400"><ImageIcon className="h-10 w-10" /></div>
                )}
                {headerType === 'video' && (
                  mediaPreviewUrl
                    ? <video src={mediaPreviewUrl} className="h-32 w-full bg-black object-contain" controls />
                    : <div className="flex h-32 items-center justify-center bg-slate-800 text-slate-400"><Video className="h-10 w-10" /></div>
                )}
                {headerType === 'document' && <div className="flex items-center gap-2 bg-slate-100 px-3 py-2.5 text-slate-500"><FileText className="h-5 w-5" /><span className="text-xs">{mediaFilename || 'Document.pdf'}</span></div>}
                <div className="px-3 py-2">
                  {headerType === 'text' && headerText && (
                    <p className="mb-0.5 text-[15px] font-semibold text-gray-900">{headerText}</p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-[14.5px] leading-snug text-gray-800">
                    {renderWhatsAppFormat(bodyText, variableKeys.map((k) => VARIABLE_BY_KEY[k]?.label || k)) || <span className="text-gray-400">Votre message apparaîtra ici…</span>}
                  </p>
                  {footerText && templateType !== 'carousel' && (
                    <p className="mt-1.5 text-[12px] text-gray-400">{footerText}</p>
                  )}
                  <div className="mt-0.5 text-right text-[10px] text-gray-400">12:00 ✓✓</div>
                </div>
                {/* Badge offre limitée (compte à rebours) */}
                {templateType === 'limited_time_offer' && (
                  <div className="mx-3 mb-2 flex items-center gap-1.5 rounded-lg bg-red-50 px-2 py-1.5 text-[13px] font-medium text-red-600">
                    ⏱ {ltoTitle || 'Offre limitée'} · expire dans {ltoHours}h
                  </div>
                )}
                {/* Boutons globaux (standard + offre limitée) */}
                {templateType !== 'carousel' && buttons.length > 0 && (
                  <div className="border-t border-slate-100">
                    {buttons.map((b, i) => (
                      <div key={i} className="flex items-center justify-center gap-1.5 border-t border-slate-100 py-2 text-[14px] font-medium text-[#1ca5e0] first:border-t-0">
                        {b.type === 'URL' && <ExternalLink className="h-4 w-4" />}
                        {b.type === 'PHONE_NUMBER' && <Phone className="h-4 w-4" />}
                        {b.type === 'COPY_CODE' && <Copy className="h-4 w-4" />}
                        {b.text || 'Bouton'}
                      </div>
                    ))}
                  </div>
                )}
                {/* Cartes du carrousel (sous le message d'intro) */}
                {templateType === 'carousel' && (
                  <div className="bg-slate-50 p-2">
                    <CarouselPreview cards={carouselCards} previews={cardPreviews} />
                  </div>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Les variables {'{{1}}'}, {'{{2}}'}… seront remplacées à l&apos;envoi.
            </p>
          </div>
                  </div>
                </div>
              </>
            ) : mode === 'choose' ? (
              /* Écran de choix : manuel vs IA */
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
                <p className="text-sm text-muted-foreground">Comment voulez-vous créer votre modèle ?</p>
                <div className="grid w-full max-w-md gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={openCreate}
                    className="flex flex-col items-center gap-2 rounded-2xl border p-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/30"
                  >
                    <FileText className="h-7 w-7 text-muted-foreground" />
                    <span className="text-sm font-semibold">Manuellement</span>
                    <span className="text-xs text-muted-foreground">J&apos;écris moi-même le message.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('ai')}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center transition-colors hover:border-primary/60 hover:bg-primary/10"
                  >
                    <Sparkles className="h-7 w-7 text-primary" />
                    <span className="text-sm font-semibold">Générer avec l&apos;IA</span>
                    <span className="text-xs text-muted-foreground">Je réponds à 3 questions, l&apos;IA propose.</span>
                  </button>
                </div>
              </div>
            ) : mode === 'ai' ? (
              /* Questionnaire IA + 3 propositions */
              <div className="flex flex-1 flex-col overflow-y-auto p-4">
                <div className="mb-3 flex items-center gap-2">
                  <button type="button" onClick={openChoose} className="text-xs text-muted-foreground hover:text-foreground">← Retour</button>
                  <span className="text-sm font-medium">Générer un modèle avec l&apos;IA</span>
                </div>

                {/* Assistant conversationnel : l'IA pose des questions, variables auto */}
                <div className="flex flex-col gap-3 rounded-xl border p-4">
                  {/* Fil de discussion */}
                  <div className="space-y-2.5">
                    {aiChat.length === 0 && (
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10"><Sparkles className="h-3.5 w-3.5 text-primary" /></span>
                        <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">
                          Bonjour ! Décrivez-moi le message que vous voulez créer, par exemple « relancer un panier abandonné » ou « prévenir que la commande est expédiée ».
                        </div>
                      </div>
                    )}
                    {aiChat.map((m, i) => (
                      <div key={i} className={cn('flex items-start gap-2', m.role === 'user' && 'flex-row-reverse')}>
                        <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', m.role === 'user' ? 'bg-primary/20' : 'bg-primary/10')}>
                          {m.role === 'user' ? <span className="text-[10px] font-semibold">Vous</span> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                        </span>
                        <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                          m.role === 'user' ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm bg-muted')}>
                          {m.content}
                        </div>
                      </div>
                    ))}
                    {aiThinking && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> L&apos;assistant réfléchit…
                      </div>
                    )}
                  </div>

                  {/* Réponses rapides suggérées par l'IA */}
                  {aiOptions.length > 0 && !aiThinking && (
                    <div className="flex flex-wrap gap-1.5">
                      {aiOptions.map((opt) => (
                        <button key={opt} type="button" onClick={() => sendAiAnswer(opt)}
                          className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/10">
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Saisie */}
                  <div className="flex items-center gap-2">
                    <input
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') sendAiAnswer(aiInput) }}
                      placeholder="Votre réponse…"
                      disabled={aiThinking}
                      className="flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                    />
                    <Button size="sm" disabled={aiThinking || !aiInput.trim()} onClick={() => sendAiAnswer(aiInput)}>
                      {aiThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Envoyer'}
                    </Button>
                  </div>
                </div>

                {/* 3 propositions en aperçu WhatsApp */}
                {aiProposals.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">Choisissez une proposition :</p>
                    {aiProposals.map((p, i) => {
                      const labels = p.variable_keys.map((k) => VARIABLE_BY_KEY[k]?.label || k)
                      const typeLabel = p.template_type === 'limited_time_offer' ? '🏷️ Offre limitée'
                        : p.template_type === 'carousel' ? '🎠 Carrousel produits' : '💬 Message + boutons'
                      return (
                        <div key={i} className="rounded-xl border p-3">
                          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">{typeLabel}</div>
                          {/* Bulle WhatsApp */}
                          <div className="overflow-hidden rounded-2xl rounded-tr-sm bg-white shadow-sm ring-1 ring-black/5">
                            <div className="px-3 py-2">
                              <p className="whitespace-pre-wrap break-words text-[14px] leading-snug text-gray-800">
                                {renderWhatsAppFormat(p.body_text, labels)}
                              </p>
                              {/* Bandeau offre limitée */}
                              {p.template_type === 'limited_time_offer' && p.lto_title && (
                                <div className="mt-1.5 flex items-center gap-1.5 rounded bg-rose-50 px-2 py-1 text-[12px] font-medium text-rose-600">
                                  ⏱ {p.lto_title} · expire dans {p.lto_hours ?? 24}h
                                </div>
                              )}
                              <div className="mt-0.5 text-right text-[10px] text-gray-400">12:00 ✓✓</div>
                            </div>
                            {/* Boutons */}
                            {p.buttons.length > 0 && (
                              <div className="border-t border-slate-100">
                                {p.buttons.map((b, bi) => (
                                  <div key={bi} className="flex items-center justify-center gap-1.5 border-t border-slate-100 py-1.5 text-[13px] font-medium text-[#1ca5e0] first:border-t-0">
                                    {b.type === 'URL' ? <ExternalLink className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                    {b.text}
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Cartes carrousel produits */}
                            {p.template_type === 'carousel' && p.cards && p.cards.length > 0 && (
                              <div className="flex gap-2 overflow-x-auto border-t border-slate-100 p-2">
                                {p.cards.map((c, ci) => (
                                  <div key={ci} className="w-[110px] shrink-0 overflow-hidden rounded-lg border">
                                    {c.image_url
                                      // eslint-disable-next-line @next/next/no-img-element
                                      ? <img src={c.image_url} alt="" className="h-[70px] w-full object-cover" />
                                      : <div className="flex h-[70px] items-center justify-center bg-slate-100 text-slate-300"><ImageIcon className="h-5 w-5" /></div>}
                                    <p className="truncate px-1.5 py-1 text-[11px] font-medium text-gray-700">{c.title || c.body}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => chooseProposal(p)}>
                            <Check className="mr-1 h-3.5 w-3.5" /> Choisir cette version
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
                <FileText className="h-8 w-8 opacity-50" />
                <p>Sélectionnez un modèle ou créez-en un.</p>
                <Button size="sm" onClick={openChoose}>
                  <Plus className="mr-1 h-4 w-4" />Nouveau modèle
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation de suppression d'un modèle */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce modèle ?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (() => {
                const langs = templates.filter((t) => t.name === confirmDelete.name).map((t) => t.language)
                return (
                  <>
                    Le modèle <strong>{confirmDelete.name}</strong> sera définitivement supprimé
                    {langs.length > 1 ? <> dans <strong>toutes ses langues</strong> ({langs.map((l) => l.toUpperCase()).join(', ')})</> : null}
                    {confirmDelete.meta_id ? <>, y compris chez <strong>Meta</strong></> : null}.
                    {' '}Cette action est <strong>irréversible</strong>.
                  </>
                )
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busyId}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!busyId}
              onClick={(e) => { e.preventDefault(); if (confirmDelete) handleDelete(confirmDelete) }}
            >
              {busyId ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
