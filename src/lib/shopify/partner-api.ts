import 'server-only'

/**
 * PARTNER API — émettre un AVOIR à un marchand.
 *
 * ── POURQUOI UNE SECONDE API ────────────────────────────────────────────────
 *
 * Récompenser un parrain par « 1 mois offert » est étonnamment difficile avec la
 * seule Admin API :
 *
 *   · `trialDays` ne s'applique qu'à la CRÉATION d'un abonnement. Pour un parrain
 *     déjà abonné, il faudrait recréer le sien — donc lui faire approuver un écran
 *     Shopify. Et s'il n'approuve pas sous 48 h, l'abonnement expire et il perd sa
 *     récompense. Une récompense qu'on peut perdre en l'ignorant, c'est un piège.
 *
 *   · `appSubscriptionTrialExtend` échoue (`TRIAL_NOT_ACTIVE`) dès que la période
 *     d'essai est terminée — c'est-à-dire pour tout marchand déjà installé.
 *
 * La bonne mécanique est l'AVOIR : `appCreditCreate` émet un crédit « utilisable
 * sur les futurs achats d'app », que Shopify impute AUTOMATIQUEMENT sur la
 * prochaine facture. Le marchand n'a rien à approuver, rien à cliquer : il voit
 * simplement sa facture à 0 €.
 *
 * Mais cette mutation vit dans la **Partner API**, pas l'Admin API : autre
 * endpoint, autre jeton (créé dans le Partner Dashboard), et l'identifiant de
 * l'organisation dans l'URL.
 *
 * ── SI LE JETON N'EST PAS CONFIGURÉ ─────────────────────────────────────────
 *
 * `isPartnerApiConfigured()` renvoie `false` et l'appelant bascule sur la
 * récompense de repli (crédits de conversations IA) — purement interne, atomique,
 * impossible à casser. Le parrainage fonctionne dans les deux cas ; seule la
 * nature de la récompense change.
 */

const PARTNER_API_VERSION = '2026-07'

function config(): { token: string; orgId: string } | null {
  const token = process.env.SHOPIFY_PARTNER_TOKEN
  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID
  if (!token || !orgId) return null
  return { token, orgId }
}

/** Le jeton Partner est-il en place ? Décide de la nature de la récompense. */
export function isPartnerApiConfigured(): boolean {
  return config() !== null
}

async function partnerGraphQL<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const cfg = config()
  if (!cfg) return { ok: false, error: 'Partner API non configurée' }

  try {
    const res = await fetch(
      `https://partners.shopify.com/${cfg.orgId}/api/${PARTNER_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': cfg.token,
        },
        body: JSON.stringify({ query, variables }),
      }
    )

    if (!res.ok) {
      // ⚠️ Ne jamais logger le corps de la réponse ni le jeton.
      return { ok: false, error: `Partner API HTTP ${res.status}` }
    }

    const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
    if (json.errors?.length) {
      return { ok: false, error: json.errors.map((e) => e.message).join(' · ') }
    }
    if (!json.data) return { ok: false, error: 'Partner API : réponse vide' }

    return { ok: true, data: json.data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

/**
 * Émet un avoir sur le compte du marchand.
 *
 * Il sera déduit automatiquement de sa prochaine facture d'app. Aucune action
 * n'est demandée au marchand.
 *
 * @param shopId  L'identifiant Shopify de la boutique (gid://shopify/Shop/...).
 * @param amount  Le montant de l'avoir (ex. le prix d'un mois d'abonnement).
 * @param test    Doit refléter le mode de facturation de l'abonnement d'origine :
 *                un avoir réel sur un abonnement de test n'aurait aucun sens.
 */
export async function createAppCredit(opts: {
  shopId: string
  amount: number
  currencyCode?: string
  description: string
  test?: boolean
}): Promise<{ ok: true; creditId: string } | { ok: false; error: string }> {
  const res = await partnerGraphQL<{
    appCreditCreate: {
      appCredit: { id: string } | null
      userErrors: { field: string[]; message: string }[]
    }
  }>(
    `mutation AppCreditCreate($shopId: ID!, $amount: MoneyInput!, $description: String!, $test: Boolean) {
       appCreditCreate(shopId: $shopId, amount: $amount, description: $description, test: $test) {
         appCredit { id }
         userErrors { field message }
       }
     }`,
    {
      shopId: opts.shopId,
      amount: { amount: opts.amount, currencyCode: opts.currencyCode || 'EUR' },
      description: opts.description,
      test: opts.test ?? false,
    }
  )

  if (!res.ok) return res

  const payload = res.data.appCreditCreate
  if (payload.userErrors?.length) {
    return { ok: false, error: payload.userErrors.map((e) => e.message).join(' · ') }
  }
  if (!payload.appCredit?.id) {
    return { ok: false, error: 'Avoir non créé (réponse Shopify incomplète)' }
  }

  return { ok: true, creditId: payload.appCredit.id }
}
