'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
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
import { useTranslation } from '@/i18n/context'

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
  const { t } = useTranslation()
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
      if (!res.ok) throw new Error(json.error || t('components.error'))
      setConfirmDisconnect(false)
      await fetchStatus()
      toast.success(t('components.shopify_toast_disconnected'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('components.error'))
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
      toast.error(j.error || t('components.shopify_toast_link_err'))
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
        toast.success(t('components.shopify_toast_linked'))
      } else if (r === 'taken') {
        toast.error(t('components.shopify_toast_taken'))
      } else if (r === 'not_installed') {
        toast.error(t('components.shopify_toast_not_installed'))
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
        toast.success(t('components.shopify_toast_connected'))
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
      if (!res.ok) throw new Error(json.error || t('components.error'))
      await fetchStatus()
      const n = json.data?.processed ?? 0
      toast.success(n > 0 ? t('components.shopify_toast_resynced') : t('components.shopify_toast_already_synced'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('components.error'))
    } finally {
      setResyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('components.loading')}
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
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
              <Image src="/brand/shopify-logo.png" alt="Shopify" width={26} height={26} className="h-[26px] w-[26px]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t('components.shopify_store')}</span>
                <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-600">{t('components.shopify_connected')}</span>
              </div>
              <p className="text-sm text-muted-foreground truncate">{status.shop_name || status.shop_domain}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => setDetailOpen(true)} title={t('components.shopify_view_detail_title')}>
              <Info className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" disabled={resyncing} onClick={resync} title={t('components.shopify_resync_title')}>
              {resyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="text-destructive" disabled={disconnecting} onClick={() => setConfirmDisconnect(true)} title={t('components.shopify_disconnect_title')}>
              {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Détail synchro */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          <span>{status.products_synced != null ? t('components.shopify_products', { count: status.products_synced, plural: status.products_synced > 1 ? 's' : '' }) : t('components.shopify_catalog')}</span>
          <span className="flex items-center gap-1">{t('components.shopify_pages')} {status.has_pages ? <Check className="h-3 w-3 text-blue-600" /> : <X className="h-3 w-3 text-muted-foreground/50" />}</span>
          <span className="flex items-center gap-1">{t('components.shopify_policies')} {status.has_policies ? <Check className="h-3 w-3 text-blue-600" /> : <X className="h-3 w-3 text-muted-foreground/50" />}</span>
          {/* `ml-auto` seulement à partir de sm : en mobile il poussait la date
              hors de la carte au lieu de la laisser passer à la ligne. */}
          <span className="sm:ml-auto">{t('components.shopify_last_sync', { date: last })}</span>
          <button onClick={() => setDetailOpen(true)} className="basis-full text-left text-blue-500 hover:text-blue-600 transition-colors">
            {t('components.shopify_view_detail')}
          </button>
        </div>

        {/* Détail des informations récupérées */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>{t('components.shopify_detail_title')}</DialogTitle>
              <DialogDescription>{t('components.shopify_detail_desc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Info_Item label={t('components.shopify_field_store')} value={status.context?.name || status.shop_name || '—'} />
                <Info_Item label={t('components.shopify_field_domain')} value={status.shop_domain || '—'} />
                <Info_Item label={t('components.shopify_field_currency')} value={status.context?.currency || '—'} />
                <Info_Item label={t('components.shopify_field_country')} value={status.context?.country || '—'} />
                <Info_Item label={t('components.shopify_field_products_synced')} value={status.products_synced != null ? String(status.products_synced) : '—'} />
                <Info_Item label={t('components.shopify_field_last_sync')} value={last} />
              </div>

              {/* Liens des pages & politiques injectés à l'agent */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('components.shopify_pages_policies')}</p>
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
                    {t('components.shopify_no_links')}
                  </p>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground border-t pt-3">
                {t('components.shopify_injected_note')}
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Confirmation de déconnexion */}
        <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('components.shopify_disconnect_q')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('components.shopify_disconnect_confirm_desc', { store: status.shop_name || status.shop_domain || '' })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={disconnecting}>{t('components.whatsapp_cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={disconnecting}
                onClick={(e) => { e.preventDefault(); disconnect() }}
              >
                {disconnecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                {t('components.shopify_disconnect_action')}
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
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
          <Image src="/brand/shopify-logo.png" alt="Shopify" width={26} height={26} className="h-[26px] w-[26px]" />
        </div>
        <div>
          <p className="font-medium">{t('components.shopify_connect_title')}</p>
          <p className="text-sm text-muted-foreground">{t('components.shopify_connect_desc')}</p>
        </div>
      </div>
      {/* Boutique déjà rattachée à un autre compte Xeyo (sécurité) */}
      {shopTaken && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="space-y-1">
            <p className="font-medium text-red-600 dark:text-red-400">{t('components.shopify_shop_taken_title')}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{shopTaken}</span> {t('components.shopify_shop_taken_desc_1')}
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
          <p className="text-sm font-medium">{t('components.shopify_orphan_title')}</p>
          {orphans.map((o) => (
            <div key={o.shop_domain} className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-muted-foreground">{o.shop_name || o.shop_domain}</span>
              <Button size="sm" disabled={linking} onClick={() => linkOrphan(o.shop_domain)}>
                {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : t('components.shopify_link_to_account')}
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
          {t('components.shopify_install_btn')}
        </a>
        <p className="text-[11px] text-muted-foreground">
          {t('components.shopify_install_hint')}
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
