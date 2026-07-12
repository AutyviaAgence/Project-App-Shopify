import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * Réglages GLOBAUX de la plateforme (admin Xeyo uniquement).
 *
 *  GET   → renvoie la ligne singleton (id=1) de platform_settings.
 *  PATCH → met à jour un ou plusieurs réglages.
 *
 * Ces réglages protègent la plateforme (ex. plafond anti-spam marketing dont le
 * risque qualité Meta pèse sur la WABA de Xeyo, pas sur le marchand) : ils sont
 * donc réservés au rôle 'admin', jamais exposés aux comptes marchands.
 */

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) }
  const { data: me } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: { role: string | null } | null }
  if (me?.role !== 'admin') return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) }
  return { user }
}

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate) return gate.error

  const admin = adminDb()
  const { data, error } = await admin
    .from('platform_settings')
    .select('marketing_contact_cap_hours, updated_at')
    .eq('id', 1)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: {
      // Défaut historique si la ligne n'existe pas encore.
      marketing_contact_cap_hours: data?.marketing_contact_cap_hours ?? 20,
      updated_at: data?.updated_at ?? null,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return gate.error

  const body = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = {}

  if ('marketing_contact_cap_hours' in body) {
    const raw = body.marketing_contact_cap_hours
    // Accepte un entier >= 0 (0 = désactivé) ; plafonné à 30 jours pour éviter
    // une saisie absurde qui bloquerait toutes les campagnes marketing.
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0 || n > 720) {
      return NextResponse.json(
        { error: 'marketing_contact_cap_hours doit être un entier entre 0 et 720 (heures)' },
        { status: 400 },
      )
    }
    update.marketing_contact_cap_hours = Math.floor(n)
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Aucune valeur à mettre à jour' }, { status: 400 })
  }
  update.updated_at = new Date().toISOString()
  update.updated_by = gate.user.id

  const admin = adminDb()
  // Upsert sur le singleton id=1 (au cas où la ligne n'existe pas encore).
  const { data, error } = await admin
    .from('platform_settings')
    .upsert({ id: 1, ...update }, { onConflict: 'id' })
    .select('marketing_contact_cap_hours, updated_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
