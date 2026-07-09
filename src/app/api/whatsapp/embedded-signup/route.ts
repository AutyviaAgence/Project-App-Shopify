import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createWabaSession } from '@/lib/whatsapp-cloud/create-session'
import { checkPlanQuota } from '@/lib/plan-quota'

const GRAPH = 'https://graph.facebook.com/v22.0'

/**
 * POST /api/whatsapp/embedded-signup  { code, waba_id, phone_number_id }
 *
 * Fin du parcours « Embedded Signup » : la popup Facebook a rendu un code
 * d'autorisation (à usage unique, côté client) ainsi que les identifiants de la
 * WABA choisie. Ici, côté serveur uniquement :
 *   1. on échange le code contre un access_token (nécessite l'app secret) ;
 *   2. on VÉRIFIE que ce token donne bien accès à la WABA annoncée par le
 *      client (celui-ci n'est pas de confiance) ;
 *   3. on abonne l'app à la WABA — sans quoi aucun webhook n'arrive ;
 *   4. on enregistre la session (token chiffré) via la logique partagée.
 *
 * Le marchand ne voit ni Phone Number ID, ni token : c'est tout l'intérêt.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { code, waba_id, phone_number_id } = (await req.json().catch(() => ({}))) as {
    code?: string
    waba_id?: string
    phone_number_id?: string
  }
  if (!code || !waba_id || !phone_number_id) {
    return NextResponse.json(
      { error: 'Réponse Meta incomplète (code, waba_id ou phone_number_id manquant).' },
      { status: 400 }
    )
  }

  const appId = process.env.META_APP_ID
  const appSecret = process.env.WABA_APP_SECRET
  if (!appId || !appSecret) {
    console.error('[embedded-signup] META_APP_ID / WABA_APP_SECRET manquants')
    return NextResponse.json({ error: 'Configuration Meta incomplète côté serveur.' }, { status: 500 })
  }

  // Quota de plan (mêmes règles que la saisie manuelle, y compris l'exception
  // onboarding : la 1ʳᵉ session est autorisée avant le choix du plan).
  let quota: Awaited<ReturnType<typeof checkPlanQuota>> = await checkPlanQuota(supabase, user.id, 'sessions')
  if (!quota.allowed && quota.reason === 'no_subscription') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (supabase as any)
      .from('profiles').select('onboarding_completed_at').eq('id', user.id).maybeSingle()
    const { count: waCount } = await supabase
      .from('whatsapp_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
    if (!prof?.onboarding_completed_at && (waCount ?? 0) === 0) quota = { allowed: true }
  }
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'Votre plan ne permet pas de connecter une session WhatsApp supplémentaire.', quota_exceeded: true },
      { status: 403 }
    )
  }

  // 1. Échange du code contre un access_token (jamais côté navigateur).
  const tokenUrl = `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`
  const tokenRes = await fetch(tokenUrl)
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: { message?: string } }
  if (!tokenRes.ok || !tokenJson.access_token) {
    console.error('[embedded-signup] échange du code échoué:', tokenJson.error)
    return NextResponse.json(
      { error: tokenJson.error?.message || 'Échec de l’échange du code Meta.' },
      { status: 502 }
    )
  }
  const accessToken = tokenJson.access_token

  // 2. Le client n'est pas de confiance : on vérifie que le token donne
  //    réellement accès à la WABA annoncée, et que le numéro lui appartient.
  const wabaRes = await fetch(`${GRAPH}/${waba_id}?fields=id,name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!wabaRes.ok) {
    return NextResponse.json(
      { error: 'Ce compte WhatsApp Business n’est pas accessible avec l’autorisation accordée.' },
      { status: 403 }
    )
  }

  const phoneRes = await fetch(`${GRAPH}/${phone_number_id}?fields=id,display_phone_number`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!phoneRes.ok) {
    return NextResponse.json(
      { error: 'Ce numéro WhatsApp n’est pas accessible avec l’autorisation accordée.' },
      { status: 403 }
    )
  }

  // 3. Enregistrement (token chiffré) + abonnement aux webhooks + import des
  //    modèles + lien WA. L'abonnement `subscribed_apps` est fait dans
  //    createWabaSession, partagé avec la saisie manuelle : sans lui, Meta
  //    n'enverrait aucun message entrant pour ce compte.
  const result = await createWabaSession(supabase, user.id, {
    waba_phone_number_id: phone_number_id,
    waba_business_account_id: waba_id,
    waba_access_token: accessToken,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    data: result.session,
    imported_templates: result.importedTemplates,
    webhooks_subscribed: result.webhooksSubscribed,
  })
}
