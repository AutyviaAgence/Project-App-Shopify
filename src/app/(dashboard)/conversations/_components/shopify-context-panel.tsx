'use client'

import { useEffect, useState } from 'react'
import { ShoppingBag, Package, ExternalLink, Loader2, History, Ban, RotateCcw, Tag, Check, X, ChevronRight, ChevronLeft, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

type Order = {
  id: string
  name: string
  createdAt: string
  financialStatus: string | null
  fulfillmentStatus: string | null
  total: string
  totalRefunded?: string
  currency: string
  tracking: { number: string | null; url: string | null } | null
}

/** Statut de remboursement calculé depuis Shopify (montant remboursé vs total). */
function refundInfo(o: Order): { label: string; badge: string } | null {
  const total = Number(o.total) || 0
  const refunded = Number(o.totalRefunded) || 0
  if (refunded <= 0) return null
  const full = refunded >= total - 0.001
  return {
    label: full
      ? `Remboursée (${refunded.toFixed(2)} ${o.currency})`
      : `Remboursé ${refunded.toFixed(2)} / ${total.toFixed(2)} ${o.currency}`,
    badge: full
      ? 'text-rose-500 bg-rose-500/15 ring-rose-500/30'
      : 'text-amber-500 bg-amber-500/15 ring-amber-500/30',
  }
}

type Data = { connected: boolean; orders: Order[]; error?: string }

/** Traduit le statut de livraison Shopify en libellé FR + style du badge. */
function fulfillmentLabel(s: string | null): { label: string; badge: string } {
  switch (s) {
    case 'FULFILLED': return { label: 'Expédiée', badge: 'text-emerald-500 bg-emerald-500/15 ring-emerald-500/30' }
    case 'PARTIALLY_FULFILLED': return { label: 'Partielle', badge: 'text-amber-500 bg-amber-500/15 ring-amber-500/30' }
    case 'UNFULFILLED': return { label: 'En préparation', badge: 'text-blue-500 bg-blue-500/15 ring-blue-500/30' }
    default: return { label: s || '—', badge: 'text-muted-foreground bg-muted ring-border' }
  }
}

/** Statut de paiement Shopify → libellé FR. */
function financialLabel(s: string | null): string {
  switch (s) {
    case 'PAID': return 'Payée'
    case 'PENDING': return 'En attente'
    case 'REFUNDED': return 'Remboursée'
    case 'PARTIALLY_REFUNDED': return 'Part. remboursée'
    case 'VOIDED': return 'Annulée'
    default: return s || '—'
  }
}

// Action passée (historique)
type ActionItem = {
  id: string
  action_type: 'cancel_order' | 'refund_order' | 'create_discount'
  summary: string | null
  status: 'pending' | 'confirmed' | 'rejected' | 'executed' | 'failed'
  // Résultat réel après exécution (montant vraiment remboursé pour un refund).
  result: { amount?: number; currency?: string; refundId?: string } | null
  // Payload de la demande (contient le montant estimé + refund_auto le cas échéant).
  payload?: { amount_estimated?: number; currency?: string; refund_auto?: boolean } | null
  created_at: string
}
const ACTION_META: Record<ActionItem['action_type'], { label: string; icon: typeof Ban; cls: string }> = {
  cancel_order: { label: 'Annulation', icon: Ban, cls: 'text-red-500' },
  refund_order: { label: 'Remboursement', icon: RotateCcw, cls: 'text-amber-500' },
  create_discount: { label: 'Code promo', icon: Tag, cls: 'text-green-600' },
}
const STATUS_META: Record<ActionItem['status'], { label: string; cls: string }> = {
  pending: { label: 'À valider', cls: 'bg-amber-500/15 text-amber-600' },
  confirmed: { label: 'Confirmée', cls: 'bg-blue-500/15 text-blue-500' },
  executed: { label: 'Exécutée', cls: 'bg-green-500/15 text-green-600' },
  rejected: { label: 'Refusée', cls: 'bg-muted text-muted-foreground' },
  failed: { label: 'Échec', cls: 'bg-red-500/15 text-red-500' },
}

/**
 * Panneau de contexte Shopify : commandes récentes du client + historique des
 * actions de la conversation (annulations, remboursements, codes promo).
 */
export function ShopifyContextPanel({ contactId, conversationId, contactName }: { contactId: string | null; conversationId?: string; contactName?: string | null }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'orders' | 'history'>('orders')
  const [actions, setActions] = useState<ActionItem[]>([])
  const [actionsLoading, setActionsLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let active = true
    if (!contactId) { setData(null); return }
    ;(async () => {
      setLoading(true)
      try {
        const j = await (await fetch(`/api/shopify/orders?contact_id=${contactId}`)).json()
        if (active) setData(j.data || null)
      } catch {
        if (active) setData(null)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [contactId])

  // Historique des actions de la conversation (chargé à l'ouverture de l'onglet)
  useEffect(() => {
    if (tab !== 'history' || !conversationId) return
    let active = true
    ;(async () => {
      setActionsLoading(true)
      try {
        const j = await (await fetch(`/api/shopify/actions?conversation_id=${conversationId}`)).json()
        if (active) setActions(j.data || [])
      } catch {
        if (active) setActions([])
      } finally {
        if (active) setActionsLoading(false)
      }
    })()
    return () => { active = false }
  }, [tab, conversationId])

  if (!contactId) return null
  // Boutique non connectée → on n'affiche pas le panneau
  if (data && !data.connected) return null

  const orderCount = data?.orders.length ?? 0

  // Replié : fine bande verticale avec une flèche pour rouvrir (comme la sidebar).
  if (collapsed) {
    return (
      <div className="hidden w-12 shrink-0 flex-col items-center gap-3 border-l bg-background py-3 xl:flex">
        <button
          onClick={() => setCollapsed(false)}
          title="Afficher les commandes"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="relative">
          <ShoppingBag className="h-5 w-5 text-muted-foreground" />
          {orderCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">{orderCount}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="hidden h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden border-l bg-background xl:flex">
      {/* En-tête : conversation liée + bouton replier */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {contactName || 'Conversation'}
        </span>
        <button
          onClick={() => setCollapsed(true)}
          title="Réduire"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {/* Onglets Commandes / Historique */}
      <div className="flex shrink-0 border-b">
        <button onClick={() => setTab('orders')}
          className={cn('flex flex-1 items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium transition-colors',
            tab === 'orders' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground')}>
          <ShoppingBag className="h-4 w-4" /> Commandes
        </button>
        <button onClick={() => setTab('history')}
          className={cn('flex flex-1 items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium transition-colors',
            tab === 'history' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground')}>
          <History className="h-4 w-4" /> Historique
        </button>
      </div>

      {tab === 'history' ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {actionsLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : actions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucune action sur cette conversation.</p>
          ) : (
            actions.map((a) => {
              const meta = ACTION_META[a.action_type]
              const st = STATUS_META[a.status]
              const Icon = meta.icon
              return (
                <div key={a.id} className="rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', meta.cls)} />
                    <span className="text-sm font-medium">{meta.label}</span>
                    {a.payload?.refund_auto && (
                      <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                        Auto IA
                      </span>
                    )}
                    <span className={cn('ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', st.cls)}>
                      {a.status === 'executed' && <Check className="h-2.5 w-2.5" />}
                      {a.status === 'rejected' && <X className="h-2.5 w-2.5" />}
                      {st.label}
                    </span>
                  </div>
                  {a.summary && <p className="mt-1 text-xs text-muted-foreground">{a.summary}</p>}
                  {/* Montant RÉELLEMENT remboursé (source de vérité, ≠ estimé) une
                      fois l'action exécutée. */}
                  {a.action_type === 'refund_order' && a.status === 'executed' && a.result?.amount != null && (
                    <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                      Remboursé : {Number(a.result.amount).toFixed(2)} {a.result.currency || ''}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{new Date(a.created_at).toLocaleString('fr-FR')}</p>
                </div>
              )
            })
          )}
        </div>
      ) : (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [scrollbar-width:thin]">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !data || data.orders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
              <ShoppingBag className="h-5 w-5 text-muted-foreground" />
            </span>
            <p className="text-sm text-muted-foreground">Aucune commande trouvée pour ce client.</p>
          </div>
        ) : (
          data.orders.map((o) => {
            const fl = fulfillmentLabel(o.fulfillmentStatus)
            const refund = refundInfo(o)
            return (
              <div
                key={o.id}
                className="group rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-border"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-semibold tracking-tight">{o.name}</span>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1', fl.badge)}>{fl.label}</span>
                </div>
                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <span className="text-base font-bold tracking-tight">
                    {o.total} <span className="text-[11px] font-medium text-muted-foreground">{o.currency}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span>{financialLabel(o.financialStatus)}</span>
                  {o.tracking?.url && (
                    <a
                      href={o.tracking.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <Package className="h-3 w-3" /> Suivi <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
                {/* Statut de remboursement (source Shopify : marche aussi pour un
                    remboursement fait directement dans l'admin Shopify). */}
                {refund && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <RotateCcw className="h-3 w-3 shrink-0 text-amber-500" />
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1', refund.badge)}>
                      {refund.label}
                    </span>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
      )}
    </div>
  )
}
