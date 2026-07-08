'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSubscription } from '@/hooks/use-subscription'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  TrendingUp, AlertCircle, ExternalLink, CheckCircle, Ban, Calendar,
  Wifi, WifiOff, Gift, Tag as TagIcon, Trash2, Link2, Store as StoreIcon,
  ChevronLeft, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanId } from '@/lib/stripe/plans'
import { BlobLoaderScreen } from '@/components/blob-loader'
import { InstallLinkGenerator } from './_components/install-link-generator'

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
  audit_status: string | null
  onboarding_plan: string | null
  plan: string | null
  tokens_used: number
  tokens_limit: number
  role: string | null
  created_at: string
  tenant_name: string | null
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

type SessionRow = {
  id: string
  instance_name: string
  phone_number: string | null
  status: string
  integration_type: string
  user_id: string
  user_email?: string
  user_name?: string
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

function SubStatusBadge({ status }: { status: string | null }) {
  if (!status || status === 'none') return <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">Aucun</Badge>
  if (status === 'active') return <Badge className="bg-green-500">Actif</Badge>
  if (status === 'trialing') return <Badge className="bg-amber-500">Essai</Badge>
  if (status === 'past_due') return <Badge className="bg-red-500">Impayé</Badge>
  if (status === 'canceled') return <Badge variant="secondary">Annulé</Badge>
  return <Badge variant="secondary">{status}</Badge>
}

export default function AdminPage() {
  const router = useRouter()
  const { subscription, loading: subLoading } = useSubscription()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  // Filtres / tri / pagination de la liste clients.
  const [clientSearch, setClientSearch] = useState('')
  const [clientPlanFilter, setClientPlanFilter] = useState<string>('all')
  const [clientSort, setClientSort] = useState<'name_asc' | 'name_desc' | 'plan' | 'tokens_desc' | 'tokens_asc' | 'recent'>('recent')
  const [clientVisible, setClientVisible] = useState(30)
  const [activating, setActivating] = useState<string | null>(null)
  const [selectedPlans, setSelectedPlans] = useState<Record<string, PlanId | 'none'>>({})
  const [configModal, setConfigModal] = useState<{ config: OnboardingConfig; userId: string } | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [validating, setValidating] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [activeTab, setActiveTab] = useState<'clients' | 'billing' | 'sessions' | 'affiliate' | 'promo' | 'install'>('clients')
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
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

  const handleActivate = async (userId: string, currentClientPlan?: string | null) => {
    const selectedPlan = selectedPlans[userId] ?? currentClientPlan ?? 'none'
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

  const handleUpdateStatus = async (userId: string, field: 'audit_status' | 'subscription_status', value: string, plan?: string) => {
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

  const handleSetObserver = async (userId: string) => {
    setActivating(userId)
    try {
      const res = await fetch('/api/admin/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, subscription_status: 'trialing', plan: null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Mode observateur activé')
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

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const res = await fetch('/api/admin/sessions')
      if (!res.ok) return
      const data = await res.json()
      setSessions(data.sessions || [])
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (subscription?.role === 'admin' && activeTab === 'sessions' && sessions.length === 0) {
      fetchSessions()
    }
  }, [activeTab, subscription, sessions.length, fetchSessions])

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (subLoading || loading) {
    return (
      <BlobLoaderScreen />
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

  const noAudit = clients.filter(c => !c.audit_status || c.audit_status === 'none')
  const auditInProgress = clients.filter(c => c.audit_status === 'acompte_paid')
  const auditDone = clients.filter(c => c.audit_status === 'solde_paid')
  const refunded = clients.filter(c => c.audit_status === 'refunded')
  const activeSubscriptions = clients.filter(c => c.subscription_status === 'active' || c.subscription_status === 'trialing')

  // Liste des plans présents (pour le filtre déroulant).
  const availablePlans = Array.from(new Set(clients.map(c => c.plan).filter(Boolean))) as string[]

  // Filtrage (recherche + plan) puis tri.
  const filteredClients = clients
    .filter(c => {
      if (clientPlanFilter !== 'all' && (c.plan ?? '') !== clientPlanFilter) return false
      const q = clientSearch.trim().toLowerCase()
      if (!q) return true
      return (c.full_name ?? '').toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.tenant_name ?? '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      switch (clientSort) {
        case 'name_asc': return (a.full_name || a.email).localeCompare(b.full_name || b.email, 'fr')
        case 'name_desc': return (b.full_name || b.email).localeCompare(a.full_name || a.email, 'fr')
        case 'plan': return (a.plan ?? '').localeCompare(b.plan ?? '', 'fr')
        case 'tokens_desc': return b.tokens_used - a.tokens_used
        case 'tokens_asc': return a.tokens_used - b.tokens_used
        case 'recent':
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })

  const visibleClients = filteredClients.slice(0, clientVisible)
  const hasMoreClients = filteredClients.length > clientVisible

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
        <button
          onClick={() => setActiveTab('sessions')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'sessions'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Wifi className="h-4 w-4" />
          Sessions
        </button>
        <button
          onClick={() => setActiveTab('affiliate')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'affiliate'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Gift className="h-4 w-4" />
          Affiliation
        </button>
        <button
          onClick={() => setActiveTab('promo')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'promo'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <TagIcon className="h-4 w-4" />
          Codes promo
        </button>
        <button
          onClick={() => setActiveTab('install')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'install'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <StoreIcon className="h-4 w-4" />
          Lien install
        </button>
      </div>

      {activeTab === 'install' && <InstallLinkGenerator />}

      {activeTab === 'billing' && (
        <BillingTab billing={billing} loading={billingLoading} onRefresh={fetchBilling} />
      )}

      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{sessions.length} sessions au total</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchSessions} disabled={sessionsLoading}>
                <RefreshCw className={cn('h-4 w-4 mr-2', sessionsLoading && 'animate-spin')} />
                Actualiser
              </Button>
            </div>
          </div>

          {sessionsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Client</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Téléphone</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Statut DB</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Instance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sessions.map(s => (
                      <tr key={s.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <p className="font-medium text-xs">{s.user_name || '—'}</p>
                          <p className="text-xs text-muted-foreground">{s.user_email}</p>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">+{s.phone_number}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs">{s.integration_type}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {s.status === 'connected' && <Badge className="bg-green-500 text-xs gap-1"><Wifi className="h-3 w-3" />Connecté</Badge>}
                          {s.status === 'disconnected' && <Badge variant="secondary" className="text-xs gap-1"><WifiOff className="h-3 w-3" />Déconnecté</Badge>}
                          {s.status === 'qr_pending' && <Badge className="bg-amber-500 text-xs">QR en attente</Badge>}
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs text-muted-foreground">{s.instance_name.slice(0, 20)}…</code>
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'affiliate' && <AffiliateTab />}
      {activeTab === 'promo' && <PromoTab />}

      {activeTab === 'clients' && <>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-green-500">{activeSubscriptions.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Abonnés actifs</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-gray-500">{noAudit.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Sans audit</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-blue-500">{auditInProgress.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Audit en cours</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-purple-500">{auditDone.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Audit livré</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{refunded.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Remboursés</p>
        </div>
      </div>

      {/* Filtres + tri */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Input
            value={clientSearch}
            onChange={e => { setClientSearch(e.target.value); setClientVisible(30) }}
            placeholder="Rechercher (nom, email, site)…"
            className="h-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={clientPlanFilter} onValueChange={v => { setClientPlanFilter(v); setClientVisible(30) }}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="Plan" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les plans</SelectItem>
              {availablePlans.map(p => (
                <SelectItem key={p} value={p}><span className="capitalize">{p}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={clientSort} onValueChange={v => setClientSort(v as typeof clientSort)}>
            <SelectTrigger className="h-9 w-52 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Plus récents</SelectItem>
              <SelectItem value="name_asc">Nom (A → Z)</SelectItem>
              <SelectItem value="name_desc">Nom (Z → A)</SelectItem>
              <SelectItem value="plan">Par abonnement (plan)</SelectItem>
              <SelectItem value="tokens_desc">Tokens (plus consommé)</SelectItem>
              <SelectItem value="tokens_asc">Tokens (moins consommé)</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filteredClients.length} client{filteredClients.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Table clients */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Client</th>
              <th className="px-4 py-3 text-left font-semibold">Site</th>
              <th className="px-4 py-3 text-left font-semibold">Abonnement</th>
              <th className="px-4 py-3 text-left font-semibold">Plan</th>
              <th className="px-4 py-3 text-left font-semibold">Tokens</th>
              <th className="px-4 py-3 text-left font-semibold">Rôle</th>
              <th className="px-4 py-3 text-left font-semibold">Configurateur</th>
              <th className="px-4 py-3 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleClients.map(client => {
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

                    {/* Tenant / Site */}
                    <td className="px-4 py-3">
                      {client.tenant_name ? (
                        <Badge variant="outline" className="text-xs">{client.tenant_name}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Subscription status */}
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <SubStatusBadge status={client.subscription_status} />
                        <Select
                          value={client.subscription_status || 'none'}
                          onValueChange={v => handleUpdateStatus(client.id, 'subscription_status', v, client.plan || 'scale')}
                          disabled={activating === client.id}
                        >
                          <SelectTrigger className="h-6 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Aucun</SelectItem>
                            <SelectItem value="trialing">Essai</SelectItem>
                            <SelectItem value="active">Actif</SelectItem>
                            <SelectItem value="past_due">Impayé</SelectItem>
                            <SelectItem value="canceled">Annulé</SelectItem>
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
                            onClick={() => handleActivate(client.id, client.plan)}
                          >
                            {activating === client.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Activer'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-amber-600 hover:text-amber-700"
                            disabled={activating === client.id}
                            onClick={() => handleSetObserver(client.id)}
                            title="Passer en mode observateur (lecture seule)"
                          >
                            👁
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
                      <td colSpan={7} className="px-6 py-4 text-sm text-muted-foreground">
                        Aucun configurateur soumis pour ce client.
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {visibleClients.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun client trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination : « Afficher plus » (pas de liste infinie) */}
      {hasMoreClients && (
        <div className="flex justify-center">
          <button
            onClick={() => setClientVisible(c => c + 30)}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Afficher plus ({filteredClients.length - clientVisible} restant{filteredClients.length - clientVisible > 1 ? 's' : ''})
          </button>
        </div>
      )}

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
    <BillingContent
      billing={billing}
      now={now}
      activeSubscriptions={activeSubscriptions}
      cancelledSubscriptions={cancelledSubscriptions}
      totalMonthly={totalMonthly}
      fmt={fmt}
      fmtAmount={fmtAmount}
    />
  )
}

// ─── Billing content (vue par mois, onglets, pagination) ─────────────────────
const BILLING_PAGE_SIZE = 30

function BillingContent({
  billing, now, activeSubscriptions, cancelledSubscriptions, totalMonthly, fmt, fmtAmount,
}: {
  billing: { subscriptions: BillingSubscription[]; invoices: BillingInvoice[] }
  now: Date
  activeSubscriptions: BillingSubscription[]
  cancelledSubscriptions: BillingSubscription[]
  totalMonthly: number
  fmt: (iso: string | null) => string
  fmtAmount: (amount: number | null, currency: string) => string
}) {
  // Vue affichée séparément : renouvellements OU historique.
  const [view, setView] = useState<'renewals' | 'history'>('renewals')
  // Décalage de mois : 0 = mois courant, -1 = mois précédent, etc.
  const [monthOffset, setMonthOffset] = useState(0)
  // Pagination : on n'affiche que N lignes, « Afficher plus » ajoute une page.
  const [visibleCount, setVisibleCount] = useState(BILLING_PAGE_SIZE)

  // Reset de la pagination dès qu'on change de vue ou de mois.
  useEffect(() => { setVisibleCount(BILLING_PAGE_SIZE) }, [view, monthOffset])

  // Bornes [début, fin[ du mois sélectionné.
  const { monthStart, monthEnd, monthLabel } = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 1)
    return {
      monthStart: start,
      monthEnd: end,
      monthLabel: start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
    }
  }, [now, monthOffset])

  const inMonth = (iso: string | null) => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return t >= monthStart.getTime() && t < monthEnd.getTime()
  }

  // Renouvellements du mois : prochain prélèvement dans le mois sélectionné.
  const renewalsOfMonth = useMemo(() =>
    activeSubscriptions
      .filter(s => inMonth(s.current_period_end))
      .sort((a, b) => new Date(a.current_period_end ?? '').getTime() - new Date(b.current_period_end ?? '').getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSubscriptions, monthStart, monthEnd])

  // Paiements du mois (les plus récents d'abord).
  const invoicesOfMonth = useMemo(() =>
    billing.invoices
      .filter(inv => inMonth(inv.created))
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [billing.invoices, monthStart, monthEnd])

  const rows = view === 'renewals' ? renewalsOfMonth : invoicesOfMonth
  const visibleRows = rows.slice(0, visibleCount)
  const hasMore = rows.length > visibleCount
  // On ne va pas dans le futur : le mois courant (offset 0) est la borne droite.
  const canGoNext = monthOffset < 0

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

      {/* Onglets (séparés) + navigation par mois */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border p-1">
          <button
            onClick={() => setView('renewals')}
            className={cn('flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              view === 'renewals' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            <Calendar className="h-4 w-4" /> Prochains renouvellements
          </button>
          <button
            onClick={() => setView('history')}
            className={cn('flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              view === 'history' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            <TrendingUp className="h-4 w-4" /> Historique des paiements
          </button>
        </div>
        {/* Navigation mois précédent / suivant */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthOffset(o => o - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:text-foreground"
            title="Mois précédent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[9rem] text-center text-sm font-medium capitalize">{monthLabel}</span>
          <button
            onClick={() => setMonthOffset(o => Math.min(0, o + 1))}
            disabled={!canGoNext}
            className="flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            title="Mois suivant"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Prochains renouvellements (du mois sélectionné) */}
      {view === 'renewals' && (
        <div>
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
                {(visibleRows as BillingSubscription[]).map(s => {
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
                {renewalsOfMonth.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Aucun renouvellement en {monthLabel}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historique des paiements (du mois sélectionné) */}
      {view === 'history' && (
        <div>
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
                {(visibleRows as BillingInvoice[]).map(inv => (
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
                {invoicesOfMonth.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Aucun paiement en {monthLabel}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination : « Afficher plus » (pas de scroll infini) */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisibleCount(c => c + BILLING_PAGE_SIZE)}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Afficher plus ({rows.length - visibleCount} restant{rows.length - visibleCount > 1 ? 's' : ''})
          </button>
        </div>
      )}

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

// ─── Affiliate Tab ─────────────────────────────────────────────────────────────

function AffiliateTab() {
  const [codes, setCodes] = useState<any[]>([])
  const [conversions, setConversions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ label: '', code: '', commission_percent: '30' })
  const [creating, setCreating] = useState(false)
  const [paying, setPaying] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [codesRes, convRes] = await Promise.all([
      fetch('/api/admin/affiliate-codes').then(r => r.json()),
      fetch('/api/admin/affiliate-conversions').then(r => r.json()),
    ])
    setCodes(Array.isArray(codesRes) ? codesRes : [])
    setConversions(Array.isArray(convRes) ? convRes : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleCreate = async () => {
    if (!form.label || !form.code) return toast.error('Remplissez tous les champs')
    setCreating(true)
    try {
      const res = await fetch('/api/admin/affiliate-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Code affilié créé')
      setForm({ label: '', code: '', commission_percent: '30' })
      fetchAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setCreating(false)
    }
  }

  const handleMarkPaid = async (id: string, method: 'transfer' | 'credit') => {
    setPaying(id)
    try {
      const res = await fetch('/api/admin/affiliate-conversions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, payout_method: method }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Commission marquée comme payée')
      fetchAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setPaying(null)
    }
  }

  const handleDeleteCode = async (id: string) => {
    if (!confirm('Supprimer ce code affilié ? Cette action est irréversible.')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/affiliate-codes?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Code affilié supprimé')
      fetchAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setDeleting(null)
    }
  }

  const handleCopyLink = (code: string, id: string) => {
    const link = `${window.location.origin}/r/${code}`
    navigator.clipboard.writeText(link)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  const pending = conversions.filter((c: any) => c.status === 'pending')

  return (
    <div className="space-y-8">
      <div className="rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Gift className="h-5 w-5 text-primary" />Créer un code affilié</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Nom / label (ex: Jean Dupont)"
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="text"
            placeholder="Code (ex: PARTNER30)"
            value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            className="border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Commission %"
              value={form.commission_percent}
              onChange={e => setForm(f => ({ ...f, commission_percent: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button onClick={handleCreate} disabled={creating} size="sm">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer'}
            </Button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Codes actifs ({codes.length})</h2>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Affilié</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Commission</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Statut</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Lien</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {codes.map((code: any) => (
                <tr key={code.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{code.label || '—'}</p>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold">{code.code}</td>
                  <td className="px-4 py-3">{code.commission_percent}%</td>
                  <td className="px-4 py-3">
                    {code.is_active
                      ? <Badge className="bg-green-500 text-white">Actif</Badge>
                      : <Badge variant="secondary">Inactif</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleCopyLink(code.code, code.id)}
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                      title={`${window?.location?.origin}/r/${code.code}`}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      {copiedId === code.id ? 'Copié !' : `/r/${code.code}`}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={deleting === code.id}
                      onClick={() => handleDeleteCode(code.id)}
                      title="Supprimer ce code"
                    >
                      {deleting === code.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </td>
                </tr>
              ))}
              {codes.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Aucun code affilié</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-500" />
          Commissions en attente ({pending.length})
        </h2>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Affilié</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Client converti</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Montant</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Commission</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pending.map((conv: any) => (
                <tr key={conv.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{conv.affiliate_codes?.label || conv.affiliate_codes?.code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{conv.converted_profile?.full_name || conv.converted_profile?.email}</p>
                    <p className="text-xs text-muted-foreground">{conv.converted_profile?.email}</p>
                  </td>
                  <td className="px-4 py-3 font-mono">{conv.affiliate_codes?.code}</td>
                  <td className="px-4 py-3">{((conv.amount_paid_cents || 0) / 100).toFixed(2)} €</td>
                  <td className="px-4 py-3 font-semibold text-primary">{((conv.commission_cents || 0) / 100).toFixed(2)} €</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={!!paying} onClick={() => handleMarkPaid(conv.id, 'transfer')}>
                        {paying === conv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Virement'}
                      </Button>
                      <Button size="sm" variant="outline" disabled={!!paying} onClick={() => handleMarkPaid(conv.id, 'credit')}>
                        Crédit plateforme
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Aucune commission en attente</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Promo Tab ─────────────────────────────────────────────────────────────────

function PromoTab() {
  const [codes, setCodes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ code: '', discount_percent: '10', max_redemptions: '', applies_to: 'both' })
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchCodes = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/promo-codes').then(r => r.json())
    setCodes(Array.isArray(res) ? res : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchCodes() }, [fetchCodes])

  const handleCreate = async () => {
    if (!form.code || !form.discount_percent) return toast.error('Code et remise requis')
    setCreating(true)
    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Code promo créé dans Stripe')
      setForm({ code: '', discount_percent: '10', max_redemptions: '', applies_to: 'both' })
      fetchCodes()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/promo-codes/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Code promo désactivé')
      fetchCodes()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-8">
      <div className="rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><TagIcon className="h-5 w-5 text-primary" />Créer un code promo Stripe</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Code (ex: LAUNCH30)"
            value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            className="border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="number"
            placeholder="Remise %"
            value={form.discount_percent}
            onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="number"
            placeholder="Max utilisations (optionnel)"
            value={form.max_redemptions}
            onChange={e => setForm(f => ({ ...f, max_redemptions: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-2">
            <select
              value={form.applies_to}
              onChange={e => setForm(f => ({ ...f, applies_to: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white dark:bg-slate-900"
            >
              <option value="both">Abonnement + Audit</option>
              <option value="subscription">Abonnement seul</option>
              <option value="audit">Audit seul</option>
            </select>
            <Button onClick={handleCreate} disabled={creating} size="sm">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer'}
            </Button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Codes promo ({codes.length})</h2>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Remise</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Applicable à</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Max util.</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Statut</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {codes.map((code: any) => (
                <tr key={code.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono font-semibold">{code.code}</td>
                  <td className="px-4 py-3 text-primary font-medium">-{code.discount_percent}%</td>
                  <td className="px-4 py-3">{code.applies_to === 'both' ? 'Abonnement + Audit' : code.applies_to === 'subscription' ? 'Abonnement' : 'Audit'}</td>
                  <td className="px-4 py-3">{code.max_redemptions ?? '∞'}</td>
                  <td className="px-4 py-3">
                    {code.is_active
                      ? <Badge className="bg-green-500 text-white">Actif</Badge>
                      : <Badge variant="secondary">Inactif</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {code.is_active && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={deleting === code.id}
                        onClick={() => handleDelete(code.id)}
                      >
                        {deleting === code.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {codes.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Aucun code promo</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
