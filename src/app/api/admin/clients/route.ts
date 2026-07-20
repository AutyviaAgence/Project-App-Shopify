import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { checkConversationQuota } from '@/lib/shopify/plans'

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
      .in('id', tenantIds) as unknown as { data: Array<{ id: string; app_name: string; slug: string }> | null, error: unknown }
    if (tenants) {
      for (const t of tenants) {
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

  // Connexions WhatsApp / Shopify par client (pour l'affichage admin).
  //  - WhatsApp connecté = au moins une session status='connected'.
  //  - Shopify connecté = au moins une boutique active.
  const whatsappConnected = new Set<string>()
  const shopifyConnected = new Set<string>()
  if (clientIds.length > 0) {
    const { data: sessions } = await adminSupabase
      .from('whatsapp_sessions')
      .select('user_id, status')
      .in('user_id', clientIds)
      .eq('status', 'connected')
    for (const s of (sessions || []) as Array<{ user_id: string }>) whatsappConnected.add(s.user_id)

    const { data: stores } = await adminSupabase
      .from('shopify_stores')
      .select('user_id, is_active')
      .in('user_id', clientIds)
      .eq('is_active', true)
    for (const s of (stores || []) as Array<{ user_id: string }>) shopifyConnected.add(s.user_id)
  }

  // Conversations IA du mois (l'unité RÉELLE du plan, à côté des tokens). On
  // réutilise checkConversationQuota — la même source que le quota appliqué à
  // l'envoi, donc pas de divergence. En parallèle pour ne pas empiler les délais.
  // limit peut être Infinity (plans illimités) → on renvoie null pour le JSON.
  const convByUser: Record<string, { used: number; limit: number | null }> = {}
  await Promise.all(clientIds.map(async (id: string) => {
    try {
      const q = await checkConversationQuota(id)
      convByUser[id] = { used: q.used, limit: Number.isFinite(q.limit) ? q.limit : null }
    } catch {
      convByUser[id] = { used: 0, limit: null }
    }
  }))

  // ── Codes promo et parrainage utilisés ────────────────────────────────────
  //
  // Rien n'indiquait, dans la fiche client, s'il avait souscrit avec un code.
  // Impossible de savoir d'où venait un marchand ni pourquoi il payait moins.
  //
  // Deux sources DISTINCTES (cf. les deux tables) : `promo_redemptions` pour les
  // codes promo, `growth_attributions` pour l'affiliation et le parrainage.
  const promoByUser: Record<string, { code: string; usedAt: string }> = {}
  const growthByUser: Record<string, { code: string; kind: string; converted: boolean }> = {}

  try {
    const [{ data: redemptions }, { data: attributions }] = await Promise.all([
      adminSupabase
        .from('promo_redemptions')
        .select('user_id, created_at, promo_codes(code)')
        .in('user_id', clientIds),
      adminSupabase
        .from('growth_attributions')
        .select('referee_id, converted_at, growth_codes(code, kind)')
        .in('referee_id', clientIds),
    ])

    for (const r of (redemptions || []) as unknown as {
      user_id: string; created_at: string; promo_codes: { code: string } | null
    }[]) {
      if (r.promo_codes?.code) {
        promoByUser[r.user_id] = { code: r.promo_codes.code, usedAt: r.created_at }
      }
    }

    for (const a of (attributions || []) as unknown as {
      referee_id: string; converted_at: string | null; growth_codes: { code: string; kind: string } | null
    }[]) {
      if (a.growth_codes?.code) {
        growthByUser[a.referee_id] = {
          code: a.growth_codes.code,
          kind: a.growth_codes.kind,
          // `converted_at` n'est posé qu'au premier paiement réellement encaissé :
          // c'est ce qui distingue un parrainage abouti d'une simple attribution.
          converted: !!a.converted_at,
        }
      }
    }
  } catch {
    // Jamais bloquant : la liste des clients doit s'afficher même si ces
    // informations complémentaires échouent.
  }

  const enriched = (clients || []).map((c: { id: string; tenant_id: string | null }) => ({
    ...c,
    onboarding_config: configsByUser[c.id] || null,
    promo_code: promoByUser[c.id] || null,
    growth_code: growthByUser[c.id] || null,
    tenant_name: c.tenant_id ? (tenantNames[c.tenant_id] || null) : null,
    has_whatsapp: whatsappConnected.has(c.id),
    has_shopify: shopifyConnected.has(c.id),
    ai_conversations_used: convByUser[c.id]?.used ?? 0,
    ai_conversations_limit: convByUser[c.id]?.limit ?? null, // null = illimité
  }))

  return NextResponse.json({ clients: enriched })
}
