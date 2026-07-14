import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /r/<code> — le lien de partage, pour un parrain COMME pour un affilié.
 *
 * ⚠️ LE MAILLON QUI ÉTAIT ROMPU.
 *
 * Cette route posait un cookie `referral_code`. Mais la page d'abonnement, elle,
 * lisait un cookie `affiliate_code` — que RIEN ne posait jamais. Résultat : la
 * fonction qui calcule les commissions n'a jamais tourné une seule fois en
 * production. Un partenaire pouvait amener cent marchands sans toucher un euro.
 *
 * Pire : le code d'un affilié atterrissait dans le système de parrainage, où il
 * ne correspondait à aucun compte. Le partenaire perdait sa commission ET
 * personne ne gagnait quoi que ce soit.
 *
 * Un seul cookie désormais — `growth_code` — pour les deux. C'est la table
 * `growth_codes` qui sait, elle, s'il s'agit d'un parrain ou d'un affilié.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  // `app.autyvia.fr` était codé en dur ici : l'ancien domaine. Tout lien de
  // parrainage partagé menait donc chez l'ancienne marque.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.xeyo.io'

  const response = NextResponse.redirect(`${baseUrl}/register`)

  response.cookies.set('growth_code', code.trim().toUpperCase(), {
    maxAge: 60 * 60 * 24 * 30, // 30 jours pour finaliser l'inscription
    path: '/',
    sameSite: 'lax',
    // Lisible en JS : la page d'inscription doit le joindre aux métadonnées du
    // compte (c'est le trigger `handle_new_user` qui pose l'attribution).
    httpOnly: false,
  })

  return response
}
