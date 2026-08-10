'use client'

import Image from 'next/image'
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

  // Logo Shopify officiel (l'ancien SVG inline était un tracé tronqué, il
  // s'affichait cassé). Fichier dans public/brand.
  const icon = (
    <Image src="/brand/shopify-logo.png" alt="" width={18} height={18} className="h-[18px] w-[18px]" aria-hidden="true" />
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
