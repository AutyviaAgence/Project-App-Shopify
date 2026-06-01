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
  ChevronDown, ChevronUp, FileText, Image as ImageIcon,
  Link2, QrCode, Check, Save, Upload, Tag,
  Clock, UserCheck, CalendarCheck, Languages,
  Shield, Settings2, Bot,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type KnowledgeImage = { id: string; ref: string; filename: string; agent_id: string | null }
type AgentWithExtras = AIAgent & { team_ids?: string[] }

// ─── Section dépliable ────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  subtitle,
  color,
  bgColor,
  borderColor,
  children,
  defaultOpen = false,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
  color: string
  bgColor: string
  borderColor: string
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={cn('rounded-2xl border-2 overflow-hidden transition-all', borderColor, open ? 'shadow-md' : 'shadow-sm')}>
      <button
        onClick={() => setOpen(!open)}
        className={cn('w-full flex items-center gap-4 px-6 py-5 text-left transition-colors', open ? bgColor : 'bg-card hover:bg-muted/30')}
      >
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', bgColor, 'border', borderColor)}>
          <Icon className={cn('h-6 w-6', color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn('text-base font-semibold', open ? color : 'text-foreground')}>{title}</p>
            {badge && (
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', bgColor, color)}>
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {open
          ? <ChevronUp className={cn('h-5 w-5 shrink-0', color)} />
          : <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
        }
      </button>
      {open && (
        <div className="px-6 pb-6 pt-2 space-y-4 border-t">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const tenant = useTenant()

  const [agent, setAgent] = useState<AgentWithExtras | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testOpen, setTestOpen] = useState(false)

  // Ressources liées
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [links, setLinks] = useState<WALink[]>([])
  const [docs, setDocs] = useState<(KnowledgeDocument & { team_ids?: string[] })[]>([])
  const [images, setImages] = useState<KnowledgeImage[]>([])
  const [allDocs, setAllDocs] = useState<KnowledgeDocument[]>([])
  const [allImages, setAllImages] = useState<KnowledgeImage[]>([])

  // Form state (miroir de l'agent)
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

  // Section 3 — Réactions
  const [escalationEnabled, setEscalationEnabled] = useState(false)
  const [escalationMode, setEscalationMode] = useState<'keywords' | 'ai' | 'both'>('keywords')
  const [escalationKeywords, setEscalationKeywords] = useState('')
  const [escalationMessage, setEscalationMessage] = useState('')
  const [bookingUrl, setBookingUrl] = useState('')

  // Schedule
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleStart, setScheduleStart] = useState('09:00')
  const [scheduleEnd, setScheduleEnd] = useState('18:00')
  const [scheduleDays, setScheduleDays] = useState<number[]>([1, 2, 3, 4, 5])

  // Dialogs
  const [addDocOpen, setAddDocOpen] = useState(false)
  const [addImageOpen, setAddImageOpen] = useState(false)
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

        // Inférer le ton depuis le prompt
        const promptLower = a.system_prompt.toLowerCase()
        if (promptLower.includes('chaleureux') || promptLower.includes('friendly')) setTone('friendly')
        else if (promptLower.includes('décontracté') || promptLower.includes('casual')) setTone('casual')
        else setTone('professional')

        const sessionList: WhatsAppSession[] = sessionsJson.data || []
        const linkList: WALink[] = (linksJson.data || []).filter((l: WALink) => l.ai_agent_id === id)
        const allDocList: KnowledgeDocument[] = docsJson.data || []
        const allImgList: KnowledgeImage[] = imgsJson.data || []

        setSessions(sessionList)
        setLinks(linkList)
        setAllDocs(allDocList)
        setAllImages(allImgList)

        // Docs/images attachés à cet agent
        const agentKbRes = await fetch(`/api/agents/${id}/knowledge`)
        const agentKbJson = await agentKbRes.json()
        setDocs(agentKbJson.data || [])
        setImages(allImgList.filter((i: KnowledgeImage) => i.agent_id === id))
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
          model,
          temperature,
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
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
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
    toast.success('Document retiré')
  }

  async function handleCreateLink() {
    if (!linkName.trim() || !linkSession) return
    setLinkSaving(true)
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: linkName.trim(),
          session_id: linkSession,
          ai_agent_id: id,
          pre_filled_message: linkMessage.trim() || null,
          is_active: true,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setLinks(prev => [...prev, json.data])
        setAddLinkOpen(false)
        setLinkName(''); setLinkSession(''); setLinkMessage('')
        toast.success('Lien créé')
      } else {
        toast.error(json.error || 'Erreur')
      }
    } finally {
      setLinkSaving(false)
    }
  }

  const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  const color = agent ? getAgentColor(agent.description, tenant.primaryColor) : tenant.primaryColor

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!agent) return null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header fixe */}
      <div className="flex-shrink-0 border-b bg-card">
        {/* Barre de navigation */}
        <div className="flex items-center gap-3 px-6 py-3 border-b">
          <Link href="/agents">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <span className="text-sm text-muted-foreground">Agents IA</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium truncate">{agent.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setTestOpen(true)}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Tester
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn('h-8', agent.is_active ? 'text-emerald-600 border-emerald-300' : '')}
              onClick={handleToggleActive}
            >
              {agent.is_active
                ? <><Power className="mr-1.5 h-3.5 w-3.5" /> Actif</>
                : <><PowerOff className="mr-1.5 h-3.5 w-3.5" /> Inactif</>
              }
            </Button>
            <Button size="sm" className="h-8" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : saved ? <Check className="mr-1.5 h-3.5 w-3.5" />
                : <Save className="mr-1.5 h-3.5 w-3.5" />}
              {saved ? 'Enregistré' : 'Enregistrer'}
            </Button>
          </div>
        </div>

        {/* Hero agent */}
        <div className="flex items-center gap-6 px-6 py-5">
          <AgentRobot color={color} size={80} />
          <div className="min-w-0 flex-1">
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              className="text-xl font-bold border-0 shadow-none p-0 h-auto focus-visible:ring-0 bg-transparent"
              placeholder="Nom de l'agent"
            />
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                agent.is_active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full', agent.is_active ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                {agent.is_active ? 'Actif' : 'Inactif'}
              </span>
              <span className="text-xs text-muted-foreground">{model}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                {tone === 'professional' ? 'Professionnel' : tone === 'friendly' ? 'Chaleureux' : 'Décontracté'}
              </span>
              {autoDetectLanguage && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">Multilangue</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Corps scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">

          {/* ── Section 1 : Qui il est ── */}
          <Section
            icon={Brain}
            title="Qui il est"
            subtitle="Personnalité, comportement et paramètres de l'agent"
            color="text-violet-600"
            bgColor="bg-violet-500/10"
            borderColor="border-violet-200 dark:border-violet-800"
            defaultOpen
          >
            {/* Ton */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ton</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'professional', label: 'Professionnel', icon: '👔' },
                  { id: 'friendly', label: 'Chaleureux', icon: '😊' },
                  { id: 'casual', label: 'Décontracté', icon: '😎' },
                ] as const).map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTone(t.id)}
                    className={cn(
                      'rounded-xl border-2 py-3 text-center transition-all',
                      tone === t.id ? 'border-violet-500 bg-violet-500/10' : 'border-border hover:border-violet-300'
                    )}
                  >
                    <span className="text-xl block">{t.icon}</span>
                    <span className="text-xs font-medium mt-1 block">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Description / objectif */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</Label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ex: Agent de support client pour Boulangerie Martin"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objectif principal</Label>
              <Input
                value={objective}
                onChange={e => setObjective(e.target.value)}
                placeholder="Ex: Répondre aux questions et proposer des rendez-vous"
                className="h-9"
              />
            </div>

            {/* Toggle langue */}
            <div className="flex items-center justify-between rounded-xl border p-4">
              <div className="flex items-center gap-3">
                <Languages className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Détection automatique de langue</p>
                  <p className="text-xs text-muted-foreground">Répond dans la langue du client</p>
                </div>
              </div>
              <Switch checked={autoDetectLanguage} onCheckedChange={setAutoDetectLanguage} />
            </div>

            {/* Avancé */}
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors list-none">
                <Settings2 className="h-3.5 w-3.5" />
                Paramètres avancés
                <ChevronDown className="ml-auto h-3.5 w-3.5 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="mt-3 space-y-4 rounded-xl border border-dashed p-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Prompt système complet</Label>
                  <Textarea
                    value={systemPrompt}
                    onChange={e => setSystemPrompt(e.target.value)}
                    className="min-h-[140px] resize-y text-xs font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Modèle IA</Label>
                    <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={model} onChange={e => setModel(e.target.value)}>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                      <option value="gpt-4.1">GPT-4.1</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Créativité : {temperature}</Label>
                    <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full mt-2" />
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>Précis</span><span>Créatif</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Délai min (s)</Label>
                    <Input type="number" min="0" value={delayMin} onChange={e => setDelayMin(parseInt(e.target.value) || 0)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Délai max (s)</Label>
                    <Input type="number" min="0" value={delayMax} onChange={e => setDelayMax(parseInt(e.target.value) || 0)} className="h-8 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Max messages / conversation</Label>
                    <Input type="number" min="0" value={maxMessages} onChange={e => setMaxMessages(e.target.value)} placeholder="Illimité" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Timeout inactivité (min)</Label>
                    <Input type="number" min="0" value={inactivityTimeout} onChange={e => setInactivityTimeout(e.target.value)} placeholder="Aucun" className="h-8 text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Condition d&apos;arrêt</Label>
                  <Textarea value={stopCondition} onChange={e => setStopCondition(e.target.value)} placeholder="Ex: si le client a confirmé son RDV..." className="min-h-[60px] resize-none text-xs" />
                </div>

                {/* Planning */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Planning horaire</Label>
                    <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
                  </div>
                  {scheduleEnabled && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Début</Label>
                          <Input type="time" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Fin</Label>
                          <Input type="time" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} className="h-8 text-sm" />
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {DAYS.map((d, i) => (
                          <button
                            key={i}
                            onClick={() => setScheduleDays(prev =>
                              prev.includes(i + 1) ? prev.filter(x => x !== i + 1) : [...prev, i + 1]
                            )}
                            className={cn(
                              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                              scheduleDays.includes(i + 1) ? 'border-violet-500 bg-violet-500/10 text-violet-600' : 'border-border text-muted-foreground hover:bg-muted'
                            )}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </details>
          </Section>

          {/* ── Section 2 : Ce qu'il sait ── */}
          <Section
            icon={BookOpen}
            title="Ce qu'il sait"
            subtitle="Documents et images à sa disposition"
            color="text-blue-600"
            bgColor="bg-blue-500/10"
            borderColor="border-blue-200 dark:border-blue-800"
            badge={`${docs.length + images.length} ressource${docs.length + images.length !== 1 ? 's' : ''}`}
          >
            {/* Documents */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents</Label>
                <button onClick={() => setAddDocOpen(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                  <Plus className="h-3 w-3" /> Ajouter
                </button>
              </div>
              {docs.length === 0 ? (
                <button onClick={() => setAddDocOpen(true)} className="w-full rounded-xl border-2 border-dashed border-blue-200 p-4 text-center text-sm text-muted-foreground hover:bg-blue-500/5 transition-colors">
                  <FileText className="mx-auto h-6 w-6 text-blue-300 mb-1" />
                  Aucun document attaché — cliquez pour en ajouter
                </button>
              ) : (
                <div className="space-y-1.5">
                  {docs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 bg-muted/30">
                      <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="text-sm truncate flex-1">{doc.name}</span>
                      <button onClick={() => handleDetachDoc(doc.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Images IA */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Images IA</Label>
                <button onClick={() => setAddImageOpen(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                  <Plus className="h-3 w-3" /> Ajouter
                </button>
              </div>
              {images.length === 0 ? (
                <button onClick={() => setAddImageOpen(true)} className="w-full rounded-xl border-2 border-dashed border-blue-200 p-4 text-center text-sm text-muted-foreground hover:bg-blue-500/5 transition-colors">
                  <ImageIcon className="mx-auto h-6 w-6 text-blue-300 mb-1" />
                  Aucune image — l&apos;agent peut envoyer des images via [IMAGE:ref]
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {images.map(img => (
                    <div key={img.id} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5">
                      <Tag className="h-3.5 w-3.5 text-orange-500" />
                      <code className="text-xs font-mono">{img.ref}</code>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* ── Section 3 : Comment il réagit ── */}
          <Section
            icon={Zap}
            title="Comment il réagit"
            subtitle="Escalade, relance automatique et rendez-vous"
            color="text-orange-600"
            bgColor="bg-orange-500/10"
            borderColor="border-orange-200 dark:border-orange-800"
          >
            {/* Escalade */}
            <div className="rounded-xl border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                <div className="flex items-center gap-3">
                  <UserCheck className="h-4 w-4 text-rose-500" />
                  <div>
                    <p className="text-sm font-medium">Escalade vers un humain</p>
                    <p className="text-xs text-muted-foreground">Transfère la conversation si nécessaire</p>
                  </div>
                </div>
                <Switch checked={escalationEnabled} onCheckedChange={setEscalationEnabled} />
              </div>
              {escalationEnabled && (
                <div className="px-4 py-4 space-y-3 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mode de déclenchement</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: 'keywords', label: 'Mots-clés' },
                        { id: 'ai', label: 'IA détecte' },
                        { id: 'both', label: 'Les deux' },
                      ] as const).map(m => (
                        <button key={m.id} onClick={() => setEscalationMode(m.id)}
                          className={cn('rounded-lg border py-2 text-xs font-medium transition-colors',
                            escalationMode === m.id ? 'border-orange-500 bg-orange-500/10 text-orange-600' : 'border-border hover:bg-muted'
                          )}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(escalationMode === 'keywords' || escalationMode === 'both') && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Mots-clés (séparés par des virgules)</Label>
                      <Input value={escalationKeywords} onChange={e => setEscalationKeywords(e.target.value)} placeholder="humain, conseiller, parler à quelqu'un" className="h-8 text-sm" />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Message avant transfert</Label>
                    <Textarea value={escalationMessage} onChange={e => setEscalationMessage(e.target.value)} placeholder="Je vous transfère à un conseiller..." className="min-h-[60px] resize-none text-sm" />
                  </div>
                </div>
              )}
            </div>

            {/* Lien de RDV */}
            <div className="rounded-xl border px-4 py-3 space-y-2">
              <div className="flex items-center gap-3">
                <CalendarCheck className="h-4 w-4 text-cyan-500" />
                <p className="text-sm font-medium">Lien de rendez-vous</p>
              </div>
              <Input value={bookingUrl} onChange={e => setBookingUrl(e.target.value)} placeholder="https://calendly.com/votre-lien" className="h-8 text-sm" />
            </div>
          </Section>

          {/* ── Section 4 : Où il est actif ── */}
          <Section
            icon={Smartphone}
            title="Où il est actif"
            subtitle="Sessions WhatsApp et liens d'entrée"
            color="text-emerald-600"
            bgColor="bg-emerald-500/10"
            borderColor="border-emerald-200 dark:border-emerald-800"
            badge={`${links.length} lien${links.length !== 1 ? 's' : ''}`}
          >
            {/* Sessions */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sessions WhatsApp</Label>
              {sessions.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-emerald-200 p-4 text-center text-sm text-muted-foreground">
                  <Smartphone className="mx-auto h-6 w-6 text-emerald-300 mb-1" />
                  Aucune session connectée
                  <Link href="/sessions" className="block text-emerald-600 text-xs mt-1 hover:underline">Connecter WhatsApp →</Link>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {sessions.map(session => (
                    <div key={session.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                      <div className={cn('h-2 w-2 rounded-full shrink-0', session.status === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{session.display_name || session.instance_name}</p>
                        <p className="text-xs text-muted-foreground">{session.phone_number || 'Non connecté'}</p>
                      </div>
                      <span className={cn('text-[10px] rounded-full px-2 py-0.5', session.status === 'connected' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground')}>
                        {session.status === 'connected' ? 'Connecté' : 'Déconnecté'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Liens WhatsApp */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Liens WhatsApp</Label>
                <button onClick={() => setAddLinkOpen(true)} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700">
                  <Plus className="h-3 w-3" /> Créer un lien
                </button>
              </div>
              {links.length === 0 ? (
                <button onClick={() => setAddLinkOpen(true)} className="w-full rounded-xl border-2 border-dashed border-emerald-200 p-4 text-center text-sm text-muted-foreground hover:bg-emerald-500/5 transition-colors">
                  <Link2 className="mx-auto h-6 w-6 text-emerald-300 mb-1" />
                  Créer un QR code ou lien WhatsApp pour cet agent
                </button>
              ) : (
                <div className="space-y-1.5">
                  {links.map(link => (
                    <div key={link.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 bg-muted/30">
                      <QrCode className="h-4 w-4 text-emerald-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{link.name}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">/{link.slug}</p>
                      </div>
                      <span className={cn('text-[10px] rounded-full px-2 py-0.5', link.is_active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground')}>
                        {link.click_count ?? 0} clics
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          <div className="h-8" />
        </div>
      </div>

      {/* Dialog ajout document */}
      <Dialog open={addDocOpen} onOpenChange={setAddDocOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Attacher un document</DialogTitle>
            <DialogDescription>Choisissez depuis votre bibliothèque</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
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
          <Link href="/knowledge">
            <Button variant="outline" className="w-full">
              <Upload className="mr-2 h-4 w-4" /> Uploader un nouveau document
            </Button>
          </Link>
        </DialogContent>
      </Dialog>

      {/* Dialog ajout image */}
      <Dialog open={addImageOpen} onOpenChange={setAddImageOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Images IA disponibles</DialogTitle>
            <DialogDescription>Images de votre bibliothèque utilisables par cet agent</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-60 overflow-y-auto">
            {allImages.map(img => (
              <div key={img.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <Tag className="h-3.5 w-3.5 text-orange-500" />
                <code className="text-xs font-mono flex-1">{img.ref}</code>
                <span className="text-[10px] text-muted-foreground">{img.filename}</span>
              </div>
            ))}
            {allImages.length === 0 && (
              <p className="text-sm text-center text-muted-foreground py-4">Aucune image dans la bibliothèque</p>
            )}
          </div>
          <Link href="/knowledge">
            <Button variant="outline" className="w-full">
              <Upload className="mr-2 h-4 w-4" /> Gérer les images
            </Button>
          </Link>
        </DialogContent>
      </Dialog>

      {/* Dialog créer lien */}
      <Dialog open={addLinkOpen} onOpenChange={setAddLinkOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Créer un lien WhatsApp</DialogTitle>
            <DialogDescription>Ce lien sera automatiquement rattaché à cet agent</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nom du lien</Label>
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
              <Textarea value={linkMessage} onChange={e => setLinkMessage(e.target.value)} placeholder="Bonjour, je suis intéressé..." className="resize-none min-h-[60px] text-sm" />
            </div>
            <Button onClick={handleCreateLink} disabled={linkSaving || !linkName.trim() || !linkSession} className="w-full">
              {linkSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              Créer le lien
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test chat */}
      <AgentTestChat open={testOpen} onOpenChange={setTestOpen} agentId={id} agentName={agent.name} />
    </div>
  )
}
