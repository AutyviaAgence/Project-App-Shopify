'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSubscription } from '@/hooks/use-subscription'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Loader2, ShieldAlert, Users, Zap, FileText, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanId } from '@/lib/stripe/plans'

type OnboardingConfig = {
  main_function: string
  behavior: string
  tools: string[]
  escalation: string
  languages: string[]
  agent_name: string
  welcome_message: string
  submitted_at: string | null
}

type ClientRow = {
  id: string
  email: string
  full_name: string | null
  subscription_status: string | null
  onboarding_status: string | null
  onboarding_plan: string | null
  plan: string | null
  tokens_used: number
  tokens_limit: number
  created_at: string
  onboarding_config: OnboardingConfig | null
}

const PLAN_LABELS: Record<string, string> = { starter: 'Starter', pro: 'Pro', scale: 'Scale' }

const MAIN_FUNCTION_LABELS: Record<string, string> = {
  sav: 'Service client / SAV',
  leads: 'Génération de leads',
  rdv: 'Prise de rendez-vous',
  devis: 'Devis et commandes',
}
const BEHAVIOR_LABELS: Record<string, string> = {
  direct: 'Répond directement',
  qualify_transfer: 'Qualifie puis transfère',
  qualify_silent: 'Qualifie en arrière-plan',
}
const ESCALATION_LABELS: Record<string, string> = {
  never: 'Jamais',
  qualified: 'Demandes qualifiées',
  on_demand: 'Sur demande',
  off_hours: 'Hors horaires',
}

function OnboardingStatusBadge({ status }: { status: string | null }) {
  if (!status || status === 'pending') return <Badge variant="secondary" className="bg-gray-100 text-gray-600">En attente</Badge>
  if (status === 'onboarding') return <Badge className="bg-blue-500">Audit</Badge>
  if (status === 'active') return <Badge className="bg-green-500">Actif</Badge>
  return <Badge variant="secondary">{status}</Badge>
}

function SubStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>
  if (status === 'active') return <Badge className="bg-green-500">Actif</Badge>
  if (status === 'trial') return <Badge className="bg-amber-500">Essai</Badge>
  if (status === 'expired') return <Badge className="bg-red-500">Expiré</Badge>
  if (status === 'cancelled') return <Badge variant="secondary">Annulé</Badge>
  return <Badge variant="secondary">{status}</Badge>
}

export default function AdminPage() {
  const router = useRouter()
  const { subscription, loading: subLoading } = useSubscription()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState<string | null>(null)
  const [selectedPlans, setSelectedPlans] = useState<Record<string, PlanId>>({})
  const [configModal, setConfigModal] = useState<OnboardingConfig | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/clients')
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setClients(data.clients || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!subLoading && subscription?.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [subLoading, subscription, router])

  useEffect(() => {
    if (subscription?.role === 'admin') fetchClients()
  }, [subscription, fetchClients])

  const handleActivate = async (userId: string) => {
    const plan = selectedPlans[userId] || 'scale'
    setActivating(userId)
    try {
      const res = await fetch('/api/admin/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Plan ${plan} activé`)
      fetchClients()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setActivating(null)
    }
  }

  const handleUpdateStatus = async (userId: string, field: 'onboarding_status' | 'subscription_status', value: string, plan?: string) => {
    setActivating(userId)
    try {
      const res = await fetch('/api/admin/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, [field]: value, plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Statut mis à jour')
      fetchClients()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setActivating(null)
    }
  }

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (subLoading || loading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (subscription?.role !== 'admin') {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center p-6">
        <div className="text-center space-y-4">
          <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="text-xl font-bold">Accès refusé</h2>
        </div>
      </div>
    )
  }

  const pending = clients.filter(c => !c.onboarding_status || c.onboarding_status === 'pending')
  const onboarding = clients.filter(c => c.onboarding_status === 'onboarding')
  const active = clients.filter(c => c.onboarding_status === 'active')

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Dashboard Admin</h1>
            <p className="text-sm text-muted-foreground">{clients.length} clients</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchClients}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{pending.length}</p>
          <p className="text-xs text-muted-foreground mt-1">En attente</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-blue-500">{onboarding.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Audit (acompte payé)</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-green-500">{active.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Actifs</p>
        </div>
      </div>

      {/* Table clients */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Client</th>
              <th className="px-4 py-3 text-left font-semibold">Onboarding</th>
              <th className="px-4 py-3 text-left font-semibold">Abonnement</th>
              <th className="px-4 py-3 text-left font-semibold">Plan</th>
              <th className="px-4 py-3 text-left font-semibold">Tokens</th>
              <th className="px-4 py-3 text-left font-semibold">Configurateur</th>
              <th className="px-4 py-3 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {clients.map(client => {
              const usagePct = client.tokens_limit > 0
                ? Math.round((client.tokens_used / client.tokens_limit) * 100)
                : 0
              const isExpanded = expandedRows.has(client.id)
              const hasConfig = !!client.onboarding_config?.submitted_at

              return (
                <>
                  <tr key={client.id} className="hover:bg-muted/20 transition-colors">
                    {/* Client */}
                    <td className="px-4 py-3">
                      <div className="font-medium">{client.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{client.email}</div>
                      <div className="text-xs text-muted-foreground">{new Date(client.created_at).toLocaleDateString('fr-FR')}</div>
                    </td>

                    {/* Onboarding status */}
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <OnboardingStatusBadge status={client.onboarding_status} />
                        <Select
                          value={client.onboarding_status || 'pending'}
                          onValueChange={v => handleUpdateStatus(client.id, 'onboarding_status', v)}
                          disabled={activating === client.id}
                        >
                          <SelectTrigger className="h-6 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">En attente</SelectItem>
                            <SelectItem value="onboarding">Audit</SelectItem>
                            <SelectItem value="active">Actif</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </td>

                    {/* Subscription status */}
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <SubStatusBadge status={client.subscription_status} />
                        <Select
                          value={client.subscription_status || 'expired'}
                          onValueChange={v => handleUpdateStatus(client.id, 'subscription_status', v, client.plan || 'scale')}
                          disabled={activating === client.id}
                        >
                          <SelectTrigger className="h-6 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Actif</SelectItem>
                            <SelectItem value="trial">Essai</SelectItem>
                            <SelectItem value="expired">Expiré</SelectItem>
                            <SelectItem value="cancelled">Annulé</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </td>

                    {/* Plan */}
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <span className="text-sm font-medium">{PLAN_LABELS[client.plan || ''] || '—'}</span>
                        <div className="flex items-center gap-1.5">
                          <Select
                            value={selectedPlans[client.id] || client.plan || 'scale'}
                            onValueChange={v => setSelectedPlans(prev => ({ ...prev, [client.id]: v as PlanId }))}
                          >
                            <SelectTrigger className="h-6 w-20 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="starter">Starter</SelectItem>
                              <SelectItem value="pro">Pro</SelectItem>
                              <SelectItem value="scale">Scale</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            disabled={activating === client.id}
                            onClick={() => handleActivate(client.id)}
                          >
                            {activating === client.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Activer'}
                          </Button>
                        </div>
                      </div>
                    </td>

                    {/* Tokens */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Zap className={cn('h-3.5 w-3.5 shrink-0', usagePct >= 90 ? 'text-red-500' : 'text-muted-foreground')} />
                        <span className="text-xs">
                          {client.tokens_used.toLocaleString()} / {client.tokens_limit.toLocaleString()}
                          <span className={cn('ml-1', usagePct >= 90 ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
                            ({usagePct}%)
                          </span>
                        </span>
                      </div>
                    </td>

                    {/* Configurateur */}
                    <td className="px-4 py-3">
                      {hasConfig ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => setConfigModal(client.onboarding_config)}
                        >
                          <FileText className="h-3.5 w-3.5 text-green-500" />
                          Voir
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Non soumis
                        </span>
                      )}
                    </td>

                    {/* Expand */}
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => toggleRow(client.id)}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </td>
                  </tr>

                  {/* Row étendue */}
                  {isExpanded && client.onboarding_config && (
                    <tr key={`${client.id}-expanded`} className="bg-muted/10">
                      <td colSpan={7} className="px-6 py-4">
                        <ConfigDetails config={client.onboarding_config} />
                      </td>
                    </tr>
                  )}
                  {isExpanded && !client.onboarding_config && (
                    <tr key={`${client.id}-expanded-empty`} className="bg-muted/10">
                      <td colSpan={7} className="px-6 py-4 text-sm text-muted-foreground">
                        Aucun configurateur soumis pour ce client.
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {clients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun client trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal configurateur */}
      <Dialog open={!!configModal} onOpenChange={() => setConfigModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurateur client</DialogTitle>
          </DialogHeader>
          {configModal && <ConfigDetails config={configModal} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ConfigDetails({ config }: { config: OnboardingConfig }) {
  const MAIN_FUNCTION_LABELS: Record<string, string> = {
    sav: 'Service client / SAV', leads: 'Génération de leads',
    rdv: 'Prise de rendez-vous', devis: 'Devis et commandes',
  }
  const BEHAVIOR_LABELS: Record<string, string> = {
    direct: 'Répond directement', qualify_transfer: 'Qualifie puis transfère',
    qualify_silent: 'Qualifie en arrière-plan',
  }
  const ESCALATION_LABELS: Record<string, string> = {
    never: 'Jamais', qualified: 'Demandes qualifiées',
    on_demand: 'Sur demande', off_hours: 'Hors horaires',
  }

  return (
    <div className="space-y-3 text-sm">
      {config.submitted_at && (
        <p className="text-xs text-muted-foreground">Soumis le {new Date(config.submitted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/50 p-3 space-y-0.5">
          <p className="text-xs text-muted-foreground font-medium">Fonction principale</p>
          <p className="font-medium">{MAIN_FUNCTION_LABELS[config.main_function] || config.main_function}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 space-y-0.5">
          <p className="text-xs text-muted-foreground font-medium">Comportement</p>
          <p className="font-medium">{BEHAVIOR_LABELS[config.behavior] || config.behavior}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 space-y-0.5">
          <p className="text-xs text-muted-foreground font-medium">Escalade</p>
          <p className="font-medium">{ESCALATION_LABELS[config.escalation] || config.escalation}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 space-y-0.5">
          <p className="text-xs text-muted-foreground font-medium">Nom de l&apos;agent</p>
          <p className="font-medium">{config.agent_name}</p>
        </div>
      </div>
      <div className="rounded-lg bg-muted/50 p-3 space-y-0.5">
        <p className="text-xs text-muted-foreground font-medium">Outils</p>
        <p className="font-medium">{config.tools.join(', ') || '—'}</p>
      </div>
      <div className="rounded-lg bg-muted/50 p-3 space-y-0.5">
        <p className="text-xs text-muted-foreground font-medium">Langues</p>
        <p className="font-medium">{config.languages.join(', ') || '—'}</p>
      </div>
      <div className="rounded-lg bg-muted/50 p-3 space-y-0.5">
        <p className="text-xs text-muted-foreground font-medium">Message d&apos;accueil</p>
        <p className="text-foreground italic">&ldquo;{config.welcome_message}&rdquo;</p>
      </div>
    </div>
  )
}
