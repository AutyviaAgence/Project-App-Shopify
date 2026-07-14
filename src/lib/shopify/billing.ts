import 'server-only'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * CŒUR DE LA FACTURATION SHOPIFY.
 *
 * Toutes les routes de facturation passent par ici : abonnement, changement de
 * plan, achat ponctuel. C'est le seul endroit qui décide d'un prix, résout un
 * code promo, ou crédite un compte.
 *
 * Xeyo est désormais 100 % Shopify : la Billing API est le SEUL canal de
 * paiement. Facturer un marchand Shopify autrement (Stripe…) est un motif de
 * rejet, voire de suspension de l'app (App Store §1.2.1).
 */

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Les packs achetables à l'unité. Repris À L'IDENTIQUE de l'ancien système
 * Stripe — mêmes quantités, mêmes prix.
 *
 * ⚠️ Le prix et la quantité sont définis ICI, côté serveur. On ne fait JAMAIS
 * confiance à ce que le client envoie : il n'envoie que l'identifiant du pack.
 * Sinon il suffirait de poster `{ price: 0 }` pour se servir gratuitement.
 */
export const ONE_TIME_PACKS = {
  tokens: {
    id: 'tokens' as const,
    label: '500 000 tokens IA',
    description: 'Tokens supplémentaires pour votre agent IA',
    amount: 500_000,
    priceCents: 5000, // 50 €
  },
  ai_credits: {
    id: 'ai_credits' as const,
    label: '500 conversations IA',
    description: 'Conversations IA supplémentaires (elles ne périment pas)',
    amount: 500,
    priceCents: 4500, // 45 €
  },
} as const

export type PackId = keyof typeof ONE_TIME_PACKS

/**
 * Facture-t-on pour de vrai ?
 *
 * ⚠️ Répliqué à l'identique dans toutes les routes de facturation. Un abonnement
 * de test et un abonnement réel ne sont pas interchangeables chez Shopify : on
 * ne peut pas remplacer l'un par l'autre.
 *
 * ⚠️ `SHOPIFY_BILLING_TEST=true` en production = personne n'est jamais débité.
 * À retirer avant le lancement (cf. docs/APP_STORE_SUBMISSION.md).
 */
export function isTestBilling(): boolean {
  return !(process.env.NODE_ENV === 'production' && process.env.SHOPIFY_BILLING_TEST !== 'true')
}

// ── CODES PROMO ────────────────────────────────────────────────────────────

export type ResolvedPromo = {
  id: string
  code: string
  /** Remise en pourcentage, 0→100 (le client Shopify convertit en 0→1). */
  percentage?: number
  amountCents?: number
  /** Nombre de cycles de facturation concernés. Absent = permanent. */
  durationMonths?: number
  trialDays?: number
}

/**
 * Résout un code promo, ou renvoie une erreur explicite.
 *
 * ⚠️ La table `promo_codes` existait mais n'était JAMAIS lue : la route de
 * paiement attendait un code que personne ne lui envoyait. Un admin pouvait
 * créer des codes… sans aucun effet.
 *
 * Toutes les vérifications sont faites ICI, côté serveur : validité, expiration,
 * plafond d'utilisations, plans éligibles, et surtout — le marchand ne l'a-t-il
 * pas déjà utilisé ? Sans ce dernier point, il suffirait de changer de plan en
 * boucle pour réappliquer la remise indéfiniment.
 */
export async function resolvePromoCode(
  code: string,
  userId: string,
  plan: string
): Promise<{ ok: true; promo: ResolvedPromo } | { ok: false; error: string }> {
  const supabase = admin()
  const normalized = code.trim().toUpperCase()
  if (!normalized) return { ok: false, error: 'Code promo vide' }

  const { data: promo } = await supabase
    .from('promo_codes')
    .select('id, code, discount_percent, discount_amount_cents, duration_months, trial_days, is_active, valid_until, max_redemptions, redemptions, plans')
    .ilike('code', normalized)
    .maybeSingle()

  if (!promo || !promo.is_active) {
    return { ok: false, error: 'Code promo invalide' }
  }
  if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
    return { ok: false, error: 'Ce code promo a expiré' }
  }
  if (promo.max_redemptions != null && (promo.redemptions || 0) >= promo.max_redemptions) {
    return { ok: false, error: 'Ce code promo n’est plus disponible' }
  }
  if (Array.isArray(promo.plans) && promo.plans.length > 0 && !promo.plans.includes(plan)) {
    return { ok: false, error: 'Ce code promo ne s’applique pas à ce plan' }
  }

  // Déjà utilisé par ce marchand ? (Le UNIQUE en base est le vrai garde-fou ;
  // ce contrôle sert à donner un message clair plutôt qu'une erreur SQL.)
  const { data: already } = await supabase
    .from('promo_redemptions')
    .select('id')
    .eq('promo_code_id', promo.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (already) {
    return { ok: false, error: 'Vous avez déjà utilisé ce code promo' }
  }

  return {
    ok: true,
    promo: {
      id: promo.id,
      code: promo.code,
      percentage: promo.discount_percent ?? undefined,
      amountCents: promo.discount_amount_cents ?? undefined,
      durationMonths: promo.duration_months ?? undefined,
      trialDays: promo.trial_days ?? undefined,
    },
  }
}

/** Enregistre l'utilisation d'un code promo, une fois le paiement CONFIRMÉ. */
export async function redeemPromoCode(promoId: string, userId: string, chargeId: string | null) {
  const supabase = admin()

  // Le UNIQUE (promo_code_id, user_id) rend l'opération idempotente : un callback
  // rejoué ne compte pas deux fois.
  const { error } = await supabase
    .from('promo_redemptions')
    .insert({ promo_code_id: promoId, user_id: userId, shopify_charge_id: chargeId })

  if (error) {
    // Doublon = le callback a déjà été traité. Ce n'est pas une erreur.
    if (error.code === '23505') return
    console.error('[billing] enregistrement du code promo échoué:', error.message)
    return
  }

  // Incrémenter le compteur d'utilisations (best-effort : la vérité reste
  // `promo_redemptions`, qu'on peut recompter à tout moment).
  const { data: promo } = await supabase
    .from('promo_codes')
    .select('redemptions')
    .eq('id', promoId)
    .maybeSingle()

  await supabase
    .from('promo_codes')
    .update({ redemptions: (promo?.redemptions || 0) + 1 })
    .eq('id', promoId)
}

// ── ACHATS PONCTUELS ───────────────────────────────────────────────────────

/**
 * Crédite un pack acheté. IDEMPOTENT.
 *
 * ⚠️ Le verrou est l'UPDATE conditionnel `WHERE status='pending'` : si 0 ligne
 * est touchée, c'est qu'un autre appel a déjà crédité (double-clic, refresh,
 * retry réseau) et on sort sans rien faire. Sans lui, le marchand serait crédité
 * plusieurs fois pour un seul paiement.
 *
 * Le crédit lui-même passe par un RPC atomique : l'ancien code faisait un
 * lire-puis-écrire qui PERDAIT des crédits en cas de concurrence.
 */
export async function creditOneTimePack(
  purchaseId: string,
  chargeId: string
): Promise<{ ok: true; pack: PackId; amount: number } | { ok: false; error: string; alreadyCredited?: boolean }> {
  const supabase = admin()

  const { data: purchase } = await supabase
    .from('shopify_one_time_purchases')
    .select('id, user_id, pack, status')
    .eq('id', purchaseId)
    .maybeSingle()

  if (!purchase) return { ok: false, error: 'Achat introuvable' }
  if (purchase.status === 'credited') {
    return { ok: false, error: 'Déjà crédité', alreadyCredited: true }
  }

  const pack = ONE_TIME_PACKS[purchase.pack as PackId]
  if (!pack) return { ok: false, error: 'Pack inconnu' }

  // LE VERROU. Seul le premier appel passe.
  const { data: locked } = await supabase
    .from('shopify_one_time_purchases')
    .update({
      status: 'credited',
      charge_id: chargeId,
      amount_credited: pack.amount,
      price_cents: pack.priceCents,
      credited_at: new Date().toISOString(),
    })
    .eq('id', purchaseId)
    .eq('status', 'pending')
    .select('id')

  if (!locked || locked.length === 0) {
    // Un autre appel a gagné la course : il crédite, pas nous.
    return { ok: false, error: 'Déjà crédité', alreadyCredited: true }
  }

  const rpc = pack.id === 'tokens' ? 'credit_tokens_extra' : 'credit_ai_conversations'
  const { error: rpcErr } = await supabase.rpc(rpc, {
    p_user_id: purchase.user_id,
    p_amount: pack.amount,
  })

  if (rpcErr) {
    // Le crédit a échoué après qu'on a posé le verrou : on le relâche, sinon
    // le marchand a payé et ne sera jamais crédité, même en réessayant.
    await supabase
      .from('shopify_one_time_purchases')
      .update({ status: 'pending', credited_at: null })
      .eq('id', purchaseId)

    console.error('[billing] crédit du pack échoué:', rpcErr.message)
    return { ok: false, error: 'Crédit impossible' }
  }

  return { ok: true, pack: pack.id, amount: pack.amount }
}
