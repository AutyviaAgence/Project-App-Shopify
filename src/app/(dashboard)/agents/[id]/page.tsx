'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import type { AIAgent, WhatsAppSession, WALink, KnowledgeDocument } from '@/types/database'
import { AgentTestChat } from '@/components/agent-test-chat'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft, Brain, BookOpen, Zap, Smartphone,
  Power, PowerOff, Play, Loader2, Plus, Trash2,
  ChevronDown, FileText, Link2, QrCode, Check,
  Save, Upload, Tag, UserCheck, CalendarCheck,
  Languages, Settings2,
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
  const connected = sessions.filter(s => s.status === 'connected')

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
  if (!agent) return null

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Topbar ── */}
      <header className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-border/50 bg-background/95 backdrop-blur-xl z-30">
        <Link href="/agents" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Retour</span>
        </Link>

        <div className="ml-1 min-w-0 flex items-center gap-2">
          <span className="text-sm font-semibold truncate">{agent.name}</span>
          <span className={cn(
            'shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
            agent.is_active ? 'bg-emerald-500/12 text-emerald-500' : 'bg-muted text-muted-foreground'
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', agent.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/50')} />
            {agent.is_active ? 'Actif' : 'Inactif'}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setTestOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
          >
            <Play className="h-3.5 w-3.5" /> Tester
          </button>
          <button
            onClick={handleToggleActive}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border',
              agent.is_active
                ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-600 hover:bg-emerald-500/15'
                : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
            )}
          >
            {agent.is_active ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{agent.is_active ? 'Actif' : 'Inactif'}</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all',
              saved ? 'bg-emerald-500 text-white' : 'bg-foreground text-background hover:opacity-90'
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saved ? 'Enregistré' : 'Enregistrer'}
          </button>
        </div>
      </header>

      {/* ── Page unique qui scrolle ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-10 space-y-12">

          {/* ═══ IDENTITÉ ═══ */}
          <Block icon={Brain} accent="#8b5cf6" title="Identité" subtitle="Qui est l'agent et comment il parle">
            {/* Nom */}
            <Row label="Nom de l'agent">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/15 focus:border-foreground/30 transition-all"
              />
            </Row>

            {/* Description */}
            <Row label="Description" hint="Affiché sous le nom">
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ex: Assistant commercial WhatsApp"
                className="w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/15 focus:border-foreground/30 transition-all"
              />
            </Row>

            {/* Objectif */}
            <Row label="Objectif" hint="Ce que l'agent doit accomplir">
              <textarea
                value={objective}
                onChange={e => setObjective(e.target.value)}
                placeholder="Ex: Qualifier les prospects et proposer un rendez-vous"
                rows={2}
                className="w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-foreground/15 focus:border-foreground/30 transition-all"
              />
            </Row>

            {/* Ton */}
            <Row label="Ton">
              <div className="grid grid-cols-3 gap-2.5">
                {([
                  { id: 'professional', label: 'Professionnel', emoji: '👔' },
                  { id: 'friendly',     label: 'Chaleureux',    emoji: '😊' },
                  { id: 'casual',       label: 'Décontracté',   emoji: '😎' },
                ] as const).map(t => {
                  const on = tone === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTone(t.id)}
                      className={cn(
                        'rounded-2xl py-4 text-center transition-all border',
                        on ? 'border-violet-500/55 bg-violet-500/12' : 'border-border/50 bg-muted/20 hover:bg-muted/40'
                      )}
                    >
                      <span className="block text-2xl mb-1.5">{t.emoji}</span>
                      <span className={cn('text-xs font-semibold', on ? 'text-violet-400' : 'text-foreground/80')}>{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </Row>

            {/* Détection langue */}
            <ToggleRow
              icon={<Languages className="h-4 w-4" />}
              label="Détection de langue"
              hint="Répond dans la langue du client"
              checked={autoDetectLanguage}
              onChange={setAutoDetectLanguage}
            />
          </Block>

          {/* ═══ SAVOIR ═══ */}
          <Block icon={BookOpen} accent="#3b82f6" title="Savoir" subtitle="Documents que l'agent peut utiliser"
            action={<MiniAction color="#3b82f6" onClick={() => setAddDocOpen(true)}>Ajouter</MiniAction>}
          >
            {docs.length === 0 && images.length === 0 ? (
              <Empty
                icon={<FileText className="h-7 w-7 text-blue-400" />}
                title="Aucune ressource"
                hint="Attachez des documents pour enrichir les réponses"
                cta="Parcourir la bibliothèque"
                onClick={() => setAddDocOpen(true)}
                color="#3b82f6"
              />
            ) : (
              <div className="space-y-2">
                {docs.map(doc => (
                  <div key={doc.id} className="group flex items-center gap-3 rounded-xl px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors">
                    <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="text-sm flex-1 truncate">{doc.name}</span>
                    <button onClick={() => handleDetachDoc(doc.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                    </button>
                  </div>
                ))}
                {images.map(img => (
                  <div key={img.id} className="flex items-center gap-3 rounded-xl px-4 py-3 bg-muted/30">
                    <Tag className="h-4 w-4 text-orange-500 shrink-0" />
                    <code className="text-xs font-mono">{img.ref}</code>
                  </div>
                ))}
                <Link href="/knowledge" className="block">
                  <button className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/50 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all">
                    <Upload className="h-4 w-4" /> Gérer la bibliothèque
                  </button>
                </Link>
              </div>
            )}
          </Block>

          {/* ═══ CANAUX ═══ */}
          <Block icon={Smartphone} accent="#10b981" title="Canaux" subtitle="Où l'agent est actif"
            action={<MiniAction color="#10b981" onClick={() => setAddLinkOpen(true)}>Créer un lien</MiniAction>}
          >
            {/* Sessions */}
            <Row label="Sessions WhatsApp">
              {sessions.length === 0 ? (
                <Empty
                  icon={<Smartphone className="h-7 w-7 text-emerald-400" />}
                  title="Aucune session"
                  hint="Connectez un numéro WhatsApp"
                  cta="Connecter WhatsApp"
                  onClick={() => router.push('/sessions')}
                  color="#10b981"
                />
              ) : (
                <div className="space-y-2">
                  {sessions.map(s => (
                    <div key={s.id} className="flex items-center gap-3.5 rounded-xl px-4 py-3 bg-muted/30">
                      <span className={cn('h-2 w-2 rounded-full shrink-0', s.status === 'connected' ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-muted-foreground/30')} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{s.display_name || s.instance_name}</p>
                        <p className="text-xs text-muted-foreground">{s.phone_number || '—'}</p>
                      </div>
                      <span className={cn('text-[10px] font-semibold rounded-full px-2.5 py-1', s.status === 'connected' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground')}>
                        {s.status === 'connected' ? 'Connecté' : 'Déconnecté'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Row>

            {/* Liens QR */}
            {links.length > 0 && (
              <Row label="Liens WhatsApp">
                <div className="space-y-2">
                  {links.map(link => (
                    <div key={link.id} className="flex items-center gap-3.5 rounded-xl px-4 py-3 bg-muted/30">
                      <QrCode className="h-4 w-4 text-emerald-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{link.name}</p>
                        <p className="text-[11px] font-mono text-muted-foreground">/{link.slug}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{link.click_count ?? 0} clics</span>
                    </div>
                  ))}
                </div>
              </Row>
            )}
          </Block>

          {/* ═══ COMPORTEMENT (escalade + RDV) ═══ */}
          <Block icon={Zap} accent="#f97316" title="Comportement" subtitle="Escalade vers un humain et rendez-vous">
            {/* Escalade */}
            <div className="rounded-2xl overflow-hidden border border-border/50">
              <div className="flex items-center justify-between px-4 py-3.5 bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10">
                    <UserCheck className="h-4 w-4 text-rose-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Transfert vers un humain</p>
                    <p className="text-xs text-muted-foreground">Si le client le demande</p>
                  </div>
                </div>
                <Switch checked={escalationEnabled} onCheckedChange={setEscalationEnabled} />
              </div>
              {escalationEnabled && (
                <div className="px-4 py-4 space-y-4 border-t border-border/40">
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'keywords', label: 'Mots-clés' },
                      { id: 'ai',       label: 'IA' },
                      { id: 'both',     label: 'Les deux' },
                    ] as const).map(m => {
                      const on = escalationMode === m.id
                      return (
                        <button
                          key={m.id}
                          onClick={() => setEscalationMode(m.id)}
                          className={cn(
                            'rounded-xl py-2.5 text-xs font-semibold transition-all border',
                            on ? 'border-orange-500/55 bg-orange-500/12 text-orange-400' : 'border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40'
                          )}
                        >
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                  {(escalationMode === 'keywords' || escalationMode === 'both') && (
                    <input
                      value={escalationKeywords}
                      onChange={e => setEscalationKeywords(e.target.value)}
                      placeholder="Mots-clés : humain, conseiller, aide…"
                      className="w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/15 transition-all"
                    />
                  )}
                  <textarea
                    value={escalationMessage}
                    onChange={e => setEscalationMessage(e.target.value)}
                    placeholder="Message de transfert : Je vous mets en relation avec un conseiller…"
                    rows={2}
                    className="w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-foreground/15 transition-all"
                  />
                </div>
              )}
            </div>

            {/* RDV */}
            <div className="rounded-2xl border border-border/50 px-4 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10">
                  <CalendarCheck className="h-4 w-4 text-cyan-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Lien de rendez-vous</p>
                  <p className="text-xs text-muted-foreground">Calendly, Cal.com…</p>
                </div>
              </div>
              <input
                value={bookingUrl}
                onChange={e => setBookingUrl(e.target.value)}
                placeholder="https://calendly.com/votre-lien"
                className="w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/15 transition-all"
              />
            </div>
          </Block>

          {/* ═══ AVANCÉ (replié) ═══ */}
          <details className="group rounded-2xl border border-border/50 overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 hover:bg-muted/20 transition-colors select-none">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground">
                <Settings2 className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Paramètres avancés</p>
                <p className="text-xs text-muted-foreground">Modèle IA, délais, planning… (optionnel)</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground group-open:rotate-180 transition-transform" />
            </summary>

            <div className="px-5 pb-6 pt-2 space-y-6 border-t border-border/40">
              {/* Modèle */}
              <Row label="Modèle IA">
                <div className="grid grid-cols-2 gap-2.5">
                  {(['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'] as const).map(m => {
                    const on = model === m
                    return (
                      <button
                        key={m}
                        onClick={() => setModel(m)}
                        className={cn(
                          'rounded-xl px-4 py-2.5 text-xs font-semibold text-left transition-all border',
                          on ? 'border-foreground/40 bg-foreground/[0.06] text-foreground' : 'border-border/50 bg-muted/20 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {m}
                      </button>
                    )
                  })}
                </div>
              </Row>

              <Row label={`Créativité — ${Math.round(temperature * 100)}%`}>
                <input type="range" min="0" max="1" step="0.1" value={temperature}
                  onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full accent-foreground" />
              </Row>

              <Row label="Prompt système">
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  className="w-full min-h-[120px] rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-foreground/15 transition-all"
                />
              </Row>

              <div className="grid grid-cols-2 gap-3">
                <Row label="Délai min (s)">
                  <NumInput value={delayMin} onChange={v => setDelayMin(parseInt(v) || 0)} />
                </Row>
                <Row label="Délai max (s)">
                  <NumInput value={delayMax} onChange={v => setDelayMax(parseInt(v) || 0)} />
                </Row>
                <Row label="Max messages">
                  <NumInput value={maxMessages} onChange={setMaxMessages} placeholder="Illimité" />
                </Row>
                <Row label="Timeout (min)">
                  <NumInput value={inactivityTimeout} onChange={setInactivityTimeout} placeholder="Aucun" />
                </Row>
              </div>

              <Row label="Condition d'arrêt">
                <textarea
                  value={stopCondition}
                  onChange={e => setStopCondition(e.target.value)}
                  placeholder="Ex: si le client a confirmé son rendez-vous…"
                  rows={2}
                  className="w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-foreground/15 transition-all"
                />
              </Row>

              {/* Planning */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-foreground/80">Planning horaire</Label>
                  <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
                </div>
                {scheduleEnabled && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <NumInput value={scheduleStart} onChange={setScheduleStart} type="time" />
                      <NumInput value={scheduleEnd} onChange={setScheduleEnd} type="time" />
                    </div>
                    <div className="flex gap-1.5">
                      {DAYS.map((d, i) => {
                        const on = scheduleDays.includes(i + 1)
                        return (
                          <button
                            key={i}
                            onClick={() => setScheduleDays(prev => prev.includes(i + 1) ? prev.filter(x => x !== i + 1) : [...prev, i + 1])}
                            className={cn(
                              'flex-1 rounded-lg py-2 text-[11px] font-semibold transition-all border',
                              on ? 'border-foreground/40 bg-foreground/[0.06] text-foreground' : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-muted'
                            )}
                          >
                            {d}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </details>

          {/* Aperçu rapide en bas */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-2 pb-6 text-xs text-muted-foreground">
            <Stat label="Sessions" value={connected.length} on={connected.length > 0} />
            <Stat label="Documents" value={docs.length + images.length} on={docs.length + images.length > 0} />
            <Stat label="Liens QR" value={links.length} on={links.length > 0} />
            <Stat label="Escalade" value={escalationEnabled ? 'Oui' : 'Non'} on={escalationEnabled} />
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
          <Link href="/knowledge">
            <Button variant="outline" className="w-full rounded-xl">
              <Upload className="mr-2 h-4 w-4" /> Uploader un document
            </Button>
          </Link>
        </DialogContent>
      </Dialog>

      <Dialog open={addLinkOpen} onOpenChange={setAddLinkOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Créer un lien WhatsApp</DialogTitle>
            <DialogDescription>Rattaché automatiquement à cet agent</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Row label="Nom">
              <input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="Ex: QR Vitrine"
                className="w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/15 transition-all" />
            </Row>
            <Row label="Session WhatsApp">
              <select
                className="w-full rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                value={linkSession} onChange={e => setLinkSession(e.target.value)}
              >
                <option value="">Choisir une session…</option>
                {sessions.map(s => <option key={s.id} value={s.id}>{s.display_name || s.instance_name} ({s.phone_number})</option>)}
              </select>
            </Row>
            <Row label="Message pré-rempli" hint="Optionnel">
              <textarea value={linkMessage} onChange={e => setLinkMessage(e.target.value)} placeholder="Bonjour, je suis intéressé…" rows={3}
                className="w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-foreground/15 transition-all" />
            </Row>
            <button
              onClick={handleCreateLink}
              disabled={linkSaving || !linkName.trim() || !linkSession}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-foreground text-background py-2.5 text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
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

// ─── Sous-composants ──────────────────────────────────────────────────────────

function Block({ icon: Icon, accent, title, subtitle, action, children }: {
  icon: React.ComponentType<{ className?: string }>
  accent: string
  title: string
  subtitle: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl ring-1"
          style={{ background: `${accent}1a`, color: accent, borderColor: `${accent}30` }}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <Label className="text-xs font-medium text-foreground/80">{label}</Label>
        {hint && <span className="text-[11px] text-muted-foreground/60">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function NumInput({ value, onChange, placeholder, type = 'number' }: {
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      min={type === 'number' ? 0 : undefined}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/15 transition-all"
    />
  )
}

function ToggleRow({ icon, label, hint, checked, onChange }: {
  icon?: React.ReactNode
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-muted/30 px-4 py-3.5">
      <div className="flex items-center gap-3">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <div>
          <p className="text-sm font-medium">{label}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function MiniAction({ color, onClick, children }: { color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:brightness-110"
      style={{ background: `${color}1a`, color }}>
      <Plus className="h-3.5 w-3.5" /> {children}
    </button>
  )
}

function Empty({ icon, title, hint, cta, onClick, color }: {
  icon: React.ReactNode
  title: string
  hint: string
  cta: string
  onClick: () => void
  color: string
}) {
  return (
    <button onClick={onClick}
      className="w-full rounded-2xl border border-dashed border-border/50 hover:border-border py-8 flex flex-col items-center gap-2 text-center transition-all hover:bg-muted/20 group">
      <span className="mb-1 opacity-60 group-hover:opacity-100 transition-opacity">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground max-w-[220px]">{hint}</p>
      <span className="mt-2 text-xs font-semibold rounded-full px-3 py-1.5" style={{ background: `${color}15`, color }}>{cta}</span>
    </button>
  )
}

function Stat({ label, value, on }: { label: string; value: string | number; on?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('font-semibold', on ? 'text-emerald-500' : 'text-foreground/70')}>{value}</span>
      <span className="text-muted-foreground/60">{label}</span>
    </div>
  )
}
