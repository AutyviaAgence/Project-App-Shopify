/**
 * Layout des pages EMBEDDED (admin Shopify).
 *
 * ⚠️ App Bridge n'est PAS chargé ici — il l'est dans le ROOT layout
 * (`src/app/layout.tsx`), et il doit y rester.
 *
 * Pourquoi : Shopify exige que son script soit le TOUT PREMIER <script> du
 * <head>, sans `async`/`defer`/`type=module`. Son propre code le vérifie et
 * s'interrompt sinon (« must be included as the first <script> tag […] Aborting »).
 * Or un layout imbriqué est rendu APRÈS les scripts du root, et
 * `<Script strategy="beforeInteractive">` de next/script ajoute `async`.
 *
 * En production, ces deux contraintes étaient violées : App Bridge s'abortait,
 * `window.shopify` n'existait jamais, aucune requête ne portait de session token,
 * et l'app affichait « Installation requise » — sans la moindre trace côté serveur.
 * Ne pas réintroduire de <Script> App Bridge ici.
 */
export default function ShopifyEmbeddedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
