import { Suspense } from 'react'
import LinkClient from './client'

/**
 * /link?token=… — LE MARCHAND RATTACHE SA BOUTIQUE AU COMPTE DE SON CHOIX.
 *
 * Arrivée depuis l'app embedded (« J'ai déjà un compte Xeyo »), avec un jeton signé
 * qui prouve qu'il est administrateur de la boutique.
 *
 * C'est ici que le cercle vicieux se termine : il s'authentifie LIBREMENT (compte
 * existant, Google, ou nouvelle inscription) et c'est CE compte qui prend la
 * boutique — au lieu de se voir imposer celui de `shop.email`.
 *
 * ⚠️ Route PUBLIQUE (cf. middleware) : un visiteur sans compte doit pouvoir y
 * arriver, sans quoi on le renverrait sur /login ou /onboarding en perdant le jeton.
 */
export default function LinkPage() {
  return (
    <Suspense fallback={null}>
      <LinkClient />
    </Suspense>
  )
}
