'use client'

import { useEffect, useState, use, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import type { AIAgent, WhatsAppSession, WALink, KnowledgeDocument } from '@/types/database'
import { AgentTestChat } from '@/components/agent-test-chat'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft, Loader2, Plus, Trash2,
  FileText, Link2, Check,
  Upload, Tag, Play,
  Sparkles, BookOpen, Smartphone, SlidersHorizontal, Settings2,
  Globe, Shield, Bot, Image as ImageIcon, ChevronRight, MessageSquare,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { track } from '@/lib/posthog/events'

type KnowledgeImage = { id: string; ref: string; filename: string; agent_id: string | null; media_kind?: 'image' | 'video' | 'document' | null }
type AgentWithExtras = AIAgent & { team_ids?: string[] }

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [agent, setAgent]           = useState<AgentWithExtras | null>(null)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [testOpen, setTestOpen]     = useState(false)

  const [sessions, setSessions]     = useState<WhatsAppSession[]>([])
  const [links, setLinks]           = useState<WALink[]>([])
  const [docs, setDocs]             = useState<KnowledgeDocument[]>([])
  const [images, setImages]         = useState<KnowledgeImage[]>([])
  // Tous les médias du compte (y compris ceux rattachés à d'autres agents),
  // pour pouvoir les réutiliser depuis la bibliothèque.
  const [allImages, setAllImages]   = useState<KnowledgeImage[]>([])
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false)
  // URLs signées des vignettes, mises en cache par id de média.
  const [mediaUrls, setMediaUrls]   = useState<Record<string, string>>({})
  const [allDocs, setAllDocs]       = useState<KnowledgeDocument[]>([])
  // Visualisation d'un document texte (les PDF s'ouvrent dans un onglet).
  const [viewingDoc, setViewingDoc] = useState<{ name: string; content: string } | null>(null)
  // Suppression d'un document de la bibliothèque : confirmation obligatoire.
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<KnowledgeDocument | null>(null)
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const uploadDocRef = useRef<HTMLInputElement>(null)

  // Médias envoyables par l'agent (image/vidéo/document) — fenêtre SAV 24h
  const [addMediaOpen, setAddMediaOpen] = useState(false)
  const [mediaKind, setMediaKind] = useState<'image' | 'video' | 'document'>('image')
  const [mediaRef, setMediaRef] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [uploadingMedia, setUploadingMedia] = useState(false)

  const [name, setName]             = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [objective, setObjective]   = useState('')
  const [model, setModel]           = useState('gpt-4o-mini')
  const [temperature, setTemperature] = useState(0.7)
  const [tone, setTone]             = useState<'professional' | 'friendly' | 'casual'>('professional')
  const [autoDetectLanguage, setAutoDetectLanguage] = useState(false)
  const [delayMin, setDelayMin]     = useState(0)
  const [delayMax, setDelayMax]     = useState(0)
  const [maxMessages, setMaxMessages] = useState('')
  const [inactivityTimeout, setInactivityTimeout] = useState('')
  const [stopCondition, setStopCondition] = useState('')
  const [escalationEnabled, setEscalationEnabled] = useState(false)
  const [escalationMode, setEscalationMode] = useState<'keywords' | 'ai' | 'both'>('keywords')
  const [escalationKeywords, setEscalationKeywords] = useState('')
  const [escalationMessage, setEscalationMessage] = useState('')
  const [bookingUrl, setBookingUrl] = useState('')
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleStart, setScheduleStart] = useState('09:00')
  const [scheduleEnd, setScheduleEnd] = useState('18:00')
  const [scheduleDays, setScheduleDays] = useState<number[]>([1, 2, 3, 4, 5])

  type TabKey = 'personality' | 'knowledge' | 'behavior' | 'advanced'
  const [activeTab, setActiveTab] = useState<TabKey>('personality')

  const [addDocOpen, setAddDocOpen] = useState(false)
  const [addLinkOpen, setAddLinkOpen] = useState(false)
  const [linkName, setLinkName]     = useState('')
  const [linkSession, setLinkSession] = useState('')
  const [linkMessage, setLinkMessage] = useState('')
  const [linkSaving, setLinkSaving] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [agentRes, sessionsRes, linksRes, docsRes, imgsRes] = await Promise.all([
          fetch(`/api/agents/${id}`), fetch('/api/sessions'), fetch('/api/links'),
          fetch('/api/knowledge'), fetch('/api/knowledge-images'),
        ])
        const [agentJson, sessionsJson, linksJson, docsJson, imgsJson] = await Promise.all([
          agentRes.json(), sessionsRes.json(), linksRes.json(), docsRes.json(), imgsRes.json(),
        ])
        const a: AgentWithExtras = agentJson.data
        if (!a) { router.push('/agents'); return }
        setAgent(a)
        setName(a.name); setDescription(a.description || '')
        setSystemPrompt(a.system_prompt); setObjective(a.objective || '')
        setModel(a.model || 'gpt-4o-mini'); setTemperature(a.temperature ?? 0.7)
        setAutoDetectLanguage(a.auto_detect_language)
        setDelayMin(a.response_delay_min ?? 0); setDelayMax(a.response_delay_max ?? 0)
        setMaxMessages(a.max_messages_per_conversation?.toString() || '')
        setInactivityTimeout(a.inactivity_timeout_minutes?.toString() || '')
        setStopCondition(a.stop_condition || '')
        setEscalationEnabled(a.escalation_enabled)
        setEscalationMode(a.escalation_mode || 'keywords')
        setEscalationKeywords(a.escalation_keywords?.join(', ') || '')
        setEscalationMessage(a.escalation_message || '')
        setBookingUrl(a.booking_url || '')
        setScheduleEnabled(a.schedule_enabled)
        setScheduleStart(a.schedule_start_time || '09:00')
        setScheduleEnd(a.schedule_end_time || '18:00')
        setScheduleDays(a.schedule_days || [1, 2, 3, 4, 5])
        const pl = a.system_prompt.toLowerCase()
        setTone(pl.includes('chaleureux') || pl.includes('friendly') ? 'friendly'
          : pl.includes('décontracté') || pl.includes('casual') ? 'casual' : 'professional')
        setSessions(sessionsJson.data || [])
        setLinks((linksJson.data || []).filter((l: WALink) => l.ai_agent_id === id))
        setAllDocs(docsJson.data || [])
        // On garde TOUS les médias du compte : ceux de cet agent, ceux partagés
        // (agent_id null) et ceux d'autres agents — pour pouvoir les réutiliser.
        setAllImages(imgsJson.data || [])
        setImages((imgsJson.data || []).filter((i: KnowledgeImage) => i.agent_id === id || i.agent_id === null))
        const kbJson = await (await fetch(`/api/agents/${id}/knowledge`)).json()
        setDocs(kbJson.data || [])
      } finally { setLoading(false) }
    }
    load()
  }, [id, router])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), description: description.trim() || null,
          system_prompt: systemPrompt, objective: objective.trim() || null,
          model, temperature, auto_detect_language: autoDetectLanguage,
          response_delay_min: delayMin, response_delay_max: delayMax,
          max_messages_per_conversation: maxMessages ? parseInt(maxMessages) : null,
          inactivity_timeout_minutes: inactivityTimeout ? parseInt(inactivityTimeout) : null,
          stop_condition: stopCondition.trim() || null,
          escalation_enabled: escalationEnabled, escalation_mode: escalationMode,
          escalation_keywords: escalationKeywords.split(',').map(k => k.trim()).filter(Boolean),
          escalation_message: escalationMessage.trim() || null,
          booking_url: bookingUrl.trim() || null,
          schedule_enabled: scheduleEnabled, schedule_start_time: scheduleStart,
          schedule_end_time: scheduleEnd, schedule_days: scheduleDays,
        }),
      })
      const json = await res.json()
      if (res.ok) { setAgent(json.data); setSaved(true); track('agent_saved'); setTimeout(() => setSaved(false), 2000) }
      else toast.error(json.error || 'Erreur')
    } catch { toast.error('Erreur réseau') }
    finally { setSaving(false) }
  }

  async function handleToggleActive() {
    if (!agent) return
    const res = await fetch(`/api/agents/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !agent.is_active }),
    })
    if (res.ok) {
      setAgent(prev => prev ? { ...prev, is_active: !prev.is_active } : prev)
      toast.success(agent.is_active ? 'Agent désactivé' : 'Agent activé')
    }
  }

  async function handleAttachDoc(docId: string) {
    const res = await fetch(`/api/agents/${id}/knowledge`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: docId }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error || 'Impossible d\'ajouter ce document')
      return
    }
    const json = await (await fetch(`/api/agents/${id}/knowledge`)).json()
    setDocs(json.data || []); setAddDocOpen(false); toast.success('Document ajouté')
  }

  async function handleDetachDoc(docId: string) {
    await fetch(`/api/agents/${id}/knowledge/${docId}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== docId))
  }

  /** URL signée d'un média (mise en cache) — sert aux vignettes et à l'aperçu. */
  const loadMediaUrl = useCallback(async (imgId: string): Promise<string | null> => {
    if (mediaUrls[imgId]) return mediaUrls[imgId]
    try {
      const res = await fetch(`/api/knowledge-images/${imgId}`)
      const json = await res.json()
      if (!res.ok || !json.url) return null
      setMediaUrls(prev => ({ ...prev, [imgId]: json.url }))
      return json.url
    } catch { return null }
  }, [mediaUrls])

  /** Ouvre le média dans un nouvel onglet (image, vidéo ou document). */
  async function handleViewMedia(img: KnowledgeImage) {
    const url = await loadMediaUrl(img.id)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    else toast.error('Média illisible')
  }

  /** Rattache un média à CET agent, ou le partage avec tous (agent_id null).
   *  Un média n'appartient qu'à un agent à la fois : « partager » est le seul
   *  moyen de le rendre disponible à plusieurs. */
  async function handleReuseMedia(img: KnowledgeImage, shareWithAll: boolean) {
    try {
      const res = await fetch('/api/knowledge-images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: img.id, agent_id: shareWithAll ? null : id }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur')
      const nextAgentId = shareWithAll ? null : (id as string)
      setAllImages(prev => prev.map(i => i.id === img.id ? { ...i, agent_id: nextAgentId } : i))
      setImages(prev => {
        const without = prev.filter(i => i.id !== img.id)
        return [{ ...img, agent_id: nextAgentId }, ...without]
      })
      toast.success(shareWithAll ? 'Média partagé avec tous les agents' : 'Média rattaché à cet agent')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  /** Visualiser un document : PDF → nouvel onglet, texte → dialogue de lecture. */
  async function handleViewDoc(doc: KnowledgeDocument) {
    try {
      const res = await fetch(`/api/knowledge/${doc.id}/download`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Document illisible')
      if (json.type === 'pdf' && json.url) window.open(json.url, '_blank', 'noopener,noreferrer')
      else setViewingDoc({ name: json.name || doc.name, content: json.content || '' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  /** Supprimer un document de la BIBLIOTHÈQUE : il disparaît de tous les agents
   *  et son fichier est effacé. Irréversible → confirmation explicite. */
  async function handleDeleteDoc(doc: KnowledgeDocument) {
    setDeletingDoc(doc.id)
    try {
      const res = await fetch(`/api/knowledge/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Suppression impossible')
      setAllDocs(prev => prev.filter(d => d.id !== doc.id))
      setDocs(prev => prev.filter(d => d.id !== doc.id))
      setConfirmDeleteDoc(null)
      toast.success('Document supprimé')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setDeletingDoc(null)
    }
  }

  // Upload d'un document sur place (puis attaché automatiquement à l'agent)
  async function handleUploadAndAttach(file: File) {
    setUploadingDoc(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('name', file.name)
      const res = await fetch('/api/knowledge', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || !json.data?.id) throw new Error(json.error || 'Erreur upload')
      await handleAttachDoc(json.data.id)
      setAllDocs(prev => [json.data, ...prev])
      toast.success('Document uploadé et ajouté')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setUploadingDoc(false)
    }
  }

  // Uploader un média (image/vidéo/document) attaché à cet agent
  async function handleUploadMedia() {
    if (!mediaFile || !mediaRef.trim()) { toast.error('Ref et fichier requis'); return }
    setUploadingMedia(true)
    try {
      const form = new FormData()
      form.append('file', mediaFile)
      form.append('ref', mediaRef.trim())
      form.append('agent_id', id)
      form.append('media_kind', mediaKind)
      const res = await fetch('/api/knowledge-images', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur upload')
      setImages(prev => [json.data, ...prev.filter(i => i.id !== json.data.id)])
      setAddMediaOpen(false); setMediaRef(''); setMediaFile(null); setMediaKind('image')
      toast.success('Média ajouté')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setUploadingMedia(false)
    }
  }

  async function handleDeleteMedia(imgId: string) {
    await fetch(`/api/knowledge-images?id=${imgId}`, { method: 'DELETE' })
    setImages(prev => prev.filter(i => i.id !== imgId))
  }

  async function handleCreateLink() {
    if (!linkName.trim() || !linkSession) return
    setLinkSaving(true)
    try {
      const res = await fetch('/api/links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: linkName.trim(), session_id: linkSession, ai_agent_id: id, pre_filled_message: linkMessage.trim() || null, is_active: true }),
      })
      const json = await res.json()
      if (res.ok) {
        setLinks(prev => [...prev, json.data]); setAddLinkOpen(false)
        setLinkName(''); setLinkSession(''); setLinkMessage('')
        track('link_created')
        toast.success('Lien créé')
      } else toast.error(json.error || 'Erreur')
    } finally { setLinkSaving(false) }
  }

  const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  const toneLabel = tone === 'professional' ? 'Professionnel' : tone === 'friendly' ? 'Chaleureux' : 'Décontracté'
  const channelCount = sessions.length

  if (loading) return <BlobLoaderScreen />
  if (!agent) return null

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Topbar minimale : retour + 1 seule action ── */}
      <header className="shrink-0 flex items-center px-5 py-3.5 z-30">
        <Link href="/agents" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Retour</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setTestOpen(true)}
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
          >
            <Play className="h-3.5 w-3.5" /> Tester
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-semibold transition-all',
              saved ? "bg-blue-500 text-white" : 'bg-foreground text-background hover:opacity-90'
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? 'Enregistré' : 'Enregistrer'}
          </button>
        </div>
      </header>

      {/* ── Contenu : config (gauche) + aperçu sticky (droite) ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-6 pb-24 lg:grid-cols-[1fr_360px]">

          {/* ════ COLONNE GAUCHE : configuration ════ */}
          <div className="min-w-0">

          {/* En-tête : fil d'ariane + titre + badges */}
          <div className="pt-8 pb-5">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Link href="/agents" className="hover:text-foreground transition-colors">Agents</Link>
              <span className="text-muted-foreground/40">/</span>
              <span className="text-foreground/70 truncate">{name || 'Agent'}</span>
            </div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-transparent text-3xl font-bold tracking-tight focus:outline-none"
            />
            {/* Rangée de badges */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={handleToggleActive}>
                <HeaderBadge>
                  <span className={cn('h-2 w-2 rounded-full', agent.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                  {agent.is_active ? 'Actif' : 'Inactif'}
                </HeaderBadge>
              </button>
              <HeaderBadge icon={Sparkles}>{toneLabel}</HeaderBadge>
              <HeaderBadge icon={FileText}>{docs.length} document{docs.length > 1 ? 's' : ''}</HeaderBadge>
              <HeaderBadge icon={Globe}>{autoDetectLanguage ? 'Auto' : 'Français'}</HeaderBadge>
            </div>
          </div>

          {/* Barre d'onglets en pills */}
          <div className="sticky top-0 z-10 -mx-1 mb-6 px-1 py-2">
            <div className="flex gap-1 overflow-x-auto rounded-2xl border border-border/50 bg-card/60 p-1.5 backdrop-blur">
              {([
                { key: 'personality', label: 'Personnalité', icon: Sparkles },
                { key: 'knowledge', label: 'Savoir & médias', icon: BookOpen },
                { key: 'behavior', label: 'Comportement', icon: SlidersHorizontal },
                { key: 'advanced', label: 'Avancé', icon: Settings2 },
              ] as const).map(t => {
                const on = activeTab === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all',
                      on
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    )}
                  >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Contenu de l'onglet actif */}
          <div className="space-y-4">

          {/* ═══ PERSONNALITÉ ═══ */}
          {activeTab === 'personality' && (
          <Group title="Personnalité" subtitle="Identité, objectif et ton de l'agent" icon={Sparkles} color="violet">
            <RowField label="Description" hint="Affiché sous le nom de l'agent" stacked>
              <CleanInput value={description} onChange={setDescription} placeholder="Assistant commercial WhatsApp" />
            </RowField>
            <Divider />
            <RowField label="Objectif" hint="Ce que l'agent doit accomplir" stacked
              trailing={<span className="text-[11px] tabular-nums text-muted-foreground/60">{objective.length}/2000</span>}>
              <CleanTextarea value={objective} onChange={setObjective} placeholder="Qualifier les prospects et proposer un rendez-vous" rows={4} maxLength={2000} />
            </RowField>
            <Divider />
            <RowField label="Ton" trailing={<span className="text-sm text-muted-foreground">{toneLabel}</span>} stacked>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {([
                  { id: 'professional', label: 'Pro', emoji: '👔' },
                  { id: 'friendly',     label: 'Chaleureux', emoji: '😊' },
                  { id: 'casual',       label: 'Détendu', emoji: '😎' },
                ] as const).map(t => {
                  const on = tone === t.id
                  return (
                    <button key={t.id} onClick={() => setTone(t.id)}
                      className={cn('rounded-2xl py-3.5 transition-all', on ? 'bg-violet-500/15 ring-1 ring-violet-500/40' : 'bg-muted/40 hover:bg-muted/70')}>
                      <span className="block text-xl">{t.emoji}</span>
                      <span className={cn('mt-1 block text-[11px] font-medium', on ? 'text-violet-400' : 'text-muted-foreground')}>{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </RowField>
            <Divider />
            <RowField label="Détection de langue" hint="Répond dans la langue du client">
              <Switch checked={autoDetectLanguage} onCheckedChange={setAutoDetectLanguage} />
            </RowField>
          </Group>
          )}

          {/* ═══ SAVOIR & MÉDIAS ═══ */}
          {activeTab === 'knowledge' && (<>
          <Group title="Savoir" subtitle="Documents que l'agent peut utiliser" icon={BookOpen} color="blue"
            trailing={<button onClick={() => setAddDocOpen(true)} className="flex items-center gap-1 text-[13px] text-blue-500 hover:text-blue-600 transition-colors"><Plus className="h-3.5 w-3.5" /> Ajouter</button>}
          >
            {docs.length === 0 ? (
              <button onClick={() => setAddDocOpen(true)} className="w-full py-6 text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
                Aucun document personnel · Ajouter un PDF ou texte →
              </button>
            ) : (
              <>
                {docs.map((doc, i) => (
                  <div key={doc.id}>
                    {i > 0 && <Divider />}
                    <div className="group flex items-center gap-3 py-3">
                      <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{doc.name}</span>
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className={cn('h-1.5 w-1.5 rounded-full',
                            doc.status === 'ready' ? 'bg-emerald-500'
                              : doc.status === 'error' ? 'bg-red-500'
                              : 'bg-amber-500 animate-pulse')} />
                          {doc.status === 'ready' ? `${doc.chunk_count} extrait${doc.chunk_count > 1 ? 's' : ''}`
                            : doc.status === 'error' ? 'Erreur'
                            : 'Traitement…'}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => handleViewDoc(doc)} title="Visualiser"
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {/* Détache le document de CET agent, le fichier reste dans la
                            bibliothèque (la suppression définitive est dans « Ajouter »). */}
                        <button onClick={() => handleDetachDoc(doc.id)} title="Retirer de cet agent"
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </Group>

          {/* ═══ MÉDIAS ═══ (médias que l'agent peut envoyer en SAV : image/vidéo/document) */}
          <Group title="Médias" subtitle="Image, vidéo ou document que l'agent peut envoyer (fenêtre SAV 24h)" icon={ImageIcon} color="orange"
            trailing={<button onClick={() => setAddMediaOpen(true)} className="flex items-center gap-1 text-[13px] text-blue-500 hover:text-blue-600 transition-colors"><Plus className="h-3.5 w-3.5" /> Ajouter</button>}
          >
            {images.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">Aucun média pour cet agent.</p>
                <div className="mt-2 flex items-center justify-center gap-3 text-sm">
                  <button onClick={() => setAddMediaOpen(true)} className="text-blue-500 hover:text-blue-600 transition-colors">
                    Ajouter un média
                  </button>
                  {allImages.length > 0 && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <button onClick={() => setMediaLibraryOpen(true)} className="text-blue-500 hover:text-blue-600 transition-colors">
                        Réutiliser depuis la bibliothèque ({allImages.length})
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Grille de vignettes : on VOIT le média, au lieu de lire une balise. */}
                <div className="grid grid-cols-2 gap-2 py-1 sm:grid-cols-3">
                  {images.map((img) => (
                    <MediaTile
                      key={img.id}
                      img={img}
                      loadUrl={loadMediaUrl}
                      onView={() => handleViewMedia(img)}
                      onDelete={() => handleDeleteMedia(img.id)}
                    />
                  ))}
                </div>
                {allImages.length > images.length && (
                  <button onClick={() => setMediaLibraryOpen(true)}
                    className="mt-2 w-full rounded-xl border border-dashed py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                    Réutiliser un média d’un autre agent ({allImages.length - images.length})
                  </button>
                )}
              </>
            )}
          </Group>
          </>)}

          {/* ═══ COMPORTEMENT ═══ */}
          {activeTab === 'behavior' && (<>
          <Group title="Comportement" subtitle="Transfert humain et prise de rendez-vous" icon={SlidersHorizontal} color="blue">
            <RowField label="Transfert vers un humain" hint="Si le client le demande">
              <Switch checked={escalationEnabled} onCheckedChange={setEscalationEnabled} />
            </RowField>
            {escalationEnabled && (
              <>
                <Divider />
                <div className="py-3 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'keywords', label: 'Mots-clés' },
                      { id: 'ai',       label: 'IA' },
                      { id: 'both',     label: 'Les deux' },
                    ] as const).map(m => {
                      const on = escalationMode === m.id
                      return (
                        <button key={m.id} onClick={() => setEscalationMode(m.id)}
                          className={cn('rounded-xl py-2 text-xs font-medium transition-all', on ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/40' : 'bg-muted/40 text-muted-foreground hover:bg-muted/70')}>
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                  {(escalationMode === 'keywords' || escalationMode === 'both') && (
                    <CleanInput value={escalationKeywords} onChange={setEscalationKeywords} placeholder="Mots-clés : humain, conseiller…" />
                  )}
                  <CleanTextarea value={escalationMessage} onChange={setEscalationMessage} placeholder="Message de transfert…" />
                </div>
              </>
            )}
            <Divider />
            <RowField label="Lien de rendez-vous" hint="Calendly, Cal.com…" stacked>
              <CleanInput value={bookingUrl} onChange={setBookingUrl} placeholder="https://calendly.com/votre-lien" />
            </RowField>
          </Group>

          <Group title="Réponses" subtitle="Délai et condition d'arrêt" icon={MessageSquare} color="violet">
              <RowField label="Délai de réponse" hint="Temps d'attente avant que l'agent réponde">
                <span className="flex items-center gap-2 text-sm">
                  <MiniNum value={delayMin} onChange={v => setDelayMin(parseInt(v) || 0)} />
                  <span className="text-muted-foreground">–</span>
                  <MiniNum value={delayMax} onChange={v => setDelayMax(parseInt(v) || 0)} />
                  <span className="text-muted-foreground text-xs">sec</span>
                </span>
              </RowField>
              <Divider />
              <RowField label="Condition d'arrêt" hint="L'agent se met en pause si remplie" stacked>
                <CleanTextarea value={stopCondition} onChange={setStopCondition} placeholder="Ex: si le client a confirmé son rendez-vous…" />
              </RowField>
            </Group>

            <Group title="Planning horaire" subtitle="Créneaux d'activité de l'agent" icon={SlidersHorizontal} color="amber" className="mt-4">
              <RowField label="Activer le planning" hint="L'agent ne répond que sur ces créneaux">
                <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
              </RowField>
              {scheduleEnabled && (
                <>
                  <Divider />
                  <div className="py-3 space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <input type="time" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)}
                        className="rounded-xl bg-muted/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20" />
                      <span className="text-muted-foreground">→</span>
                      <input type="time" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)}
                        className="rounded-xl bg-muted/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20" />
                    </div>
                    <div className="flex gap-1.5">
                      {DAYS.map((d, i) => {
                        const on = scheduleDays.includes(i + 1)
                        return (
                          <button key={i}
                            onClick={() => setScheduleDays(prev => prev.includes(i + 1) ? prev.filter(x => x !== i + 1) : [...prev, i + 1])}
                            className={cn('flex-1 rounded-lg py-2 text-[11px] font-semibold transition-all', on ? 'bg-foreground/[0.08] ring-1 ring-foreground/20 text-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground')}>
                            {d}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </Group>
          </>)}

          {/* ═══ AVANCÉ ═══ */}
          {activeTab === 'advanced' && (
          <Group title="Modèle & génération" subtitle="Réservé aux réglages fins de l'IA" icon={Settings2} color="slate">
            <RowField label="Modèle IA" stacked>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'] as const).map(m => {
                  const on = model === m
                  return (
                    <button key={m} onClick={() => setModel(m)}
                      className={cn('rounded-xl px-4 py-2.5 text-xs font-semibold text-left transition-all', on ? 'bg-foreground/[0.08] ring-1 ring-foreground/20 text-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground')}>
                      {m}
                    </button>
                  )
                })}
              </div>
            </RowField>
            <Divider />
            <RowField label="Créativité" trailing={<span className="text-sm text-muted-foreground">{Math.round(temperature * 100)}%</span>} stacked>
              <input type="range" min="0" max="1" step="0.1" value={temperature}
                onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full accent-foreground mt-2" />
            </RowField>
            <Divider />
            <RowField label="Prompt système" stacked>
              <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                className="w-full min-h-[120px] rounded-xl bg-muted/40 px-3.5 py-3 text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all mt-1" />
            </RowField>
          </Group>
          )}

          </div>{/* fin contenu onglet */}
          </div>{/* fin colonne gauche */}

          {/* ════ COLONNE DROITE : aperçu sticky ════ */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <AgentPreviewCard
              name={name}
              description={description}
              toneLabel={toneLabel}
              isActive={agent.is_active}
              channelCount={channelCount}
              docCount={docs.length}
              mediaCount={images.length}
              language={autoDetectLanguage ? 'Auto' : 'Français'}
              onTest={() => setTestOpen(true)}
              onPermissions={() => setActiveTab('advanced')}
            />
          </div>

        </div>
      </main>

      {/* ── Dialogs ── */}
      <Dialog open={addDocOpen} onOpenChange={setAddDocOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Attacher un document</DialogTitle>
            <DialogDescription>Choisissez depuis votre bibliothèque</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 py-2 max-h-60 overflow-y-auto">
            {(() => {
              // Docs boutique (Catalogue/Pages/Politiques) = globaux, déjà inclus
              // automatiquement dans le RAG → on ne les propose pas à l'attache.
              // Deux séparateurs acceptés : « · » (noms actuels) et « — »
              // (documents créés avant le renommage, toujours en base).
              const isStoreDoc = (n: string) => /^(Catalogue|Pages|Politiques)\s*[·—]/.test(n)
              const attachable = allDocs.filter(d => !docs.find(dd => dd.id === d.id) && !isStoreDoc(d.name))
              if (attachable.length === 0) {
                return <p className="text-sm text-center text-muted-foreground py-4">Aucun document à attacher. Uploadez-en un ci-dessous.</p>
              }
              // Une ligne = attacher (clic sur le nom) + voir + supprimer.
              // Un <button> ne peut pas en contenir d'autres → conteneur <div>.
              return attachable.map(doc => (
                <div key={doc.id}
                  className="group flex items-center gap-1 rounded-xl pr-1 hover:bg-muted/50 transition-colors">
                  <button onClick={() => handleAttachDoc(doc.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left">
                    <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="truncate text-sm">{doc.name}</span>
                  </button>
                  <button onClick={() => handleViewDoc(doc)} title="Visualiser"
                    className="shrink-0 rounded-lg p-2 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100">
                    <Eye className="h-4 w-4" />
                  </button>
                  <button onClick={() => setConfirmDeleteDoc(doc)} title="Supprimer de la bibliothèque"
                    className="shrink-0 rounded-lg p-2 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            })()}
          </div>
          <input
            ref={uploadDocRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadAndAttach(f); e.target.value = '' }}
          />
          <Button
            variant="outline"
            className="w-full rounded-xl"
            disabled={uploadingDoc}
            onClick={() => uploadDocRef.current?.click()}
          >
            {uploadingDoc ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Uploader un document
          </Button>
        </DialogContent>
      </Dialog>

      {/* Lecture d'un document texte (les PDF s'ouvrent dans un onglet). */}
      <Dialog open={!!viewingDoc} onOpenChange={(o) => !o && setViewingDoc(null)}>
        <DialogContent className="sm:max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="truncate">{viewingDoc?.name}</DialogTitle>
            <DialogDescription>Contenu utilisé par l&apos;agent pour répondre.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-xl border bg-muted/30 p-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground">
              {viewingDoc?.content || 'Document vide.'}
            </pre>
          </div>
        </DialogContent>
      </Dialog>

      {/* Suppression d'un document de la BIBLIOTHÈQUE : il quitte tous les agents. */}
      <AlertDialog open={!!confirmDeleteDoc} onOpenChange={(o) => !o && setConfirmDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmDeleteDoc?.name}</strong> sera retiré de <strong>tous vos agents</strong> et
              le fichier sera définitivement effacé. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingDoc}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!deletingDoc}
              onClick={(e) => { e.preventDefault(); if (confirmDeleteDoc) handleDeleteDoc(confirmDeleteDoc) }}
            >
              {deletingDoc ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bibliothèque de médias : réutiliser un média déjà uploadé pour un autre
          agent. Un média n'appartient qu'à un agent, d'où le choix « partager ». */}
      <Dialog open={mediaLibraryOpen} onOpenChange={setMediaLibraryOpen}>
        <DialogContent className="sm:max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Bibliothèque de médias</DialogTitle>
            <DialogDescription>
              Réutilisez un média déjà envoyé par un autre agent. Un média appartient à un seul
              agent, « Partager » le rend disponible pour tous.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const others = allImages.filter((i) => i.agent_id !== id && i.agent_id !== null)
            if (others.length === 0) {
              return <p className="py-6 text-center text-sm text-muted-foreground">Aucun média rattaché à un autre agent.</p>
            }
            return (
              <div className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto py-2 sm:grid-cols-3">
                {others.map((img) => (
                  <div key={img.id} className="space-y-1.5">
                    <MediaTile img={img} loadUrl={loadMediaUrl} onView={() => handleViewMedia(img)} compact />
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]"
                        onClick={() => { handleReuseMedia(img, false); setMediaLibraryOpen(false) }}>
                        Rattacher
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 flex-1 text-[11px]"
                        onClick={() => { handleReuseMedia(img, true); setMediaLibraryOpen(false) }}>
                        Partager
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={addMediaOpen} onOpenChange={setAddMediaOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Ajouter un média</DialogTitle>
            <DialogDescription>L&apos;agent pourra l&apos;envoyer au client pendant le SAV (sans modèle).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {([
                  { id: 'image', label: 'Image', icon: Tag },
                  { id: 'video', label: 'Vidéo', icon: Play },
                  { id: 'document', label: 'Document', icon: FileText },
                ] as const).map(k => {
                  const on = mediaKind === k.id
                  return (
                    <button key={k.id} onClick={() => { setMediaKind(k.id); setMediaFile(null) }}
                      className={cn('flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs transition-colors',
                        on ? 'border-blue-500 bg-blue-500/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50')}>
                      <k.icon className="h-4 w-4" />
                      {k.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Référence (utilisée par l&apos;agent)</Label>
              <input
                value={mediaRef}
                onChange={e => setMediaRef(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-'))}
                placeholder="ex: guide-retour"
                className="mt-1.5 w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm font-mono outline-none focus:border-blue-500"
              />
              {mediaRef && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  L&apos;agent écrira <code className="font-mono">[{mediaKind === 'video' ? 'VIDEO' : mediaKind === 'document' ? 'DOC' : 'IMAGE'}:{mediaRef}]</code>
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Fichier</Label>
              <input
                type="file"
                accept={mediaKind === 'image' ? 'image/jpeg,image/png,image/webp,image/gif' : mediaKind === 'video' ? 'video/mp4,video/3gpp' : 'application/pdf'}
                onChange={e => setMediaFile(e.target.files?.[0] || null)}
                className="mt-1.5 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {mediaKind === 'image' ? 'jpeg, png, webp, gif, max 5 Mo'
                  : mediaKind === 'video' ? 'mp4, 3gp, max 16 Mo'
                  : 'pdf, max 16 Mo'}
              </p>
            </div>
            <Button className="w-full rounded-xl" disabled={uploadingMedia || !mediaFile || !mediaRef.trim()} onClick={handleUploadMedia}>
              {uploadingMedia ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Ajouter le média
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addLinkOpen} onOpenChange={setAddLinkOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Créer un lien WhatsApp</DialogTitle>
            <DialogDescription>Rattaché automatiquement à cet agent</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <RowField label="Nom" stacked>
              <CleanInput value={linkName} onChange={setLinkName} placeholder="Ex: QR Vitrine" />
            </RowField>
            <RowField label="Session WhatsApp" stacked>
              <select
                className="w-full rounded-xl bg-muted/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20 mt-1"
                value={linkSession} onChange={e => setLinkSession(e.target.value)}
              >
                <option value="">Choisir une session…</option>
                {sessions.map(s => <option key={s.id} value={s.id}>{s.display_name || s.instance_name} ({s.phone_number})</option>)}
              </select>
            </RowField>
            <RowField label="Message pré-rempli" hint="Optionnel" stacked>
              <CleanTextarea value={linkMessage} onChange={setLinkMessage} placeholder="Bonjour, je suis intéressé…" />
            </RowField>
            <button
              onClick={handleCreateLink}
              disabled={linkSaving || !linkName.trim() || !linkSession}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-foreground text-background py-2.5 text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {linkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Créer le lien
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AgentTestChat open={testOpen} onOpenChange={setTestOpen} agentId={id} agentName={agent.name} />
    </div>
  )
}

// ─── Sous-composants (style Kanal : cartes douces, icônes colorées) ──────────

/** Couleurs d'accent par section (fond teinté + icône). */
const ACCENT: Record<string, string> = {
  violet: 'bg-violet-500/15 text-violet-400',
  amber: 'bg-amber-500/15 text-amber-400',
  blue: 'bg-blue-500/15 text-blue-400',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  orange: 'bg-orange-500/15 text-orange-400',
  slate: 'bg-slate-500/15 text-slate-300',
}

function SectionIcon({ icon: Icon, color = 'violet' }: { icon: React.ElementType; color?: keyof typeof ACCENT | string }) {
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', ACCENT[color] || ACCENT.violet)}>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  )
}

/** Vignette d'un média : aperçu visuel (image), icône (vidéo/document), avec
 *  la balise que l'agent utilisera et les actions voir / supprimer. */
function MediaTile({ img, loadUrl, onView, onDelete, compact }: {
  img: KnowledgeImage
  loadUrl: (id: string) => Promise<string | null>
  onView: () => void
  onDelete?: () => void
  compact?: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const kind = img.media_kind || 'image'
  const isImage = kind === 'image'

  useEffect(() => {
    if (!isImage) return
    let alive = true
    loadUrl(img.id).then((u) => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [img.id, isImage, loadUrl])

  const Icon = kind === 'video' ? Play : kind === 'document' ? FileText : Tag
  const color = kind === 'video' ? 'text-purple-500' : kind === 'document' ? 'text-blue-500' : 'text-orange-500'
  const tag = kind === 'video' ? 'VIDEO' : kind === 'document' ? 'DOC' : 'IMAGE'

  return (
    <div className="group relative overflow-hidden rounded-xl border bg-muted/20 transition-colors hover:border-foreground/20">
      <button onClick={onView} title="Ouvrir" className="block w-full">
        <div className={cn('flex items-center justify-center overflow-hidden bg-muted/40', compact ? 'h-20' : 'h-24')}>
          {isImage && url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={img.filename} className="h-full w-full object-cover" />
          ) : (
            <Icon className={cn('h-7 w-7', color)} />
          )}
        </div>
        <div className="px-2 py-1.5 text-left">
          <code className="block truncate text-[10px] font-mono text-muted-foreground">[{tag}:{img.ref}]</code>
          <span className="block truncate text-[10px] text-muted-foreground/70">{img.filename}</span>
        </div>
      </button>
      {onDelete && (
        <button onClick={onDelete} title="Retirer"
          className="absolute right-1 top-1 rounded-lg bg-background/80 p-1 opacity-0 backdrop-blur transition-opacity hover:text-destructive group-hover:opacity-100">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      {img.agent_id === null && (
        <span className="absolute left-1 top-1 rounded bg-background/80 px-1 py-0.5 text-[9px] font-medium text-muted-foreground backdrop-blur">
          Tous
        </span>
      )}
    </div>
  )
}

function Group({ title, subtitle, trailing, children, className, icon, color, badge }: {
  title: string
  subtitle?: string
  trailing?: React.ReactNode
  children: React.ReactNode
  className?: string
  icon?: React.ElementType
  color?: string
  badge?: React.ReactNode
}) {
  return (
    <section className={cn('flex flex-col rounded-2xl border border-border/60 bg-card/40 p-5 shadow-sm', className)}>
      <div className="flex items-center gap-3">
        {icon && <SectionIcon icon={icon} color={color} />}
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {badge}
        {trailing}
      </div>
      <div className="mt-4 border-t border-border/40 pt-1">
        {children}
      </div>
    </section>
  )
}

function RowField({ label, hint, trailing, stacked, children }: {
  label: string
  hint?: string
  trailing?: React.ReactNode
  stacked?: boolean
  children?: React.ReactNode
}) {
  if (stacked) {
    return (
      <div className="py-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>
          {trailing}
        </div>
        {hint && <p className="mb-1.5 text-xs text-muted-foreground/70">{hint}</p>}
        {children}
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-1 py-3">
      <div className="min-w-0">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
      </div>
      <div className="shrink-0">{children ?? trailing}</div>
    </div>
  )
}

function Divider() {
  return <div className="h-px bg-border/40" />
}

function CleanInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/40 transition-all focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
    />
  )
}

function CleanTextarea({ value, onChange, placeholder, rows = 2, maxLength }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; maxLength?: number }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      className="w-full resize-y rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/40 transition-all focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
    />
  )
}

/** Petit badge d'en-tête (pill grise avec icône). */
function HeaderBadge({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </span>
  )
}

function MiniNum({ value, onChange, placeholder }: { value: string | number; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="number" min={0}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-16 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm text-center placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all"
    />
  )
}

// ─── Carte d'aperçu de l'agent (panneau live, colonne droite) ────────────────

function MiniStat({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: React.ReactNode; color: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', color)} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}

function PreviewAction({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl border border-border/50 bg-muted/20 px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 text-left">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
    </button>
  )
}

function AgentPreviewCard({
  name, description, toneLabel, isActive, channelCount, docCount, mediaCount, language,
  onTest, onPermissions,
}: {
  name: string
  description: string
  toneLabel: string
  isActive: boolean
  channelCount: number
  docCount: number
  mediaCount: number
  language: string
  onTest: () => void
  onPermissions: () => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-sm">
      {/* Bandeau dégradé + avatar */}
      <div className="relative h-20 bg-gradient-to-br from-violet-500/40 via-blue-500/30 to-indigo-500/40">
        <div className="absolute -bottom-6 left-5 flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-card bg-gradient-to-br from-blue-500 to-indigo-500 shadow-md">
          <Bot className="h-6 w-6 text-background" />
        </div>
        <span className={cn(
          'absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur',
          isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-muted/40 text-muted-foreground'
        )}>
          <span className={cn('h-1.5 w-1.5 rounded-full', isActive ? 'bg-emerald-400' : 'bg-muted-foreground/40')} />
          {isActive ? 'Actif' : 'Inactif'}
        </span>
      </div>

      <div className="px-5 pb-5 pt-8">
        <h3 className="truncate text-lg font-bold tracking-tight text-foreground">{name || 'Agent'}</h3>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{description || 'Aucune description'}</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-2.5 py-1 text-[11px] font-medium text-violet-400">
          <Sparkles className="h-3 w-3" /> {toneLabel}
        </span>

        {/* 4 mini-stats */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <MiniStat icon={Smartphone} label="Canaux" value={channelCount} color="text-blue-400" />
          <MiniStat icon={FileText} label="Docs" value={docCount} color="text-blue-400" />
          <MiniStat icon={ImageIcon} label="Médias" value={mediaCount} color="text-orange-400" />
          <MiniStat icon={Globe} label="Langue" value={language} color="text-violet-400" />
        </div>

        {/* Actions */}
        <div className="mt-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Actions</p>
          <div className="space-y-2">
            <PreviewAction icon={Play} label="Tester l'agent" onClick={onTest} />
            <PreviewAction icon={Shield} label="Permissions" onClick={onPermissions} />
          </div>
        </div>
      </div>
    </div>
  )
}
