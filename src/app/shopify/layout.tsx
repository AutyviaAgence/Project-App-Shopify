import Script from 'next/script'

/**
 * Layout des pages EMBEDDED (admin Shopify).
 *
 * Injecte App Bridge v4, requis par Shopify pour toute app embarquée :
 *  - fournit `shopify.idToken()` → le SESSION TOKEN envoyé aux routes API
 *    (l'iframe n'a pas de cookie : c'est la seule identité disponible) ;
 *  - gère la navigation dans l'admin (plus d'échappement d'iframe).
 *
 * Chargé via CDN avec `beforeInteractive` : Shopify exige que le script soit dans
 * le <head>, avant tout autre script. `data-api-key` = client_id public de l'app.
 */
export default function ShopifyEmbeddedLayout({ children }: { children: React.ReactNode }) {
  // Server Component → on lit directement SHOPIFY_API_KEY (le client_id est public
  // par nature : il apparaît déjà dans l'URL OAuth). Évite d'ajouter une variable
  // NEXT_PUBLIC_* à configurer séparément en prod.
  const apiKey = process.env.SHOPIFY_API_KEY || process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || ''
  return (
    <>
      <Script
        src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
        data-api-key={apiKey}
        strategy="beforeInteractive"
      />
      {children}
    </>
  )
}
