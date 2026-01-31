import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/campaigns/[id]/execute
 * Exécute une campagne de manière asynchrone (fire & forget)
 * Cette route est appelée en interne après le démarrage d'une campagne
 *
 * Sur VPS, pas de timeout → on peut exécuter des processus longs
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  // Vérifier le secret interne (évite les appels externes)
  const authHeader = req.headers.get('x-internal-secret')
  const internalSecret = process.env.INTERNAL_API_SECRET

  if (!internalSecret || authHeader !== internalSecret) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  // Créer client Supabase admin (service role)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Récupérer la campagne
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campagne non trouvée' }, { status: 404 })
  }

  if (campaign.status !== 'running') {
    return NextResponse.json({ error: 'Campagne pas en cours' }, { status: 400 })
  }

  // Lancer l'exécution en arrière-plan (ne pas attendre)
  executeCampaign(supabase, campaign).catch((err) => {
    console.error(`[Campaign ${campaignId}] Execution error:`, err)
  })

  return NextResponse.json({ message: 'Exécution lancée' })
}

interface Campaign {
  id: string
  user_id: string
  name: string
  status: string
  relance_agent_id: string | null
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeCampaign(supabase: any, campaign: Campaign) {
  const campaignId = campaign.id
  console.log(`[Campaign ${campaignId}] Starting execution...`)

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
  const hourStart = Date.now()

  for (const recipient of recipients) {
    // Vérifier si la campagne est toujours running
    const { data: currentCampaign } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', campaignId)
      .single()

    if (currentCampaign?.status !== 'running') {
      console.log(`[Campaign ${campaignId}] Status changed to ${currentCampaign?.status}, stopping`)
      break
    }

    // Vérifier les heures d'envoi
    if (!isWithinSendingHours(campaign.send_hour_start, campaign.send_hour_end)) {
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
        console.log(`[Campaign ${campaignId}] Hourly limit reached, waiting ${waitTime}s`)
        await sleep(3600000 - elapsed)
        sentThisHour = 0
      }
    }

    // Récupérer session et contact
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('id, instance_name, status')
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
      try {
        message = await generateAIMessage(agent, contact)
      } catch (error) {
        console.error(`[Campaign ${campaignId}] AI error:`, error)
        message = campaign.message_template || ''
      }
    } else {
      message = (campaign.message_template || '')
        .replace(/{contact_name}/g, contact.name || 'Client')
        .replace(/{phone_number}/g, contact.phone_number)
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

    // Envoyer le message via Evolution API
    const result = await sendWhatsAppMessage(session.instance_name, contact.phone_number, message)

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
        await supabase
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: message.slice(0, 100)
          })
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

async function generateAIMessage(agent: AIAgent, contact: Contact): Promise<string> {
  const systemPrompt = agent.system_prompt
    .replace(/{contact_name}/g, contact.name || 'Client')
    .replace(/{phone_number}/g, contact.phone_number)

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
        { role: 'user', content: `Génère un message de relance personnalisé pour ${contact.name || 'ce contact'}.` }
      ]
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.statusText}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

async function sendWhatsAppMessage(
  instanceName: string,
  phoneNumber: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL
    const evolutionKey = process.env.EVOLUTION_API_KEY

    if (!evolutionUrl || !evolutionKey) {
      return { success: false, error: 'Evolution API non configurée' }
    }

    const response = await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
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

function isWithinSendingHours(startHour: number, endHour: number): boolean {
  const now = new Date()
  const hour = now.getHours()
  return hour >= startHour && hour < endHour
}

function getRandomDelay(minSec: number, maxSec: number): number {
  return (minSec + Math.random() * (maxSec - minSec)) * 1000
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
