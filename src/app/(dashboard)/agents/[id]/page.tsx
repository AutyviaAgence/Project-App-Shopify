'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import type { AIAgent, WhatsAppSession, WALink, KnowledgeDocument } from '@/types/database'
import { AgentRobot, getAgentColor } from '@/components/agent-card/AgentRobot'
import { AgentTestChat } from '@/components/agent-test-chat'
import { useTenant } from '@/lib/tenant/context'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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

const SECTIONS = [
  { id: 'identity',  label: 'Identité',    icon: Brain,      accent: '#8b5cf6' },
  { id: 'knowledge', label: 'Savoir',       icon: BookOpen,   accent: '#3b82f6' },
  { id: 'behavior',  label: 'Comportement', icon: Zap,        accent: '#f97316' },
  { id: 'channels',  label: 'Canaux',       icon: Smartphone, accent: '#10b981' },
] as const

type SectionId = typeof SECTIONS[number]['id']

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const tenant = useTenant()

  const [agent, setAgent]           = useState<AgentWithExtras | null>(null)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [testOpen, setTestOpen]     = useState(false)
  const [active, setActive]         = useState<SectionId>('identity')

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
  const color = agent ? getAgentColor(agent.description, tenant.primaryColor) : tenant.primaryColor
  const toneLabel = tone === 'professional' ? 'Professionnel' : tone === 'friendly' ? 'Chaleureux' : 'Décontracté'
  const connected = sessions.filter(s => s.status === 'connected')
  const sec = SECTIONS.find(s => s.id === active)!

  const badges: Record<SectionId, string | undefined> = {
    identity: undefined,
    knowledge: docs.length + images.length > 0 ? String(docs.length + images.length) : undefined,
    behavior: escalationEnabled ? '●' : undefined,
    channels: connected.length > 0 ? String(connected.length) : undefined,
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
  if (!agent) return null

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'hsl(var(--background))' }}>

      {/* ── Topbar ─ Apple-style: clean, centré, compact ── */}
      <header className="shrink-0 relative flex items-center px-5 py-2.5 border-b border-border/50 bg-background/95 backdrop-blur-xl z-30">
        <Link href="/agents" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Agents IA</span>
        </Link>

        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <div className="h-5 w-5 rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ background: `${color}22` }}>
            <AgentRobot color={color} size={20} />
          </div>
          <span className="text-sm font-semibold truncate max-w-[200px]">{agent.name}</span>
          <span className={cn(
            'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
            agent.is_active ? 'bg-emerald-500/12 text-emerald-500' : 'bg-muted text-muted-foreground'
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', agent.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
            {agent.is_active ? 'Actif' : 'Inactif'}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
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
            {agent.is_active ? 'Actif' : 'Inactif'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all',
              saved
                ? 'bg-emerald-500 text-white'
                : 'bg-foreground text-background hover:opacity-90'
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saved ? 'Enregistré' : 'Enregistrer'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-64 shrink-0 flex flex-col border-r border-border/50 overflow-y-auto" style={{ background: 'hsl(var(--card)/0.4)' }}>

          {/* Agent card in sidebar */}
          <div className="px-4 pt-6 pb-5">
            <div className="flex flex-col items-center text-center gap-3">
              <div>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="text-[15px] font-semibold border-0 shadow-none p-0 h-auto bg-transparent focus-visible:ring-0 text-center text-foreground"
                />
                <p className="text-xs text-muted-foreground mt-0.5 truncate px-2">{description || 'Aucune description'}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                <Tag2 label={model} />
                <Tag2 label={toneLabel} />
                {autoDetectLanguage && <Tag2 label="Multilangue" />}
              </div>
            </div>
          </div>

          <div className="mx-4 h-px bg-border/50" />

          {/* Nav */}
          <nav className="px-3 py-4 space-y-0.5">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">Configuration</p>
            {SECTIONS.map(({ id: sid, label, icon: Icon, accent }) => {
              const isActive = active === sid
              const badge = badges[sid]
              return (
                <button
                  key={sid}
                  onClick={() => setActive(sid)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all text-left group',
                    isActive ? 'font-medium' : 'text-muted-foreground hover:text-foreground'
                  )}
                  style={isActive ? { background: `${accent}12`, color: accent } : {}}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all"
                    style={isActive ? { background: `${accent}20`, color: accent } : {}}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1">{label}</span>
                  {badge && (
                    <span
                      className="min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold px-1"
                      style={{ background: isActive ? `${accent}25` : 'hsl(var(--muted))', color: isActive ? accent : 'hsl(var(--muted-foreground))' }}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          <div className="mx-4 h-px bg-border/50" />

          {/* Quick stats */}
          <div className="px-4 py-5 mt-auto">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-3">Aperçu</p>
            <div className="space-y-3">
              <QuickStat label="Sessions actives" value={String(connected.length)} color={connected.length > 0 ? '#10b981' : undefined} />
              <QuickStat label="Documents" value={String(docs.length + images.length)} />
              <QuickStat label="Liens QR" value={String(links.length)} />
              <QuickStat label="Escalade" value={escalationEnabled ? 'Activée' : 'Désactivée'} color={escalationEnabled ? '#10b981' : undefined} />
            </div>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto bg-background">

          {/* Section title bar */}
          <div className="sticky top-0 z-10 px-8 py-4 bg-background/95 backdrop-blur-xl border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: `${sec.accent}15`, color: sec.accent }}
              >
                <sec.icon className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-sm font-semibold">{sectionTitle(active)}</h1>
                <p className="text-[11px] text-muted-foreground">{sectionSubtitle(active)}</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-8 py-8 max-w-xl space-y-8">

            {active === 'identity' && (
              <>
                {/* Ton */}
                <Section title="Ton">
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'professional', label: 'Professionnel', emoji: '👔' },
                      { id: 'friendly',     label: 'Chaleureux',    emoji: '😊' },
                      { id: 'casual',       label: 'Décontracté',   emoji: '😎' },
                    ] as const).map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTone(t.id)}
                        className={cn(
                          'relative rounded-2xl py-5 text-center transition-all duration-200 text-sm',
                          tone === t.id
                            ? 'bg-foreground text-background font-medium shadow-lg scale-[1.02]'
                            : 'bg-muted/40 hover:bg-muted/70 text-foreground'
                        )}
                      >
                        <span className="block text-xl mb-1.5">{t.emoji}</span>
                        <span className="text-xs font-medium">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </Section>

                {/* Description + Objectif */}
                <Section title="Présentation">
                  <Field label="Description" hint="Affiché sous le nom de l'agent">
                    <PremiumInput value={description} onChange={e => setDescription(e.target.value)} placeholder="Assistant commercial WhatsApp..." />
                  </Field>
                  <Field label="Objectif" hint="Mission principale dans chaque conversation">
                    <PremiumTextarea value={objective} onChange={e => setObjective(e.target.value)} placeholder="Qualifier les prospects et proposer un rendez-vous..." rows={3} />
                  </Field>
                </Section>

                {/* Toggle langue */}
                <Section title="Options">
                  <ToggleRow
                    icon={<Languages className="h-4 w-4" />}
                    label="Détection de langue"
                    hint="Répond dans la langue du client"
                    checked={autoDetectLanguage}
                    onChange={setAutoDetectLanguage}
                  />
                </Section>

                {/* Avancé */}
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors select-none">
                    <Settings2 className="h-3.5 w-3.5" />
                    Paramètres avancés
                    <ChevronDown className="ml-1 h-3.5 w-3.5 group-open:rotate-180 transition-transform duration-200" />
                  </summary>
                  <div className="mt-6 space-y-6 pl-1">
                    <Section title="Modèle IA">
                      <div className="grid grid-cols-2 gap-3">
                        {(['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'] as const).map(m => (
                          <button
                            key={m}
                            onClick={() => setModel(m)}
                            className={cn(
                              'rounded-xl px-4 py-3 text-xs font-medium text-left transition-all border',
                              model === m
                                ? 'border-foreground bg-foreground text-background'
                                : 'border-border/50 bg-muted/30 text-muted-foreground hover:border-border hover:text-foreground'
                            )}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                      <Field label={`Créativité — ${Math.round(temperature * 100)}%`}>
                        <input
                          type="range" min="0" max="1" step="0.1" value={temperature}
                          onChange={e => setTemperature(parseFloat(e.target.value))}
                          className="w-full accent-foreground mt-1"
                        />
                      </Field>
                    </Section>

                    <Section title="Prompt système">
                      <Textarea
                        value={systemPrompt}
                        onChange={e => setSystemPrompt(e.target.value)}
                        className="min-h-[140px] resize-y text-xs font-mono bg-muted/30 border-border/50 rounded-xl"
                      />
                    </Section>

                    <Section title="Timing">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Délai min (s)">
                          <PremiumInput type="number" min="0" value={delayMin} onChange={e => setDelayMin(parseInt(e.target.value) || 0)} />
                        </Field>
                        <Field label="Délai max (s)">
                          <PremiumInput type="number" min="0" value={delayMax} onChange={e => setDelayMax(parseInt(e.target.value) || 0)} />
                        </Field>
                        <Field label="Max messages">
                          <PremiumInput type="number" value={maxMessages} onChange={e => setMaxMessages(e.target.value)} placeholder="Illimité" />
                        </Field>
                        <Field label="Timeout inactivité (min)">
                          <PremiumInput type="number" value={inactivityTimeout} onChange={e => setInactivityTimeout(e.target.value)} placeholder="Aucun" />
                        </Field>
                      </div>
                    </Section>

                    <Section title="Condition d'arrêt">
                      <PremiumTextarea
                        value={stopCondition}
                        onChange={e => setStopCondition(e.target.value)}
                        placeholder="Ex: si le client a confirmé son rendez-vous..."
                        rows={2}
                      />
                    </Section>

                    <Section title="Planning horaire">
                      <ToggleRow
                        label="Activer le planning"
                        hint="L'agent ne répond que dans les plages définies"
                        checked={scheduleEnabled}
                        onChange={setScheduleEnabled}
                      />
                      {scheduleEnabled && (
                        <div className="mt-4 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Début">
                              <PremiumInput type="time" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} />
                            </Field>
                            <Field label="Fin">
                              <PremiumInput type="time" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} />
                            </Field>
                          </div>
                          <div className="flex gap-1.5">
                            {DAYS.map((d, i) => (
                              <button
                                key={i}
                                onClick={() => setScheduleDays(prev => prev.includes(i + 1) ? prev.filter(x => x !== i + 1) : [...prev, i + 1])}
                                className={cn(
                                  'flex-1 rounded-lg py-2 text-[11px] font-semibold transition-all',
                                  scheduleDays.includes(i + 1) ? 'bg-foreground text-background' : 'bg-muted/40 text-muted-foreground hover:bg-muted'
                                )}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </Section>
                  </div>
                </details>
              </>
            )}

            {active === 'knowledge' && (
              <>
                <Section
                  title="Documents"
                  action={
                    <button onClick={() => setAddDocOpen(true)} className="flex items-center gap-1 text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors">
                      <Plus className="h-3.5 w-3.5" /> Ajouter
                    </button>
                  }
                >
                  {docs.length === 0 ? (
                    <EmptyState
                      icon={<FileText className="h-7 w-7 text-blue-400" />}
                      title="Aucun document"
                      hint="Attachez des fichiers pour enrichir les réponses"
                      action="Parcourir la bibliothèque"
                      onAction={() => setAddDocOpen(true)}
                      color="#3b82f6"
                    />
                  ) : (
                    <div className="space-y-1.5">
                      {docs.map(doc => (
                        <div key={doc.id} className="group flex items-center gap-3 rounded-xl px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors">
                          <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                          <span className="text-sm flex-1 truncate">{doc.name}</span>
                          <button onClick={() => handleDetachDoc(doc.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => setAddDocOpen(true)} className="w-full text-xs text-center py-2 text-muted-foreground hover:text-foreground transition-colors">
                        + Ajouter un document
                      </button>
                    </div>
                  )}
                </Section>

                {images.length > 0 && (
                  <Section title="Images IA">
                    <div className="flex flex-wrap gap-2">
                      {images.map(img => (
                        <span key={img.id} className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs">
                          <Tag className="h-3 w-3 text-orange-500" />
                          <code className="font-mono">{img.ref}</code>
                        </span>
                      ))}
                    </div>
                  </Section>
                )}

                <Link href="/knowledge">
                  <button className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/50 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30 transition-all">
                    <Upload className="h-4 w-4" /> Gérer la bibliothèque
                  </button>
                </Link>
              </>
            )}

            {active === 'behavior' && (
              <>
                {/* Escalade */}
                <Section title="Escalade vers un humain">
                  <div className="rounded-2xl overflow-hidden border border-border/50">
                    <div className="flex items-center justify-between px-5 py-4 bg-muted/20">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10">
                          <UserCheck className="h-4 w-4 text-rose-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Transfert vers humain</p>
                          <p className="text-xs text-muted-foreground">Déclenché automatiquement</p>
                        </div>
                      </div>
                      <Switch checked={escalationEnabled} onCheckedChange={setEscalationEnabled} />
                    </div>
                    {escalationEnabled && (
                      <div className="px-5 py-5 space-y-5 border-t border-border/40">
                        <Field label="Mode de déclenchement">
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { id: 'keywords', label: 'Mots-clés' },
                              { id: 'ai',       label: 'IA' },
                              { id: 'both',     label: 'Les deux' },
                            ] as const).map(m => (
                              <button
                                key={m.id}
                                onClick={() => setEscalationMode(m.id)}
                                className={cn(
                                  'rounded-xl py-2.5 text-xs font-medium transition-all',
                                  escalationMode === m.id
                                    ? 'bg-foreground text-background'
                                    : 'bg-muted/40 text-muted-foreground hover:bg-muted'
                                )}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </Field>
                        {(escalationMode === 'keywords' || escalationMode === 'both') && (
                          <Field label="Mots-clés" hint="Séparés par des virgules">
                            <PremiumInput value={escalationKeywords} onChange={e => setEscalationKeywords(e.target.value)} placeholder="humain, conseiller, aide..." />
                          </Field>
                        )}
                        <Field label="Message de transfert">
                          <PremiumTextarea value={escalationMessage} onChange={e => setEscalationMessage(e.target.value)} placeholder="Je vous transfère vers un conseiller..." rows={3} />
                        </Field>
                      </div>
                    )}
                  </div>
                </Section>

                {/* RDV */}
                <Section title="Rendez-vous">
                  <div className="rounded-2xl border border-border/50 px-5 py-4 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10">
                        <CalendarCheck className="h-4 w-4 text-cyan-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Lien de prise de rendez-vous</p>
                        <p className="text-xs text-muted-foreground">Calendly, Cal.com, Tidycal…</p>
                      </div>
                    </div>
                    <PremiumInput value={bookingUrl} onChange={e => setBookingUrl(e.target.value)} placeholder="https://calendly.com/votre-lien" />
                  </div>
                </Section>
              </>
            )}

            {active === 'channels' && (
              <>
                {/* Sessions */}
                <Section title="Sessions WhatsApp">
                  {sessions.length === 0 ? (
                    <EmptyState
                      icon={<Smartphone className="h-7 w-7 text-emerald-400" />}
                      title="Aucune session"
                      hint="Connectez un numéro WhatsApp pour activer l'agent"
                      action="Connecter WhatsApp"
                      onAction={() => router.push('/sessions')}
                      color="#10b981"
                    />
                  ) : (
                    <div className="space-y-1.5">
                      {sessions.map(s => (
                        <div key={s.id} className="flex items-center gap-3.5 rounded-xl px-4 py-3.5 bg-muted/30">
                          <div className={cn('h-2 w-2 rounded-full shrink-0', s.status === 'connected' ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-muted-foreground/30')} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{s.display_name || s.instance_name}</p>
                            <p className="text-xs text-muted-foreground">{s.phone_number || '—'}</p>
                          </div>
                          <span className={cn(
                            'text-[10px] font-semibold rounded-full px-2.5 py-1',
                            s.status === 'connected' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                          )}>
                            {s.status === 'connected' ? 'Connecté' : 'Déconnecté'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Liens QR */}
                <Section
                  title="Liens WhatsApp"
                  action={
                    <button onClick={() => setAddLinkOpen(true)} className="flex items-center gap-1 text-xs font-medium text-emerald-500 hover:text-emerald-600 transition-colors">
                      <Plus className="h-3.5 w-3.5" /> Créer
                    </button>
                  }
                >
                  {links.length === 0 ? (
                    <EmptyState
                      icon={<QrCode className="h-7 w-7 text-emerald-400" />}
                      title="Aucun lien QR"
                      hint="Créez un lien pour démarrer automatiquement une conversation"
                      action="Créer un lien"
                      onAction={() => setAddLinkOpen(true)}
                      color="#10b981"
                    />
                  ) : (
                    <div className="space-y-1.5">
                      {links.map(link => (
                        <div key={link.id} className="flex items-center gap-3.5 rounded-xl px-4 py-3.5 bg-muted/30">
                          <QrCode className="h-4 w-4 text-emerald-500 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{link.name}</p>
                            <p className="text-[11px] font-mono text-muted-foreground">/{link.slug}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">{link.click_count ?? 0} clics</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>
        </main>
      </div>

      {/* Dialogs */}
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
            <Field label="Nom">
              <PremiumInput value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="Ex: QR Vitrine" />
            </Field>
            <Field label="Session WhatsApp">
              <select
                className="w-full rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                value={linkSession} onChange={e => setLinkSession(e.target.value)}
              >
                <option value="">Choisir une session...</option>
                {sessions.map(s => <option key={s.id} value={s.id}>{s.display_name || s.instance_name} ({s.phone_number})</option>)}
              </select>
            </Field>
            <Field label="Message pré-rempli" hint="Optionnel">
              <PremiumTextarea value={linkMessage} onChange={e => setLinkMessage(e.target.value)} placeholder="Bonjour, je suis intéressé..." rows={3} />
            </Field>
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function sectionTitle(id: SectionId) {
  return { identity: 'Identité', knowledge: 'Savoir', behavior: 'Comportement', channels: 'Canaux' }[id]
}

function sectionSubtitle(id: SectionId) {
  return {
    identity:  'Personnalité, ton et paramètres du modèle',
    knowledge: 'Documents et ressources disponibles',
    behavior:  'Escalade et prise de rendez-vous',
    channels:  'Sessions WhatsApp et liens QR',
  }[id]
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

function PremiumInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50',
        'focus:outline-none focus:ring-2 focus:ring-foreground/15 focus:border-foreground/30',
        'transition-all duration-150',
        className
      )}
    />
  )
}

function PremiumTextarea({ className, rows = 3, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { rows?: number }) {
  return (
    <textarea
      {...props}
      rows={rows}
      className={cn(
        'w-full rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 resize-none',
        'focus:outline-none focus:ring-2 focus:ring-foreground/15 focus:border-foreground/30',
        'transition-all duration-150',
        className
      )}
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

function EmptyState({ icon, title, hint, action, onAction, color }: {
  icon: React.ReactNode
  title: string
  hint: string
  action: string
  onAction: () => void
  color: string
}) {
  return (
    <button
      onClick={onAction}
      className="w-full rounded-2xl border border-dashed border-border/50 hover:border-border py-8 flex flex-col items-center gap-2 text-center transition-all hover:bg-muted/20 group"
    >
      <span className="mb-1 opacity-60 group-hover:opacity-100 transition-opacity">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground max-w-[200px]">{hint}</p>
      <span className="mt-2 text-xs font-semibold rounded-full px-3 py-1.5 transition-colors" style={{ background: `${color}15`, color }}>
        {action}
      </span>
    </button>
  )
}

function Tag2({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-muted/60 px-2.5 py-0.5 text-[10px] text-muted-foreground font-medium">
      {label}
    </span>
  )
}

function QuickStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold" style={color ? { color } : undefined}>{value}</span>
    </div>
  )
}
