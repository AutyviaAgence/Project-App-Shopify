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
/**
 * client_id de l'app publique (Xeyo - WhatsApp Support & Chat).
 *
 * ⚠️ EN DUR, et c'est délibéré. Le client_id est PUBLIC par nature : il apparaît
 * dans chaque URL OAuth et dans le HTML de toute app embedded. Ce n'est pas un
 * secret (le secret, lui, est `SHOPIFY_API_SECRET`, jamais exposé).
 *
 * Pourquoi ne pas se contenter de `process.env.SHOPIFY_API_KEY` : en production,
 * la variable n'était pas disponible AU BUILD et le HTML sortait avec
 * `data-api-key=""`. App Bridge ne s'initialisait donc jamais → pas de
 * `shopify.idToken()` → aucun session token → l'app embedded ne fonctionnait pas
 * du tout (et l'exigence 1.1.1 échouait). L'échec était TOTALEMENT SILENCIEUX.
 *
 * Le fallback env reste prioritaire pour permettre de pointer une autre app.
 */
const XEYO_APP_STORE_CLIENT_ID = 'f9d37d1f9ab1427165874c33eb7c4926'

export default function ShopifyEmbeddedLayout({ children }: { children: React.ReactNode }) {
  const apiKey =
    process.env.SHOPIFY_API_KEY ||
    process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ||
    XEYO_APP_STORE_CLIENT_ID
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
