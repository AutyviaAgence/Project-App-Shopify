import { Suspense } from 'react'
import ShopifyEmbeddedClient from './client'

/**
 * Page embedded affichée dans l'admin Shopify (iframe).
 * Statut de l'intégration + connexion de la boutique + état de l'agent.
 */
export default function ShopifyEmbeddedPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Chargement…</div>}>
      <ShopifyEmbeddedClient />
    </Suspense>
  )
}
