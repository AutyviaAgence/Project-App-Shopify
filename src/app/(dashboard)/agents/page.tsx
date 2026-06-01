'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/i18n/context'
import { cn } from '@/lib/utils'
import type { AIAgent, Team } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Plus,
  Bot,
  Trash2,
  Pencil,
  Loader2,
  Brain,
  Clock,
  Languages,
  Users,
  ShieldAlert,
  CalendarClock,
  Link2,
  Megaphone,
  MousePointerClick,
  Sparkles,
  Settings2,
  ChevronDown,
  Wand2,
  MessageSquare,
  Wrench,
  Pin,
  PinOff,
  Copy,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { MultiTeamSelect } from '@/components/multi-team-select'
import { AgentWizard, type GeneratedAgentConfig } from '@/components/agent-wizard'
import { AgentTestChat } from '@/components/agent-test-chat'
import { AgentToolsManager } from '@/components/agent-tools-manager'

type TeamWithRole = Team & { my_role: 'owner' | 'admin' | 'member' }
type BookingStats = {
  total_proposals: number
  total_clicks: number
  unique_contacts: number
  conversion_rate: number
}
type AgentWithTeamIds = AIAgent & { team_ids?: string[]; booking_stats?: BookingStats }

export default function AgentsPage() {
  const { t } = useTranslation()
  const [agents, setAgents] = useState<AgentWithTeamIds[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AgentWithTeamIds | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [agentToDelete, setAgentToDelete] = useState<AgentWithTeamIds | null>(null)
  const [teams, setTeams] = useState<TeamWithRole[]>([])
  const [agentKnowledge, setAgentKnowledge] = useState<Record<string, { id: string; name: string }[]>>({})

  // Form state
  const [formTeamIds, setFormTeamIds] = useState<string[]>([])
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formSystemPrompt, setFormSystemPrompt] = useState('')
  const [formObjective, setFormObjective] = useState('')
  const [formModel, setFormModel] = useState('gpt-4o-mini')
  const [formTemperature, setFormTemperature] = useState('0.7')
  const [formDelayMin, setFormDelayMin] = useState('0')
  const [formDelayMax, setFormDelayMax] = useState('0')
  const [formMaxMessages, setFormMaxMessages] = useState('')
  const [formInactivityTimeout, setFormInactivityTimeout] = useState('')

  // Schedule form state
  const [formScheduleEnabled, setFormScheduleEnabled] = useState(false)
  const [formScheduleTimezone, setFormScheduleTimezone] = useState('Europe/Paris')
  const [formScheduleStartTime, setFormScheduleStartTime] = useState('09:00')
  const [formScheduleEndTime, setFormScheduleEndTime] = useState('18:00')
  const [formScheduleDays, setFormScheduleDays] = useState<number[]>([1, 2, 3, 4, 5])

  // Language detection
  const [formAutoDetectLanguage, setFormAutoDetectLanguage] = useState(false)

  // Escalation (garde-fou)
  const [formEscalationEnabled, setFormEscalationEnabled] = useState(false)
  const [formEscalationMode, setFormEscalationMode] = useState<'keywords' | 'ai' | 'both'>('keywords')
  const [formEscalationKeywords, setFormEscalationKeywords] = useState('')
  const [formEscalationMessage, setFormEscalationMessage] = useState('')

  // Lien de rendez-vous
  const [formBookingUrl, setFormBookingUrl] = useState('')

  // Type d'agent
  const [formAgentType, setFormAgentType] = useState<'conversation' | 'relance' | 'qualifier'>('conversation')

  // Condition d'arrêt
  const [formStopCondition, setFormStopCondition] = useState('')

  // Qualifier routes
  type QualifierRouteForm = { id?: string; name: string; description: string; target_agent_id: string; priority: number }
  const [qualifierRoutes, setQualifierRoutes] = useState<QualifierRouteForm[]>([])
  const [loadingRoutes, setLoadingRoutes] = useState(false)

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false)

  // Optimisation du prompt
  const [optimizing, setOptimizing] = useState(false)

  // Test chat state
  const [testChatOpen, setTestChatOpen] = useState(false)
  const [testingAgent, setTestingAgent] = useState<AIAgent | null>(null)

  // Tools state
  const [toolsOpen, setToolsOpen] = useState(false)
  const [toolsAgent, setToolsAgent] = useState<AgentWithTeamIds | null>(null)

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents(json.data)
        // Fetch knowledge bases for each agent in parallel
        const kbMap: Record<string, { id: string; name: string }[]> = {}
        await Promise.all(
          (json.data as AgentWithTeamIds[]).map(async (agent) => {
            try {
              const kbRes = await fetch(`/api/agents/${agent.id}/knowledge`)
              const kbJson = await kbRes.json()
              if (kbRes.ok && kbJson.data?.length > 0) {
                kbMap[agent.id] = kbJson.data.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }))
              }
            } catch {
              // Silently ignore KB fetch errors
            }
          })
        )
        setAgentKnowledge(kbMap)
      }
    } catch {
      toast.error(t('agents.load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/teams')
      const json = await res.json()
      if (res.ok && json.data) {
        setTeams(json.data.filter((t: TeamWithRole) => t.my_role === 'owner' || t.my_role === 'admin'))
      }
    } catch {
      // Silently ignore
    }
  }, [])

  useEffect(() => {
    fetchAgents()
    fetchTeams()
  }, [fetchAgents, fetchTeams])

  function openCreateDialog() {
    setEditing(null)
    setFormTeamIds([])
    setFormName('')
    setFormDescription('')
    setFormSystemPrompt('')
    setFormObjective('')
    setFormModel('gpt-4o-mini')
    setFormTemperature('0.7')
    setFormDelayMin('0')
    setFormDelayMax('0')
    setFormMaxMessages('')
    setFormInactivityTimeout('')
    setFormScheduleEnabled(false)
    setFormScheduleTimezone('Europe/Paris')
    setFormScheduleStartTime('09:00')
    setFormScheduleEndTime('18:00')
    setFormScheduleDays([1, 2, 3, 4, 5])
    setFormAutoDetectLanguage(false)
    setFormEscalationEnabled(false)
    setFormEscalationMode('keywords')
    setFormEscalationKeywords('')
    setFormEscalationMessage('')
    setFormBookingUrl('')
    setFormAgentType('conversation')
    setFormStopCondition('')
    setQualifierRoutes([])
    setDialogOpen(true)
  }

  function openEditDialog(agent: AgentWithTeamIds) {
    setEditing(agent)
    setFormTeamIds(agent.team_ids || (agent.team_id ? [agent.team_id] : []))
    setFormName(agent.name)
    setFormDescription(agent.description || '')
    setFormSystemPrompt(agent.system_prompt)
    setFormObjective(agent.objective || '')
    setFormModel(agent.model)
    setFormTemperature(String(agent.temperature))
    setFormDelayMin(String(agent.response_delay_min ?? 0))
    setFormDelayMax(String(agent.response_delay_max ?? 0))
    setFormMaxMessages(agent.max_messages_per_conversation != null ? String(agent.max_messages_per_conversation) : '')
    setFormInactivityTimeout(agent.inactivity_timeout_minutes != null ? String(agent.inactivity_timeout_minutes) : '')
    setFormScheduleEnabled(agent.schedule_enabled ?? false)
    setFormScheduleTimezone(agent.schedule_timezone ?? 'Europe/Paris')
    setFormScheduleStartTime(agent.schedule_start_time ?? '09:00')
    setFormScheduleEndTime(agent.schedule_end_time ?? '18:00')
    setFormScheduleDays(agent.schedule_days ?? [1, 2, 3, 4, 5])
    setFormAutoDetectLanguage(agent.auto_detect_language ?? false)
    setFormEscalationEnabled(agent.escalation_enabled ?? false)
    setFormEscalationMode((agent as any).escalation_mode ?? 'keywords')
    setFormEscalationKeywords(agent.escalation_keywords?.join(', ') ?? '')
    setFormEscalationMessage(agent.escalation_message ?? '')
    setFormBookingUrl(agent.booking_url ?? '')
    setFormAgentType(agent.agent_type ?? 'conversation')
    setFormStopCondition(agent.stop_condition ?? '')
    setQualifierRoutes([])
    setDialogOpen(true)

    // Load qualifier routes if qualifier type
    if (agent.agent_type === 'qualifier') {
      setLoadingRoutes(true)
      fetch(`/api/agents/${agent.id}/qualifier-routes`)
        .then(res => res.json())
        .then(json => {
          if (json.data) {
            setQualifierRoutes(json.data.map((r: { id: string; name: string; description: string; target_agent_id: string; priority: number }) => ({
              id: r.id,
              name: r.name,
              description: r.description,
              target_agent_id: r.target_agent_id,
              priority: r.priority,
            })))
          }
        })
        .catch(() => {})
        .finally(() => setLoadingRoutes(false))
    }
  }

  async function syncQualifierRoutes(agentId: string) {
    try {
      // Fetch existing routes
      const existingRes = await fetch(`/api/agents/${agentId}/qualifier-routes`)
      const existingJson = await existingRes.json()
      const existingRoutes: { id: string }[] = existingJson.data || []

      // Delete routes that are no longer in the form
      const formRouteIds = qualifierRoutes.filter(r => r.id).map(r => r.id!)
      for (const existing of existingRoutes) {
        if (!formRouteIds.includes(existing.id)) {
          await fetch(`/api/agents/${agentId}/qualifier-routes/${existing.id}`, { method: 'DELETE' })
        }
      }

      // Create or update routes
      for (let i = 0; i < qualifierRoutes.length; i++) {
        const route = qualifierRoutes[i]
        if (!route.name.trim() || !route.description.trim() || !route.target_agent_id) continue

        if (route.id) {
          // Update existing
          await fetch(`/api/agents/${agentId}/qualifier-routes/${route.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: route.name.trim(),
              description: route.description.trim(),
              target_agent_id: route.target_agent_id,
              priority: i,
            }),
          })
        } else {
          // Create new
          await fetch(`/api/agents/${agentId}/qualifier-routes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              target_agent_id: route.target_agent_id,
              name: route.name.trim(),
              description: route.description.trim(),
              priority: i,
            }),
          })
        }
      }
    } catch (err) {
      console.error('Error syncing qualifier routes:', err)
    }
  }

  async function handleSave() {
    if (!formName.trim() || !formSystemPrompt.trim()) {
      toast.error(t('agents.name_prompt_required'))
      return
    }

    const temp = parseFloat(formTemperature)
    if (isNaN(temp) || temp < 0 || temp > 2) {
      toast.error(t('agents.temp_error'))
      return
    }

    setSaving(true)
    try {
      if (editing) {
        const res = await fetch(`/api/agents/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim(),
            system_prompt: formSystemPrompt.trim(),
            objective: formObjective.trim(),
            model: formModel,
            temperature: temp,
            response_delay_min: parseInt(formDelayMin) || 0,
            response_delay_max: parseInt(formDelayMax) || 0,
            max_messages_per_conversation: formMaxMessages.trim() ? parseInt(formMaxMessages) : null,
            inactivity_timeout_minutes: formInactivityTimeout.trim() ? parseInt(formInactivityTimeout) : null,
            schedule_enabled: formScheduleEnabled,
            schedule_timezone: formScheduleTimezone,
            schedule_start_time: formScheduleStartTime,
            schedule_end_time: formScheduleEndTime,
            schedule_days: formScheduleDays,
            auto_detect_language: formAutoDetectLanguage,
            escalation_enabled: formEscalationEnabled,
            escalation_mode: formEscalationMode,
            escalation_keywords: formEscalationKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0),
            escalation_message: formEscalationMessage.trim() || null,
            booking_url: formBookingUrl.trim() || null,
            team_ids: formTeamIds,
            agent_type: formAgentType,
            stop_condition: formStopCondition.trim() || null,
          }),
        })
        const json = await res.json()
        if (res.ok && json.data) {
          // Save qualifier routes if qualifier type
          if (formAgentType === 'qualifier') {
            await syncQualifierRoutes(editing.id)
          }
          setAgents((prev) => prev.map((a) => (a.id === editing.id ? json.data : a)))
          toast.success(t('agents.agent_edited'))
          setDialogOpen(false)
        } else {
          toast.error(json.error || t('agents.edit_error'))
        }
      } else {
        const res = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim(),
            system_prompt: formSystemPrompt.trim(),
            objective: formObjective.trim(),
            model: formModel,
            temperature: temp,
            response_delay_min: parseInt(formDelayMin) || 0,
            response_delay_max: parseInt(formDelayMax) || 0,
            max_messages_per_conversation: formMaxMessages.trim() ? parseInt(formMaxMessages) : null,
            inactivity_timeout_minutes: formInactivityTimeout.trim() ? parseInt(formInactivityTimeout) : null,
            schedule_enabled: formScheduleEnabled,
            schedule_timezone: formScheduleTimezone,
            schedule_start_time: formScheduleStartTime,
            schedule_end_time: formScheduleEndTime,
            schedule_days: formScheduleDays,
            auto_detect_language: formAutoDetectLanguage,
            escalation_enabled: formEscalationEnabled,
            escalation_mode: formEscalationMode,
            escalation_keywords: formEscalationKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0),
            escalation_message: formEscalationMessage.trim() || null,
            booking_url: formBookingUrl.trim() || null,
            team_ids: formTeamIds,
            agent_type: formAgentType,
            stop_condition: formStopCondition.trim() || null,
          }),
        })
        const json = await res.json()
        if (res.ok && json.data) {
          // Save qualifier routes if qualifier type
          if (formAgentType === 'qualifier' && qualifierRoutes.length > 0) {
            await syncQualifierRoutes(json.data.id)
          }
          setAgents((prev) => [json.data, ...prev])
          toast.success(t('agents.agent_created'))
          setDialogOpen(false)
        } else {
          toast.error(json.error || t('agents.create_error'))
        }
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setSaving(false)
    }
  }

  function openDeleteDialog(agent: AIAgent) {
    setAgentToDelete(agent)
    setDeleteDialogOpen(true)
  }

  async function handleConfirmDelete() {
    if (!agentToDelete) return
    setDeleting(agentToDelete.id)
    try {
      const res = await fetch(`/api/agents/${agentToDelete.id}`, { method: 'DELETE' })
      if (res.ok) {
        setAgents((prev) => prev.filter((a) => a.id !== agentToDelete.id))
        toast.success(t('agents.agent_deleted'))
        setDeleteDialogOpen(false)
        setAgentToDelete(null)
      } else {
        const json = await res.json()
        toast.error(json.error || t('agents.delete_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setDeleting(null)
    }
  }

  async function handleToggleActive(agent: AIAgent) {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !agent.is_active }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? json.data : a)))
        toast.success(json.data.is_active ? t('agents.agent_enabled') : t('agents.agent_disabled'))
      }
    } catch {
      toast.error(t('common.network_error'))
    }
  }

  async function handleTogglePin(agent: AIAgent) {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: !agent.is_pinned }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? json.data : a)))
      }
    } catch {
      toast.error(t('common.network_error'))
    }
  }

  async function handleDuplicate(agent: AIAgent) {
    try {
      setSaving(true)
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${agent.name} (copie)`,
          description: agent.description,
          system_prompt: agent.system_prompt,
          objective: agent.objective,
          model: agent.model,
          temperature: agent.temperature,
          response_delay_min: agent.response_delay_min,
          response_delay_max: agent.response_delay_max,
          max_messages_per_conversation: agent.max_messages_per_conversation,
          inactivity_timeout_minutes: agent.inactivity_timeout_minutes,
          escalation_enabled: agent.escalation_enabled,
          escalation_mode: (agent as any).escalation_mode || 'keywords',
          escalation_keywords: agent.escalation_keywords,
          escalation_message: agent.escalation_message,
          booking_url: agent.booking_url,
          agent_type: agent.agent_type,
          stop_condition: agent.stop_condition,
          team_ids: (agent as AIAgent & { team_ids?: string[] }).team_ids || (agent.team_id ? [agent.team_id] : []),
          is_active: false,
          schedule_enabled: agent.schedule_enabled,
          schedule_timezone: agent.schedule_timezone,
          schedule_start_time: agent.schedule_start_time,
          schedule_end_time: agent.schedule_end_time,
          schedule_days: agent.schedule_days,
          auto_detect_language: agent.auto_detect_language,
        }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setAgents((prev) => [json.data, ...prev])
        toast.success(t('agents.duplicated'))
      } else {
        toast.error(json.error || t('common.error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setSaving(false)
    }
  }

  async function handleWizardComplete(config: GeneratedAgentConfig) {
    setSaving(true)
    try {
      // 1. Créer l'agent
      const agentRes = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.name,
          description: config.description,
          system_prompt: config.system_prompt,
          objective: config.objective,
          model: 'gpt-4o-mini',
          temperature: 0.7,
          response_delay_min: 30,
          response_delay_max: 120,
          agent_type: config.agent_type,
          escalation_enabled: config.escalation_enabled,
          escalation_mode: (config as any).escalation_mode || 'keywords',
          escalation_keywords: config.escalation_keywords,
          escalation_message: config.escalation_message,
          booking_url: config.booking_url || null,
          schedule_enabled: config.schedule_enabled,
          schedule_timezone: 'Europe/Paris',
          schedule_start_time: config.schedule_start_time,
          schedule_end_time: config.schedule_end_time,
          schedule_days: config.schedule_days,
          auto_detect_language: true,
        }),
      })

      const agentJson = await agentRes.json()

      if (!agentRes.ok) {
        toast.error(agentJson.error || t('agents.wizard_create_error'))
        return
      }

      // 2. Créer automatiquement un document RAG avec les infos métier
      if (config.ragContent) {
        try {
          const ragRes = await fetch('/api/knowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `Informations - ${config.name}`,
              content: config.ragContent,
              agent_ids: [agentJson.data.id],
            }),
          })

          if (ragRes.ok) {
            toast.success(t('agents.wizard_created_kb'))
          } else {
            toast.success(t('agents.wizard_created_no_kb'))
          }
        } catch {
          toast.success(t('agents.wizard_created_no_kb'))
        }
      } else {
        toast.success(t('agents.wizard_created'))
      }

      setAgents((prev) => [agentJson.data, ...prev])
      setWizardOpen(false)
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setSaving(false)
    }
  }

  async function handleOptimizePrompt() {
    if (!formSystemPrompt.trim() || formSystemPrompt.trim().length < 10) {
      toast.error(t('agents.prompt_min_error'))
      return
    }

    setOptimizing(true)
    try {
      const res = await fetch('/api/agents/optimize-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: formSystemPrompt,
          context: {
            businessName: formName || undefined,
            agentType: formAgentType,
            objective: formObjective || undefined,
          },
        }),
      })

      const json = await res.json()

      if (res.ok && json.data?.optimized) {
        setFormSystemPrompt(json.data.optimized)
        toast.success(t('agents.prompt_optimized'))
      } else {
        toast.error(json.error || t('agents.optimize_error'))
      }
    } catch {
      toast.error(t('common.network_error'))
    } finally {
      setOptimizing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div data-tour="agents-header">
          <h1 className="text-xl sm:text-2xl font-bold">{t('agents.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('agents.description')}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button data-tour="new-agent-btn" className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              {t('agents.new_agent')}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setWizardOpen(true)}>
              <Sparkles className="mr-2 h-4 w-4 text-primary" />
              <div>
                <p className="font-medium">{t('agents.guided_assistant')}</p>
                <p className="text-xs text-muted-foreground">{t('agents.guided_desc')}</p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openCreateDialog}>
              <Settings2 className="mr-2 h-4 w-4" />
              <div>
                <p className="font-medium">{t('agents.advanced_mode')}</p>
                <p className="text-xs text-muted-foreground">{t('agents.advanced_desc')}</p>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">{t('agents.no_agents')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('agents.no_agents_desc')}
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <Button onClick={() => setWizardOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" />
                {t('agents.create_with_assistant')}
              </Button>
              <Button variant="outline" onClick={openCreateDialog}>
                <Settings2 className="mr-2 h-4 w-4" />
                {t('agents.advanced_mode')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...agents].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)).map((agent) => {
            const isDeleting = deleting === agent.id

            return (
              <Card key={agent.id} className={cn('overflow-hidden', !agent.is_active && 'opacity-60', agent.is_pinned && 'ring-1 ring-primary/30')}>
                <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-sm font-medium truncate min-w-0 flex items-center gap-1">
                    <Bot className="mr-1 inline h-4 w-4 shrink-0" />
                    <span className="truncate">{agent.name}</span>
                    <button
                      onClick={() => handleTogglePin(agent)}
                      className={cn(
                        'ml-1 shrink-0 rounded p-0.5 transition-colors hover:bg-muted',
                        agent.is_pinned ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'
                      )}
                      title={agent.is_pinned ? t('agents.unpin') : t('agents.pin')}
                    >
                      {agent.is_pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                    </button>
                  </CardTitle>
                  <Badge variant={agent.is_active ? 'default' : 'secondary'} className="w-fit">
                    {agent.is_active ? t('common.active') : t('common.inactive')}
                  </Badge>
                </CardHeader>
                <CardContent className="min-w-0">
                  <div className="space-y-2 min-w-0">
                    {agent.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {agent.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {agent.agent_type === 'relance' && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Megaphone className="h-3 w-3" />
                          {t('agents.relance')}
                        </Badge>
                      )}
                      {agent.agent_type === 'qualifier' && (
                        <Badge variant="secondary" className="gap-1 text-xs bg-sky-500/10 text-sky-500">
                          <Sparkles className="h-3 w-3" />
                          {t('agents.qualifier')}
                        </Badge>
                      )}
                      {(agent.team_ids?.length || agent.team_id) && (
                        <>
                          {(agent.team_ids || (agent.team_id ? [agent.team_id] : [])).map(tid => (
                            <Badge key={tid} variant="outline" className="gap-1 text-xs font-normal">
                              <Users className="h-3 w-3" />
                              {teams.find(tm => tm.id === tid)?.name || t('common.team')}
                            </Badge>
                          ))}
                        </>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {agent.model}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        T° {agent.temperature}
                      </span>
                      {(agent.response_delay_min > 0 || agent.response_delay_max > 0) && (
                        <span className="text-xs text-muted-foreground">
                          {t('agents.delay')} {agent.response_delay_min}–{agent.response_delay_max}s
                        </span>
                      )}
                      {agent.max_messages_per_conversation != null && (
                        <span className="text-xs text-muted-foreground">
                          {t('agents.max')} {agent.max_messages_per_conversation} msg
                        </span>
                      )}
                      {agent.inactivity_timeout_minutes != null && (
                        <span className="text-xs text-muted-foreground">
                          {t('agents.timeout')} {agent.inactivity_timeout_minutes}min
                        </span>
                      )}
                      {agent.schedule_enabled && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {agent.schedule_start_time}–{agent.schedule_end_time}
                        </span>
                      )}
                      {agent.auto_detect_language && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Languages className="h-3 w-3" />
                          {t('agents.multi_lang')}
                        </span>
                      )}
                      {agent.escalation_enabled && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <ShieldAlert className="h-3 w-3" />
                          {t('agents.guardrail')}
                        </span>
                      )}
                    </div>

                    {/* Knowledge bases */}
                    {agentKnowledge[agent.id]?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {agentKnowledge[agent.id].map((kb) => (
                          <Badge key={kb.id} variant="outline" className="gap-1 text-xs font-normal">
                            <Brain className="h-3 w-3 text-[#7DC2A5]" />
                            {kb.name}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground line-clamp-2 break-words">
                      {agent.system_prompt}
                    </p>

                    {agent.objective && (
                      <p className="text-xs text-muted-foreground truncate break-all">
                        {t('agents.objective')} : {agent.objective}
                      </p>
                    )}

                    {/* Stats des liens de RDV */}
                    {agent.booking_url && (
                      <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
                        <div className="flex items-center gap-1" title="Nombre de fois où l'agent a proposé un lien de RDV">
                          <CalendarClock className="h-3.5 w-3.5 text-blue-500" />
                          <span className="text-xs font-medium">
                            {agent.booking_stats?.total_proposals || 0}
                          </span>
                          <span className="text-xs text-muted-foreground">{t('agents.proposed')}</span>
                        </div>
                        <div className="flex items-center gap-1" title="Nombre de clics sur les liens de RDV">
                          <MousePointerClick className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-medium">
                            {agent.booking_stats?.total_clicks || 0}
                          </span>
                          <span className="text-xs text-muted-foreground">{t('dashboard.clicks')}</span>
                        </div>
                        {(agent.booking_stats?.total_proposals || 0) > 0 && (
                          <div className="flex items-center gap-1" title="Taux de conversion (clics / propositions)">
                            <span className={`text-xs font-medium ${
                              (agent.booking_stats?.conversion_rate || 0) >= 50 ? 'text-green-500' :
                              (agent.booking_stats?.conversion_rate || 0) >= 20 ? 'text-yellow-500' :
                              'text-muted-foreground'
                            }`}>
                              {agent.booking_stats?.conversion_rate || 0}%
                            </span>
                            <span className="text-xs text-muted-foreground">{t('agents.rate')}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Link href={`/agents/${agent.id}`}>
                      <Button size="sm" variant="default">
                        <Bot className="mr-1 h-3 w-3" />
                        Configurer
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditDialog(agent)}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setTestingAgent(agent)
                        setTestChatOpen(true)
                      }}
                    >
                      <MessageSquare className="mr-1 h-3 w-3" />
                      {t('common.test')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setToolsAgent(agent)
                        setToolsOpen(true)
                      }}
                    >
                      <Wrench className="mr-1 h-3 w-3" />
                      {t('tools.title')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDuplicate(agent)}
                      disabled={saving}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      {t('common.duplicate')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(agent)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-3 w-3" />
                      )}
                      {t('common.delete')}
                    </Button>
                    <div className="ml-auto">
                      <Switch
                        checked={agent.is_active}
                        onCheckedChange={() => handleToggleActive(agent)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t('agents.edit_agent') : t('agents.new_agent_title')}</DialogTitle>
            <DialogDescription>
              {editing
                ? t('agents.edit_desc')
                : t('agents.create_desc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <MultiTeamSelect
              teams={teams}
              selectedTeamIds={formTeamIds}
              onTeamIdsChange={setFormTeamIds}
              label={t('common.teams')}
              description={t('agents.teams_desc')}
              emptyDescription={t('agents.teams_empty')}
            />

            <div className="space-y-2">
              <Label htmlFor="agent-name">{t('agents.name_label')}</Label>
              <Input
                id="agent-name"
                placeholder={t('agents.name_placeholder')}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-description">{t('agents.description_label')}</Label>
              <Textarea
                id="agent-description"
                placeholder={t('agents.description_placeholder')}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-type">{t('agents.agent_type')}</Label>
              <Select value={formAgentType} onValueChange={(v) => setFormAgentType(v as 'conversation' | 'relance')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conversation">{t('agents.type_conversation')}</SelectItem>
                  <SelectItem value="relance">{t('agents.type_relance')}</SelectItem>
                  <SelectItem value="qualifier">{t('agents.type_qualifier')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('agents.type_help')}
              </p>
            </div>

            {/* Qualifier Routes Section */}
            {formAgentType === 'qualifier' && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-sky-500" />
                    {t('agents.qualifier_routes')}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setQualifierRoutes(prev => [...prev, { name: '', description: '', target_agent_id: '', priority: prev.length }])}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {t('agents.qualifier_route_add')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('agents.qualifier_routes_help')}
                </p>

                {loadingRoutes && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Chargement...
                  </div>
                )}

                {qualifierRoutes.length === 0 && !loadingRoutes && (
                  <p className="text-xs text-muted-foreground italic py-2">
                    {t('agents.qualifier_route_none')}
                  </p>
                )}

                {qualifierRoutes.map((route, idx) => (
                  <div key={idx} className="space-y-2 p-3 border rounded-lg relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-1 right-1 h-6 w-6 p-0"
                      onClick={() => setQualifierRoutes(prev => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('agents.qualifier_route_name')}</Label>
                      <Input
                        placeholder={t('agents.qualifier_route_name_placeholder')}
                        value={route.name}
                        onChange={e => setQualifierRoutes(prev => prev.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('agents.qualifier_route_description')}</Label>
                      <Textarea
                        placeholder={t('agents.qualifier_route_description_placeholder')}
                        value={route.description}
                        onChange={e => setQualifierRoutes(prev => prev.map((r, i) => i === idx ? { ...r, description: e.target.value } : r))}
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('agents.qualifier_route_target')}</Label>
                      <Select
                        value={route.target_agent_id || 'none'}
                        onValueChange={v => setQualifierRoutes(prev => prev.map((r, i) => i === idx ? { ...r, target_agent_id: v === 'none' ? '' : v } : r))}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {agents.filter(a => a.agent_type !== 'qualifier' && a.id !== editing?.id).map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="agent-prompt">{t('agents.system_prompt')}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOptimizePrompt}
                  disabled={optimizing || !formSystemPrompt.trim() || formSystemPrompt.trim().length < 10}
                  className="h-7 text-xs"
                >
                  {optimizing ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      {t('agents.optimizing')}
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-1.5 h-3 w-3" />
                      {t('agents.optimize_prompt')}
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                id="agent-prompt"
                placeholder={t('agents.prompt_placeholder')}
                value={formSystemPrompt}
                onChange={(e) => setFormSystemPrompt(e.target.value)}
                rows={8}
              />
              <p className="text-xs text-muted-foreground">
                {t('agents.prompt_help')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-objective">{t('agents.objective')}</Label>
              <Input
                id="agent-objective"
                placeholder={t('agents.objective_placeholder')}
                value={formObjective}
                onChange={(e) => setFormObjective(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agent-model">{t('agents.model')}</Label>
                <Select value={formModel} onValueChange={setFormModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-temperature">{t('agents.temperature')}</Label>
                <Input
                  id="agent-temperature"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={formTemperature}
                  onChange={(e) => setFormTemperature(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('agents.temperature_help')}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('agents.response_delay')}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="agent-delay-min" className="text-xs text-muted-foreground">{t('agents.minimum')}</Label>
                  <Input
                    id="agent-delay-min"
                    type="number"
                    min={0}
                    max={30}
                    step={1}
                    value={formDelayMin}
                    onChange={(e) => setFormDelayMin(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="agent-delay-max" className="text-xs text-muted-foreground">{t('agents.maximum')}</Label>
                  <Input
                    id="agent-delay-max"
                    type="number"
                    min={0}
                    max={30}
                    step={1}
                    value={formDelayMax}
                    onChange={(e) => setFormDelayMax(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('agents.delay_help')}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('agents.conversation_limits')}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="agent-max-messages" className="text-xs text-muted-foreground">
                    {t('agents.max_messages')}
                  </Label>
                  <Input
                    id="agent-max-messages"
                    type="number"
                    min={1}
                    max={10000}
                    step={1}
                    placeholder={t('common.unlimited')}
                    value={formMaxMessages}
                    onChange={(e) => setFormMaxMessages(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="agent-inactivity" className="text-xs text-muted-foreground">
                    {t('agents.inactivity_timeout')}
                  </Label>
                  <Input
                    id="agent-inactivity"
                    type="number"
                    min={1}
                    max={10080}
                    step={1}
                    placeholder={t('common.disabled')}
                    value={formInactivityTimeout}
                    onChange={(e) => setFormInactivityTimeout(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('agents.limits_help')}
              </p>
            </div>

            {/* Schedule Section */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {t('agents.schedule')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('agents.schedule_limit')}
                  </p>
                </div>
                <Switch
                  checked={formScheduleEnabled}
                  onCheckedChange={setFormScheduleEnabled}
                />
              </div>

              {formScheduleEnabled && (
                <div className="space-y-3 pl-1">
                  <div className="space-y-1">
                    <Label htmlFor="schedule-timezone" className="text-xs text-muted-foreground">
                      {t('agents.timezone')}
                    </Label>
                    <Select value={formScheduleTimezone} onValueChange={setFormScheduleTimezone}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Europe/Paris">Europe/Paris (CET)</SelectItem>
                        <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                        <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                        <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST)</SelectItem>
                        <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                        <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                        <SelectItem value="Africa/Casablanca">Africa/Casablanca (WET)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="schedule-start" className="text-xs text-muted-foreground">
                        {t('agents.start_hour')}
                      </Label>
                      <Input
                        id="schedule-start"
                        type="time"
                        value={formScheduleStartTime}
                        onChange={(e) => setFormScheduleStartTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="schedule-end" className="text-xs text-muted-foreground">
                        {t('agents.end_hour')}
                      </Label>
                      <Input
                        id="schedule-end"
                        type="time"
                        value={formScheduleEndTime}
                        onChange={(e) => setFormScheduleEndTime(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('agents.active_days')}</Label>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { day: 1, label: t('agents.day_mon') },
                        { day: 2, label: t('agents.day_tue') },
                        { day: 3, label: t('agents.day_wed') },
                        { day: 4, label: t('agents.day_thu') },
                        { day: 5, label: t('agents.day_fri') },
                        { day: 6, label: t('agents.day_sat') },
                        { day: 0, label: t('agents.day_sun') },
                      ].map(({ day, label }) => (
                        <Button
                          key={day}
                          type="button"
                          size="sm"
                          variant={formScheduleDays.includes(day) ? 'default' : 'outline'}
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setFormScheduleDays((prev) =>
                              prev.includes(day)
                                ? prev.filter((d) => d !== day)
                                : [...prev, day]
                            )
                          }}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Language Detection Section */}
            <div className="flex items-center justify-between border-t pt-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Languages className="h-4 w-4" />
                  {t('agents.lang_detection')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('agents.lang_detection_desc')}
                </p>
              </div>
              <Switch
                checked={formAutoDetectLanguage}
                onCheckedChange={setFormAutoDetectLanguage}
              />
            </div>

            {/* Lien de rendez-vous */}
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="booking-url" className="text-sm font-medium flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4" />
                {t('agents.booking_link')}
              </Label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="booking-url"
                  type="url"
                  placeholder={t('agents.booking_placeholder')}
                  value={formBookingUrl}
                  onChange={(e) => setFormBookingUrl(e.target.value)}
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('agents.booking_help')}
              </p>
            </div>

            {/* Escalation Section (Garde-fou) */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4" />
                    {t('agents.escalation')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('agents.escalation_desc')}
                  </p>
                </div>
                <Switch
                  checked={formEscalationEnabled}
                  onCheckedChange={setFormEscalationEnabled}
                />
              </div>

              {formEscalationEnabled && (
                <div className="space-y-3 pl-1">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t('agents.escalation_mode')}
                    </Label>
                    <Select value={formEscalationMode} onValueChange={(v) => setFormEscalationMode(v as 'keywords' | 'ai' | 'both')}>
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="keywords">{t('agents.escalation_mode_keywords')}</SelectItem>
                        <SelectItem value="ai">{t('agents.escalation_mode_ai')}</SelectItem>
                        <SelectItem value="both">{t('agents.escalation_mode_both')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(formEscalationMode === 'keywords' || formEscalationMode === 'both') && (
                  <div className="space-y-1">
                    <Label htmlFor="escalation-keywords" className="text-xs text-muted-foreground">
                      {t('agents.escalation_keywords')}
                    </Label>
                    <Textarea
                      id="escalation-keywords"
                      placeholder={t('agents.escalation_keywords_placeholder')}
                      value={formEscalationKeywords}
                      onChange={(e) => setFormEscalationKeywords(e.target.value)}
                      rows={3}
                      className="text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {t('agents.escalation_keywords_help')}
                    </p>
                  </div>
                  )}

                  <div className="space-y-1">
                    <Label htmlFor="escalation-message" className="text-xs text-muted-foreground">
                      {t('agents.escalation_message')}
                    </Label>
                    <Textarea
                      id="escalation-message"
                      placeholder={t('agents.escalation_message_placeholder')}
                      value={formEscalationMessage}
                      onChange={(e) => setFormEscalationMessage(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {t('agents.escalation_message_help')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Condition d'arrêt */}
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-orange-500" />
                {t('agents.stop_condition')}
              </div>
              <div className="space-y-2">
                <Textarea
                  id="stop-condition"
                  placeholder={t('agents.stop_condition_placeholder')}
                  value={formStopCondition}
                  onChange={(e) => setFormStopCondition(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('agents.stop_condition_help')}
                </p>
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || !formName.trim() || !formSystemPrompt.trim()}
              className="w-full"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Bot className="mr-2 h-4 w-4" />
              )}
              {editing ? t('common.save') : t('agents.create_agent')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setAgentToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title={t('agents.delete_title')}
        description={t('agents.delete_desc', { name: agentToDelete?.name || '' })}
        loading={deleting === agentToDelete?.id}
      />

      {/* Agent Creation Wizard */}
      <AgentWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onComplete={handleWizardComplete}
      />

      {/* Agent Test Chat */}
      {testingAgent && (
        <AgentTestChat
          open={testChatOpen}
          onOpenChange={(open) => {
            setTestChatOpen(open)
            if (!open) setTestingAgent(null)
          }}
          agentId={testingAgent.id}
          agentName={testingAgent.name}
        />
      )}

      {/* Agent Tools Dialog */}
      <Dialog open={toolsOpen} onOpenChange={(open) => {
        setToolsOpen(open)
        if (!open) setToolsAgent(null)
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              {t('tools.title')} — {toolsAgent?.name}
            </DialogTitle>
            <DialogDescription>{t('tools.dialog_desc')}</DialogDescription>
          </DialogHeader>
          {toolsAgent && (
            <AgentToolsManager agentId={toolsAgent.id} agentName={toolsAgent.name} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
