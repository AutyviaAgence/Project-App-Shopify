'use client'

import { SHOPIFY_APP_STORE_URL } from '@/lib/shopify/app-store'

/**
 * Bouton « Continuer avec Shopify » (connexion + inscription).
 *
 * ⚠️ Shopify n'est PAS un fournisseur OAuth tiers : on ne peut pas s'y connecter
 * comme avec Google. Le seul chemin conforme (exigence App Store 2.3.1 :
 * l'installation doit partir d'une surface Shopify) est d'envoyer le marchand
 * installer l'app. Shopify nous le renvoie ensuite par OAuth, et
 * `resolveXeyoUser()` crée ou rattache son compte Xeyo automatiquement — sans
 * mot de passe à choisir.
 *
 * ⚠️ Ne JAMAIS remplacer ceci par un champ « votre boutique » : demander un
 * domaine `.myshopify.com` est un motif de rejet.
 *
 * `disabled` sert à l'inscription, où les CGU doivent être acceptées avant de
 * créer un compte — sans ce garde, on provisionnerait un compte sans consentement.
 */
export function ShopifyAuthButton({
  label,
  disabled = false,
  disabledReason,
}: {
  label: string
  disabled?: boolean
  disabledReason?: string
}) {
  const base =
    'inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors'

  const icon = (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15.34 3.5c-.1-.01-.2.02-.29.08-.04.03-.5.35-1.02.72-.53-1.53-1.47-2.93-3.12-2.93h-.15C10.3.72 9.7.4 9.16.4 5.03.4 3.06 5.56 2.44 8.19c-1.6.5-2.74.85-2.89.9-.9.28-.92.31-1.04 1.15L-3 22.7l13.1 2.45L21.9 22.6S15.47 3.66 15.34 3.5z"
        fill="#95BF47"
      />
    </svg>
  )

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title={disabledReason}
        className={`${base} cursor-not-allowed bg-background opacity-50`}
      >
        {icon}
        {label}
      </button>
    )
  }

  return (
    <a href={SHOPIFY_APP_STORE_URL} className={`${base} bg-background hover:bg-accent`}>
      {icon}
      {label}
    </a>
  )
}
