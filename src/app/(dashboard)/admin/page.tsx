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
  Loader2, ShieldAlert, Users, Zap, FileText,
  CheckCircle2, XCircle, Clock, RefreshCw, ShieldCheck, CreditCard,
  TrendingUp, AlertCircle, ExternalLink, CheckCircle, Ban, Calendar,
  Wifi, WifiOff, Gift, Tag as TagIcon, Trash2, Link2, Store as StoreIcon,
  ChevronLeft, ChevronRight, MoreVertical, Coins, PauseCircle, PlayCircle,
  ShieldOff, UserCog, ChevronDown, MessageSquare,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  has_whatsapp?: boolean
  has_shopify?: boolean
  ai_conversations_used?: number
  ai_conversations_limit?: number | null // null = illimité
}

const PLAN_LABELS: Record<string, string> = { starter: 'Starter', pro: 'Pro', scale: 'Scale' }

/**
 * Facturation admin — d'après `shopify_stores`, la source de vérité.
 *
 * ⚠️ Remplace `BillingSubscription` / `BillingInvoice`, qui décrivaient des
 * données STRIPE. Un marchand Shopify n'a pas de client Stripe : la vue de
 * facturation ne montrait donc aucun des vrais clients.
 */
type AdminBilling = {
  subscriptions: Array<{
    id: string
    userId: string | null
    email: string | null
    fullName: string | null
    shopDomain: string
    shopName: string | null
    plan: string
    /** Plan visé, en attente d'approbation du marchand chez Shopify. */
    pendingPlan: string | null
    status: string | null
    priceEur: number
    currentPeriodEnd: string | null
    chargeId: string | null
    createdAt: string
  }>
  purchases: Array<{
    id: string
    shop_domain: string
    pack: string
    status: string
    price_cents: number | null
    created_at: string
  }>
  totals: {
    mrrCents: number
    activeCount: number
    pendingCount: number
    frozenCount: number
  }
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
  // Colonne d'usage : bascule tokens ↔ conversations IA (clic sur l'en-tête).
  const [usageMetric, setUsageMetric] = useState<'tokens' | 'conversations'>('conversations')
  const [activating, setActivating] = useState<string | null>(null)
  const [selectedPlans, setSelectedPlans] = useState<Record<string, PlanId | 'none'>>({})
  const [configModal, setConfigModal] = useState<{ config: OnboardingConfig; userId: string } | null>(null)
  const [validating, setValidating] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [activeTab, setActiveTab] = useState<'clients' | 'billing' | 'sessions' | 'affiliate' | 'promo' | 'install' | 'settings'>('clients')
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  // `BillingTab` charge désormais ses propres données (il lit `shopify_stores`,
  // et non plus Stripe). Cet état n'a plus lieu d'être.
  const [billingLoading, setBillingLoading] = useState(false)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/clients')
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setClients(data.clients || [])
    setLoading(false)
  }, [])

  // Le chargement de la facturation vit maintenant dans `BillingTab` : il lit
  // `shopify_stores` (la source de vérité) et non plus Stripe.

  // ── Actions admin par client (tokens / bannir / pause) ────────────────
  const [tokensModal, setTokensModal] = useState<{ id: string; email: string; tokens_limit: number } | null>(null)
  const [tokensLimitInput, setTokensLimitInput] = useState('')
  const [tokensExtraInput, setTokensExtraInput] = useState('')
  const [tokensResetUsed, setTokensResetUsed] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)

  // Démarre l'impersonation puis recharge sur le dashboard DU CLIENT. À partir de
  // là, tout est vu/modifié comme lui, et une bannière permet de revenir.
  async function impersonate(userId: string, email: string) {
    setActionBusy(true)
    try {
      const res = await fetch('/api/admin/impersonate/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: userId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Impossible de démarrer')
      toast.success(`Connecté en tant que ${email}`)
      // Rechargement DUR (pas router.push) : tous les Server Components doivent
      // relire l'utilisateur effectif depuis le cookie fraîchement posé.
      window.location.href = '/dashboard'
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
      setActionBusy(false)
    }
  }

  async function clientAction(userId: string, action: string, extra?: Record<string, unknown>) {
    setActionBusy(true)
    try {
      const res = await fetch('/api/admin/client-actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, action, ...extra }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Action échouée')
      toast.success(
        action === 'ban' ? 'Compte banni (connexion refusée)'
        : action === 'unban' ? 'Compte débanni'
        : action === 'pause' ? 'Compte mis en pause'
        : action === 'resume' ? 'Compte réactivé'
        : 'Tokens mis à jour'
      )
      fetchClients()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
      return false
    } finally {
      setActionBusy(false)
    }
  }

  async function saveTokensModal() {
    if (!tokensModal) return
    const extra: Record<string, unknown> = {}
    if (tokensLimitInput.trim() !== '') extra.tokens_limit = Math.max(0, parseInt(tokensLimitInput) || 0)
    if (tokensExtraInput.trim() !== '') extra.tokens_extra = Math.max(0, parseInt(tokensExtraInput) || 0)
    if (tokensResetUsed) extra.reset_used = true
    const ok = await clientAction(tokensModal.id, 'set_tokens', extra)
    if (ok) setTokensModal(null)
  }

  useEffect(() => {
    if (!subLoading && subscription?.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [subLoading, subscription, router])

  useEffect(() => {
    if (subscription?.role === 'admin') fetchClients()
  }, [subscription, fetchClients])


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

  const activeSubscriptions = clients.filter(c => c.subscription_status === 'active' || c.subscription_status === 'trialing')

  // Répartition par ABONNEMENT (remplace les anciennes stats d'audit).
  // « Inscription sans abonnement » = pas d'abonnement actif payant (plan vide OU
  // statut non actif). Les 3 autres comptent l'abonnement par plan.
  const isActive = (c: ClientRow) => c.subscription_status === 'active' || c.subscription_status === 'trialing'
  const noSubscription = clients.filter(c => !isActive(c) || !c.plan)
  const proCount = clients.filter(c => isActive(c) && c.plan === 'pro')
  const scaleCount = clients.filter(c => isActive(c) && c.plan === 'scale')
  const starterCount = clients.filter(c => isActive(c) && c.plan === 'starter')

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
        {/* L'onglet facturation a son propre bouton d'actualisation (il charge
            ses données lui-même). */}
        <Button variant="outline" size="sm" onClick={fetchClients}>
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
        <button
          onClick={() => setActiveTab('settings')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'settings'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <ShieldCheck className="h-4 w-4" />
          Paramètres généraux
        </button>
      </div>

      {activeTab === 'settings' && <PlatformSettingsTab />}

      {activeTab === 'install' && <InstallLinkGenerator />}

      {activeTab === 'billing' && (
        <BillingTab loading={billingLoading} />
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
          <p className="text-2xl font-bold text-gray-500">{noSubscription.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Sans abonnement</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-blue-500">{starterCount.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Starter</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-purple-500">{proCount.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Pro</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold text-emerald-500">{scaleCount.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Scale</p>
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
              <th className="px-4 py-3 text-left font-semibold">
                {/* Clic = bascule tokens ↔ conversations IA (l'unité du plan). */}
                <button
                  onClick={() => setUsageMetric(m => m === 'tokens' ? 'conversations' : 'tokens')}
                  className="inline-flex items-center gap-1 rounded hover:text-primary"
                  title="Cliquer pour basculer entre conversations IA et tokens"
                >
                  {usageMetric === 'tokens' ? 'Tokens' : 'Conversations IA'}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </th>
              <th className="px-4 py-3 text-left font-semibold">Rôle</th>
              <th className="px-4 py-3 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleClients.map(client => {
              const usagePct = client.tokens_limit > 0
                ? Math.round((client.tokens_used / client.tokens_limit) * 100)
                : 0


              return (
                <>
                  <tr key={client.id} className="hover:bg-muted/20 transition-colors">
                    {/* Client */}
                    <td className="px-4 py-3">
                      <div className="font-medium">{client.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{client.email}</div>
                      <div className="text-xs text-muted-foreground">{new Date(client.created_at).toLocaleDateString('fr-FR')}</div>
                    </td>

                    {/* Tenant / Site + connexions WhatsApp / Shopify */}
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        {client.tenant_name ? (
                          <Badge variant="outline" className="text-xs">{client.tenant_name}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {/* Pastilles de connexion : vert = branché, gris = pas branché. */}
                        <div className="flex items-center gap-1.5">
                          <span
                            title={client.has_whatsapp ? 'WhatsApp connecté' : 'WhatsApp non connecté'}
                            className={cn(
                              'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium',
                              client.has_whatsapp ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'
                            )}
                          >
                            <MessageSquare className="h-2.5 w-2.5" /> WA
                          </span>
                          <span
                            title={client.has_shopify ? 'Shopify connecté' : 'Shopify non connecté'}
                            className={cn(
                              'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium',
                              client.has_shopify ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'
                            )}
                          >
                            <StoreIcon className="h-2.5 w-2.5" /> Shopify
                          </span>
                        </div>
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
                              <SelectItem value="none">Aucun</SelectItem>
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

                    {/* Usage : tokens OU conversations IA selon l'en-tête. */}
                    <td className="px-4 py-3">
                      {usageMetric === 'tokens' ? (
                        <div className="flex items-center gap-1.5">
                          <Zap className={cn('h-3.5 w-3.5 shrink-0', usagePct >= 90 ? 'text-red-500' : 'text-muted-foreground')} />
                          <span className="text-xs">
                            {client.tokens_used.toLocaleString()} / {client.tokens_limit.toLocaleString()}
                            <span className={cn('ml-1', usagePct >= 90 ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
                              ({usagePct}%)
                            </span>
                          </span>
                        </div>
                      ) : (() => {
                        // Conversations IA : l'unité RÉELLE du plan. limit null = illimité.
                        const used = client.ai_conversations_used ?? 0
                        const limit = client.ai_conversations_limit
                        const pct = limit && limit > 0 ? Math.round((used / limit) * 100) : 0
                        const hot = limit != null && pct >= 90
                        return (
                          <div className="flex items-center gap-1.5">
                            <MessageSquare className={cn('h-3.5 w-3.5 shrink-0', hot ? 'text-red-500' : 'text-muted-foreground')} />
                            <span className="text-xs">
                              {used.toLocaleString()} / {limit == null ? '∞' : limit.toLocaleString()}
                              {limit != null && (
                                <span className={cn('ml-1', hot ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
                                  ({pct}%)
                                </span>
                              )}
                            </span>
                          </div>
                        )
                      })()}
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

                    {/* Actions : menu (tokens / pause / bannir) + détail. */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={actionBusy}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {/* Se connecter EN TANT QUE ce client (impersonation) :
                                voir et modifier son compte comme lui, avec une
                                bannière pour revenir. Journalisé. */}
                            <DropdownMenuItem onClick={() => impersonate(client.id, client.email)}>
                              <UserCog className="mr-2 h-4 w-4 text-primary" /> Se connecter en tant que
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setTokensLimitInput(String(client.tokens_limit ?? 0))
                                setTokensExtraInput('')
                                setTokensResetUsed(false)
                                setTokensModal({ id: client.id, email: client.email, tokens_limit: client.tokens_limit })
                              }}
                            >
                              <Coins className="mr-2 h-4 w-4" /> Modifier les tokens
                            </DropdownMenuItem>
                            {client.subscription_status === 'past_due' ? (
                              <DropdownMenuItem onClick={() => clientAction(client.id, 'resume')}>
                                <PlayCircle className="mr-2 h-4 w-4 text-emerald-500" /> Réactiver le compte
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => clientAction(client.id, 'pause')}>
                                <PauseCircle className="mr-2 h-4 w-4 text-amber-500" /> Mettre en pause
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={() => clientAction(client.id, 'ban')}>
                              <Ban className="mr-2 h-4 w-4" /> Bannir le compte
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => clientAction(client.id, 'unban')}>
                              <ShieldOff className="mr-2 h-4 w-4" /> Débannir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                </>
              )
            })}
            {visibleClients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
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

      {/* Modal tokens (action admin) */}
      <Dialog open={!!tokensModal} onOpenChange={() => setTokensModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-4 w-4" /> Modifier les tokens
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{tokensModal?.email}</p>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Limite mensuelle (tokens)</label>
              <Input type="number" min={0} value={tokensLimitInput} onChange={(e) => setTokensLimitInput(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Tokens bonus (extra)</label>
              <Input type="number" min={0} placeholder="Laisser vide pour ne pas changer" value={tokensExtraInput} onChange={(e) => setTokensExtraInput(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={tokensResetUsed} onChange={(e) => setTokensResetUsed(e.target.checked)} />
              Remettre la consommation du mois à zéro
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setTokensModal(null)}>Annuler</Button>
              <Button size="sm" disabled={actionBusy} onClick={saveTokensModal}>
                {actionBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

/**
 * Facturation — vue admin.
 *
 * ⚠️ L'ANCIENNE VERSION NE MONTRAIT AUCUN CLIENT RÉEL.
 *
 * Elle ne listait que les comptes ayant un client Stripe, puis interrogeait
 * Stripe. Or un marchand Shopify n'a pas de client Stripe — et l'onboarding
 * impose une boutique Shopify. Tous les vrais clients étaient donc INVISIBLES
 * dans cette vue.
 *
 * Elle lit désormais `shopify_stores`, la source de vérité, tenue à jour par le
 * callback de facturation et le webhook d'abonnement.
 */
function BillingTab({ loading }: { loading: boolean }) {
  const [data, setData] = useState<AdminBilling | null>(null)
  const [busy, setBusy] = useState(true)

  const load = () => {
    setBusy(true)
    fetch('/api/admin/billing')
      .then(r => (r.ok ? r.json() : null))
      .then(j => setData(j?.data ?? null))
      .catch(() => setData(null))
      .finally(() => setBusy(false))
  }

  useEffect(() => { load() }, [])

  if (loading || busy) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Aucune donnée de facturation.</p>
  }

  const eur = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €'

  return (
    <div className="space-y-6">
      {/* « En attente » = le marchand a lancé un abonnement mais ne l'a jamais
          approuvé chez Shopify. « Gelé » = impayé, Shopify a suspendu. */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Revenu mensuel</p>
          <p className="mt-1 text-2xl font-semibold text-primary">{eur(data.totals.mrrCents)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Abonnements actifs</p>
          <p className="mt-1 text-2xl font-semibold">{data.totals.activeCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">En attente d’approbation</p>
          <p className="mt-1 text-2xl font-semibold">{data.totals.pendingCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Impayés (gelés)</p>
          <p className="mt-1 text-2xl font-semibold">{data.totals.frozenCount}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium">Abonnements ({data.subscriptions.length})</p>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Actualiser
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/10 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Client</th>
                <th className="px-4 py-2 text-left font-medium">Boutique</th>
                <th className="px-4 py-2 text-left font-medium">Plan</th>
                <th className="px-4 py-2 text-left font-medium">Statut</th>
                <th className="px-4 py-2 text-left font-medium">Renouvellement</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.subscriptions.map(s => (
                <tr key={s.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{s.fullName || s.email || '—'}</p>
                    {s.fullName && s.email && (
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{s.shopDomain}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium capitalize">{s.plan}</span>
                    {s.pendingPlan && (
                      <span className="ml-1.5 text-xs text-amber-600">→ {s.pendingPlan} ?</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><SubStatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {s.currentPeriodEnd
                      ? new Date(s.currentPeriodEnd).toLocaleDateString('fr-FR')
                      : '—'}
                  </td>
                </tr>
              ))}
              {data.subscriptions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Aucune boutique active.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Achats ponctuels. Ils ne passaient pas du tout par Shopify avant : le
          bouton « Acheter des tokens » renvoyait un 403 à tous les marchands. */}
      {data.purchases.length > 0 && (
        <div className="overflow-hidden rounded-xl border">
          <p className="border-b bg-muted/30 px-4 py-3 text-sm font-medium">
            Achats ponctuels ({data.purchases.length})
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/10 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Boutique</th>
                  <th className="px-4 py-2 text-left font-medium">Pack</th>
                  <th className="px-4 py-2 text-left font-medium">Montant</th>
                  <th className="px-4 py-2 text-left font-medium">Statut</th>
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.purchases.map(p => (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">{p.shop_domain}</td>
                    <td className="px-4 py-3">
                      {p.pack === 'tokens' ? 'Tokens' : 'Conversations IA'}
                    </td>
                    <td className="px-4 py-3">{p.price_cents ? eur(p.price_cents) : '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={p.status === 'credited' ? 'default' : 'secondary'}>
                        {p.status === 'credited' ? 'Crédité' : p.status === 'declined' ? 'Refusé' : 'En attente'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString('fr-FR')}
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
  // ⚠️ `contact_email` est ce qui RATTACHE le code à un compte Xeyo. Sans lui, le
  // partenaire reste orphelin et ne voit jamais ses commissions — c'était
  // exactement le bug de l'ancienne version (la colonne `user_id` était NOT NULL
  // mais n'était jamais renseignée).
  const [form, setForm] = useState({ label: '', code: '', commission_percent: '30', contact_email: '' })
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
      setForm({ label: '', code: '', commission_percent: '30', contact_email: '' })
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          {/* ⚠️ C'est cet email qui RATTACHE le code au compte Xeyo du partenaire.
              Sans lui, il ne verra jamais ses commissions — l'ancienne version ne le
              demandait pas, et le partenaire restait orphelin à vie. */}
          <input
            type="email"
            placeholder="Email du partenaire (facultatif)"
            value={form.contact_email}
            onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Programme</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Payé par le client</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Commission</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {/* Les commissions viennent désormais de `growth_rewards` : le
                  bénéficiaire est le PARTENAIRE, et le code qui l'a générée vient de
                  l'attribution. On n'affiche plus l'identité du client converti — un
                  partenaire n'a pas à connaître les clients de la plateforme. */}
              {pending.map((conv: any) => (
                <tr key={conv.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {conv.beneficiary?.full_name || conv.beneficiary?.email || '—'}
                    </p>
                    {conv.beneficiary?.email && conv.beneficiary?.full_name && (
                      <p className="text-xs text-muted-foreground">{conv.beneficiary.email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      {conv.attribution?.code?.label || '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono">{conv.attribution?.code?.code || '—'}</td>
                  <td className="px-4 py-3">{((conv.base_amount_cents || 0) / 100).toFixed(2)} €</td>
                  <td className="px-4 py-3 font-semibold text-primary">{((conv.amount_cents || 0) / 100).toFixed(2)} €</td>
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
  // Tous les champs supportés par l'API. Le formulaire n'en exposait que 4 : on
  // ne pouvait créer que des codes « % simple », alors que la remise en euros,
  // la durée, les jours d'essai, l'expiration et le ciblage par plan étaient
  // déjà gérés côté serveur. C'est ce qu'il faut pour un « tarif fondateur ».
  const [form, setForm] = useState({
    code: '',
    discount_percent: '10',
    discount_amount_cents: '',
    duration_months: '',
    trial_days: '',
    max_redemptions: '',
    valid_until: '',
    plans: [] as string[],
  })
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
    if (!form.code) return toast.error('Code requis')
    // Un code doit offrir quelque chose (la route le revalide de son côté).
    if (!form.discount_percent && !form.discount_amount_cents && !form.trial_days) {
      return toast.error('Indiquez une remise (% ou €) ou des jours d’essai.')
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          // On n'envoie que ce qui est renseigné : la route traite null =
          // « non applicable » (remise permanente, tous plans, sans expiration…).
          discount_percent: form.discount_percent || null,
          // Saisie en euros côté admin, stockée en centimes.
          discount_amount_cents: form.discount_amount_cents
            ? Math.round(Number(form.discount_amount_cents) * 100)
            : null,
          duration_months: form.duration_months || null,
          trial_days: form.trial_days || null,
          max_redemptions: form.max_redemptions || null,
          valid_until: form.valid_until || null,
          plans: form.plans.length ? form.plans : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Code ${data.code} créé`)
      setForm({ code: '', discount_percent: '10', discount_amount_cents: '', duration_months: '', trial_days: '', max_redemptions: '', valid_until: '', plans: [] })
      fetchCodes()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setCreating(false)
    }
  }

  /**
   * DÉSACTIVATION, pas suppression.
   *
   * Le bouton appelait `DELETE`, qui supprime réellement la ligne — et le
   * `ON DELETE CASCADE` effaçait au passage TOUT l'historique d'utilisation
   * (`promo_redemptions`), alors que le toast annonçait « désactivé ». On perdait
   * la trace de qui avait utilisé quoi, et un marchand pouvait réutiliser un code
   * recréé sous le même nom. `PATCH is_active:false` existait déjà côté API.
   */
  const handleDeactivate = async (id: string) => {
    setDeleting(id)
    try {
      // ⚠️ Le PATCH est sur la route RACINE et attend `id` dans le BODY
      // (pas /promo-codes/{id}, qui n'expose qu'un DELETE destructif).
      const res = await fetch('/api/admin/promo-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: false }),
      })
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
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2"><TagIcon className="h-5 w-5 text-primary" />Créer un code promo</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Remise en % ou en €, limitée dans le temps ou permanente, avec ou sans jours d’essai offerts.
          Un « tarif fondateur » = une remise en % sans durée ni date d’expiration.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Code</label>
            <input
              type="text"
              placeholder="FONDATEUR"
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Remise %</label>
            <input
              type="number" min="0" max="100"
              placeholder="20"
              value={form.discount_percent}
              onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">…ou remise en €</label>
            <input
              type="number" min="0" step="0.01"
              placeholder="30"
              value={form.discount_amount_cents}
              onChange={e => setForm(f => ({ ...f, discount_amount_cents: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Durée (mois)</label>
            <input
              type="number" min="1"
              placeholder="Vide = permanente"
              value={form.duration_months}
              onChange={e => setForm(f => ({ ...f, duration_months: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Jours d’essai offerts</label>
            <input
              type="number" min="0"
              placeholder="En plus des 7 jours"
              value={form.trial_days}
              onChange={e => setForm(f => ({ ...f, trial_days: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Max utilisations</label>
            <input
              type="number" min="1"
              placeholder="Vide = illimité"
              value={form.max_redemptions}
              onChange={e => setForm(f => ({ ...f, max_redemptions: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Expire le</label>
            <input
              type="date"
              value={form.valid_until}
              onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">
              Plans éligibles <span className="font-normal">(aucun coché = tous)</span>
            </label>
            <div className="flex flex-wrap gap-3 pt-1.5">
              {(['starter', 'pro', 'scale'] as const).map(p => (
                <label key={p} className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={form.plans.includes(p)}
                    onChange={e => setForm(f => ({
                      ...f,
                      plans: e.target.checked ? [...f.plans, p] : f.plans.filter(x => x !== p),
                    }))}
                    className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
                  />
                  <span className="capitalize">{p}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Créer le code
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Codes promo ({codes.length})</h2>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                {/* « Applicable à » (applies_to) était une colonne legacy Stripe,
                    plus lue par l'API. Remplacée par les infos réellement
                    appliquées : durée, essai, plans, utilisations, expiration. */}
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Avantage</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Durée</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plans</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Utilisations</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expire</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Statut</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {codes.map((code: any) => (
                <tr key={code.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono font-semibold">{code.code}</td>
                  <td className="px-4 py-3 font-medium text-primary">
                    {[
                      code.discount_percent ? `-${code.discount_percent}%` : null,
                      code.discount_amount_cents ? `-${(code.discount_amount_cents / 100).toFixed(2)}€` : null,
                      code.trial_days ? `+${code.trial_days}j d’essai` : null,
                    ].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {code.duration_months ? `${code.duration_months} mois` : 'Permanente'}
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {Array.isArray(code.plans) && code.plans.length ? code.plans.join(', ') : 'Tous'}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {(code.redemptions ?? 0)} / {code.max_redemptions ?? '∞'}
                  </td>
                  <td className="px-4 py-3">
                    {code.valid_until
                      ? new Date(code.valid_until).toLocaleDateString('fr-FR')
                      : '—'}
                  </td>
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
                        title="Désactiver ce code (l’historique d’utilisation est conservé)"
                        onClick={() => handleDeactivate(code.id)}
                      >
                        {deleting === code.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {codes.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">Aucun code promo</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/**
 * Réglages GLOBAUX de la plateforme (sécurité Xeyo, pas préférences marchand) :
 *  · plafond anti-spam de fréquence marketing par contact ;
 *  · durées de rétention des données personnelles (RGPD art. 5.1.e).
 */
function PlatformSettingsTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [capHours, setCapHours] = useState<string>('20')
  const [msgDays, setMsgDays] = useState<string>('0')
  const [logDays, setLogDays] = useState<string>('0')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/platform-settings')
      const json = await res.json()
      if (res.ok) {
        setCapHours(String(json.data?.marketing_contact_cap_hours ?? 20))
        setMsgDays(String(json.data?.message_retention_days ?? 0))
        setLogDays(String(json.data?.log_retention_days ?? 0))
        setUpdatedAt(json.data?.updated_at ?? null)
      } else {
        toast.error(json.error || 'Chargement impossible')
      }
    } catch {
      toast.error('Chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // `patch` sert les deux blocs : chacun n'envoie que ses propres champs, la
  // route ne met à jour que ce qu'elle reçoit.
  const patch = async (body: Record<string, number>) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/platform-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Réglage enregistré')
        setUpdatedAt(json.data?.updated_at ?? new Date().toISOString())
      } else {
        toast.error(json.error || 'Enregistrement impossible')
      }
    } catch {
      toast.error('Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  const saveCap = () => {
    const n = Number(capHours)
    if (!Number.isFinite(n) || n < 0 || n > 720) {
      toast.error('Valeur invalide : un entier entre 0 et 720 heures')
      return
    }
    patch({ marketing_contact_cap_hours: Math.floor(n) })
  }

  const saveRetention = () => {
    const m = Number(msgDays)
    const l = Number(logDays)
    for (const v of [m, l]) {
      if (!Number.isFinite(v) || v < 0 || v > 3650) {
        toast.error('Valeur invalide : un entier entre 0 et 3650 jours')
        return
      }
    }
    patch({ message_retention_days: Math.floor(m), log_retention_days: Math.floor(l) })
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  const n = Number(capHours)
  const disabled = Number.isFinite(n) && n === 0
  const msgOff = Number(msgDays) === 0
  const logOff = Number(logDays) === 0

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="rounded-xl border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Fréquence marketing par contact</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Plafond anti-spam appliqué à <strong>toutes</strong> les campagnes marketing :
          un même contact ne reçoit pas plus d&apos;un message marketing dans la fenêtre
          définie. Le transactionnel (statuts de commande, SAV) n&apos;est jamais concerné.
          Ce plafond protège la qualité de la WABA Xeyo côté Meta — c&apos;est un réglage
          plateforme, il s&apos;applique à tous les comptes.
        </p>

        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Fenêtre (heures)</label>
            <input
              type="number"
              min={0}
              max={720}
              value={capHours}
              onChange={e => setCapHours(e.target.value)}
              className="w-40 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <Button onClick={saveCap} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>20</strong> = 1 message marketing max par contact et par jour (recommandé).</p>
          <p><strong>0</strong> = plafond désactivé {disabled && <Badge variant="secondary" className="ml-1">actuellement désactivé</Badge>}.</p>
        </div>
      </div>

      <div className="rounded-xl border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Conservation des données</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Le RGPD interdit de garder des données personnelles plus longtemps que
          nécessaire (art. 5.1.e). Une purge automatique supprime chaque nuit les
          données plus anciennes que les durées ci-dessous. C&apos;est distinct du
          droit à l&apos;effacement, déjà assuré à la demande.
          <br />
          <strong>Les contacts ne sont jamais supprimés</strong> par cette purge : effacer
          un contact abonné détruirait son consentement WhatsApp. Seul l&apos;historique
          des échanges est concerné.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Messages (jours)</label>
            <input
              type="number"
              min={0}
              max={3650}
              value={msgDays}
              onChange={e => setMsgDays(e.target.value)}
              className="w-40 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Logs techniques (jours)</label>
            <input
              type="number"
              min={0}
              max={3650}
              value={logDays}
              onChange={e => setLogDays(e.target.value)}
              className="w-40 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <Button onClick={saveRetention} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>730</strong> jours (24 mois) pour les messages, <strong>90</strong> pour les logs : recommandé.</p>
          <p>
            <strong>0</strong> = conservation illimitée, purge désactivée
            {(msgOff || logOff) && <Badge variant="secondary" className="ml-1">purge partiellement désactivée</Badge>}.
          </p>
          <p className="pt-1 text-amber-600 dark:text-amber-500">
            ⚠️ La suppression est définitive et irréversible. Baisser une durée purgera
            dès la prochaine exécution tout ce qui dépasse le nouveau seuil.
          </p>
          {updatedAt && (
            <p className="pt-1">Dernière modification : {new Date(updatedAt).toLocaleString('fr-FR')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
