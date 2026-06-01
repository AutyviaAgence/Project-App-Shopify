'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import type { AIAgent, WhatsAppSession, WALink, KnowledgeDocument } from '@/types/database'
import { AgentRobot, getAgentColor } from '@/components/agent-card/AgentRobot'
import { AgentTestChat } from '@/components/agent-test-chat'
import { useTenant } from '@/lib/tenant/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  ArrowLeft, Brain, BookOpen, Zap, Smartphone,
  Power, PowerOff, Play, Loader2, Plus, Trash2,
  ChevronDown, FileText, Link2, QrCode, Check,
  Save, Upload, Tag, UserCheck, CalendarCheck,
  Languages, Settings2, Bot, Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type KnowledgeImage = { id: string; ref: string; filename: string; agent_id: string | null }
type AgentWithExtras = AIAgent & { team_ids?: string[] }

const SECTIONS = [
  { id: 'identity', label: 'Qui il est', icon: Brain, accentColor: '#8b5cf6' },
  { id: 'knowledge', label: "Ce qu'il sait", icon: BookOpen, accentColor: '#3b82f6' },
  { id: 'behavior', label: 'Comment il réagit', icon: Zap, accentColor: '#f97316' },
  { id: 'channels', label: 'Où il est actif', icon: Smartphone, accentColor: '#10b981' },
] as const

type SectionId = typeof SECTIONS[number]['id']

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const tenant = useTenant()

  const [agent, setAgent] = useState<AgentWithExtras | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<SectionId>('identity')

  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [links, setLinks] = useState<WALink[]>([])
  const [docs, setDocs] = useState<KnowledgeDocument[]>([])
  const [images, setImages] = useState<KnowledgeImage[]>([])
  const [allDocs, setAllDocs] = useState<KnowledgeDocument[]>([])

  // Form
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [objective, setObjective] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [temperature, setTemperature] = useState(0.7)
  const [tone, setTone] = useState<'professional' | 'friendly' | 'casual'>('professional')
  const [autoDetectLanguage, setAutoDetectLanguage] = useState(false)
  const [delayMin, setDelayMin] = useState(0)
  const [delayMax, setDelayMax] = useState(0)
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

  // Dialogs
  const [addDocOpen, setAddDocOpen] = useState(false)
  const [addLinkOpen, setAddLinkOpen] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkSession, setLinkSession] = useState('')
  const [linkMessage, setLinkMessage] = useState('')
  const [linkSaving, setLinkSaving] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [agentRes, sessionsRes, linksRes, docsRes, imgsRes] = await Promise.all([
          fetch(`/api/agents/${id}`),
          fetch('/api/sessions'),
          fetch('/api/links'),
          fetch('/api/knowledge'),
          fetch('/api/knowledge-images'),
        ])
        const [agentJson, sessionsJson, linksJson, docsJson, imgsJson] = await Promise.all([
          agentRes.json(), sessionsRes.json(), linksRes.json(), docsRes.json(), imgsRes.json(),
        ])

        const a: AgentWithExtras = agentJson.data
        if (!a) { router.push('/agents'); return }

        setAgent(a)
        setName(a.name)
        setDescription(a.description || '')
        setSystemPrompt(a.system_prompt)
        setObjective(a.objective || '')
        setModel(a.model || 'gpt-4o-mini')
        setTemperature(a.temperature ?? 0.7)
        setAutoDetectLanguage(a.auto_detect_language)
        setDelayMin(a.response_delay_min ?? 0)
        setDelayMax(a.response_delay_max ?? 0)
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

        const promptLower = a.system_prompt.toLowerCase()
        if (promptLower.includes('chaleureux') || promptLower.includes('friendly')) setTone('friendly')
        else if (promptLower.includes('décontracté') || promptLower.includes('casual')) setTone('casual')
        else setTone('professional')

        const sessionList: WhatsAppSession[] = sessionsJson.data || []
        const linkList: WALink[] = (linksJson.data || []).filter((l: WALink) => l.ai_agent_id === id)
        const allDocList: KnowledgeDocument[] = docsJson.data || []

        setSessions(sessionList)
        setLinks(linkList)
        setAllDocs(allDocList)
        setImages((imgsJson.data || []).filter((i: KnowledgeImage) => i.agent_id === id))

        const kbRes = await fetch(`/api/agents/${id}/knowledge`)
        const kbJson = await kbRes.json()
        setDocs(kbJson.data || [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, router])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          system_prompt: systemPrompt,
          objective: objective.trim() || null,
          model, temperature,
          auto_detect_language: autoDetectLanguage,
          response_delay_min: delayMin,
          response_delay_max: delayMax,
          max_messages_per_conversation: maxMessages ? parseInt(maxMessages) : null,
          inactivity_timeout_minutes: inactivityTimeout ? parseInt(inactivityTimeout) : null,
          stop_condition: stopCondition.trim() || null,
          escalation_enabled: escalationEnabled,
          escalation_mode: escalationMode,
          escalation_keywords: escalationKeywords.split(',').map(k => k.trim()).filter(Boolean),
          escalation_message: escalationMessage.trim() || null,
          booking_url: bookingUrl.trim() || null,
          schedule_enabled: scheduleEnabled,
          schedule_start_time: scheduleStart,
          schedule_end_time: scheduleEnd,
          schedule_days: scheduleDays,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setAgent(json.data)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSaving(false) }
  }

  async function handleToggleActive() {
    if (!agent) return
    const res = await fetch(`/api/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !agent.is_active }),
    })
    if (res.ok) {
      setAgent(prev => prev ? { ...prev, is_active: !prev.is_active } : prev)
      toast.success(agent.is_active ? 'Agent désactivé' : 'Agent activé')
    }
  }

  async function handleAttachDoc(docId: string) {
    await fetch(`/api/agents/${id}/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: docId }),
    })
    const res = await fetch(`/api/agents/${id}/knowledge`)
    const json = await res.json()
    setDocs(json.data || [])
    setAddDocOpen(false)
    toast.success('Document ajouté')
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: linkName.trim(), session_id: linkSession, ai_agent_id: id, pre_filled_message: linkMessage.trim() || null, is_active: true }),
      })
      const json = await res.json()
      if (res.ok) {
        setLinks(prev => [...prev, json.data])
        setAddLinkOpen(false)
        setLinkName(''); setLinkSession(''); setLinkMessage('')
        toast.success('Lien créé')
      } else { toast.error(json.error || 'Erreur') }
    } finally { setLinkSaving(false) }
  }

  const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  const color = agent ? getAgentColor(agent.description, tenant.primaryColor) : tenant.primaryColor
  const toneLabel = tone === 'professional' ? 'Professionnel' : tone === 'friendly' ? 'Chaleureux' : 'Décontracté'
  const connectedSessions = sessions.filter(s => s.status === 'connected')

  // Badges per section for sidebar
  const sectionBadges: Record<SectionId, string | undefined> = {
    identity: undefined,
    knowledge: docs.length + images.length > 0 ? `${docs.length + images.length}` : undefined,
    behavior: escalationEnabled ? 'Escalade' : undefined,
    channels: connectedSessions.length > 0 ? `${connectedSessions.length}` : undefined,
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
  if (!agent) return null

  const activeAccent = SECTIONS.find(s => s.id === activeSection)?.accentColor ?? color

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Topbar ── */}
      <div className="shrink-0 flex items-center gap-3 border-b bg-background/80 backdrop-blur-sm px-6 py-3 z-20">
        <Link href="/agents">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <span className="text-sm text-muted-foreground">Agents IA</span>
        <span className="text-muted-foreground text-sm">/</span>
        <span className="text-sm font-medium truncate">{agent.name}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setTestOpen(true)}>
            <Play className="mr-1.5 h-3.5 w-3.5" /> Tester
          </Button>
          <Button
            variant="outline" size="sm" className={cn('h-8', agent.is_active && 'border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10')}
            onClick={handleToggleActive}
          >
            {agent.is_active ? <><Power className="mr-1.5 h-3.5 w-3.5" />Actif</> : <><PowerOff className="mr-1.5 h-3.5 w-3.5" />Inactif</>}
          </Button>
          <Button size="sm" className="h-8" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            {saved ? 'Enregistré' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      {/* ── Body : Sidebar + Content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-72 shrink-0 flex flex-col border-r bg-muted/20 overflow-y-auto">

          {/* Agent hero */}
          <div
            className="relative px-5 py-6 overflow-hidden"
            style={{
              background: `radial-gradient(ellipse at 30% 50%, ${color}28 0%, transparent 70%)`,
              borderBottom: `1px solid ${color}20`,
            }}
          >
            <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
              style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '32px 32px' }} />

            <div className="relative flex items-center gap-4 mb-4">
              <div className="relative shrink-0">
                <div className="absolute inset-0 blur-xl rounded-full opacity-50" style={{ background: color }} />
                <AgentRobot color={color} size={64} />
              </div>
              <div className="min-w-0 flex-1">
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="text-base font-bold border-0 shadow-none p-0 h-auto bg-transparent focus-visible:ring-0 text-foreground leading-tight"
                />
                {description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>}
              </div>
            </div>

            <div className="relative flex flex-wrap gap-1.5">
              <span className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                agent.is_active ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' : 'border-border bg-muted text-muted-foreground'
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full', agent.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground')} />
                {agent.is_active ? 'Actif' : 'Inactif'}
              </span>
              <span className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] text-muted-foreground">{model}</span>
              <span className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] text-muted-foreground">{toneLabel}</span>
            </div>
          </div>

          {/* Section nav */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Configuration</p>
            {SECTIONS.map(({ id: sid, label, icon: Icon, accentColor }) => {
              const isActive = activeSection === sid
              const badge = sectionBadges[sid]
              return (
                <button
                  key={sid}
                  onClick={() => setActiveSection(sid)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all text-left',
                    isActive
                      ? 'text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                  style={isActive ? { background: `${accentColor}15`, color: accentColor } : {}}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all"
                    style={isActive
                      ? { background: `${accentColor}25`, color: accentColor }
                      : { background: 'transparent', color: 'currentColor' }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 truncate">{label}</span>
                  {badge && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ background: `${accentColor}20`, color: accentColor }}
                    >
                      {badge}
                    </span>
                  )}
                  {isActive && (
                    <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: accentColor }} />
                  )}
                </button>
              )
            })}
          </nav>

          {/* Stats rapides sidebar */}
          <div className="px-4 py-4 border-t space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">Résumé</p>
            <StatRow label="Sessions actives" value={`${connectedSessions.length}`} />
            <StatRow label="Documents" value={`${docs.length + images.length}`} />
            <StatRow label="Liens QR" value={`${links.length}`} />
            <StatRow label="Escalade" value={escalationEnabled ? 'Activée' : 'Désactivée'} highlight={escalationEnabled} />
          </div>
        </aside>

        {/* ── Contenu principal ── */}
        <main className="flex-1 overflow-y-auto">

          {/* Section header */}
          <div
            className="sticky top-0 z-10 px-8 py-4 border-b bg-background/90 backdrop-blur-sm flex items-center gap-3"
            style={{ borderBottomColor: `${activeAccent}20` }}
          >
            {(() => {
              const sec = SECTIONS.find(s => s.id === activeSection)!
              const Icon = sec.icon
              return (
                <>
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${sec.accentColor}18`, border: `1px solid ${sec.accentColor}30`, color: sec.accentColor }}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">{sec.label}</h2>
                    <p className="text-xs text-muted-foreground">{sectionSubtitle(activeSection)}</p>
                  </div>
                </>
              )
            })()}
          </div>

          {/* Section content */}
          <div className="px-8 py-6 max-w-2xl">

            {activeSection === 'identity' && (
              <div className="space-y-6">

                {/* Ton */}
                <FormBlock label="Ton de l'agent">
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { id: 'professional', label: 'Professionnel', emoji: '👔' },
                      { id: 'friendly', label: 'Chaleureux', emoji: '😊' },
                      { id: 'casual', label: 'Décontracté', emoji: '😎' },
                    ] as const).map(t => (
                      <button key={t.id} onClick={() => setTone(t.id)}
                        className={cn('rounded-xl border-2 py-4 text-center transition-all text-sm',
                          tone === t.id ? 'border-violet-500 bg-violet-500/10 font-medium' : 'border-border hover:border-violet-400/50 hover:bg-muted/50'
                        )}>
                        <span className="block text-2xl mb-1">{t.emoji}</span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </FormBlock>

                {/* Description */}
                <FormBlock label="Description" hint="Rôle affiché sous le nom de l'agent">
                  <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Assistant commercial spécialisé WhatsApp" className="h-9" />
                </FormBlock>

                {/* Objectif */}
                <FormBlock label="Objectif" hint="Ce que l'agent doit accomplir dans chaque conversation">
                  <Textarea value={objective} onChange={e => setObjective(e.target.value)} placeholder="Ex: Qualifier les prospects et proposer un rendez-vous" className="resize-none min-h-[80px]" />
                </FormBlock>

                {/* Détection de langue */}
                <div className="flex items-center justify-between rounded-xl border px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Languages className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Détection de langue automatique</p>
                      <p className="text-xs text-muted-foreground">Répond dans la langue du client</p>
                    </div>
                  </div>
                  <Switch checked={autoDetectLanguage} onCheckedChange={setAutoDetectLanguage} />
                </div>

                {/* Paramètres avancés */}
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-dashed px-5 py-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                    <Settings2 className="h-4 w-4" />
                    Paramètres avancés
                    <ChevronDown className="ml-auto h-4 w-4 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="mt-4 space-y-4 rounded-xl border border-dashed p-5">
                    <FormBlock label="Prompt système">
                      <Textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} className="min-h-[140px] resize-y text-xs font-mono" />
                    </FormBlock>
                    <div className="grid grid-cols-2 gap-4">
                      <FormBlock label="Modèle IA">
                        <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={model} onChange={e => setModel(e.target.value)}>
                          <option value="gpt-4o-mini">GPT-4o Mini</option>
                          <option value="gpt-4o">GPT-4o</option>
                          <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                          <option value="gpt-4.1">GPT-4.1</option>
                        </select>
                      </FormBlock>
                      <FormBlock label={`Créativité : ${temperature}`}>
                        <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full mt-3" />
                      </FormBlock>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormBlock label="Délai réponse min (s)">
                        <Input type="number" min="0" value={delayMin} onChange={e => setDelayMin(parseInt(e.target.value) || 0)} className="h-9" />
                      </FormBlock>
                      <FormBlock label="Délai réponse max (s)">
                        <Input type="number" min="0" value={delayMax} onChange={e => setDelayMax(parseInt(e.target.value) || 0)} className="h-9" />
                      </FormBlock>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormBlock label="Max messages / conversation">
                        <Input type="number" value={maxMessages} onChange={e => setMaxMessages(e.target.value)} placeholder="Illimité" className="h-9" />
                      </FormBlock>
                      <FormBlock label="Timeout inactivité (min)">
                        <Input type="number" value={inactivityTimeout} onChange={e => setInactivityTimeout(e.target.value)} placeholder="Aucun" className="h-9" />
                      </FormBlock>
                    </div>
                    <FormBlock label="Condition d'arrêt">
                      <Textarea value={stopCondition} onChange={e => setStopCondition(e.target.value)} placeholder="Ex: si le client a confirmé son RDV..." className="min-h-[60px] resize-none text-sm" />
                    </FormBlock>

                    {/* Planning */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Planning horaire</Label>
                        <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
                      </div>
                      {scheduleEnabled && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <Input type="time" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} className="h-9" />
                            <Input type="time" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} className="h-9" />
                          </div>
                          <div className="flex gap-1.5">
                            {DAYS.map((d, i) => (
                              <button key={i} onClick={() => setScheduleDays(prev => prev.includes(i + 1) ? prev.filter(x => x !== i + 1) : [...prev, i + 1])}
                                className={cn('flex-1 rounded-md py-2 text-xs font-medium border transition-colors',
                                  scheduleDays.includes(i + 1) ? 'border-violet-500 bg-violet-500/10 text-violet-600' : 'border-border text-muted-foreground hover:bg-muted'
                                )}>
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              </div>
            )}

            {activeSection === 'knowledge' && (
              <div className="space-y-6">
                {/* Documents */}
                <FormBlock
                  label="Documents"
                  hint="Fichiers de connaissance attachés à cet agent"
                  action={<button onClick={() => setAddDocOpen(true)} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"><Plus className="h-3 w-3" /> Ajouter</button>}
                >
                  {docs.length === 0 ? (
                    <button onClick={() => setAddDocOpen(true)}
                      className="w-full rounded-xl border-2 border-dashed border-blue-500/30 p-6 text-center text-sm text-muted-foreground hover:border-blue-500/60 hover:bg-blue-500/5 transition-all">
                      <FileText className="mx-auto h-8 w-8 text-blue-400 mb-2" />
                      <p className="font-medium">Aucun document</p>
                      <p className="text-xs mt-1">Ajoutez depuis votre bibliothèque de connaissances</p>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {docs.map(doc => (
                        <div key={doc.id} className="group flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                          <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                          <span className="text-sm flex-1 truncate">{doc.name}</span>
                          <button onClick={() => handleDetachDoc(doc.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </FormBlock>

                {/* Images IA */}
                {images.length > 0 && (
                  <FormBlock label="Images IA" hint="Références d'images disponibles pour cet agent">
                    <div className="flex flex-wrap gap-2">
                      {images.map(img => (
                        <span key={img.id} className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-sm">
                          <Tag className="h-3.5 w-3.5 text-orange-500" />
                          <code className="font-mono text-xs">{img.ref}</code>
                        </span>
                      ))}
                    </div>
                  </FormBlock>
                )}

                <Link href="/knowledge">
                  <Button variant="outline" className="w-full">
                    <Upload className="mr-2 h-4 w-4" /> Gérer la bibliothèque de connaissances
                  </Button>
                </Link>
              </div>
            )}

            {activeSection === 'behavior' && (
              <div className="space-y-6">
                {/* Escalade */}
                <div className="rounded-xl border overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/15">
                        <UserCheck className="h-4 w-4 text-rose-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Escalade vers un humain</p>
                        <p className="text-xs text-muted-foreground">Transfère la conversation si nécessaire</p>
                      </div>
                    </div>
                    <Switch checked={escalationEnabled} onCheckedChange={setEscalationEnabled} />
                  </div>
                  {escalationEnabled && (
                    <div className="px-5 py-4 space-y-4 border-t">
                      <FormBlock label="Mode de déclenchement">
                        <div className="grid grid-cols-3 gap-2">
                          {([{ id: 'keywords', label: 'Mots-clés' }, { id: 'ai', label: 'IA' }, { id: 'both', label: 'Les deux' }] as const).map(m => (
                            <button key={m.id} onClick={() => setEscalationMode(m.id)}
                              className={cn('rounded-xl border py-2.5 text-sm font-medium transition-colors',
                                escalationMode === m.id ? 'border-orange-500 bg-orange-500/10 text-orange-600' : 'border-border hover:bg-muted'
                              )}>
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </FormBlock>
                      {(escalationMode === 'keywords' || escalationMode === 'both') && (
                        <FormBlock label="Mots-clés déclencheurs" hint="Séparés par des virgules">
                          <Input value={escalationKeywords} onChange={e => setEscalationKeywords(e.target.value)} placeholder="humain, conseiller, parler à quelqu'un..." className="h-9" />
                        </FormBlock>
                      )}
                      <FormBlock label="Message d'escalade">
                        <Textarea value={escalationMessage} onChange={e => setEscalationMessage(e.target.value)} placeholder="Je vous transfère à un conseiller qui va vous aider..." className="min-h-[80px] resize-none" />
                      </FormBlock>
                    </div>
                  )}
                </div>

                {/* RDV */}
                <div className="rounded-xl border px-5 py-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15">
                      <CalendarCheck className="h-4 w-4 text-cyan-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Lien de prise de rendez-vous</p>
                      <p className="text-xs text-muted-foreground">Calendly, Cal.com, etc.</p>
                    </div>
                  </div>
                  <Input value={bookingUrl} onChange={e => setBookingUrl(e.target.value)} placeholder="https://calendly.com/votre-lien" className="h-9" />
                </div>
              </div>
            )}

            {activeSection === 'channels' && (
              <div className="space-y-6">
                {/* Sessions */}
                <FormBlock label="Sessions WhatsApp" hint="L'agent répond sur ces numéros connectés">
                  {sessions.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed border-emerald-500/30 p-6 text-center">
                      <Smartphone className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
                      <p className="text-sm font-medium">Aucune session</p>
                      <Link href="/sessions" className="text-xs text-emerald-600 hover:underline">Connecter WhatsApp →</Link>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sessions.map(s => (
                        <div key={s.id} className="flex items-center gap-4 rounded-xl border px-4 py-3">
                          <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', s.status === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{s.display_name || s.instance_name}</p>
                            <p className="text-xs text-muted-foreground">{s.phone_number || '—'}</p>
                          </div>
                          <span className={cn('text-xs rounded-full px-2.5 py-1 font-medium', s.status === 'connected' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground')}>
                            {s.status === 'connected' ? 'Connecté' : 'Déconnecté'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </FormBlock>

                {/* Liens QR */}
                <FormBlock
                  label="Liens WhatsApp"
                  hint="QR codes et liens de démarrage de conversation"
                  action={<button onClick={() => setAddLinkOpen(true)} className="flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-600"><Plus className="h-3 w-3" /> Créer</button>}
                >
                  {links.length === 0 ? (
                    <button onClick={() => setAddLinkOpen(true)}
                      className="w-full rounded-xl border-2 border-dashed border-emerald-500/30 p-6 text-center text-sm text-muted-foreground hover:border-emerald-500/60 hover:bg-emerald-500/5 transition-all">
                      <QrCode className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
                      <p className="font-medium">Aucun lien QR</p>
                      <p className="text-xs mt-1">Créez un QR code pour démarrer automatiquement une conversation</p>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {links.map(link => (
                        <div key={link.id} className="flex items-center gap-4 rounded-xl border bg-muted/30 px-4 py-3">
                          <QrCode className="h-4 w-4 text-emerald-500 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{link.name}</p>
                            <p className="text-xs font-mono text-muted-foreground">/{link.slug}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">{link.click_count ?? 0} clics</span>
                        </div>
                      ))}
                    </div>
                  )}
                </FormBlock>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* Dialogs */}
      <Dialog open={addDocOpen} onOpenChange={setAddDocOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Attacher un document</DialogTitle>
            <DialogDescription>Choisissez depuis votre bibliothèque</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2 max-h-64 overflow-y-auto">
            {allDocs.filter(d => !docs.find(dd => dd.id === d.id)).map(doc => (
              <button key={doc.id} onClick={() => handleAttachDoc(doc.id)}
                className="w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/50 transition-colors text-left">
                <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                <span className="text-sm">{doc.name}</span>
              </button>
            ))}
            {allDocs.filter(d => !docs.find(dd => dd.id === d.id)).length === 0 && (
              <p className="text-sm text-center text-muted-foreground py-4">Tous les documents sont déjà attachés</p>
            )}
          </div>
          <Link href="/knowledge"><Button variant="outline" className="w-full"><Upload className="mr-2 h-4 w-4" />Uploader un document</Button></Link>
        </DialogContent>
      </Dialog>

      <Dialog open={addLinkOpen} onOpenChange={setAddLinkOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Créer un lien WhatsApp</DialogTitle>
            <DialogDescription>Rattaché automatiquement à cet agent</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nom</Label>
              <Input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="Ex: QR Vitrine" className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Session WhatsApp</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={linkSession} onChange={e => setLinkSession(e.target.value)}>
                <option value="">Choisir...</option>
                {sessions.map(s => <option key={s.id} value={s.id}>{s.display_name || s.instance_name} ({s.phone_number})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Message pré-rempli (optionnel)</Label>
              <Textarea value={linkMessage} onChange={e => setLinkMessage(e.target.value)} className="resize-none min-h-[60px] text-sm" placeholder="Bonjour, je suis intéressé..." />
            </div>
            <Button onClick={handleCreateLink} disabled={linkSaving || !linkName.trim() || !linkSession} className="w-full">
              {linkSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              Créer le lien
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AgentTestChat open={testOpen} onOpenChange={setTestOpen} agentId={id} agentName={agent.name} />
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sectionSubtitle(id: SectionId): string {
  switch (id) {
    case 'identity': return 'Personnalité, ton et paramètres du modèle'
    case 'knowledge': return 'Documents et ressources que l\'agent peut utiliser'
    case 'behavior': return 'Escalade vers un humain et prise de rendez-vous'
    case 'channels': return 'Sessions WhatsApp et liens QR connectés'
  }
}

function FormBlock({ label, hint, children, action }: {
  label: string
  hint?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', highlight ? 'text-emerald-500' : 'text-foreground')}>{value}</span>
    </div>
  )
}
