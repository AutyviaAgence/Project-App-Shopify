'use client'

import { useEffect, useState } from 'react'
import { ShoppingBag, Package, ExternalLink, Loader2, History, Ban, RotateCcw, Tag, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Order = {
  id: string
  name: string
  createdAt: string
  financialStatus: string | null
  fulfillmentStatus: string | null
  total: string
  currency: string
  tracking: { number: string | null; url: string | null } | null
}

type Data = { connected: boolean; orders: Order[]; error?: string }

/** Traduit le statut de livraison Shopify en libellé FR + dégradé de carte. */
function fulfillmentLabel(s: string | null): { label: string; badge: string; gradient: string } {
  switch (s) {
    case 'FULFILLED': return { label: 'Expédiée', badge: 'text-emerald-300 bg-emerald-500/15 ring-emerald-500/30', gradient: 'from-emerald-500/25 to-teal-500/10' }
    case 'PARTIALLY_FULFILLED': return { label: 'Partielle', badge: 'text-amber-300 bg-amber-500/15 ring-amber-500/30', gradient: 'from-amber-500/25 to-orange-500/10' }
    case 'UNFULFILLED': return { label: 'En préparation', badge: 'text-blue-300 bg-blue-500/15 ring-blue-500/30', gradient: 'from-blue-500/25 to-indigo-500/10' }
    default: return { label: s || '—', badge: 'text-muted-foreground bg-muted ring-border', gradient: 'from-white/10 to-white/0' }
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
export function ShopifyContextPanel({ contactId, conversationId }: { contactId: string | null; conversationId?: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'orders' | 'history'>('orders')
  const [actions, setActions] = useState<ActionItem[]>([])
  const [actionsLoading, setActionsLoading] = useState(false)

  useEffect(() => {
    if (!contactId) { setData(null); return }
    setLoading(true)
    fetch(`/api/shopify/orders?contact_id=${contactId}`)
      .then((r) => r.json())
      .then((j) => setData(j.data || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [contactId])

  // Historique des actions de la conversation (chargé à l'ouverture de l'onglet)
  useEffect(() => {
    if (tab !== 'history' || !conversationId) return
    setActionsLoading(true)
    fetch(`/api/shopify/actions?conversation_id=${conversationId}`)
      .then((r) => r.json())
      .then((j) => setActions(j.data || []))
      .catch(() => setActions([]))
      .finally(() => setActionsLoading(false))
  }, [tab, conversationId])

  if (!contactId) return null
  // Boutique non connectée → on n'affiche pas le panneau
  if (data && !data.connected) return null

  return (
    <div className="hidden w-72 shrink-0 border-l bg-background xl:block">
      {/* Onglets Commandes / Historique */}
      <div className="flex border-b">
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
        <div className="space-y-2 p-4">
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
                    <span className={cn('ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', st.cls)}>
                      {a.status === 'executed' && <Check className="h-2.5 w-2.5" />}
                      {a.status === 'rejected' && <X className="h-2.5 w-2.5" />}
                      {st.label}
                    </span>
                  </div>
                  {a.summary && <p className="mt-1 text-xs text-muted-foreground">{a.summary}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{new Date(a.created_at).toLocaleString('fr-FR')}</p>
                </div>
              )
            })
          )}
        </div>
      ) : (
      <div className="flex flex-col gap-3 overflow-y-auto p-4 [scrollbar-width:thin]">
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
          data.orders.map((o, i) => {
            const fl = fulfillmentLabel(o.fulfillmentStatus)
            return (
              <div
                key={o.id}
                className="group overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-colors hover:border-border"
              >
                {/* Bandeau dégradé selon le statut + n° commande */}
                <div className={cn('flex items-center justify-between bg-gradient-to-br px-4 pb-8 pt-4', fl.gradient)}>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-background/40 backdrop-blur">
                      <ShoppingBag className="h-4 w-4 text-foreground" />
                    </span>
                    <span className="text-base font-bold tracking-tight">{o.name}</span>
                  </div>
                  <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1', fl.badge)}>{fl.label}</span>
                </div>

                {/* Corps : montant + métadonnées (remonte sur le bandeau) */}
                <div className="-mt-5 space-y-3 px-4 pb-4">
                  <div className="rounded-xl border border-border/60 bg-background/80 p-3 backdrop-blur">
                    <p className="text-2xl font-bold tracking-tight">
                      {o.total} <span className="text-sm font-medium text-muted-foreground">{o.currency}</span>
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{financialLabel(o.financialStatus)}</span>
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                      <span>{new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>

                  {o.tracking?.url ? (
                    <a
                      href={o.tracking.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                    >
                      <Package className="h-3.5 w-3.5" /> Suivre le colis
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <p className="text-center text-[11px] text-muted-foreground/60">
                      {i === 0 ? 'Pas encore de suivi' : ''}
                    </p>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
      )}
    </div>
  )
}
