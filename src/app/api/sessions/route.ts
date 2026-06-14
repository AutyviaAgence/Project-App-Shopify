import { NextRequest, NextResponse } from 'next/server'
import { generateUniqueSlug } from '@/lib/links/slug'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { encryptMessage } from '@/lib/crypto/encryption'
import { checkPlanQuota } from '@/lib/plan-quota'
import type { WhatsAppSession } from '@/types/database'

/** POST /api/sessions — Créer une nouvelle session WhatsApp (WABA) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { waba_phone_number_id, waba_business_account_id, waba_access_token } = body as {
    waba_phone_number_id?: string
    waba_business_account_id?: string
    waba_access_token?: string
  }

  // Vérifier le quota de sessions selon le plan
  const sessionQuota = await checkPlanQuota(supabase, user.id, 'sessions')
  if (!sessionQuota.allowed) {
    const error = sessionQuota.reason === 'observer_mode'
      ? 'Votre compte est en mode visualisation. Souscrivez à un plan pour créer des sessions WhatsApp.'
      : sessionQuota.reason === 'no_subscription'
      ? 'Abonnement requis pour créer une session WhatsApp. Souscrivez à un plan depuis la page Abonnement.'
      : `Limite atteinte : votre plan ${sessionQuota.plan} inclut ${sessionQuota.limit} session(s) WhatsApp. Passez à un plan supérieur pour en ajouter davantage.`
    return NextResponse.json({
      error,
      quota_exceeded: true,
      reason: sessionQuota.reason,
      limit: sessionQuota.limit,
      current: sessionQuota.current,
    }, { status: 403 })
  }

  // ========== WABA (WhatsApp Cloud API) ==========
  if (!waba_phone_number_id || !waba_business_account_id || !waba_access_token) {
    return NextResponse.json(
      { error: 'Phone Number ID, Business Account ID et Access Token sont requis' },
      { status: 400 }
    )
  }

  const instanceName = `waba-${user.id.slice(0, 8)}-${Date.now()}`

  // Vérifier le token en récupérant le numéro
  const phoneResult = await wabaClient.getPhoneNumber(waba_phone_number_id, waba_access_token)

  let displayPhone: string | null = null
  if (phoneResult.ok) {
    displayPhone = phoneResult.data.display_phone_number
  }

  const { data: session, error: dbError } = await supabase
    .from('whatsapp_sessions')
    .insert({
      user_id: user.id,
      instance_name: instanceName,
      status: 'connected' as const,
      phone_number: displayPhone?.replace(/\D/g, '') || null,
      integration_type: 'waba',
      waba_phone_number_id,
      waba_business_account_id: waba_business_account_id,
      waba_access_token: encryptMessage(waba_access_token),
    })
    .select()
    .single()

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // Import des modèles déjà présents sur ce compte WhatsApp (best-effort) : on
  // les récupère depuis Meta pour qu'ils apparaissent immédiatement, avec leur
  // vrai meta_id/statut. Évite le bug du meta_id obsolète au changement de WABA.
  // `session.waba_access_token` est la version CHIFFRÉE en base (le module la déchiffre).
  let importedTemplates = 0
  try {
    const { importTemplatesFromMeta } = await import('@/lib/templates/meta-import')
    const r = await importTemplatesFromMeta(supabase, user.id, {
      id: session.id,
      waba_business_account_id: session.waba_business_account_id,
      waba_access_token: session.waba_access_token,
    })
    importedTemplates = r.imported
  } catch (e) {
    console.error('[sessions] import templates Meta échec (non bloquant):', e)
  }

  // Création auto d'un lien WhatsApp associé à la session (best-effort).
  // Ne pas faire échouer la création de session si le lien échoue.
  try {
    const { count } = await supabase
      .from('wa_links')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id)
      .eq('user_id', user.id)

    if (!count) {
      // Slug basé sur le nom de la boutique Shopify si dispo, sinon le numéro/aléatoire
      const { data: store } = await supabase
        .from('shopify_stores')
        .select('shop_name')
        .eq('user_id', user.id)
        .maybeSingle()
      const slugSource = store?.shop_name || displayPhone || 'boutique'
      const slug = await generateUniqueSlug(supabase, slugSource)

      const { error: linkError } = await supabase
        .from('wa_links')
        .insert({
          user_id: user.id,
          session_id: session.id,
          name: store?.shop_name ? `Lien ${store.shop_name}` : 'Lien WhatsApp',
          slug,
          pre_filled_message: 'Bonjour, je viens de votre boutique !',
          is_active: true,
          ai_agent_id: null,
        })
      if (linkError) {
        console.error('[sessions] Échec création auto du lien WA:', linkError.message)
      }
    }
  } catch (e) {
    console.error('[sessions] Erreur création auto du lien WA:', e)
  }

  return NextResponse.json({ data: session, imported_templates: importedTemplates })
}

/** GET /api/sessions — Lister les sessions de l'utilisateur (+ équipes avec permissions) */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Sessions de l'utilisateur (système d'équipes retiré). Champs sensibles exclus.
  const { data: sessions, error } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id, instance_name, status, phone_number, display_name, integration_type, waba_phone_number_id, waba_business_account_id, daily_ai_message_limit, ai_message_delay, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: sessions || [] })
}
