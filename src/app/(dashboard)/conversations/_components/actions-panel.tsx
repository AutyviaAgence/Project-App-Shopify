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
  // ⚠️ Pas de `method` : le remboursement part TOUJOURS sur le moyen de paiement
  // d'origine (exigence App Store 1.1.15). Le serveur le force de toute façon —
  // exposer un choix ici ne ferait que mentir au marchand et à l'acheteur.
  // Message de confirmation à envoyer au client (optionnel).
  notify?: { message: string }
}

const REFUND_REASONS = [
  'Produit défectueux',
  'Erreur de commande',
  'Article non reçu',
  'Geste commercial',
  'Autre',
]

// Détails de la commande affichés dans le formulaire de remboursement.
type OrderDetails = {
  name: string
  currency: string
  total: number
  totalRefunded: number
  refundableAmount: number
  lineItems: { title: string; quantity: number; unitPrice: number }[]
}

function money(v: number, c: string) {
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c || 'EUR' }).format(v) }
  catch { return `${v.toFixed(2)} ${c}` }
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

      // Remboursement réussi + case « prévenir le client » → envoyer le message
      // via l'endpoint de conversation existant (gère fenêtre 24h + persistance).
      if (decision === 'confirm' && json.data?.status === 'executed' && refund?.notify?.message) {
        try {
          const sendRes = await fetch(`/api/conversations/${conversationId}/send`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: refund.notify.message }),
          })
          if (!sendRes.ok) {
            const sj = await sendRes.json().catch(() => ({}))
            toast.warning(`Remboursement fait, mais message non envoyé : ${sj.error || 'hors fenêtre 24h ?'}`)
          } else {
            toast.success('Client prévenu du remboursement')
          }
        } catch {
          toast.warning('Remboursement fait, mais message non envoyé.')
        }
      }

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

  // Détails de la commande, chargés depuis Shopify à l'ouverture.
  const [details, setDetails] = useState<OrderDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(true)

  const [reasonChoice, setReasonChoice] = useState(REFUND_REASONS[0])
  const [reasonCustom, setReasonCustom] = useState('')
  const [amount, setAmount] = useState<string>(estimated != null ? String(estimated) : '')
  // ⚠️ Plus de choix de méthode : le serveur force le remboursement sur le moyen
  // de paiement d'ORIGINE (App Store 1.1.15). Laisser un état ici ne servirait
  // qu'à mentir au marchand et au client.
  // Prévenir le client : case + lien optionnel.
  const [notifyClient, setNotifyClient] = useState(true)
  const [notifyLink, setNotifyLink] = useState('')

  useEffect(() => {
    let active = true
    fetch(`/api/shopify/actions/${action.id}/refundable`)
      .then((r) => r.json())
      .then((j) => {
        if (!active || !j.data) return
        setDetails(j.data)
        // Pré-remplir le montant avec le remboursable si pas déjà saisi.
        setAmount((prev) => (prev === '' ? String(j.data.refundableAmount) : prev))
      })
      .catch(() => {})
      .finally(() => { if (active) setDetailsLoading(false) })
    return () => { active = false }
  }, [action.id])

  // Devise + plafond : depuis les détails Shopify si dispo, sinon l'estimation.
  const currency = details?.currency || String(action.payload.currency || '')
  const maxRefundable = details?.refundableAmount ?? estimated

  const amountNum = Number(amount)
  const amountValid = amount !== '' && !isNaN(amountNum) && amountNum > 0 && (maxRefundable == null || amountNum <= maxRefundable + 0.001)
  const reason = reasonChoice === 'Autre' ? reasonCustom.trim() : reasonChoice
  const canConfirm = amountValid && reason.length > 0 && !busy

  // Message de confirmation envoyé au client (aperçu + envoi si case cochée).
  const orderLabel = String(action.payload.order_name || '').replace(/^#?/, '#')
  // Le remboursement part TOUJOURS sur le moyen d'origine : le message doit dire
  // la vérité. Il annonçait auparavant « en crédit magasin » alors que le serveur
  // remboursait la carte — une promesse fausse faite à l'acheteur.
  const notifyMessage = [
    `Bonjour, votre remboursement de ${amountValid ? money(amountNum, currency) : '—'} pour la commande ${orderLabel} a bien été effectué sur votre moyen de paiement.`,
    notifyLink.trim() ? `\nDétails : ${notifyLink.trim()}` : '',
    `\nMerci pour votre confiance !`,
  ].join('')

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

        {/* Détails de la commande (Shopify) */}
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          {detailsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement de la commande…
            </div>
          ) : details ? (
            <div className="space-y-1.5">
              <div className="flex justify-between"><span className="text-muted-foreground">Total commande</span><span className="font-medium">{money(details.total, details.currency)}</span></div>
              {details.totalRefunded > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Déjà remboursé</span><span className="font-medium text-amber-600">− {money(details.totalRefunded, details.currency)}</span></div>
              )}
              <div className="flex justify-between border-t pt-1.5"><span className="text-muted-foreground">Remboursable</span><span className="font-semibold text-emerald-600">{money(details.refundableAmount, details.currency)}</span></div>
              {details.lineItems.length > 0 && (
                <div className="mt-2 space-y-0.5 border-t pt-2">
                  {details.lineItems.map((li, i) => (
                    <div key={i} className="flex justify-between text-xs text-muted-foreground">
                      <span className="truncate">{li.quantity}× {li.title}</span>
                      <span className="shrink-0">{money(li.unitPrice * li.quantity, details.currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Détails de la commande indisponibles.</p>
          )}
        </div>

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
            {maxRefundable != null && (
              <p className="text-xs text-muted-foreground">Remboursable : {maxRefundable.toFixed(2)} {currency}</p>
            )}
            {!amountValid && amount !== '' && (
              <p className="text-xs text-rose-500">Le montant doit être &gt; 0 et ≤ {maxRefundable?.toFixed(2) ?? '—'} {currency}.</p>
            )}
          </div>

          {/* Méthode */}
          {/*
            Le choix de la méthode (crédit magasin / mixte) a été retiré : l'exigence
            App Store 1.1.15 impose que tout remboursement retourne sur le moyen de
            paiement d'origine. Le serveur force `original` de toute façon — laisser
            le choix ici ne ferait que mentir au marchand.
          */}
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Le remboursement est effectué sur le <strong className="text-foreground">moyen de paiement d’origine</strong> du client.
          </p>

          {/* Prévenir le client */}
          <div className="space-y-2 rounded-lg border p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={notifyClient}
                onChange={(e) => setNotifyClient(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Prévenir le client du remboursement
            </label>
            {notifyClient && (
              <div className="space-y-2">
                <input
                  value={notifyLink}
                  onChange={(e) => setNotifyLink(e.target.value)}
                  placeholder="Lien à joindre (optionnel), ex : suivi, politique…"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground whitespace-pre-line">
                  {notifyMessage}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
            <Button
              disabled={!canConfirm}
              onClick={() => onConfirm({
                reason,
                amount: amountNum,
                // Pas de `method` : le serveur rembourse toujours sur le moyen
                // d'origine (App Store 1.1.15). L'envoyer serait un leurre.
                notify: notifyClient ? { message: notifyMessage } : undefined,
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
