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
  CheckCircle2, XCircle, Clock, RefreshCw, ShieldCheck, CreditCard,
  TrendingUp, AlertCircle, ExternalLink, CheckCircle, Ban, Calendar
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanId } from '@/lib/stripe/plans'

type OnboardingConfig = {
  main_function: string
  behavior: string
  tools: string[]
  escalation: string
  languages: string[]
  conversation_example: string
  info_to_collect: string
  cgv_accepted_at: string | null
  submitted_at: string | null
  admin_validated_at: string | null
  admin_validated_by: string | null
  admin_notes: string | null
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
  role: string | null
  created_at: string
  onboarding_config: OnboardingConfig | null
}

const PLAN_LABELS: Record<string, string> = { starter: 'Starter', pro: 'Pro', scale: 'Scale' }

type BillingSubscription = {
  user_id: string
  email: string
  full_name: string | null
  plan: string | null
  db_status: string | null
  stripe_status: string
  stripe_subscription_id: string
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  amount: number | null
  currency: string
}

type BillingInvoice = {
  id: string
  user_id: string | null
  email: string
  full_name: string | null
  plan: string | null
  amount: number
  currency: string
  status: string | null
  created: string
  period_start: string | null
  period_end: string | null
  invoice_url: string | null
  description: string | null
}

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
  if (!status) return <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">Aucun abonnement</Badge>
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
  const [selectedPlans, setSelectedPlans] = useState<Record<string, PlanId | 'none'>>({})
  const [configModal, setConfigModal] = useState<{ config: OnboardingConfig; userId: string } | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [validating, setValidating] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [activeTab, setActiveTab] = useState<'clients' | 'billing'>('clients')
  const [billing, setBilling] = useState<{ subscriptions: BillingSubscription[]; invoices: BillingInvoice[] } | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/clients')
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setClients(data.clients || [])
    setLoading(false)
  }, [])

  const fetchBilling = useCallback(async () => {
    setBillingLoading(true)
    try {
      const res = await fetch('/api/admin/billing')
      if (!res.ok) return
      const data = await res.json()
      setBilling(data.data)
    } finally {
      setBillingLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!subLoading && subscription?.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [subLoading, subscription, router])

  useEffect(() => {
    if (subscription?.role === 'admin') fetchClients()
  }, [subscription, fetchClients])

  useEffect(() => {
    if (subscription?.role === 'admin' && activeTab === 'billing' && !billing) {
      fetchBilling()
    }
  }, [activeTab, subscription, billing, fetchBilling])

  const handleActivate = async (userId: string) => {
    const selectedPlan = selectedPlans[userId] || 'scale'
    const plan = selectedPlan === 'none' ? null : selectedPlan
    setActivating(userId)
    try {
      const res = await fetch('/api/admin/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(plan ? `Plan ${plan} activé` : 'Plan réinitialisé')
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

  const handleUpdateRole = async (userId: string, role: string) => {
    setActivating(userId)
    try {
      const res = await fetch('/api/admin/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Rôle changé en ${role}`)
      fetchClients()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setActivating(null)
    }
  }

  const handleValidateConfig = async () => {
    if (!configModal) return
    setValidating(true)
    try {
      const res = await fetch('/api/admin/validate-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: configModal.userId, notes: adminNotes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Configurateur validé et horodaté')
      setConfigModal(null)
      setAdminNotes('')
      fetchClients()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setValidating(false)
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
        <Button variant="outline" size="sm" onClick={activeTab === 'billing' ? fetchBilling : fetchClients}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('clients')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'clients'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Users className="h-4 w-4" />
          Clients
        </button>
        <button
          onClick={() => setActiveTab('billing')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'billing'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <CreditCard className="h-4 w-4" />
          Paiements
        </button>
      </div>

      {activeTab === 'billing' && (
        <BillingTab billing={billing} loading={billingLoading} onRefresh={fetchBilling} />
      )}

      {activeTab === 'clients' && <>

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
              <th className="px-4 py-3 text-left font-semibold">Rôle</th>
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
              const hasConfig = !!client.onboarding_config

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
                            value={selectedPlans[client.id] || client.plan || 'none'}
                            onValueChange={v => setSelectedPlans(prev => ({ ...prev, [client.id]: v as PlanId | 'none' }))}
                          >
                            <SelectTrigger className="h-6 w-20 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Aucun —</SelectItem>
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

                    {/* Rôle */}
                    <td className="px-4 py-3">
                      <Select
                        value={client.role || 'user'}
                        onValueChange={v => handleUpdateRole(client.id, v)}
                        disabled={activating === client.id}
                      >
                        <SelectTrigger className="h-6 w-20 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>

                    {/* Configurateur */}
                    <td className="px-4 py-3">
                      {hasConfig ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => {
                            setAdminNotes(client.onboarding_config?.admin_notes || '')
                            setConfigModal({ config: client.onboarding_config!, userId: client.id })
                          }}
                        >
                          {client.onboarding_config?.admin_validated_at
                            ? <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                            : <FileText className="h-3.5 w-3.5 text-amber-500" />}
                          {client.onboarding_config?.admin_validated_at ? 'Validé' : 'À valider'}
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
                      <td colSpan={8} className="px-6 py-4">
                        <ConfigDetails config={client.onboarding_config} />
                      </td>
                    </tr>
                  )}
                  {isExpanded && !client.onboarding_config && (
                    <tr key={`${client.id}-expanded-empty`} className="bg-muted/10">
                      <td colSpan={8} className="px-6 py-4 text-sm text-muted-foreground">
                        Aucun configurateur soumis pour ce client.
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {clients.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun client trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal configurateur */}
      <Dialog open={!!configModal} onOpenChange={() => { setConfigModal(null); setAdminNotes('') }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Configurateur client
              {configModal?.config.admin_validated_at && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                  <ShieldCheck className="h-3 w-3" />
                  Validé le {new Date(configModal.config.admin_validated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {configModal && (
            <div className="space-y-4">
              <ConfigDetails config={configModal.config} />

              {/* Notes admin */}
              <div className="space-y-1.5 pt-2 border-t">
                <label className="text-xs font-medium text-muted-foreground">Notes internes (admin)</label>
                <textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  rows={3}
                  placeholder="Observations, points à configurer, remarques…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              {/* Bouton valider */}
              {!configModal.config.admin_validated_at ? (
                <Button
                  className="w-full gap-2"
                  onClick={handleValidateConfig}
                  disabled={validating}
                >
                  {validating
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <ShieldCheck className="h-4 w-4" />}
                  Valider et horodater ce configurateur
                </Button>
              ) : (
                <div className="space-y-2">
                  {configModal.config.admin_notes && (
                    <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Notes : </span>
                      {configModal.config.admin_notes}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    className="w-full gap-2 text-xs"
                    onClick={handleValidateConfig}
                    disabled={validating}
                  >
                    {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    Mettre à jour les notes
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      </> /* end activeTab === 'clients' */}
    </div>
  )
}

// ─── Billing Tab ──────────────────────────────────────────────────────────────

function BillingTab({
  billing,
  loading,
  onRefresh,
}: {
  billing: { subscriptions: BillingSubscription[]; invoices: BillingInvoice[] } | null
  loading: boolean
  onRefresh: () => void
}) {
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const fmtAmount = (amount: number | null, currency: string) =>
    amount !== null ? `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}` : '—'

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )

  if (!billing) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
      <AlertCircle className="h-8 w-8" />
      <p>Impossible de charger les données Stripe.</p>
      <button onClick={onRefresh} className="text-sm text-primary underline">Réessayer</button>
    </div>
  )

  const now = new Date()

  // Abonnements avec prochain prélèvement
  const activeSubscriptions = billing.subscriptions.filter(s => s.stripe_status === 'active' || s.stripe_status === 'trialing')
  const cancelledSubscriptions = billing.subscriptions.filter(s => s.stripe_status === 'canceled' || s.cancel_at_period_end)
  const totalMonthly = activeSubscriptions.reduce((acc, s) => acc + (s.amount ?? 0), 0)

  return (
    <div className="space-y-8">

      {/* KPIs billing */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-green-500">{activeSubscriptions.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Abonnements actifs</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-primary">{(totalMonthly / 100).toFixed(0)} €</p>
          <p className="text-xs text-muted-foreground mt-1">MRR estimé</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-orange-500">{cancelledSubscriptions.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Annulés / en cours</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-blue-500">{billing.invoices.filter(i => i.status === 'paid').length}</p>
          <p className="text-xs text-muted-foreground mt-1">Factures payées</p>
        </div>
      </div>

      {/* Abonnements actifs — prochains prélèvements */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-green-500" />
          Prochains renouvellements
        </h2>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Client</th>
                <th className="px-4 py-3 text-left font-semibold">Plan</th>
                <th className="px-4 py-3 text-left font-semibold">Montant</th>
                <th className="px-4 py-3 text-left font-semibold">Prochain prélèvement</th>
                <th className="px-4 py-3 text-left font-semibold">Statut Stripe</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {activeSubscriptions
                .sort((a, b) => new Date(a.current_period_end ?? '').getTime() - new Date(b.current_period_end ?? '').getTime())
                .map(s => {
                  const daysLeft = s.current_period_end
                    ? Math.ceil((new Date(s.current_period_end).getTime() - now.getTime()) / 86400000)
                    : null
                  return (
                    <tr key={s.stripe_subscription_id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-medium">{s.full_name || s.email}</p>
                        <p className="text-xs text-muted-foreground">{s.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="capitalize font-medium">{s.plan ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-green-600">
                        {fmtAmount(s.amount, s.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <p>{fmt(s.current_period_end)}</p>
                        {daysLeft !== null && (
                          <p className={cn('text-xs', daysLeft <= 3 ? 'text-orange-500 font-medium' : 'text-muted-foreground')}>
                            dans {daysLeft}j
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {s.cancel_at_period_end ? (
                          <span className="inline-flex items-center gap-1 text-xs text-orange-600 font-medium">
                            <Ban className="h-3 w-3" /> Annulation fin de période
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle className="h-3 w-3" /> Actif
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              {activeSubscriptions.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Aucun abonnement actif.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Abonnements annulés */}
      {billing.subscriptions.filter(s => s.stripe_status === 'canceled' && !s.cancel_at_period_end).length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Abonnements résiliés
          </h2>
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Client</th>
                  <th className="px-4 py-3 text-left font-semibold">Plan</th>
                  <th className="px-4 py-3 text-left font-semibold">Fin de période</th>
                  <th className="px-4 py-3 text-left font-semibold">Statut DB</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {billing.subscriptions
                  .filter(s => s.stripe_status === 'canceled' && !s.cancel_at_period_end)
                  .map(s => (
                    <tr key={s.stripe_subscription_id} className="hover:bg-muted/20 opacity-75">
                      <td className="px-4 py-3">
                        <p className="font-medium">{s.full_name || s.email}</p>
                        <p className="text-xs text-muted-foreground">{s.email}</p>
                      </td>
                      <td className="px-4 py-3 capitalize">{s.plan ?? '—'}</td>
                      <td className="px-4 py-3">{fmt(s.current_period_end)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-red-500 font-medium">{s.db_status ?? 'cancelled'}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historique des paiements */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-500" />
          Historique des paiements
        </h2>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Client</th>
                <th className="px-4 py-3 text-left font-semibold">Plan</th>
                <th className="px-4 py-3 text-left font-semibold">Montant</th>
                <th className="px-4 py-3 text-left font-semibold">Statut</th>
                <th className="px-4 py-3 text-left font-semibold">Facture</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {billing.invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 text-muted-foreground">{fmt(inv.created)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{inv.full_name || inv.email}</p>
                    <p className="text-xs text-muted-foreground">{inv.email}</p>
                  </td>
                  <td className="px-4 py-3 capitalize">{inv.plan ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold">{fmtAmount(inv.amount, inv.currency)}</td>
                  <td className="px-4 py-3">
                    {inv.status === 'paid' && <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle className="h-3 w-3" /> Payé</span>}
                    {inv.status === 'open' && <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium"><Clock className="h-3 w-3" /> En attente</span>}
                    {inv.status === 'void' && <span className="text-xs text-muted-foreground">Annulé</span>}
                    {inv.status === 'uncollectible' && <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium"><XCircle className="h-3 w-3" /> Impayé</span>}
                  </td>
                  <td className="px-4 py-3">
                    {inv.invoice_url && (
                      <a href={inv.invoice_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> Voir
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {billing.invoices.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Aucun paiement trouvé.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {config.submitted_at && (
          <span>Soumis le {new Date(config.submitted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        )}
        {config.cgv_accepted_at && (
          <span className="flex items-center gap-1 text-green-600">
            <ShieldCheck className="h-3 w-3" />
            CGV acceptées le {new Date(config.cgv_accepted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
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
          <p className="text-xs text-muted-foreground font-medium">Langues</p>
          <p className="font-medium">{config.languages.join(', ') || '—'}</p>
        </div>
      </div>
      <div className="rounded-lg bg-muted/50 p-3 space-y-0.5">
        <p className="text-xs text-muted-foreground font-medium">Outils</p>
        <p className="font-medium">{config.tools.join(', ') || '—'}</p>
      </div>
      <div className="rounded-lg bg-muted/50 p-3 space-y-1">
        <p className="text-xs text-muted-foreground font-medium">Exemple de conversation</p>
        <pre className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">{config.conversation_example || '—'}</pre>
      </div>
      <div className="rounded-lg bg-muted/50 p-3 space-y-1">
        <p className="text-xs text-muted-foreground font-medium">Informations à récolter</p>
        <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{config.info_to_collect || '—'}</pre>
      </div>
    </div>
  )
}
