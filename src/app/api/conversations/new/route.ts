import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTemplateToContact } from '@/lib/automations/dispatch'

/**
 * POST /api/conversations/new
 * Initie une conversation WhatsApp avec un nouveau numéro en envoyant un
 * template approuvé (seul moyen autorisé par Meta hors fenêtre 24h).
 * Crée le contact puis délègue à sendTemplateToContact (moteur unifié : body +
 * variables, carrousel, LTO, COPY_CODE, variante linguistique, trace inbox).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const phoneRaw = (body.phone as string || '').replace(/\D/g, '')
  const templateId = body.template_id as string | undefined
  const variables = (body.variables && typeof body.variables === 'object')
    ? body.variables as Record<string, string>
    : {}

  if (!phoneRaw) return NextResponse.json({ error: 'Numéro requis' }, { status: 400 })
  if (!templateId) return NextResponse.json({ error: 'Modèle requis' }, { status: 400 })

  // Session WhatsApp de l'utilisateur
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('integration_type', 'waba')
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()
  if (!session?.id) {
    return NextResponse.json({ error: 'Aucune session WhatsApp connectée' }, { status: 400 })
  }

  // Le template doit appartenir à l'utilisateur (l'envoi vérifie ensuite l'approbation).
  const { data: tpl } = await supabase
    .from('whatsapp_templates')
    .select('id')
    .eq('id', templateId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!tpl) return NextResponse.json({ error: 'Modèle introuvable' }, { status: 400 })

  // Créer/retrouver le contact AVANT l'envoi (sendTemplateToContact exige un contactId).
  const { data: contact } = await supabase
    .from('contacts')
    .upsert({ session_id: session.id, phone_number: phoneRaw }, { onConflict: 'session_id,phone_number' })
    .select('id')
    .single()
  if (!contact) return NextResponse.json({ error: 'Erreur contact' }, { status: 500 })

  // Envoi (manuel → saute les garde-fous opt-in) + trace inbox gérée en interne.
  const res = await sendTemplateToContact({
    templateId,
    contactId: contact.id,
    variables,
    manual: true,
  })
  if (!res.ok) {
    const notFound = res.error === 'template_introuvable' || res.error === 'template_non_approuve'
    return NextResponse.json({ error: res.error || 'Échec de l\'envoi' }, { status: notFound ? 400 : 502 })
  }

  // Récupérer l'id de la conversation (upsertée par sendTemplateToContact).
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('session_id', session.id)
    .eq('contact_id', contact.id)
    .maybeSingle()

  return NextResponse.json({ data: { conversation_id: conversation?.id } })
}
