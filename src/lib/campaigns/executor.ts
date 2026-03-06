import { createClient } from '@supabase/supabase-js'
import { checkTokenLimit, recordTokenUsage } from '@/lib/openai/token-tracker'
import { withSessionDelay } from '@/lib/messaging/session-queue'

/**
 * Exécuteur de campagnes de relance WhatsApp
 * Fonctionne en arrière-plan sur VPS (pas de timeout)
 */

interface Campaign {
  id: string
  user_id: string
  name: string
  status: string
  relance_agent_id: string | null
  conversation_agent_id: string | null
  message_template: string | null
  delay_between_min: number
  delay_between_max: number
  messages_per_hour: number
  send_hour_start: number
  send_hour_end: number
}

interface AIAgent {
  id: string
  system_prompt: string
  model: string
  temperature: number
}

interface Contact {
  id: string
  phone_number: string
  name: string | null
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
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

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

  // Récupérer le timezone de l'utilisateur
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', campaign.user_id)
    .single()
  const userTimezone = profile?.timezone || 'Europe/Paris'

  // Récupérer l'agent IA si configuré
  let agent: AIAgent | null = null
  if (campaign.relance_agent_id) {
    const { data } = await supabase
      .from('ai_agents')
      .select('id, system_prompt, model, temperature')
      .eq('id', campaign.relance_agent_id)
      .single()
    agent = data
  }

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
      .select('id, instance_name, status, integration_type, waba_phone_number_id, waba_access_token, ai_message_delay')
      .eq('id', recipient.session_id)
      .single()

    if (!session || session.status !== 'connected') {
      await supabase
        .from('campaign_recipients')
        .update({ status: 'skipped', error_message: 'Session non connectée' })
        .eq('id', recipient.id)
      continue
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, phone_number, name')
      .eq('id', recipient.contact_id)
      .single()

    if (!contact) {
      await supabase
        .from('campaign_recipients')
        .update({ status: 'skipped', error_message: 'Contact introuvable' })
        .eq('id', recipient.id)
      continue
    }

    // Générer le message
    let message: string
    if (agent) {
      // Vérifier la limite de tokens avant de générer
      const tokenCheck = await checkTokenLimit(campaign.user_id)
      if (!tokenCheck.allowed) {
        console.log(`[Campaign ${campaignId}] Token limit reached, pausing campaign`)
        await supabase
          .from('campaigns')
          .update({
            status: 'paused',
            paused_at: new Date().toISOString(),
            pause_reason: 'Limite de tokens IA atteinte'
          })
          .eq('id', campaignId)
        break
      } else {
        try {
          message = await generateAIMessage(agent, contact, campaign.user_id)
        } catch (error) {
          console.error(`[Campaign ${campaignId}] AI error:`, error)
          message = campaign.message_template || ''
        }
      }
    } else {
      const safeName = sanitizeForPrompt(contact.name || 'Client')
      const safePhone = contact.phone_number.replace(/[^0-9+]/g, '')
      message = (campaign.message_template || '')
        .replace(/{contact_name}/g, safeName)
        .replace(/{phone_number}/g, safePhone)
    }

    if (!message) {
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

    // Envoyer le message via l'intégration appropriée (Evolution ou WABA)
    const sessionDelay = session.ai_message_delay ?? 0
    const result = await withSessionDelay(session.id, sessionDelay, () =>
      sendWhatsAppMessage(session, contact.phone_number, message)
    )

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
      }
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

async function generateAIMessage(agent: AIAgent, contact: Contact, userId: string): Promise<string> {
  const safeName = sanitizeForPrompt(contact.name || 'Client')
  const safePhone = contact.phone_number.replace(/[^0-9+]/g, '')

  const systemPrompt = agent.system_prompt
    .replace(/{contact_name}/g, safeName)
    .replace(/{phone_number}/g, safePhone)

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: agent.model || 'gpt-4o-mini',
      temperature: agent.temperature ?? 0.7,
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Génère un message de relance personnalisé pour ${safeName}.` }
      ]
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.statusText}`)
  }

  const data = await response.json()
  const tokensUsed = data.usage?.total_tokens || 0
  if (tokensUsed > 0) {
    await recordTokenUsage(userId, tokensUsed)
  }
  return data.choices[0]?.message?.content || ''
}

async function sendWhatsAppMessage(
  session: { instance_name: string; integration_type?: string; waba_phone_number_id?: string | null; waba_access_token?: string | null },
  phoneNumber: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // WABA : utiliser l'API Meta Graph directement
    if (session.integration_type === 'waba') {
      if (!session.waba_phone_number_id || !session.waba_access_token) {
        return { success: false, error: 'Credentials WABA manquants' }
      }
      const response = await fetch(`https://graph.facebook.com/v22.0/${session.waba_phone_number_id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.waba_access_token}`,
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
      return { success: true }
    }

    // Evolution API (par défaut)
    const evolutionUrl = process.env.EVOLUTION_API_URL
    const evolutionKey = process.env.EVOLUTION_API_KEY

    if (!evolutionUrl || !evolutionKey) {
      return { success: false, error: 'Evolution API non configurée' }
    }

    const response = await fetch(`${evolutionUrl}/message/sendText/${session.instance_name}`, {
      method: 'POST',
      headers: {
        'apikey': evolutionKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: phoneNumber,
        text: message,
      })
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }

    return { success: true }
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
