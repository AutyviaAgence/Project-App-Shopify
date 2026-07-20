import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { sendMessage } from '@/lib/messaging/send'

/**
 * POST /api/tools/whatsapp-send
 * Internal proxy for AI agents to send WhatsApp messages to configured contacts.
 * Called by the tool executor with agent context.
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Auth: internal server calls use X-Internal-Secret header, browser calls use Supabase session
    const internalSecret = req.headers.get('x-internal-secret')
    const isInternalCall = internalSecret === process.env.SUPABASE_SERVICE_ROLE_KEY
    let callerUserId: string | null = null
    if (!isInternalCall) {
      const supabaseAuth = await createClient()
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      callerUserId = user.id
    }
    const { agent_id, session_id: explicitSessionId, contact_name, contact_id, phone_number, message, send_delay, notification_type } = body

    if (!agent_id || !message) {
      return NextResponse.json({ error: 'agent_id and message are required' }, { status: 400 })
    }

    if (!contact_name && !phone_number) {
      return NextResponse.json({ error: 'contact_name or phone_number is required' }, { status: 400 })
    }

    // Use admin client to fetch session
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Resolve session: prefer explicit session_id from tool config, fallback to wa_links
    let sessionId = explicitSessionId as string | undefined
    if (!sessionId) {
      const { data: link } = await supabase
        .from('wa_links')
        .select('session_id')
        // ⚠️ La colonne s'appelle `ai_agent_id`, pas `agent_id` — vérifié en base
        // (`agent_id` renvoie 400). L'erreur n'était pas lue (seul `data` est
        // destructuré), donc la requête échouait EN SILENCE : l'envoi WhatsApp
        // répondait « No WhatsApp session linked to this agent » quoi qu'il arrive.
        .eq('ai_agent_id', agent_id)
        .limit(1)
        .single()
      if (!link) {
        return NextResponse.json({ error: 'No WhatsApp session linked to this agent' }, { status: 404 })
      }
      sessionId = link.session_id
    }

    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('user_id, integration_type, instance_name, waba_phone_number_id, waba_access_token, daily_ai_message_limit, ai_message_delay')
      .eq('id', sessionId)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'WhatsApp session not found' }, { status: 404 })
    }

    // SÉCURITÉ (IDOR) : pour un appel navigateur, la session doit appartenir à
    // l'utilisateur connecté — sinon on pourrait envoyer depuis le numéro d'un
    // autre marchand. Les appels internes (agent) sont déjà de confiance.
    if (!isInternalCall && session.user_id !== callerUserId) {
      return NextResponse.json({ error: 'Accès refusé à cette session' }, { status: 403 })
    }

    // Check daily message limit
    if (session.daily_ai_message_limit) {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('sent_by', 'ai_agent')
        .gte('created_at', todayStart.toISOString())

      if ((count ?? 0) >= session.daily_ai_message_limit) {
        return NextResponse.json({
          error: `Daily message limit reached (${count}/${session.daily_ai_message_limit}). Message not sent.`,
        }, { status: 429 })
      }
    }

    // Apply delays: session-level + tool-level (both in seconds)
    const sessionDelay = session.ai_message_delay || 0
    const toolDelay = typeof send_delay === 'number' ? Math.min(send_delay, 300) : 0
    const totalDelay = Math.max(sessionDelay, toolDelay)
    if (totalDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, totalDelay * 1000))
    }

    // sendMessage déchiffre le token en interne — on passe la valeur brute (chiffrée)
    const sessionCtx = {
      waba_phone_number_id: session.waba_phone_number_id,
      waba_access_token: session.waba_access_token,
    }

    // Format phone number (remove + and spaces)
    const cleanPhone = (phone_number || '').replace(/[\s+\-()]/g, '')

    if (!cleanPhone) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    // ── TEMPLATE D'ABORD (API officielle) ──────────────────────────────
    // Hors fenêtre de 24 h, Meta REFUSE les messages libres : la notification
    // fiable passe par le template UTILITY approuvé « xeyo_notification »
    // ({{1}} = le message). S'il est approuvé et que l'outil a fourni le
    // contact_id, on l'utilise ; sinon on retombe sur le texte libre (valable
    // uniquement si le destinataire a écrit dans les dernières 24 h).
    if (contact_id) {
      // Le TYPE choisi par l'agent (generic/commande/sav) mappe vers son
      // template dédié ; repli sur le générique si le type n'est pas approuvé.
      const NAME_BY_TYPE: Record<string, string> = {
        generic: 'xeyo_notification',
        commande: 'xeyo_notif_commande',
        sav: 'xeyo_notif_sav',
      }
      const wantedName = NAME_BY_TYPE[String(notification_type)] || 'xeyo_notification'
      const candidates = wantedName === 'xeyo_notification' ? [wantedName] : [wantedName, 'xeyo_notification']
      let notifTpl: { id: string } | null = null
      for (const name of candidates) {
        const { data } = await supabase
          .from('whatsapp_templates')
          .select('id')
          .eq('user_id', session.user_id)
          .eq('name', name)
          .eq('status', 'approved')
          .limit(1)
          .maybeSingle()
        if (data) { notifTpl = data; break }
      }
      if (notifTpl) {
        const { sendTemplateToContact } = await import('@/lib/automations/dispatch')
        const r = await sendTemplateToContact({
          templateId: notifTpl.id,
          contactId: contact_id,
          variables: { notification_message: message },
          manual: true, // notification interne configurée par le marchand
        })
        if (r.ok) {
          return NextResponse.json({
            sent: true,
            via: 'template',
            to: cleanPhone,
            contact: contact_name || null,
            message_preview: message.slice(0, 100),
          })
        }
        // Échec template (ex. variante non trouvée) → on tente le texte libre.
      }
    }

    // Send the message (texte libre : fenêtre de 24 h uniquement)
    const result = await sendMessage(sessionCtx, cleanPhone, message)

    if (!result.ok) {
      return NextResponse.json({
        error: `${result.error} (destinataire hors fenêtre de 24 h ? Approuvez le modèle « xeyo_notification » pour des notifications garanties)`,
      }, { status: 500 })
    }

    return NextResponse.json({
      sent: true,
      via: 'freeform',
      to: cleanPhone,
      contact: contact_name || null,
      message_preview: message.slice(0, 100),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
