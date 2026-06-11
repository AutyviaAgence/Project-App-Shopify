import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'

/**
 * GET /api/templates/test-send
 *
 * Diagnostic : liste les derniers contacts opt-in issus de la vitrine Shopify.
 * Permet de vérifier si l'opt-in de la page Merci a bien créé un contact
 * (donc si l'extension a réellement appelé /api/shopify/proxy/optin).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Sessions de l'utilisateur
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)
  const sessionIds = (sessions || []).map((s) => s.id)
  if (sessionIds.length === 0) {
    return NextResponse.json({ contacts: [], note: 'aucune session WhatsApp' })
  }

  const { data: contacts } = await supabase
    .from('contacts')
    .select('phone_number, name, opt_in_status, opt_in_source, preferred_channel, marketing_consent, opt_in_at, created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({ contacts: contacts || [] })
}

/**
 * POST /api/templates/test-send
 *
 * Diagnostic : rejoue l'envoi du template de confirmation vers un numéro de
 * test et RETOURNE l'erreur Meta brute (code + message). Sert à comprendre
 * pourquoi un message d'opt-in n'arrive pas, sans fouiller les logs serveur.
 *
 * body: { phone: "33612345678", template?: "confirmation_commande" }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const phone = String(body.phone || '').replace(/[^0-9]/g, '')
  const templateName = String(body.template || 'confirmation_commande')
  if (!phone || phone.length < 8) {
    return NextResponse.json({ error: 'Numéro invalide (format E.164 sans +, ex: 33612345678)' }, { status: 400 })
  }

  // Session WABA connectée
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, waba_phone_number_id, waba_access_token')
    .eq('user_id', user.id)
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()

  const diag: Record<string, unknown> = {
    phone,
    templateName,
    hasSession: !!session,
    hasPhoneNumberId: !!session?.waba_phone_number_id,
    hasToken: !!session?.waba_access_token,
  }

  if (!session?.waba_phone_number_id || !session?.waba_access_token) {
    return NextResponse.json({ ok: false, step: 'session', diag }, { status: 200 })
  }

  // Statut du template approuvé pour ce marchand
  const { data: tpl } = await supabase
    .from('whatsapp_templates')
    .select('name, language, status, variables_count')
    .eq('user_id', user.id)
    .eq('name', templateName)
    .maybeSingle()

  diag.templateFound = !!tpl
  diag.templateStatus = tpl?.status ?? null
  diag.templateLanguage = tpl?.language ?? null
  diag.variablesCount = tpl?.variables_count ?? null

  if (!tpl) {
    return NextResponse.json({ ok: false, step: 'template_missing', diag }, { status: 200 })
  }
  if (tpl.status !== 'approved') {
    return NextResponse.json({ ok: false, step: 'template_not_approved', diag }, { status: 200 })
  }

  // Construire les variables attendues (valeurs de test)
  const count = typeof tpl.variables_count === 'number' ? tpl.variables_count : 0
  const sampleVars = ['Client test', 'votre commande', 'https://exemple.com']
  const params = sampleVars.slice(0, count)
  while (params.length < count) params.push('')
  const components = params.length > 0
    ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }]
    : []

  // Envoi réel — on retourne l'erreur Meta brute
  let token = ''
  try {
    token = decryptMessage(session.waba_access_token)
  } catch {
    return NextResponse.json({ ok: false, step: 'token_decrypt', diag }, { status: 200 })
  }

  const res = await wabaClient.sendTemplateWithParams(
    session.waba_phone_number_id,
    token,
    phone,
    tpl.name,
    tpl.language || 'fr',
    components
  )

  if (res.ok) {
    return NextResponse.json({ ok: true, step: 'sent', diag, meta: res.data }, { status: 200 })
  }
  // Erreur Meta brute : c'est elle qui explique tout (code 132001, 131026...)
  return NextResponse.json({ ok: false, step: 'send_failed', diag, metaError: res.error }, { status: 200 })
}
