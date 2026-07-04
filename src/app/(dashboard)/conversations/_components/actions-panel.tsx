'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2, Check, X, RotateCcw, Ban, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

type Action = {
  id: string
  conversation_id: string | null
  action_type: 'cancel_order' | 'refund_order' | 'create_discount'
  payload: Record<string, unknown>
  summary: string | null
  status: 'pending' | 'confirmed' | 'rejected' | 'executed' | 'failed'
  error_message: string | null
  created_at: string
}

const TYPE_META: Record<Action['action_type'], { label: string; icon: typeof Ban; cls: string }> = {
  cancel_order: { label: 'Annulation de commande', icon: Ban, cls: 'text-red-500' },
  refund_order: { label: 'Remboursement', icon: RotateCcw, cls: 'text-amber-500' },
  create_discount: { label: 'Code de réduction', icon: Tag, cls: 'text-green-600' },
}

/**
 * Panneau des actions Shopify EN ATTENTE pour une conversation donnée.
 * Affiché en haut du fil de discussion. Permet de valider/refuser directement.
 * onChange est appelé après une décision (pour rafraîchir badges/tri).
 */
export function ActionsPanel({ conversationId, onChange }: { conversationId: string; onChange?: () => void }) {
  const [actions, setActions] = useState<Action[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch(`/api/shopify/actions?status=pending&conversation_id=${conversationId}`)
      const json = await res.json()
      if (res.ok) setActions(json.data || [])
    } catch { /* silencieux */ }
  }, [conversationId])

  useEffect(() => { fetchActions() }, [fetchActions])

  async function decide(id: string, decision: 'confirm' | 'reject') {
    setBusyId(id)
    try {
      const res = await fetch(`/api/shopify/actions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const json = await res.json()
      if (!res.ok && !json.data) throw new Error(json.error || 'Erreur')
      await fetchActions()
      onChange?.()
      if (decision === 'reject') toast.success('Action refusée')
      else if (json.data?.status === 'executed') toast.success('Action exécutée sur Shopify')
      else toast.error(json.error || 'Échec de l\'exécution')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusyId(null)
    }
  }

  if (actions.length === 0) return null

  return (
    <div className="border-b bg-amber-500/5 px-4 py-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600">
        <Ban className="h-3.5 w-3.5" /> Action{actions.length > 1 ? 's' : ''} à valider
      </p>
      <div className="space-y-2">
        {actions.map((a) => {
          const meta = TYPE_META[a.action_type]
          const Icon = meta.icon
          return (
            <div key={a.id} className="flex items-start justify-between gap-3 rounded-xl border bg-card p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Icon className={cn('h-4 w-4', meta.cls)} />
                  <span className="text-sm font-medium">{meta.label}</span>
                  {a.action_type === 'refund_order' && a.payload.amount_estimated != null && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600">
                      {Number(a.payload.amount_estimated).toFixed(2)} {String(a.payload.currency || '')}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{a.summary || JSON.stringify(a.payload)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => decide(a.id, 'reject')}>
                  <X className="mr-1 h-4 w-4" />Refuser
                </Button>
                <Button size="sm" disabled={busyId === a.id} onClick={() => decide(a.id, 'confirm')}>
                  {busyId === a.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                  Confirmer
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
