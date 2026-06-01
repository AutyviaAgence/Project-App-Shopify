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

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const tenant = useTenant()

  const [agent, setAgent] = useState<AgentWithExtras | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testOpen, setTestOpen] = useState(false)

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
  const [editingSection, setEditingSection] = useState<string | null>(null)

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
        setEditingSection(null)
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

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
  if (!agent) return null

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">

      {/* ── Barre de nav ── */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/80 backdrop-blur-sm px-6 py-3">
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

      {/* ── Band hero ── */}
      <div
        className="relative overflow-hidden px-6 py-10 flex items-center gap-8"
        style={{
          background: `radial-gradient(ellipse at 20% 50%, ${color}22 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, ${color}15 0%, transparent 50%)`,
          borderBottom: `1px solid ${color}25`,
        }}
      >
        {/* Grille de fond subtile */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

        {/* Robot */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 blur-2xl rounded-full opacity-40" style={{ background: color }} />
          <AgentRobot color={color} size={100} />
        </div>

        {/* Infos agent */}
        <div className="min-w-0 flex-1">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            className="text-2xl font-bold border-0 shadow-none p-0 h-auto bg-transparent focus-visible:ring-0 text-foreground"
          />
          {description && <p className="text-sm text-muted-foreground mt-1 truncate">{description}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
              agent.is_active ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' : 'border-border bg-muted text-muted-foreground'
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', agent.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground')} />
              {agent.is_active ? 'Actif' : 'Inactif'}
            </span>
            <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">{model}</span>
            <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">{toneLabel}</span>
            {autoDetectLanguage && <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">Multilangue</span>}
          </div>
        </div>
      </div>

      {/* ── Bento grid ── */}
      <div className="p-6 grid grid-cols-2 gap-4 max-w-6xl mx-auto w-full">

        {/* ── Card 1 : Qui il est ── */}
        <BentoCard
          icon={Brain}
          title="Qui il est"
          color={color}
          accentColor="#8b5cf6"
          editing={editingSection === 'identity'}
          onEdit={() => setEditingSection(editingSection === 'identity' ? null : 'identity')}
          summary={
            <div className="space-y-2">
              <Row label="Ton" value={toneLabel} />
              <Row label="Objectif" value={objective || 'Non défini'} truncate />
              <Row label="Modèle" value={model} />
              {autoDetectLanguage && <Row label="Langue" value="Auto-détection" />}
            </div>
          }
        >
          {/* Ton */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Ton</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'professional', label: 'Professionnel', emoji: '👔' },
                { id: 'friendly', label: 'Chaleureux', emoji: '😊' },
                { id: 'casual', label: 'Décontracté', emoji: '😎' },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setTone(t.id)}
                  className={cn('rounded-xl border-2 py-2.5 text-center transition-all text-xs',
                    tone === t.id ? 'border-violet-500 bg-violet-500/10 font-medium' : 'border-border hover:border-violet-400/50'
                  )}>
                  <span className="block text-lg mb-0.5">{t.emoji}</span>{t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Rôle de l'agent..." className="h-8 text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Objectif</Label>
            <Input value={objective} onChange={e => setObjective(e.target.value)} placeholder="Ex: Répondre aux questions et proposer des RDV" className="h-8 text-sm" />
          </div>

          <div className="flex items-center justify-between rounded-xl border px-4 py-3">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Détection de langue</p>
                <p className="text-xs text-muted-foreground">Répond dans la langue du client</p>
              </div>
            </div>
            <Switch checked={autoDetectLanguage} onCheckedChange={setAutoDetectLanguage} />
          </div>

          {/* Avancé */}
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
              <Settings2 className="h-3.5 w-3.5" />
              Paramètres avancés
              <ChevronDown className="ml-auto h-3.5 w-3.5 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-3 space-y-3 rounded-xl border border-dashed p-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Prompt système</Label>
                <Textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} className="min-h-[120px] resize-y text-xs font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Modèle</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-xs" value={model} onChange={e => setModel(e.target.value)}>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                    <option value="gpt-4.1">GPT-4.1</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Créativité : {temperature}</Label>
                  <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full mt-2" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Délai min (s)</Label>
                  <Input type="number" min="0" value={delayMin} onChange={e => setDelayMin(parseInt(e.target.value) || 0)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Délai max (s)</Label>
                  <Input type="number" min="0" value={delayMax} onChange={e => setDelayMax(parseInt(e.target.value) || 0)} className="h-8 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Max messages</Label>
                  <Input type="number" value={maxMessages} onChange={e => setMaxMessages(e.target.value)} placeholder="Illimité" className="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Timeout inactivité (min)</Label>
                  <Input type="number" value={inactivityTimeout} onChange={e => setInactivityTimeout(e.target.value)} placeholder="Aucun" className="h-8 text-xs" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Condition d&apos;arrêt</Label>
                <Textarea value={stopCondition} onChange={e => setStopCondition(e.target.value)} placeholder="Ex: si le client a confirmé son RDV..." className="min-h-[50px] resize-none text-xs" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Planning horaire</Label>
                  <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
                </div>
                {scheduleEnabled && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="time" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} className="h-8 text-xs" />
                      <Input type="time" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="flex gap-1">
                      {DAYS.map((d, i) => (
                        <button key={i} onClick={() => setScheduleDays(prev => prev.includes(i + 1) ? prev.filter(x => x !== i + 1) : [...prev, i + 1])}
                          className={cn('flex-1 rounded-md py-1.5 text-[10px] font-medium border transition-colors',
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
        </BentoCard>

        {/* ── Card 2 : Ce qu'il sait ── */}
        <BentoCard
          icon={BookOpen}
          title="Ce qu'il sait"
          accentColor="#3b82f6"
          color={color}
          editing={editingSection === 'knowledge'}
          onEdit={() => setEditingSection(editingSection === 'knowledge' ? null : 'knowledge')}
          badge={docs.length + images.length > 0 ? `${docs.length + images.length} ressource${docs.length + images.length > 1 ? 's' : ''}` : undefined}
          summary={
            docs.length === 0 && images.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Aucune ressource attachée</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {docs.slice(0, 3).map(d => (
                  <span key={d.id} className="flex items-center gap-1 rounded-lg border bg-muted/50 px-2 py-1 text-[11px]">
                    <FileText className="h-3 w-3 text-blue-500" />{d.name}
                  </span>
                ))}
                {docs.length > 3 && <span className="rounded-lg border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">+{docs.length - 3}</span>}
                {images.map(i => (
                  <span key={i.id} className="flex items-center gap-1 rounded-lg border bg-muted/50 px-2 py-1 text-[11px]">
                    <Tag className="h-3 w-3 text-orange-500" />{i.ref}
                  </span>
                ))}
              </div>
            )
          }
        >
          {/* Documents */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Documents</Label>
              <button onClick={() => setAddDocOpen(true)} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600">
                <Plus className="h-3 w-3" /> Ajouter
              </button>
            </div>
            {docs.length === 0 ? (
              <button onClick={() => setAddDocOpen(true)}
                className="w-full rounded-xl border-2 border-dashed border-blue-500/30 p-4 text-center text-xs text-muted-foreground hover:border-blue-500/60 hover:bg-blue-500/5 transition-all">
                <FileText className="mx-auto h-5 w-5 text-blue-400 mb-1" />
                Ajouter un document depuis la bibliothèque
              </button>
            ) : (
              <div className="space-y-1.5">
                {docs.map(doc => (
                  <div key={doc.id} className="group flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2">
                    <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span className="text-xs flex-1 truncate">{doc.name}</span>
                    <button onClick={() => handleDetachDoc(doc.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Images IA */}
          {images.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Images IA</Label>
              <div className="flex flex-wrap gap-1.5">
                {images.map(img => (
                  <span key={img.id} className="flex items-center gap-1.5 rounded-lg border bg-muted/30 px-2.5 py-1.5 text-xs">
                    <Tag className="h-3 w-3 text-orange-500" />
                    <code className="font-mono">{img.ref}</code>
                  </span>
                ))}
              </div>
            </div>
          )}

          <Link href="/knowledge">
            <Button variant="outline" size="sm" className="w-full text-xs h-8">
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Gérer la bibliothèque
            </Button>
          </Link>
        </BentoCard>

        {/* ── Card 3 : Comment il réagit ── */}
        <BentoCard
          icon={Zap}
          title="Comment il réagit"
          accentColor="#f97316"
          color={color}
          editing={editingSection === 'behavior'}
          onEdit={() => setEditingSection(editingSection === 'behavior' ? null : 'behavior')}
          summary={
            <div className="space-y-2">
              <Row label="Escalade" value={escalationEnabled ? 'Activée' : 'Désactivée'} />
              <Row label="RDV" value={bookingUrl ? 'Configuré' : 'Non configuré'} />
            </div>
          }
        >
          {/* Escalade */}
          <div className="rounded-xl border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
              <div className="flex items-center gap-2.5">
                <UserCheck className="h-4 w-4 text-rose-500" />
                <div>
                  <p className="text-sm font-medium">Escalade vers un humain</p>
                  <p className="text-xs text-muted-foreground">Transfère si nécessaire</p>
                </div>
              </div>
              <Switch checked={escalationEnabled} onCheckedChange={setEscalationEnabled} />
            </div>
            {escalationEnabled && (
              <div className="px-4 py-3 space-y-3 border-t">
                <div className="grid grid-cols-3 gap-1.5">
                  {([{ id: 'keywords', label: 'Mots-clés' }, { id: 'ai', label: 'IA' }, { id: 'both', label: 'Les deux' }] as const).map(m => (
                    <button key={m.id} onClick={() => setEscalationMode(m.id)}
                      className={cn('rounded-lg border py-1.5 text-xs font-medium transition-colors',
                        escalationMode === m.id ? 'border-orange-500 bg-orange-500/10 text-orange-600' : 'border-border hover:bg-muted'
                      )}>
                      {m.label}
                    </button>
                  ))}
                </div>
                {(escalationMode === 'keywords' || escalationMode === 'both') && (
                  <Input value={escalationKeywords} onChange={e => setEscalationKeywords(e.target.value)} placeholder="humain, conseiller, ..." className="h-8 text-xs" />
                )}
                <Textarea value={escalationMessage} onChange={e => setEscalationMessage(e.target.value)} placeholder="Je vous transfère à un conseiller..." className="min-h-[60px] resize-none text-sm" />
              </div>
            )}
          </div>

          {/* RDV */}
          <div className="rounded-xl border px-4 py-3 space-y-2">
            <div className="flex items-center gap-2.5">
              <CalendarCheck className="h-4 w-4 text-cyan-500" />
              <p className="text-sm font-medium">Lien de rendez-vous</p>
            </div>
            <Input value={bookingUrl} onChange={e => setBookingUrl(e.target.value)} placeholder="https://calendly.com/..." className="h-8 text-sm" />
          </div>
        </BentoCard>

        {/* ── Card 4 : Où il est actif ── */}
        <BentoCard
          icon={Smartphone}
          title="Où il est actif"
          accentColor="#10b981"
          color={color}
          editing={editingSection === 'channels'}
          onEdit={() => setEditingSection(editingSection === 'channels' ? null : 'channels')}
          badge={links.length > 0 ? `${links.length} lien${links.length > 1 ? 's' : ''}` : undefined}
          summary={
            <div className="space-y-2">
              <Row label="Sessions" value={`${sessions.filter(s => s.status === 'connected').length} connectée${sessions.filter(s => s.status === 'connected').length > 1 ? 's' : ''}`} />
              <Row label="Liens QR" value={links.length > 0 ? `${links.length} lien${links.length > 1 ? 's' : ''}` : 'Aucun'} />
            </div>
          }
        >
          {/* Sessions */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Sessions WhatsApp</Label>
            {sessions.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-emerald-500/30 p-4 text-center">
                <Smartphone className="mx-auto h-5 w-5 text-emerald-400 mb-1" />
                <p className="text-xs text-muted-foreground">Aucune session</p>
                <Link href="/sessions" className="text-[11px] text-emerald-600 hover:underline">Connecter WhatsApp →</Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                {sessions.map(s => (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                    <span className={cn('h-2 w-2 rounded-full shrink-0', s.status === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{s.display_name || s.instance_name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.phone_number || '—'}</p>
                    </div>
                    <span className={cn('text-[10px] rounded-full px-2 py-0.5', s.status === 'connected' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground')}>
                      {s.status === 'connected' ? 'Connecté' : 'Déconnecté'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Liens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Liens WhatsApp</Label>
              <button onClick={() => setAddLinkOpen(true)} className="flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-600">
                <Plus className="h-3 w-3" /> Créer
              </button>
            </div>
            {links.length === 0 ? (
              <button onClick={() => setAddLinkOpen(true)}
                className="w-full rounded-xl border-2 border-dashed border-emerald-500/30 p-4 text-center text-xs text-muted-foreground hover:border-emerald-500/60 hover:bg-emerald-500/5 transition-all">
                <QrCode className="mx-auto h-5 w-5 text-emerald-400 mb-1" />
                Créer un QR code pour cet agent
              </button>
            ) : (
              <div className="space-y-1.5">
                {links.map(link => (
                  <div key={link.id} className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2">
                    <QrCode className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate">{link.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">/{link.slug}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{link.click_count ?? 0} clics</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </BentoCard>
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

// ─── Composants utilitaires ───────────────────────────────────────────────────

function BentoCard({
  icon: Icon, title, accentColor, color, editing, onEdit, summary, children, badge,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  accentColor: string
  color: string
  editing: boolean
  onEdit: () => void
  summary: React.ReactNode
  children: React.ReactNode
  badge?: string
}) {
  return (
    <div className={cn(
      'rounded-2xl border bg-card overflow-hidden transition-all duration-200',
      editing ? 'ring-2 shadow-lg' : 'hover:shadow-md'
    )}
      style={editing ? { boxShadow: `0 0 0 2px ${accentColor}40` } : {}}
    >
      {/* Header de la card */}
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-muted/20">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}30`, color: accentColor }}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{title}</p>
            {badge && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: `${accentColor}18`, color: accentColor }}>
                {badge}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onEdit}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all',
            editing
              ? 'text-white'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
          style={editing ? { background: accentColor } : {}}
        >
          <Pencil className="h-3 w-3" />
          {editing ? 'Fermer' : 'Modifier'}
        </button>
      </div>

      {/* Corps */}
      <div className="px-5 py-4">
        {editing ? (
          <div className="space-y-4">{children}</div>
        ) : (
          <div>{summary}</div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="text-xs flex-1 border-b border-dashed border-border/50 mx-1" />
      <span className={cn('text-xs font-medium', truncate && 'truncate max-w-[140px]')}>{value}</span>
    </div>
  )
}
