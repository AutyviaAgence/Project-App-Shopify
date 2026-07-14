import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * Commissions d'affiliation — suivi et versement.
 *
 * ⚠️ Lisait `affiliate_conversions`, que le nouveau moteur n'alimente plus. Les
 * commissions vivent désormais dans `growth_rewards` (`reward_type = 'commission'`).
 *
 * Le versement reste MANUEL : cette route ne fait que marquer la commission comme
 * payée. Aucun virement n'est déclenché — c'est un registre, pas un système de
 * paiement.
 */

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

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

  // Le bénéficiaire (le partenaire) et le code qui a généré la commission.
  const { data } = await auth.admin
    .from('growth_rewards')
    .select(`
      id, amount_cents, base_amount_cents, currency, status, created_at, paid_at, payout_method,
      beneficiary:profiles!growth_rewards_beneficiary_user_id_fkey(email, full_name),
      attribution:growth_attributions!growth_rewards_attribution_id_fkey(
        code:growth_codes!growth_attributions_code_id_fkey(code, label, commission_percent)
      )
    `)
    .eq('reward_type', 'commission')
    .order('created_at', { ascending: false })

  return NextResponse.json(data || [])
}

/** Marque une commission comme versée. Le virement est fait à la main, hors app. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id, payout_method, payout_note } = await req.json()
  if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 })

  // `.eq('status', 'pending')` : on ne repasse pas une commission déjà versée en
  // « payée » (double-clic, rafraîchissement) — la date de versement serait
  // écrasée, et la trace du premier paiement perdue.
  const { data, error } = await auth.admin
    .from('growth_rewards')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      payout_method: payout_method || 'virement',
      payout_note: payout_note || null,
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .maybeSingle()

  if (error) {
    console.error('[admin/affiliate-conversions] versement échoué:', error.message)
    return NextResponse.json({ error: 'Mise à jour impossible' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Cette commission a déjà été versée.' }, { status: 409 })
  }

  return NextResponse.json(data)
}
