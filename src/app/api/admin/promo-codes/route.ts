import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * Codes promo Xeyo (remise sur l'abonnement du marchand).
 *
 * ⚠️ CE QUI A CHANGÉ.
 *
 * Cette route créait des coupons STRIPE. Or Xeyo est facturé via la Billing API
 * de Shopify : un coupon Stripe n'a strictement aucun effet sur un abonnement
 * Shopify. Les codes créés ici étaient donc inutilisables — et de toute façon la
 * table n'était jamais lue au moment de l'abonnement.
 *
 * Un code promo est maintenant une simple ligne en base, traduite à
 * l'abonnement en `discount` natif de la Billing API (remise en % ou en montant
 * fixe, sur N cycles) et/ou en `trialDays`. Les deux sont cumulables : on peut
 * offrir 30 jours gratuits PUIS 3 mois à -50 %.
 */

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Le rôle admin est vérifié CÔTÉ SERVEUR : la page cliente ne garde rien. */
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { ok: false as const, status: 401, error: 'Non authentifié' }

  const admin = getAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string | null } | null }

  if (profile?.role !== 'admin') return { ok: false as const, status: 403, error: 'Accès refusé' }
  return { ok: true as const, admin }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data } = await auth.admin
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false })

  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const {
    code,
    discount_percent,
    discount_amount_cents,
    duration_months,
    trial_days,
    max_redemptions,
    valid_until,
    plans,
  } = body

  const normalized = String(code || '').trim().toUpperCase()
  if (!normalized) {
    return NextResponse.json({ error: 'Code requis' }, { status: 400 })
  }

  // Un code doit offrir QUELQUE CHOSE : une remise ou des jours d'essai. Sinon il
  // s'appliquerait sans rien changer, et le marchand croirait à un bug.
  const hasPercent = discount_percent != null && Number(discount_percent) > 0
  const hasAmount = discount_amount_cents != null && Number(discount_amount_cents) > 0
  const hasTrial = trial_days != null && Number(trial_days) > 0

  if (!hasPercent && !hasAmount && !hasTrial) {
    return NextResponse.json(
      { error: 'Indiquez au moins une remise (% ou montant) ou des jours d’essai.' },
      { status: 400 }
    )
  }
  if (hasPercent && Number(discount_percent) > 100) {
    return NextResponse.json({ error: 'La remise ne peut pas dépasser 100 %.' }, { status: 400 })
  }

  const { data, error } = await auth.admin
    .from('promo_codes')
    .insert({
      code: normalized,
      discount_percent: hasPercent ? Number(discount_percent) : null,
      discount_amount_cents: hasAmount ? Number(discount_amount_cents) : null,
      // Nombre de cycles de facturation concernés. NULL = remise permanente.
      duration_months: duration_months ? Number(duration_months) : null,
      trial_days: hasTrial ? Number(trial_days) : null,
      max_redemptions: max_redemptions ? Number(max_redemptions) : null,
      valid_until: valid_until || null,
      // Restreindre à certains plans. NULL = tous.
      plans: Array.isArray(plans) && plans.length ? plans : null,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    // 23505 = le code existe déjà (l'unicité est insensible à la casse).
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ce code existe déjà.' }, { status: 409 })
    }
    console.error('[admin/promo-codes] création échouée:', error.message)
    return NextResponse.json({ error: 'Création impossible' }, { status: 500 })
  }

  return NextResponse.json(data)
}

/**
 * PATCH — activer / désactiver un code.
 *
 * ⚠️ La suppression était un DELETE définitif, alors que l'interface affichait
 * « Code promo désactivé » et une colonne « Statut : Actif / Inactif » qui ne
 * pouvait JAMAIS valoir « Inactif » (aucune route ne l'écrivait). Désactiver
 * préserve l'historique des utilisations.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id, is_active, max_redemptions, valid_until } = await req.json()
  if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 })

  // ⚠️ Le PATCH ne gérait QUE `is_active` : une fois créé, un code était figé.
  // Impossible de relever le plafond d'une campagne qui marche, de la clôturer
  // par une date, ni de réactiver un code stoppé par erreur — il fallait le
  // supprimer et le recréer (en perdant l'historique).
  //
  // On applique donc uniquement les champs RÉELLEMENT fournis : `undefined` =
  // « ne pas toucher », alors que `null` est une valeur légitime (illimité /
  // sans expiration) qu'il faut pouvoir poser.
  const patch: Record<string, unknown> = {}
  if (is_active !== undefined) patch.is_active = !!is_active
  if (max_redemptions !== undefined) {
    const n = max_redemptions === null || max_redemptions === '' ? null : Number(max_redemptions)
    if (n !== null && (!Number.isFinite(n) || n < 1)) {
      return NextResponse.json({ error: 'Le plafond doit être un entier ≥ 1 (ou vide pour illimité).' }, { status: 400 })
    }
    patch.max_redemptions = n
  }
  if (valid_until !== undefined) {
    patch.valid_until = valid_until === null || valid_until === '' ? null : valid_until
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucune modification fournie.' }, { status: 400 })
  }

  const { data, error } = await auth.admin
    .from('promo_codes')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, code: data })
}
