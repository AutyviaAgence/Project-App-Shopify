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

/** Traduit le statut de livraison Shopify en libellé FR lisible. */
function fulfillmentLabel(s: string | null): { label: string; color: string } {
  switch (s) {
    case 'FULFILLED': return { label: 'Expédiée', color: 'text-green-600 bg-green-500/10' }
    case 'PARTIALLY_FULFILLED': return { label: 'Partielle', color: 'text-amber-600 bg-amber-500/10' }
    case 'UNFULFILLED': return { label: 'En préparation', color: 'text-blue-600 bg-blue-500/10' }
    default: return { label: s || '—', color: 'text-muted-foreground bg-muted' }
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
      <div className="space-y-3 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !data || data.orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune commande trouvée pour ce client.
          </p>
        ) : (
          data.orders.map((o) => {
            const fl = fulfillmentLabel(o.fulfillmentStatus)
            return (
              <div key={o.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{o.name}</span>
                  <span className="text-sm font-semibold">{o.total} {o.currency}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${fl.color}`}>{fl.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                {o.tracking?.url && (
                  <a
                    href={o.tracking.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Package className="h-3 w-3" /> Suivre le colis
                    <ExternalLink className="h-3 w-3" />
                  </a>
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
