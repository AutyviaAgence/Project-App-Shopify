'use client'

import { useEffect, useState } from 'react'
import { ShoppingBag, Package, ExternalLink, Loader2 } from 'lucide-react'

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

/**
 * Panneau de contexte Shopify : affiche les commandes récentes du client
 * à côté de la conversation (le moat helpdesk e-commerce).
 */
export function ShopifyContextPanel({ contactId }: { contactId: string | null }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!contactId) { setData(null); return }
    setLoading(true)
    fetch(`/api/shopify/orders?contact_id=${contactId}`)
      .then((r) => r.json())
      .then((j) => setData(j.data || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [contactId])

  if (!contactId) return null
  // Boutique non connectée → on n'affiche pas le panneau
  if (data && !data.connected) return null

  return (
    <div className="hidden w-72 shrink-0 border-l bg-background xl:block">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <ShoppingBag className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Commandes Shopify</span>
      </div>

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
    </div>
  )
}
