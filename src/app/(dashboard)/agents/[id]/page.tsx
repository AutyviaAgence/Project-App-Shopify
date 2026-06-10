'use client'

import { useEffect, useState, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import type { AIAgent, WhatsAppSession, WALink, KnowledgeDocument } from '@/types/database'
import { AgentTestChat } from '@/components/agent-test-chat'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft, Loader2, Plus, Trash2,
  ChevronDown, FileText, Link2, QrCode, Check,
  Upload, Tag, Play,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type KnowledgeImage = { id: string; ref: string; filename: string; agent_id: string | null }
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
  const [allDocs, setAllDocs]       = useState<KnowledgeDocument[]>([])
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const uploadDocRef = useRef<HTMLInputElement>(null)

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

  const [addDocOpen, setAddDocOpen] = useState(false)
  const [addLinkOpen, setAddLinkOpen] = useState(false)
  const [linkName, setLinkName]     = useState('')
  const [linkSession, setLinkSession] = useState('')
  const [linkMessage, setLinkMessage] = useState('')
  const [linkSaving, setLinkSaving] = useState(false)
  const [savingSession, setSavingSession] = useState<string | null>(null)

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
        setImages((imgsJson.data || []).filter((i: KnowledgeImage) => i.agent_id === id))
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
      if (res.ok) { setAgent(json.data); setSaved(true); setTimeout(() => setSaved(false), 2000) }
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
    await fetch(`/api/agents/${id}/knowledge`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: docId }),
    })
    const json = await (await fetch(`/api/agents/${id}/knowledge`)).json()
    setDocs(json.data || []); setAddDocOpen(false); toast.success('Document ajouté')
  }

  async function handleDetachDoc(docId: string) {
    await fetch(`/api/agents/${id}/knowledge/${docId}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== docId))
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

  async function handleToggleSession(s: WhatsAppSession) {
    const assigned = s.qualifier_agent_id === id
    const newValue = assigned ? null : id
    setSavingSession(s.id)
    try {
      const res = await fetch(`/api/sessions/${s.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qualifier_agent_id: newValue }),
      })
      if (res.ok) {
        setSessions(prev => prev.map(x => x.id === s.id ? { ...x, qualifier_agent_id: newValue } : x))
        toast.success(assigned ? 'Agent retiré de la session' : 'Agent activé sur la session')
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSavingSession(null) }
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
        toast.success('Lien créé')
      } else toast.error(json.error || 'Erreur')
    } finally { setLinkSaving(false) }
  }

  const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  const toneLabel = tone === 'professional' ? 'Professionnel' : tone === 'friendly' ? 'Chaleureux' : 'Décontracté'

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
              saved ? 'bg-emerald-500 text-white' : 'bg-foreground text-background hover:opacity-90'
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? 'Enregistré' : 'Enregistrer'}
          </button>
        </div>
      </header>

      {/* ── Bento : blocs de tailles variées ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="w-full px-8 pb-24">

          {/* Titre */}
          <div className="pt-8 pb-8">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-transparent text-3xl font-bold tracking-tight focus:outline-none"
            />
            <button
              onClick={handleToggleActive}
              className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className={cn('h-2 w-2 rounded-full', agent.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
              {agent.is_active ? 'Actif' : 'Inactif'}
            </button>
          </div>

          {/* Grille bento : Personnalité (large, 2 col) + Canaux (haut, 1 col x 2 rangées) ; Savoir + Comportement en bas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-min">

          {/* ═══ PERSONNALITÉ ═══ (large : 2 colonnes) */}
          <Group title="Personnalité" className="md:col-span-2">
            <RowField label="Description" hint="Affiché sous le nom de l'agent" stacked>
              <CleanInput value={description} onChange={setDescription} placeholder="Assistant commercial WhatsApp" />
            </RowField>
            <Divider />
            <RowField label="Objectif" hint="Ce que l'agent doit accomplir" stacked>
              <CleanTextarea value={objective} onChange={setObjective} placeholder="Qualifier les prospects et proposer un rendez-vous" rows={4} />
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

          {/* ═══ CANAUX ═══ (colonne droite, haute : 2 rangées) */}
          <Group title="Canaux" subtitle="Numéros sur lesquels cet agent répond" className="md:col-span-1 md:row-span-2">
            {sessions.length === 0 ? (
              <button onClick={() => router.push('/sessions')} className="w-full py-6 text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
                Aucune session · Connecter WhatsApp →
              </button>
            ) : (
              sessions.map((s, i) => {
                const assigned = s.qualifier_agent_id === id
                const takenByOther = !!s.qualifier_agent_id && !assigned
                return (
                  <div key={s.id}>
                    {i > 0 && <Divider />}
                    <button
                      onClick={() => handleToggleSession(s)}
                      disabled={savingSession === s.id}
                      className="w-full flex items-center gap-3 py-3.5 text-left"
                    >
                      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', s.status === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{s.display_name || s.instance_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {s.phone_number || '—'}
                          {takenByOther && <span className="text-amber-500"> · autre agent</span>}
                        </p>
                      </div>
                      {savingSession === s.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                      ) : (
                        <span className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all',
                          assigned ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border'
                        )}>
                          {assigned && <Check className="h-3.5 w-3.5" />}
                        </span>
                      )}
                    </button>
                  </div>
                )
              })
            )}

            {/* Liens QR */}
            <Divider />
            <RowField label="Liens WhatsApp" trailing={
              <button onClick={() => setAddLinkOpen(true)} className="flex items-center gap-1 text-[13px] text-emerald-500 hover:text-emerald-600 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Créer
              </button>
            }>
              {links.length > 0 && <span className="text-sm text-muted-foreground">{links.length}</span>}
            </RowField>
            {links.map((link, i) => (
              <div key={link.id}>
                {i > 0 && <Divider />}
                <div className="flex items-center gap-3 py-3">
                  <QrCode className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{link.name}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">/{link.slug}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{link.click_count ?? 0} clics</span>
                </div>
              </div>
            ))}
          </Group>

          {/* ═══ SAVOIR ═══ (sous Personnalité, colonne gauche) */}
          <Group title="Savoir" subtitle="Documents que l'agent peut utiliser" className="md:col-span-1"
            trailing={<button onClick={() => setAddDocOpen(true)} className="flex items-center gap-1 text-[13px] text-blue-500 hover:text-blue-600 transition-colors"><Plus className="h-3.5 w-3.5" /> Ajouter</button>}
          >
            {docs.length === 0 && images.length === 0 ? (
              <button onClick={() => setAddDocOpen(true)} className="w-full py-6 text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
                Aucune ressource · Parcourir la bibliothèque →
              </button>
            ) : (
              <>
                {docs.map((doc, i) => (
                  <div key={doc.id}>
                    {i > 0 && <Divider />}
                    <div className="group flex items-center gap-3 py-3">
                      <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="text-sm flex-1 truncate">{doc.name}</span>
                      <button onClick={() => handleDetachDoc(doc.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                      </button>
                    </div>
                  </div>
                ))}
                {images.map(img => (
                  <div key={img.id} className="flex items-center gap-3 py-3">
                    <Tag className="h-4 w-4 text-orange-500 shrink-0" />
                    <code className="text-xs font-mono">{img.ref}</code>
                  </div>
                ))}
              </>
            )}
          </Group>

          {/* ═══ COMPORTEMENT ═══ (à côté de Savoir) */}
          <Group title="Comportement" className="md:col-span-1">
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

          </div>{/* fin grille bento */}

          {/* ═══ AVANCÉ (replié) ═══ */}
          <details className="group mt-4">
            <summary className="flex cursor-pointer list-none items-center justify-center gap-2 py-3 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors select-none">
              Paramètres avancés
              <ChevronDown className="h-4 w-4 group-open:rotate-180 transition-transform" />
            </summary>

            <Group title="Modèle & génération" className="mt-4">
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
              <RowField label={`Créativité`} trailing={<span className="text-sm text-muted-foreground">{Math.round(temperature * 100)}%</span>} stacked>
                <input type="range" min="0" max="1" step="0.1" value={temperature}
                  onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full accent-foreground mt-2" />
              </RowField>
              <Divider />
              <RowField label="Prompt système" stacked>
                <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                  className="w-full min-h-[120px] rounded-xl bg-muted/40 px-3.5 py-3 text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all mt-1" />
              </RowField>
            </Group>

            <Group title="Limites & timing" className="mt-4">
              <RowField label="Délai de réponse">
                <span className="flex items-center gap-2 text-sm">
                  <MiniNum value={delayMin} onChange={v => setDelayMin(parseInt(v) || 0)} />
                  <span className="text-muted-foreground">–</span>
                  <MiniNum value={delayMax} onChange={v => setDelayMax(parseInt(v) || 0)} />
                  <span className="text-muted-foreground text-xs">sec</span>
                </span>
              </RowField>
              <Divider />
              <RowField label="Max messages">
                <MiniNum value={maxMessages} onChange={setMaxMessages} placeholder="∞" />
              </RowField>
              <Divider />
              <RowField label="Timeout inactivité">
                <span className="flex items-center gap-2 text-sm">
                  <MiniNum value={inactivityTimeout} onChange={setInactivityTimeout} placeholder="—" />
                  <span className="text-muted-foreground text-xs">min</span>
                </span>
              </RowField>
              <Divider />
              <RowField label="Condition d'arrêt" stacked>
                <CleanTextarea value={stopCondition} onChange={setStopCondition} placeholder="Ex: si le client a confirmé son rendez-vous…" />
              </RowField>
            </Group>

            <Group title="Planning horaire" className="mt-4">
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
          </details>
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
            {allDocs.filter(d => !docs.find(dd => dd.id === d.id)).map(doc => (
              <button key={doc.id} onClick={() => handleAttachDoc(doc.id)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/50 transition-colors text-left">
                <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                <span className="text-sm">{doc.name}</span>
              </button>
            ))}
            {allDocs.filter(d => !docs.find(dd => dd.id === d.id)).length === 0 && (
              <p className="text-sm text-center text-muted-foreground py-4">Tous les documents sont déjà attachés</p>
            )}
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

// ─── Sous-composants (style Revolut : minimal, peu de bordures) ───────────────

function Group({ title, subtitle, trailing, children, className }: {
  title: string
  subtitle?: string
  trailing?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col rounded-3xl bg-muted/[0.18] p-5', className)}>
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground/40 mt-0.5">{subtitle}</p>}
        </div>
        {trailing}
      </div>
      <div className="flex-1">
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
      <div className="py-3.5">
        <div className="flex items-baseline justify-between mb-1.5">
          <div>
            <Label className="text-sm font-medium">{label}</Label>
            {hint && <span className="ml-2 text-xs text-muted-foreground/60">{hint}</span>}
          </div>
          {trailing}
        </div>
        {children}
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-3 py-3.5">
      <div className="min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground/60">{hint}</p>}
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
      className="w-full rounded-xl bg-muted/40 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all"
    />
  )
}

function CleanTextarea({ value, onChange, placeholder, rows = 2 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-xl bg-muted/40 px-3.5 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/40 resize-y focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all"
    />
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
