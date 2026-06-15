'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Store, RefreshCw, Check, X } from 'lucide-react'

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
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground" disabled={resyncing} onClick={resync} title="Resynchroniser les informations de la boutique">
            {resyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {/* Détail synchro */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          <span>{status.products_synced != null ? `${status.products_synced} produit${status.products_synced > 1 ? 's' : ''}` : 'Catalogue'}</span>
          <span className="flex items-center gap-1">Pages {status.has_pages ? <Check className="h-3 w-3 text-green-600" /> : <X className="h-3 w-3 text-muted-foreground/50" />}</span>
          <span className="flex items-center gap-1">Politiques {status.has_policies ? <Check className="h-3 w-3 text-green-600" /> : <X className="h-3 w-3 text-muted-foreground/50" />}</span>
          <span className="ml-auto">Dernière synchro : {last}</span>
        </div>
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
