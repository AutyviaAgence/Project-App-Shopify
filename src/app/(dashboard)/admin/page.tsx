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
  TrendingUp, AlertCircle, ExternalLink, CheckCircle, Ban, Calendar,
  Wifi, WifiOff, AlertTriangle, Terminal
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
  audit_status: string | null
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

type SessionRow = {
  id: string
  instance_name: string
  phone_number: string | null
  status: string
  integration_type: string
  user_id: string
  user_email?: string
  user_name?: string
  evolution_state?: string
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

const AUDIT_OPTIONS: { value: string; label: string; description: string; color: string }[] = [
  { value: 'none',         label: 'Sans audit',    description: 'Pas d\'audit en cours',                          color: 'bg-gray-100 text-gray-700' },
  { value: 'acompte_paid', label: 'Audit en cours', description: 'Acompte 750€ payé — audit en cours',            color: 'bg-blue-500 text-white' },
  { value: 'solde_paid',   label: 'Audit livré',    description: 'Solde 750€ payé — audit terminé et livré',      color: 'bg-green-500 text-white' },
  { value: 'refunded',     label: 'Remboursé',      description: 'Audit remboursé selon conditions des CGU',       color: 'bg-red-500 text-white' },
]

function AuditStatusBadge({ status }: { status: string | null }) {
  const opt = AUDIT_OPTIONS.find(o => o.value === (status || 'none'))
  if (!opt) return <Badge variant="secondary">{status}</Badge>
  return <Badge className={opt.color}>{opt.label}</Badge>
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
  const [activating, setActivating] = useState<string | null>(null)
  const [selectedPlans, setSelectedPlans] = useState<Record<string, PlanId | 'none'>>({})
  const [configModal, setConfigModal] = useState<{ config: OnboardingConfig; userId: string } | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [validating, setValidating] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [activeTab, setActiveTab] = useState<'clients' | 'billing' | 'sessions'>('clients')
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [checkingZombies, setCheckingZombies] = useState(false)
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

  const checkZombies = async () => {
    setCheckingZombies(true)
    try {
      const res = await fetch(`/api/cron/check-sessions?secret=${process.env.NEXT_PUBLIC_CRON_SECRET || ''}`, )
      const data = await res.json()
      toast.success(`Vérification terminée : ${data.zombies?.length ?? 0} zombie(s) détecté(s)`)
      fetchSessions()
    } catch {
      toast.error('Erreur lors de la vérification')
    } finally {
      setCheckingZombies(false)
    }
  }

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

  const noAudit = clients.filter(c => !c.audit_status || c.audit_status === 'none')
  const auditInProgress = clients.filter(c => c.audit_status === 'acompte_paid')
  const auditDone = clients.filter(c => c.audit_status === 'solde_paid')
  const refunded = clients.filter(c => c.audit_status === 'refunded')
  const activeSubscriptions = clients.filter(c => c.subscription_status === 'active' || c.subscription_status === 'trialing')

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
      </div>

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
              <Button size="sm" onClick={checkZombies} disabled={checkingZombies} className="gap-2">
                {checkingZombies ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                Détecter zombies
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
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">État Evolution</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Instance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sessions.map(s => {
                    const isZombie = s.status === 'connected' && s.evolution_state && s.evolution_state !== 'open'
                    return (
                      <tr key={s.id} className={cn('hover:bg-muted/20', isZombie && 'bg-red-500/5')}>
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
                          {s.evolution_state === null ? <span className="text-xs text-muted-foreground">—</span>
                          : s.evolution_state === 'open' ? <span className="text-xs text-green-600 font-medium">open ✓</span>
                          : isZombie ? <span className="text-xs text-red-600 font-semibold flex items-center gap-1"><AlertTriangle className="h-3 w-3" />zombie ({s.evolution_state})</span>
                          : <span className="text-xs text-amber-600">{s.evolution_state}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs text-muted-foreground">{s.instance_name.slice(0, 20)}…</code>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Instructions suppression manuelle zombie */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
              <Terminal className="h-4 w-4" />
              Suppression manuelle d&apos;une instance zombie (si Evolution refuse le DELETE)
            </div>
            <p className="text-xs text-muted-foreground">Sur le VPS via MobaXterm ou terminal Dokploy :</p>
            <pre className="text-xs bg-muted rounded p-3 overflow-x-auto">{`# 1. Créer le script
cat > /tmp/fix.js << 'EOF'
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.instance.findFirst({where:{name:'INSTANCE_NAME'}})
.then(i=>{
  if(!i) return console.log('NOT FOUND');
  return p.instance.delete({where:{id:i.id}}).then(()=>console.log('DELETED OK'));
})
.catch(e=>console.error('ERR',e.message));
EOF

# 2. Copier et exécuter dans le container
docker cp /tmp/fix.js whatsapp-test-evolutionapi-yfoofj-evolution-api-1:/evolution/fix.js
docker exec -w /evolution whatsapp-test-evolutionapi-yfoofj-evolution-api-1 node fix.js

# 3. Redémarrer le container pour vider le cache
docker restart whatsapp-test-evolutionapi-yfoofj-evolution-api-1`}</pre>
          </div>
        </div>
      )}

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

      {/* Table clients */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Client</th>
              <th className="px-4 py-3 text-left font-semibold">Audit</th>
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

                    {/* Audit status */}
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <AuditStatusBadge status={client.audit_status} />
                        <Select
                          value={client.audit_status || 'none'}
                          onValueChange={v => handleUpdateStatus(client.id, 'audit_status', v)}
                          disabled={activating === client.id}
                        >
                          <SelectTrigger className="h-6 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="w-72">
                            {AUDIT_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <div>
                                  <span className="font-medium">{opt.label}</span>
                                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
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
                            onClick={() => handleActivate(client.id)}
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
