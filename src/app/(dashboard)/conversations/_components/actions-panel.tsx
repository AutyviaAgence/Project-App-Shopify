'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
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

// Options envoyées au serveur à la validation d'un remboursement.
type RefundOptions = {
  reason?: string
  amount?: number
  method?: 'original' | 'store_credit' | 'both'
  storeCreditAmount?: number
}

const REFUND_REASONS = [
  'Produit défectueux',
  'Erreur de commande',
  'Article non reçu',
  'Geste commercial',
  'Autre',
]

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
  // Action de remboursement en cours de configuration (formulaire).
  const [refundAction, setRefundAction] = useState<Action | null>(null)

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch(`/api/shopify/actions?status=pending&conversation_id=${conversationId}`)
      const json = await res.json()
      if (res.ok) setActions(json.data || [])
    } catch { /* silencieux */ }
  }, [conversationId])

  useEffect(() => { fetchActions() }, [fetchActions])

  async function decide(id: string, decision: 'confirm' | 'reject', refund?: RefundOptions) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/shopify/actions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, refund }),
      })
      const json = await res.json()
      if (!res.ok && !json.data) throw new Error(json.error || 'Erreur')
      await fetchActions()
      onChange?.()
      if (decision === 'reject') toast.success('Action refusée')
      else if (json.data?.status === 'executed') toast.success('Remboursement effectué sur Shopify')
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
                <Button
                  size="sm"
                  disabled={busyId === a.id}
                  onClick={() => {
                    // Remboursement → formulaire (motif/montant/méthode). Autres → direct.
                    if (a.action_type === 'refund_order') setRefundAction(a)
                    else decide(a.id, 'confirm')
                  }}
                >
                  {busyId === a.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                  Confirmer
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Formulaire de remboursement (motif + montant + méthode).
          key={id} : remonte le formulaire à chaque action → état initial propre
          sans setState dans un effet. */}
      {refundAction && (
        <RefundDialog
          key={refundAction.id}
          action={refundAction}
          busy={busyId === refundAction.id}
          onClose={() => setRefundAction(null)}
          onConfirm={async (opts) => {
            await decide(refundAction.id, 'confirm', opts)
            setRefundAction(null)
          }}
        />
      )}
    </div>
  )
}

/** Formulaire de validation d'un remboursement : motif, montant, méthode.
 *  Monté avec key={action.id} → état initialisé une fois par action. */
function RefundDialog({
  action, busy, onClose, onConfirm,
}: {
  action: Action
  busy: boolean
  onClose: () => void
  onConfirm: (opts: RefundOptions) => void
}) {
  const estimated = action.payload.amount_estimated != null ? Number(action.payload.amount_estimated) : undefined
  const currency = String(action.payload.currency || '')

  const [reasonChoice, setReasonChoice] = useState(REFUND_REASONS[0])
  const [reasonCustom, setReasonCustom] = useState('')
  const [amount, setAmount] = useState<string>(estimated != null ? String(estimated) : '')
  const [method, setMethod] = useState<'original' | 'store_credit' | 'both'>('original')
  const [storeCredit, setStoreCredit] = useState<string>('')

  const amountNum = Number(amount)
  const scNum = Number(storeCredit)
  const amountValid = amount !== '' && !isNaN(amountNum) && amountNum > 0 && (estimated == null || amountNum <= estimated + 0.001)
  const scValid = method !== 'both' || (storeCredit !== '' && !isNaN(scNum) && scNum > 0 && scNum <= amountNum)
  const reason = reasonChoice === 'Autre' ? reasonCustom.trim() : reasonChoice
  const canConfirm = amountValid && scValid && reason.length > 0 && !busy

  return (
    <Dialog open={!!action} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-amber-500" /> Rembourser {String(action.payload.order_name || '')}
          </DialogTitle>
          <DialogDescription>
            Vérifiez le motif, le montant et la méthode avant de rembourser. Cette action est définitive côté Shopify.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Motif */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Motif</label>
            <select
              value={reasonChoice}
              onChange={(e) => setReasonChoice(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {REFUND_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {reasonChoice === 'Autre' && (
              <input
                value={reasonCustom}
                onChange={(e) => setReasonCustom(e.target.value)}
                placeholder="Précisez le motif…"
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            )}
          </div>

          {/* Montant */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Montant à rembourser {currency && <span className="text-muted-foreground">({currency})</span>}</label>
            <input
              type="number" step="0.01" min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {estimated != null && (
              <p className="text-xs text-muted-foreground">Remboursable : {estimated.toFixed(2)} {currency}</p>
            )}
            {!amountValid && amount !== '' && (
              <p className="text-xs text-rose-500">Le montant doit être &gt; 0 et ≤ {estimated?.toFixed(2) ?? '—'} {currency}.</p>
            )}
          </div>

          {/* Méthode */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Méthode de remboursement</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['original', 'Moyen initial'],
                ['store_credit', 'Crédit magasin'],
                ['both', 'Les deux'],
              ] as ['original' | 'store_credit' | 'both', string][]).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMethod(v)}
                  className={cn(
                    'rounded-md border px-2 py-2 text-xs font-medium transition-colors',
                    method === v ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {method === 'both' && (
              <div className="mt-1 space-y-1">
                <label className="text-xs text-muted-foreground">Dont en crédit magasin (le reste sur le moyen initial)</label>
                <input
                  type="number" step="0.01" min="0"
                  value={storeCredit}
                  onChange={(e) => setStoreCredit(e.target.value)}
                  placeholder={`ex : ${(amountNum / 2 || 0).toFixed(2)}`}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                {!scValid && storeCredit !== '' && (
                  <p className="text-xs text-rose-500">La part en crédit doit être &gt; 0 et ≤ {amount || '—'}.</p>
                )}
              </div>
            )}
            {method === 'store_credit' && (
              <p className="text-xs text-muted-foreground">Le client sera crédité d’un avoir utilisable sur la boutique (nécessite le crédit magasin activé sur Shopify).</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
            <Button
              disabled={!canConfirm}
              onClick={() => onConfirm({
                reason,
                amount: amountNum,
                method,
                storeCreditAmount: method === 'both' ? scNum : undefined,
              })}
            >
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              Rembourser
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
