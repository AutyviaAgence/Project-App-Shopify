'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2, Check, X, ShoppingBag, RotateCcw, Ban, Tag, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlobLoaderScreen } from '@/components/blob-loader'

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

const STATUS_META: Record<Action['status'], { label: string; cls: string }> = {
  pending: { label: 'À valider', cls: 'bg-amber-500/15 text-amber-500' },
  confirmed: { label: 'Confirmée', cls: 'bg-blue-500/15 text-blue-500' },
  executed: { label: 'Exécutée', cls: 'bg-green-500/15 text-green-600' },
  rejected: { label: 'Refusée', cls: 'bg-muted text-muted-foreground' },
  failed: { label: 'Échec', cls: 'bg-red-500/15 text-red-500' },
}

export default function ActionsPage() {
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'all'>('pending')

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch(`/api/shopify/actions${tab === 'pending' ? '?status=pending' : ''}`)
      const json = await res.json()
      if (res.ok) setActions(json.data || [])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { setLoading(true); fetchActions() }, [fetchActions])

  async function decide(id: string, decision: 'confirm' | 'reject') {
    setBusyId(id)
    try {
      const res = await fetch(`/api/shopify/actions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const json = await res.json()
      if (!res.ok && !json.data) throw new Error(json.error || 'Erreur')
      await fetchActions()
      if (decision === 'reject') toast.success('Action refusée')
      else if (json.data?.status === 'executed') toast.success('Action exécutée sur Shopify')
      else toast.error(json.error || 'Échec de l\'exécution')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <BlobLoaderScreen />

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ShoppingBag className="h-5 w-5" /> Actions Shopify
        </h1>
        <p className="text-sm text-muted-foreground">
          Les actions proposées par l&apos;agent IA. Validez-les pour qu&apos;elles soient exécutées sur votre boutique.
        </p>
      </div>

      <div className="flex gap-2">
        {(['pending', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn('rounded-lg px-3 py-1.5 text-sm', tab === t ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted')}
          >
            {t === 'pending' ? 'À valider' : 'Tout l\'historique'}
          </button>
        ))}
      </div>

      {actions.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          <Clock className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">{tab === 'pending' ? 'Aucune action en attente.' : 'Aucune action.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((a) => {
            const meta = TYPE_META[a.action_type]
            const st = STATUS_META[a.status]
            const Icon = meta.icon
            return (
              <div key={a.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icon className={cn('h-4 w-4', meta.cls)} />
                      <span className="text-sm font-medium">{meta.label}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs', st.cls)}>{st.label}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">{a.summary || JSON.stringify(a.payload)}</p>
                    {a.status === 'failed' && a.error_message && (
                      <p className="mt-1 text-xs text-red-500">Erreur : {a.error_message}</p>
                    )}
                  </div>
                  {a.status === 'pending' && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => decide(a.id, 'reject')}>
                        <X className="mr-1 h-4 w-4" />Refuser
                      </Button>
                      <Button size="sm" disabled={busyId === a.id} onClick={() => decide(a.id, 'confirm')}>
                        {busyId === a.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                        Confirmer
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
