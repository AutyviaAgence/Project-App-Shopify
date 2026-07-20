import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * Codes d'affiliation (partenaires externes).
 *
 * ⚠️ CE QUI ÉTAIT CASSÉ.
 *
 * Cette route écrivait dans `affiliate_codes`, dont la colonne `user_id` était
 * NOT NULL — mais elle ne la renseignait JAMAIS (elle n'insérait que le libellé,
 * le code et le taux). Résultat : soit l'insertion échouait, soit le partenaire
 * n'était rattaché à aucun compte et ne voyait jamais ses commissions.
 *
 * Elle écrit désormais dans `growth_codes` (kind = 'affiliate'), où le
 * propriétaire est explicitement NULLABLE : un code peut être créé AVANT que le
 * partenaire n'ait un compte Xeyo, et lui être rattaché ensuite via son email.
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

  const { data } = await auth.admin
    .from('growth_codes')
    .select('id, code, label, contact_email, commission_percent, discount_percent, discount_duration_months, owner_user_id, is_active, created_at')
    .eq('kind', 'affiliate')
    .order('created_at', { ascending: false })

  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { label, code, commission_percent, contact_email, discount_percent, discount_duration_months } = body

  const normalized = String(code || '').trim().toUpperCase()
  if (!normalized || !commission_percent) {
    return NextResponse.json({ error: 'Code et commission requis' }, { status: 400 })
  }
  const percent = Number(commission_percent)
  if (!(percent > 0 && percent <= 100)) {
    return NextResponse.json({ error: 'La commission doit être comprise entre 1 et 100 %.' }, { status: 400 })
  }

  // Remise accordée AU MARCHAND (facultative) — distincte de la commission qui,
  // elle, rémunère l'affilié. Elle s'applique sur l'abonnement Shopify.
  // 0 % est valide : le partenaire touche sa commission, le marchand paie plein
  // tarif. Champ vide = pas de remise du tout (NULL) ; « 0 » = remise nulle
  // assumée. Les deux se comportent pareil à l'usage, mais on respecte la saisie.
  let discount: number | null = null
  if (discount_percent != null && String(discount_percent).trim() !== '') {
    discount = Number(discount_percent)
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      return NextResponse.json({ error: 'La remise doit être comprise entre 0 et 100 %.' }, { status: 400 })
    }
  }

  // Durée de la remise, en cycles. Vide = permanente.
  let discountMonths: number | null = null
  if (discount_duration_months != null && String(discount_duration_months).trim() !== '') {
    discountMonths = Number(discount_duration_months)
    if (!Number.isInteger(discountMonths) || discountMonths <= 0) {
      return NextResponse.json({ error: 'La durée de la remise doit être un nombre de mois positif.' }, { status: 400 })
    }
  }

  // Si le partenaire a déjà un compte Xeyo, on le rattache tout de suite : c'est
  // ce rattachement qui lui permettra de voir ses commissions sur /partner.
  let ownerId: string | null = null
  const email = String(contact_email || '').trim().toLowerCase()
  if (email) {
    const { data: profile } = await auth.admin
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle()
    ownerId = profile?.id ?? null
  }

  const { data, error } = await auth.admin
    .from('growth_codes')
    .insert({
      kind: 'affiliate',
      code: normalized,
      label: label ? String(label).trim() : null,
      contact_email: email || null,
      commission_percent: percent,
      discount_percent: discount,
      discount_duration_months: discountMonths,
      owner_user_id: ownerId,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ce code existe déjà.' }, { status: 409 })
    }
    console.error('[admin/affiliate-codes] création échouée:', error.message)
    return NextResponse.json({ error: 'Création impossible' }, { status: 500 })
  }

  return NextResponse.json(data)
}

/**
 * PATCH — activer / désactiver un code, ou rattacher un partenaire.
 *
 * Le rattachement par email est ce qui manquait : un code créé avant que le
 * partenaire n'ait un compte restait orphelin à vie.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id, is_active, contact_email, discount_percent, discount_duration_months } = await req.json()
  if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof is_active === 'boolean') patch.is_active = is_active

  // Remise marchand : une chaîne vide la RETIRE (null), une valeur la définit.
  if (discount_percent !== undefined) {
    if (discount_percent === null || String(discount_percent).trim() === '') {
      patch.discount_percent = null
    } else {
      const d = Number(discount_percent)
      if (!Number.isFinite(d) || d < 0 || d > 100) {
        return NextResponse.json({ error: 'La remise doit être comprise entre 0 et 100 %.' }, { status: 400 })
      }
      patch.discount_percent = d
    }
  }

  if (discount_duration_months !== undefined) {
    if (discount_duration_months === null || String(discount_duration_months).trim() === '') {
      patch.discount_duration_months = null
    } else {
      const m = Number(discount_duration_months)
      if (!Number.isInteger(m) || m <= 0) {
        return NextResponse.json({ error: 'La durée de la remise doit être un nombre de mois positif.' }, { status: 400 })
      }
      patch.discount_duration_months = m
    }
  }

  if (contact_email) {
    const email = String(contact_email).trim().toLowerCase()
    const { data: profile } = await auth.admin
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json(
        { error: 'Aucun compte Xeyo avec cet email. Le partenaire doit d’abord s’inscrire.' },
        { status: 404 }
      )
    }
    patch.contact_email = email
    patch.owner_user_id = profile.id
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  const { error } = await auth.admin.from('growth_codes').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

/**
 * DELETE — retire le code.
 *
 * ⚠️ `ON DELETE CASCADE` : supprimer un code efface aussi ses attributions et ses
 * commissions. Pour retirer un code de la circulation sans effacer ce qu'on doit
 * au partenaire, il faut le DÉSACTIVER (PATCH `is_active: false`).
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 })

  const { error } = await auth.admin.from('growth_codes').delete().eq('id', id).eq('kind', 'affiliate')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
