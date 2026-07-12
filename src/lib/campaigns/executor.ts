import { getAdminSupabase } from '@/lib/supabase/admin-singleton'
import { withSessionDelay } from '@/lib/messaging/session-queue'
import { decryptMessage, encryptMessage } from '@/lib/crypto/encryption'
import { canUseAi } from '@/lib/plans/gate'
import { isRateLimitError } from '@/lib/whatsapp-cloud/send-errors'

/**
 * Exécuteur de campagnes de relance WhatsApp
 * Fonctionne en arrière-plan sur VPS (pas de timeout)
 */

interface Campaign {
  id: string
  user_id: string
  name: string
  status: string
  conversation_agent_id: string | null
  message_template: string | null
  // Template Meta approuvé (prioritaire sur message_template)
  template_id: string | null
  template_params: Record<string, string> | null
  delay_between_min: number
  delay_between_max: number
  messages_per_hour: number
  send_hour_start: number
  send_hour_end: number
}

// Lock in-memory pour éviter l'exécution concurrente d'une même campagne
const runningCampaigns = new Set<string>()

/**
 * Lance l'exécution d'une campagne en arrière-plan
 * Appelé depuis /api/campaigns/[id]/actions quand action = start ou resume
 */
export function startCampaignExecution(campaignId: string): void {
  // Vérifier le lock pour éviter double exécution (double-click, retry réseau)
  if (runningCampaigns.has(campaignId)) {
    console.warn(`[Campaign ${campaignId}] Already running, skipping duplicate execution`)
    return
  }
  runningCampaigns.add(campaignId)

  // Fire & forget - on ne bloque pas la réponse HTTP
  executeCampaignById(campaignId)
    .catch((err) => {
      console.error(`[Campaign ${campaignId}] Execution error:`, err)
    })
    .finally(() => {
      runningCampaigns.delete(campaignId)
    })
}

async function executeCampaignById(campaignId: string): Promise<void> {
  const supabase = getAdminSupabase()

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (error || !campaign) {
    console.error(`[Campaign ${campaignId}] Not found`)
    return
  }

  if (campaign.status !== 'running') {
    console.log(`[Campaign ${campaignId}] Not in running state (${campaign.status})`)
    return
  }

  await executeCampaign(supabase, campaign as Campaign)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeCampaign(supabase: any, campaign: Campaign): Promise<void> {
  const campaignId = campaign.id
  console.log(`[Campaign ${campaignId}] Starting execution...`)

  // Gate plan : les campagnes nécessitent un plan payant (ou trial actif).
  // Plan free → campagne mise en pause avec raison explicite.
  const gate = await canUseAi(campaign.user_id)
  if (!gate.allowed) {
    console.log(`[Campaign ${campaignId}] Plan ${gate.plan} sans campagnes (${gate.reason}), mise en pause`)
    await supabase
      .from('campaigns')
      .update({
        status: 'paused',
        paused_at: new Date().toISOString(),
        pause_reason: 'Les campagnes nécessitent un plan payant. Passez à un plan supérieur pour continuer.',
      })
      .eq('id', campaignId)
    return
  }

  // Récupérer le timezone de l'utilisateur
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', campaign.user_id)
    .single()
  const userTimezone = profile?.timezone || 'Europe/Paris'

  // Récupérer le template Meta approuvé (mode prioritaire pour la relance hors fenêtre 24h)
  let template: { name: string; language: string; source_language: string | null } | null = null
  if (campaign.template_id) {
    const { data } = await supabase
      .from('whatsapp_templates')
      .select('name, language, status, source_language')
      .eq('id', campaign.template_id)
      .single()
    if (data && data.status === 'approved') {
      template = { name: data.name, language: data.language, source_language: data.source_language }
    } else {
      console.error(`[Campaign ${campaignId}] Template ${campaign.template_id} introuvable ou non approuvé`)
    }
  }

  // Variantes linguistiques APPROUVÉES de ce modèle (même nom), pour envoyer à
  // chaque contact le template dans sa langue. Indexées par code langue.
  const langVariants = new Map<string, string>() // language -> (toujours le même name)
  if (template) {
    const { data: variants } = await supabase
      .from('whatsapp_templates')
      .select('language, status')
      .eq('user_id', campaign.user_id)
      .eq('name', template.name)
      .eq('status', 'approved')
    for (const v of variants || []) langVariants.set(v.language, template.name)
  }


  // Récupération après crash : un destinataire resté en 'sending' vient d'un
  // exécuteur interrompu (le lock in-memory est perdu au redémarrage serveur).
  // On le remet en file plutôt que de le laisser bloqué à jamais.
  await supabase
    .from('campaign_recipients')
    .update({ status: 'pending' })
    .eq('campaign_id', campaignId)
    .eq('status', 'sending')

  // Récupérer les destinataires en attente
  const { data: recipients } = await supabase
    .from('campaign_recipients')
    .select('*')
    .eq('campaign_id', campaignId)
    .in('status', ['pending', 'queued'])
    .order('queued_at', { ascending: true })

  if (!recipients || recipients.length === 0) {
    console.log(`[Campaign ${campaignId}] No recipients, marking as completed`)
    await supabase
      .from('campaigns')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', campaignId)
    return
  }

  console.log(`[Campaign ${campaignId}] Processing ${recipients.length} recipients...`)

  let sentThisHour = 0
  let hourStart = Date.now()
  let recipientIndex = 0

  for (const recipient of recipients) {
    // Vérifier si la campagne est toujours running (tous les 10 destinataires pour limiter les queries DB)
    if (recipientIndex % 10 === 0) {
      const { data: currentCampaign } = await supabase
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .single()

      if (currentCampaign?.status !== 'running') {
        console.log(`[Campaign ${campaignId}] Status changed to ${currentCampaign?.status}, stopping`)
        break
      }
    }
    recipientIndex++

    // Vérifier les heures d'envoi
    if (!isWithinSendingHours(campaign.send_hour_start, campaign.send_hour_end, userTimezone)) {
      console.log(`[Campaign ${campaignId}] Outside sending hours, pausing`)
      await supabase
        .from('campaigns')
        .update({
          status: 'paused',
          paused_at: new Date().toISOString(),
          pause_reason: 'Hors des heures d\'envoi autorisées'
        })
        .eq('id', campaignId)
      break
    }

    // Vérifier limite par heure
    if (sentThisHour >= campaign.messages_per_hour) {
      const elapsed = Date.now() - hourStart
      if (elapsed < 3600000) {
        const waitTime = Math.ceil((3600000 - elapsed) / 1000)
        console.log(`[Campaign ${campaignId}] Hourly limit reached (${campaign.messages_per_hour}), waiting ${waitTime}s`)
        await sleep(3600000 - elapsed)
        sentThisHour = 0
        hourStart = Date.now()
      }
    }

    // Récupérer session et contact
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('id, instance_name, status, integration_type, waba_phone_number_id, waba_access_token, ai_message_delay, marketing_paused')
      .eq('id', recipient.session_id)
      .single()

    if (!session || session.status !== 'connected') {
      await supabase
        .from('campaign_recipients')
        .update({ status: 'skipped', error_message: 'Session non connectée' })
        .eq('id', recipient.id)
      continue
    }

    // Qualité RED : Meta a mis le numéro en pause marketing. Envoyer un template
    // (marketing) dans cet état dégrade encore la qualité → on pause la campagne
    // tout de suite (les destinataires restent pending, reprise après remontée
    // de qualité). Les campagnes texte simple ne sont pas concernées.
    if (template && (session as { marketing_paused?: boolean }).marketing_paused) {
      await supabase
        .from('campaign_recipients')
        .update({ status: 'pending', error_message: null })
        .eq('id', recipient.id)
      await supabase
        .from('campaigns')
        .update({
          status: 'paused',
          paused_at: new Date().toISOString(),
          pause_reason: 'Qualité du numéro trop basse (marketing en pause chez Meta). Reprenez quand la qualité remonte.',
        })
        .eq('id', campaignId)
      console.warn(`[Campaign ${campaignId}] Number marketing-paused (RED quality), pausing campaign`)
      break
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, phone_number, name, preferred_language')
      .eq('id', recipient.contact_id)
      .single()

    if (!contact) {
      await supabase
        .from('campaign_recipients')
        .update({ status: 'skipped', error_message: 'Contact introuvable' })
        .eq('id', recipient.id)
      continue
    }

    // Générer le message depuis le message_template (le template Meta approuvé,
    // s'il existe, est envoyé séparément plus bas via sendTemplate).
    const safeName = sanitizeForPrompt(contact.name || 'Client')
    const safePhone = contact.phone_number.replace(/[^0-9+]/g, '')
    const message = (campaign.message_template || '')
      .replace(/{contact_name}/g, safeName)
      .replace(/{phone_number}/g, safePhone)

    if (!message && !template) {
      await supabase
        .from('campaign_recipients')
        .update({ status: 'skipped', error_message: 'Pas de message à envoyer' })
        .eq('id', recipient.id)
      continue
    }

    // Marquer comme sending
    await supabase
      .from('campaign_recipients')
      .update({ status: 'sending' })
      .eq('id', recipient.id)

    // Envoyer via WABA : template Meta approuvé (prioritaire) sinon message texte
    const sessionDelay = session.ai_message_delay ?? 0
    const result = await withSessionDelay(session.id, sessionDelay, () => {
      if (template) {
        // Paramètres du template : valeurs de campaign.template_params, avec {contact_name} résolu
        const params = Object.values(campaign.template_params || {}).map((v) =>
          String(v).replace(/{contact_name}/g, contact.name || 'Client')
        )
        // MULTILINGUE : choisir la langue de la variante selon le contact.
        // Cascade : langue contact → langue source → 'fr' → langue du modèle.
        const prefs = [contact.preferred_language, template!.source_language, 'fr', template!.language]
          .filter((l): l is string => !!l)
        const lang = prefs.find((l) => langVariants.has(l)) || template!.language
        return sendCampaignTemplate(session, contact.phone_number, template!.name, lang, params)
      }
      return sendWhatsAppMessage(session, contact.phone_number, message)
    })

    if (result.success) {
      await supabase
        .from('campaign_recipients')
        .update({
          status: 'sent',
          message_sent: message,
          sent_at: new Date().toISOString()
        })
        .eq('id', recipient.id)

      sentThisHour++
      console.log(`[Campaign ${campaignId}] Sent to ${contact.phone_number} (${sentThisHour}/${campaign.messages_per_hour}/h)`)

      // Mettre à jour la conversation si elle existe
      if (recipient.conversation_id) {
        const updateData: Record<string, unknown> = {
          last_message_at: new Date().toISOString(),
          last_message_preview: message.slice(0, 100)
        }

        // Changer l'agent de conversation si spécifié dans la campagne
        if (campaign.conversation_agent_id) {
          updateData.agent_id = campaign.conversation_agent_id
          console.log(`[Campaign ${campaignId}] Switching conversation agent to ${campaign.conversation_agent_id}`)
        }

        await supabase
          .from('conversations')
          .update(updateData)
          .eq('id', recipient.conversation_id)

        // Tracer le message sortant AVEC son wamid + campaign_id : permet de
        // rattacher les accusés livré/lu de Meta et d'agréger le funnel de
        // livraison par campagne (Phase 2 perf). Sans wamid, aucun receipt
        // n'était corrélable → delivered/read structurellement à 0.
        await supabase.from('messages').insert({
          conversation_id: recipient.conversation_id,
          session_id: session.id,
          direction: 'outbound',
          content: encryptMessage(message || `[Modèle : ${template?.name || ''}]`),
          message_type: 'text',
          sent_by: 'user',
          status: 'sent',
          wa_message_id: result.waMessageId ?? null,
          campaign_id: campaignId,
        })
      }
    } else if (isRateLimitError(result.error || '')) {
      // Limite d'envoi Meta atteinte : ce N'EST PAS un échec du destinataire. On
      // le REMET en file (pending) et on met la campagne en pause avec report —
      // la fenêtre glissante de Meta libèrera de la place. Sinon on brûlait tous
      // les destinataires restants en « échec » définitif.
      await supabase
        .from('campaign_recipients')
        .update({ status: 'pending', error_message: null })
        .eq('id', recipient.id)
      await supabase
        .from('campaigns')
        .update({
          status: 'paused',
          paused_at: new Date().toISOString(),
          pause_reason: 'Limite d\'envoi Meta atteinte. Reprenez la campagne dans ~1 h (la fenêtre de 24 h de Meta libèrera de la place).',
        })
        .eq('id', campaignId)
      console.warn(`[Campaign ${campaignId}] Rate limited by Meta, pausing (recipient requeued): ${result.error}`)
      break
    } else {
      await supabase
        .from('campaign_recipients')
        .update({
          status: 'failed',
          error_message: result.error
        })
        .eq('id', recipient.id)
      console.log(`[Campaign ${campaignId}] Failed to send to ${contact.phone_number}: ${result.error}`)
    }

    // Mettre à jour les stats
    await supabase.rpc('update_campaign_stats', { p_campaign_id: campaignId })

    // Attendre le délai aléatoire
    const delay = getRandomDelay(campaign.delay_between_min, campaign.delay_between_max)
    console.log(`[Campaign ${campaignId}] Waiting ${(delay / 1000).toFixed(1)}s...`)
    await sleep(delay)
  }

  // Vérifier s'il reste des destinataires
  const { count } = await supabase
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .in('status', ['pending', 'queued'])

  if (count === 0) {
    console.log(`[Campaign ${campaignId}] All recipients processed, marking as completed`)
    await supabase
      .from('campaigns')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', campaignId)
  }
}

/** Sanitize contact data to prevent prompt injection */
function sanitizeForPrompt(value: string): string {
  // Remove control characters and limit length
  return value
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[{}]/g, '')
    .slice(0, 100)
    .trim()
}

async function sendWhatsAppMessage(
  session: { waba_phone_number_id?: string | null; waba_access_token?: string | null },
  phoneNumber: string,
  message: string
): Promise<{ success: boolean; error?: string; waMessageId?: string | null }> {
  try {
    // WABA : utiliser l'API Meta Graph directement
    const token = session.waba_access_token ? decryptMessage(session.waba_access_token) : null
    if (!session.waba_phone_number_id || !token) {
      return { success: false, error: 'Credentials WABA manquants' }
    }
    const response = await fetch(`https://graph.facebook.com/v22.0/${session.waba_phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: { body: message },
      }),
    })
    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }
    // wamid : indispensable pour rattacher ensuite les accusés livré/lu.
    const data = await response.json().catch(() => null)
    const waMessageId = data?.messages?.[0]?.id ?? null
    return { success: true, waMessageId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' }
  }
}

/** Envoie un template WhatsApp approuvé (pour relance hors fenêtre 24h). */
async function sendCampaignTemplate(
  session: { waba_phone_number_id?: string | null; waba_access_token?: string | null },
  phoneNumber: string,
  templateName: string,
  languageCode: string,
  params: string[]
): Promise<{ success: boolean; error?: string; waMessageId?: string | null }> {
  try {
    const token = session.waba_access_token ? decryptMessage(session.waba_access_token) : null
    if (!session.waba_phone_number_id || !token) {
      return { success: false, error: 'Credentials WABA manquants' }
    }
    const components = params.length > 0
      ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }]
      : []
    const response = await fetch(`https://graph.facebook.com/v22.0/${session.waba_phone_number_id}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components.length > 0 ? { components } : {}),
        },
      }),
    })
    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }
    const data = await response.json().catch(() => null)
    const waMessageId = data?.messages?.[0]?.id ?? null
    return { success: true, waMessageId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' }
  }
}

function isWithinSendingHours(startHour: number, endHour: number, timezone: string): boolean {
  const now = new Date()
  // Use Intl to get the current hour in the user's timezone
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }).format(now)
  )
  return hour >= startHour && hour < endHour
}

function getRandomDelay(minSec: number, maxSec: number): number {
  return (minSec + Math.random() * (maxSec - minSec)) * 1000
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
