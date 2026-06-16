'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Loader2, Store, RefreshCw, Check, X, Trash2, Info, ExternalLink } from 'lucide-react'

/** Normalise une saisie en domaine xxx.myshopify.com (accepte URL, nom seul, etc.). */
function normalizeShopDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase()
  if (!s) return null
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '') // retire protocole + chemin
  if (!s.includes('.')) s = `${s}.myshopify.com`         // "maboutique" → "maboutique.myshopify.com"
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : null
}

type StoreStatus = {
  connected: boolean
  shop_name?: string | null
  shop_domain?: string | null
  last_synced_at?: string | null
  products_synced?: number | null
  has_pages?: boolean
  has_policies?: boolean
  context?: {
    name?: string | null
    currency?: string | null
    country?: string | null
    links?: { label: string; url: string }[]
  }
}

/**
 * Carte de connexion Boutique Shopify (Dashboard). Affiche le statut, le détail
 * de la synchro (catalogue/pages/politiques) et un bouton « Resynchroniser ».
 */
export function ShopifyConnect() {
  const [status, setStatus] = useState<StoreStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [resyncing, setResyncing] = useState(false)
  const [shopInput, setShopInput] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  async function disconnect() {
    setDisconnecting(true)
    try {
      const res = await fetch('/api/shopify/disconnect', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setConfirmDisconnect(false)
      await fetchStatus()
      toast.success('Boutique déconnectée.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setDisconnecting(false)
    }
  }

  function startInstall() {
    const domain = normalizeShopDomain(shopInput)
    if (!domain) {
      toast.error('Entrez un domaine valide, ex : maboutique.myshopify.com')
      return
    }
    // Lance l'OAuth Shopify. Au retour, le callback redirige vers /shopify avec
    // autolink → la boutique se lie automatiquement au compte connecté.
    window.location.href = `/api/shopify/install?shop=${encodeURIComponent(domain)}`
  }

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/shopify/store-status')
      const json = await res.json()
      if (res.ok && json.data) setStatus(json.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  async function resync() {
    setResyncing(true)
    try {
      const res = await fetch('/api/shopify/resync', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await fetchStatus()
      const n = json.data?.processed ?? 0
      toast.success(n > 0 ? 'Boutique resynchronisée — informations mises à jour.' : 'Déjà à jour, rien à resynchroniser.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setResyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    )
  }

  // Connecté
  if (status?.connected) {
    const last = status.last_synced_at
      ? new Date(status.last_synced_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '—'
    return (
      <div className="rounded-xl border p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15">
              <Store className="h-5 w-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">Boutique Shopify</span>
                <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-600">Connectée</span>
              </div>
              <p className="text-sm text-muted-foreground truncate">{status.shop_name || status.shop_domain}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => setDetailOpen(true)} title="Voir le détail des informations récupérées">
              <Info className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" disabled={resyncing} onClick={resync} title="Resynchroniser les informations de la boutique">
              {resyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="text-destructive" disabled={disconnecting} onClick={() => setConfirmDisconnect(true)} title="Déconnecter la boutique">
              {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Détail synchro */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          <span>{status.products_synced != null ? `${status.products_synced} produit${status.products_synced > 1 ? 's' : ''}` : 'Catalogue'}</span>
          <span className="flex items-center gap-1">Pages {status.has_pages ? <Check className="h-3 w-3 text-green-600" /> : <X className="h-3 w-3 text-muted-foreground/50" />}</span>
          <span className="flex items-center gap-1">Politiques {status.has_policies ? <Check className="h-3 w-3 text-green-600" /> : <X className="h-3 w-3 text-muted-foreground/50" />}</span>
          <span className="ml-auto">Dernière synchro : {last}</span>
          <button onClick={() => setDetailOpen(true)} className="basis-full text-left text-blue-500 hover:text-blue-600 transition-colors">
            Voir le détail récupéré →
          </button>
        </div>

        {/* Détail des informations récupérées */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Informations récupérées</DialogTitle>
              <DialogDescription>Ce que l&apos;agent IA connaît de votre boutique.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Info_Item label="Boutique" value={status.context?.name || status.shop_name || '—'} />
                <Info_Item label="Domaine" value={status.shop_domain || '—'} />
                <Info_Item label="Devise" value={status.context?.currency || '—'} />
                <Info_Item label="Pays" value={status.context?.country || '—'} />
                <Info_Item label="Produits synchronisés" value={status.products_synced != null ? String(status.products_synced) : '—'} />
                <Info_Item label="Dernière synchro" value={last} />
              </div>

              {/* Liens des pages & politiques injectés à l'agent */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Pages & politiques</p>
                {status.context?.links && status.context.links.length > 0 ? (
                  <div className="space-y-1">
                    {status.context.links.map((lnk, i) => (
                      <a key={`${lnk.url}-${i}`} href={lnk.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors">
                        <span className="truncate">{lnk.label}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Aucun lien détecté. Resynchronisez si vous avez ajouté des pages ou politiques.
                  </p>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground border-t pt-3">
                Le catalogue, les pages et les politiques sont injectés automatiquement dans tous vos agents.
                Pour vérifier, demandez à un agent (ex : « Quelle est ta politique de retour ? »).
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Confirmation de déconnexion */}
        <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Déconnecter la boutique ?</AlertDialogTitle>
              <AlertDialogDescription>
                Le lien avec <strong>{status.shop_name || status.shop_domain}</strong> sera retiré, ainsi que les informations
                synchronisées (catalogue, pages, politiques) de cette boutique. Votre agent IA et vos documents ajoutés à la
                main sont conservés. Vous pourrez ensuite connecter une autre boutique.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={disconnecting}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={disconnecting}
                onClick={(e) => { e.preventDefault(); disconnect() }}
              >
                {disconnecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Déconnecter
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // Pas connecté
  return (
    <div className="rounded-xl border p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Store className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Connectez votre boutique Shopify</p>
          <p className="text-sm text-muted-foreground">L&apos;agent IA répond avec votre catalogue, vos FAQ et vos politiques.</p>
        </div>
      </div>
      {/* Saisie du domaine → lance l'OAuth Shopify, puis liaison auto au compte. */}
      <div className="flex gap-2">
        <Input
          value={shopInput}
          onChange={(e) => setShopInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') startInstall() }}
          placeholder="maboutique.myshopify.com"
          className="h-9"
        />
        <Button onClick={startInstall} className="shrink-0">
          <Store className="mr-1 h-4 w-4" /> Connecter
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Entrez l&apos;adresse de votre boutique (xxx.myshopify.com). Vous serez redirigé vers Shopify pour autoriser l&apos;accès.
      </p>
    </div>
  )
}

/** Petite cellule label/valeur pour la modale de détail. */
function Info_Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  )
}
