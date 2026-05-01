import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/** GET /api/admin/clients — Liste tous les clients (admin only) */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string | null } | null }

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: clients, error } = await adminSupabase
    .from('profiles')
    .select('id, email, full_name, subscription_status, audit_status, onboarding_plan, plan, tokens_used, tokens_limit, role, created_at, tenant_id')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Récupérer les noms des tenants
  const tenantIds = [...new Set((clients || []).map((c: { tenant_id: string | null }) => c.tenant_id).filter(Boolean))] as string[]
  let tenantNames: Record<string, string> = {}
  if (tenantIds.length > 0) {
    const { data: tenants } = await adminSupabase
      .from('tenants' as any)
      .select('id, app_name, slug')
      .in('id', tenantIds)
    if (tenants) {
      for (const t of tenants as Array<{ id: string; app_name: string; slug: string }>) {
        tenantNames[t.id] = t.app_name
      }
    }
  }

  // Récupérer les configurateurs soumis
  const clientIds = (clients || []).map((c: { id: string }) => c.id)
  let configsByUser: Record<string, unknown> = {}
  if (clientIds.length > 0) {
    const { data: configs } = await adminSupabase
      .from('onboarding_configs')
      .select('user_id, main_function, behavior, tools, escalation, languages, conversation_example, info_to_collect, cgv_accepted_at, submitted_at, admin_validated_at, admin_validated_by, admin_notes')
      .in('user_id', clientIds)
    if (configs) {
      for (const c of configs as Array<{ user_id: string }>) {
        configsByUser[c.user_id] = c
      }
    }
  }

  const enriched = (clients || []).map((c: { id: string; tenant_id: string | null }) => ({
    ...c,
    onboarding_config: configsByUser[c.id] || null,
    tenant_name: c.tenant_id ? (tenantNames[c.tenant_id] || null) : null,
  }))

  return NextResponse.json({ clients: enriched })
}
