'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SHOPIFY_APP_STORE_URL } from '@/lib/shopify/app-store'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Loader2, Store, RefreshCw, Check, X, Trash2, Info, ExternalLink, AlertTriangle } from 'lucide-react'
import { track } from '@/lib/posthog/events'

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
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  // Boutique déjà rattachée à un AUTRE compte (409) → bannière persistante.
  const [shopTaken, setShopTaken] = useState<string | null>(null)

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

  /** Lien direct depuis CETTE session (boutique déjà installée et libre). */
  async function tryDirectConnect(shop: string): Promise<'linked' | 'not_installed' | 'taken' | 'error'> {
    try {
      const res = await fetch('/api/shopify/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop }),
      })
      if (res.ok || res.status === 207) { setShopTaken(null); return 'linked' }
      if (res.status === 404) return 'not_installed'
      // 409 : boutique déjà liée à un autre compte → bannière persistante.
      if (res.status === 409) {
        setShopTaken(shop)
        localStorage.removeItem('onb_pending_shop')
        return 'taken'
      }
      const j = await res.json().catch(() => ({}))
      toast.error(j.error || 'Impossible de lier la boutique')
      return 'error'
    } catch {
      return 'error'
    }
  }

  // Boutiques installées mais rattachées à aucun compte (cf. orphan-stores).
  const [orphans, setOrphans] = useState<{ shop_domain: string; shop_name: string | null }[]>([])
  const [linking, setLinking] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/shopify/store-status')
      const json = await res.json()
      if (res.ok && json.data) setStatus(json.data)

      // Pas de boutique liée ? Peut-être une orpheline à proposer.
      if (!json.data?.connected) {
        const o = await fetch('/api/shopify/orphan-stores').then((r) => r.json()).catch(() => null)
        setOrphans(o?.data?.stores || [])
      } else {
        setOrphans([])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  /** Relie une boutique orpheline au compte connecté (connect refuse un 409 si prise). */
  async function linkOrphan(shop: string) {
    setLinking(true)
    try {
      const r = await tryDirectConnect(shop)
      if (r === 'linked') {
        await fetchStatus()
        toast.success('Boutique reliée ✓')
      } else if (r === 'taken') {
        toast.error('Cette boutique est déjà liée à un autre compte.')
      } else if (r === 'not_installed') {
        toast.error('Boutique introuvable — réinstallez l’application.')
      }
    } finally {
      setLinking(false)
    }
  }

  useEffect(() => { fetchStatus() }, [fetchStatus])

  // Reprise post-OAuth : si une boutique est en attente (installée pendant
  // l'OAuth mais lien perdu en route), on la lie depuis CETTE session.
  useEffect(() => {
    if (loading || status?.connected) return
    const pending = typeof window !== 'undefined' ? localStorage.getItem('onb_pending_shop') : null
    if (!pending) return
    ;(async () => {
      const r = await tryDirectConnect(pending)
      if (r === 'linked') {
        localStorage.removeItem('onb_pending_shop')
        await fetchStatus()
        toast.success('Boutique connectée ✓')
      } else if (r === 'not_installed') {
        localStorage.removeItem('onb_pending_shop') // install jamais aboutie : on ne boucle pas
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, status?.connected])

  // Tracke la connexion Shopify une seule fois (quand le statut passe à connecté).
  useEffect(() => {
    if (status?.connected && typeof window !== 'undefined') {
      const key = 'xeyo_ph_shopify_' + (status.shop_domain || '1')
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        track('shopify_connected', { shop: status.shop_domain || undefined })
      }
    }
  }, [status?.connected, status?.shop_domain])

  async function resync() {
    setResyncing(true)
    try {
      const res = await fetch('/api/shopify/resync', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await fetchStatus()
      const n = json.data?.processed ?? 0
      toast.success(n > 0 ? 'Boutique resynchronisée, informations mises à jour.' : 'Déjà à jour, rien à resynchroniser.')
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
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/15">
              <Store className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">Boutique Shopify</span>
                <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-600">Connectée</span>
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
          <span className="flex items-center gap-1">Pages {status.has_pages ? <Check className="h-3 w-3 text-blue-600" /> : <X className="h-3 w-3 text-muted-foreground/50" />}</span>
          <span className="flex items-center gap-1">Politiques {status.has_policies ? <Check className="h-3 w-3 text-blue-600" /> : <X className="h-3 w-3 text-muted-foreground/50" />}</span>
          {/* `ml-auto` seulement à partir de sm : en mobile il poussait la date
              hors de la carte au lieu de la laisser passer à la ligne. */}
          <span className="sm:ml-auto">Dernière synchro : {last}</span>
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
  //
  // `h-full flex-col` : même hauteur que la carte WhatsApp voisine (alignées sur
  // la plus grande dans la grille). Le bloc bouton+légende plus bas porte
  // `mt-auto` pour que les deux boutons tombent sur la même ligne.
  return (
    <div className="flex h-full flex-col rounded-xl border p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Store className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Connectez votre boutique Shopify</p>
          <p className="text-sm text-muted-foreground">L&apos;agent IA répond avec votre catalogue, vos FAQ et vos politiques.</p>
        </div>
      </div>
      {/* Boutique déjà rattachée à un autre compte Xeyo (sécurité) */}
      {shopTaken && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="space-y-1">
            <p className="font-medium text-red-600 dark:text-red-400">Cette boutique est déjà connectée à un autre compte</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{shopTaken}</span> est rattachée à un autre compte Xeyo.
              Une boutique ne peut être liée qu&apos;à un seul compte. Connectez-vous avec le compte propriétaire,
              ou demandez-lui de la déconnecter avant de la relier ici.
            </p>
          </div>
        </div>
      )}
      {/*
        Boutique DÉJÀ INSTALLÉE mais rattachée à aucun compte (user_id NULL).

        Le managed install la provisionne (token exchange), mais on ne peut pas
        deviner à quel compte Xeyo elle appartient : `shop.email` est une donnée
        client protégée que Shopify ne renvoie qu'après approbation *Protected
        Customer Data*. L'attribuer automatiquement reviendrait à laisser le premier
        venu s'approprier la boutique d'un autre marchand — on la PROPOSE donc, et
        c'est le marchand connecté qui la relie explicitement.
      */}
      {orphans.length > 0 && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium">Boutique installée, en attente de liaison</p>
          {orphans.map((o) => (
            <div key={o.shop_domain} className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-muted-foreground">{o.shop_name || o.shop_domain}</span>
              <Button size="sm" disabled={linking} onClick={() => linkOrphan(o.shop_domain)}>
                {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Relier à mon compte'}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/*
        ⚠️ Exigence App Store 2.3.1 : PAS de champ de saisie du domaine
        `.myshopify.com`. L'installation part de la fiche App Store ; Shopify
        identifie la boutique et nous la renvoie via OAuth. Ne jamais
        réintroduire de saisie manuelle ici — c'est un motif de rejet.
      */}
      {/* `mt-auto` colle le bouton au bas → aligné avec celui de la carte WhatsApp. */}
      <div className="mt-auto space-y-2">
        <a
          href={SHOPIFY_APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Store className="h-4 w-4" />
          Installer depuis le Shopify App Store
        </a>
        <p className="text-[11px] text-muted-foreground">
          Shopify vous demandera d’autoriser l’accès, puis vous ramènera ici. Cette page se mettra à jour automatiquement.
        </p>
      </div>
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
