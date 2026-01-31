// Supabase Edge Function: campaign-executor
// Exécute les campagnes de relance WhatsApp de manière asynchrone
// Déployé avec: supabase functions deploy campaign-executor

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

interface Recipient {
  id: string
  campaign_id: string
  contact_id: string
  conversation_id: string | null
  session_id: string
  status: string
}

interface AIAgent {
  id: string
  system_prompt: string
  model: string
  temperature: number
}

interface WhatsAppSession {
  id: string
  instance_name: string
  status: string
}

interface Contact {
  id: string
  phone_number: string
  name: string | null
}

// Générer message avec l'agent IA
async function generateAIMessage(
  agent: AIAgent,
  contact: Contact,
  openaiApiKey: string
): Promise<string> {
  const systemPrompt = agent.system_prompt
    .replace('{contact_name}', contact.name || 'Client')
    .replace('{phone_number}', contact.phone_number)

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
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
    const error = await response.text()
    throw new Error(`OpenAI error: ${error}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

// Envoyer message via Evolution API
async function sendWhatsAppMessage(
  instanceName: string,
  phoneNumber: string,
  message: string,
  evolutionApiUrl: string,
  evolutionApiKey: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch(
      `${evolutionApiUrl}/message/sendText/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'apikey': evolutionApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: phoneNumber,
          text: message,
        })
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }

    const data = await response.json()
    return { success: true, messageId: data.key?.id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Vérifier si dans les heures d'envoi autorisées
function isWithinSendingHours(startHour: number, endHour: number, timezone = 'Europe/Paris'): boolean {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  })
  const currentHour = parseInt(formatter.format(now))
  return currentHour >= startHour && currentHour < endHour
}

// Calculer délai aléatoire entre min et max
function getRandomDelay(minSec: number, maxSec: number): number {
  return (minSec + Math.random() * (maxSec - minSec)) * 1000
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { campaign_id, action } = await req.json()

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ error: 'campaign_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Créer client Supabase admin
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Récupérer la campagne
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single()

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: 'Campaign not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Action: start
    if (action === 'start' || action === 'resume') {
      if (campaign.status !== 'running') {
        return new Response(
          JSON.stringify({ error: 'Campaign not in running state' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

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

      // Récupérer les destinataires pending/queued
      const { data: recipients } = await supabase
        .from('campaign_recipients')
        .select('*')
        .eq('campaign_id', campaign_id)
        .in('status', ['pending', 'queued'])
        .order('queued_at', { ascending: true })

      if (!recipients || recipients.length === 0) {
        // Campagne terminée
        await supabase
          .from('campaigns')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', campaign_id)

        return new Response(
          JSON.stringify({ message: 'Campaign completed - no more recipients' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      let sentThisHour = 0
      const hourStart = Date.now()

      for (const recipient of recipients) {
        // Vérifier si la campagne est toujours running
        const { data: currentCampaign } = await supabase
          .from('campaigns')
          .select('status')
          .eq('id', campaign_id)
          .single()

        if (currentCampaign?.status !== 'running') {
          console.log(`Campaign ${campaign_id} no longer running, stopping`)
          break
        }

        // Vérifier les heures d'envoi
        if (!isWithinSendingHours(campaign.send_hour_start, campaign.send_hour_end)) {
          console.log(`Outside sending hours (${campaign.send_hour_start}-${campaign.send_hour_end}), pausing`)
          await supabase
            .from('campaigns')
            .update({
              status: 'paused',
              paused_at: new Date().toISOString(),
              pause_reason: 'outside_sending_hours'
            })
            .eq('id', campaign_id)
          break
        }

        // Vérifier limite par heure
        if (sentThisHour >= campaign.messages_per_hour) {
          const elapsed = Date.now() - hourStart
          if (elapsed < 3600000) {
            const waitTime = 3600000 - elapsed
            console.log(`Hourly limit reached (${campaign.messages_per_hour}), waiting ${waitTime}ms`)
            await new Promise(resolve => setTimeout(resolve, waitTime))
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
            .update({ status: 'skipped', error_message: 'Session not connected' })
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
            .update({ status: 'skipped', error_message: 'Contact not found' })
            .eq('id', recipient.id)
          continue
        }

        // Générer le message
        let message: string
        if (agent) {
          try {
            message = await generateAIMessage(agent, contact, openaiApiKey)
          } catch (error) {
            console.error('AI generation error:', error)
            message = campaign.message_template || ''
          }
        } else {
          message = (campaign.message_template || '')
            .replace('{contact_name}', contact.name || 'Client')
            .replace('{phone_number}', contact.phone_number)
        }

        if (!message) {
          await supabase
            .from('campaign_recipients')
            .update({ status: 'skipped', error_message: 'No message to send' })
            .eq('id', recipient.id)
          continue
        }

        // Marquer comme sending
        await supabase
          .from('campaign_recipients')
          .update({ status: 'sending' })
          .eq('id', recipient.id)

        // Envoyer le message
        const result = await sendWhatsAppMessage(
          session.instance_name,
          contact.phone_number,
          message,
          evolutionApiUrl,
          evolutionApiKey
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
        }

        // Mettre à jour les stats
        await supabase.rpc('update_campaign_stats', { p_campaign_id: campaign_id })

        // Attendre le délai aléatoire
        const delay = getRandomDelay(campaign.delay_between_min, campaign.delay_between_max)
        console.log(`Waiting ${Math.round(delay / 1000)}s before next message...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      // Vérifier s'il reste des destinataires
      const { count } = await supabase
        .from('campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign_id)
        .in('status', ['pending', 'queued'])

      if (count === 0) {
        await supabase
          .from('campaigns')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', campaign_id)
      }

      return new Response(
        JSON.stringify({ message: 'Campaign execution completed', sent: sentThisHour }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Campaign executor error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
