import { Suspense } from 'react'
import ShopifyEmbeddedClient from './client'

/**
 * Page embedded affichée dans l'admin Shopify (iframe).
 * Statut de l'intégration + connexion de la boutique + état de l'agent.
 */
export default function ShopifyEmbeddedPage() {
  // Composant SERVEUR : pas d'accès au dictionnaire client. On met l'anglais,
  // langue par défaut de la vue embedded (cf. STRINGS dans client.tsx) — un
  // « Chargement… » français s'affichait à tout reviewer anglophone.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ShopifyEmbeddedClient />
    </Suspense>
  )
}
