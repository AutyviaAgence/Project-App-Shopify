import 'server-only'
import { getAdminSupabase } from '@/lib/supabase/admin-singleton'
import { generateAgentResponse, type ChatMessage, type OpenAIMessage } from './client'
import { checkTokenLimit, recordTokenUsage } from './token-tracker'
import { logAiUsage } from './usage-log'
import { sendMessage, sendMediaMessage, sendInteractiveMessage, sendImageLink, sendPresence } from '@/lib/messaging/send'
import { retrieveContext } from '@/lib/knowledge/retriever'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'
import { getAgentTools, buildOpenAITools, executeToolCall } from '@/lib/tools/executor'
import { SHOPIFY_ACTION_TOOLS, isShopifyActionTool, handleActionTool, userHasShopifyStore, NOTIFICATION_CHANNEL_TOOL, isNotificationChannelTool, handleNotificationChannelTool, TRACK_ORDER_TOOL, isTrackOrderTool, handleTrackOrder, LINK_CUSTOMER_TOOL, isLinkCustomerTool, handleLinkCustomer } from '@/lib/shopify/ai-tools'
import { checkConversationQuota } from '@/lib/shopify/plans'
import { canUseAi } from '@/lib/plans/gate'
import { pickInitialModel, isSensitiveToolName, MODEL_QUALITY } from './model-router'
import type { WhatsAppSession } from '@/types/database'

const MAX_CONTEXT_MESSAGES = 50

/**
 * Traite une réponse IA automatique pour un message entrant.
 * Conçu pour être appelé en fire-and-forget depuis le webhook.
 * Gère ses propres erreurs en interne (ne throw jamais).
 */
export async function processAIResponse(params: {
  conversationId: string
  sessionId: string
  instanceName: string
  contactPhoneNumber: string
  agentId: string
  session?: Pick<WhatsAppSession, 'integration_type' | 'instance_name' | 'waba_phone_number_id' | 'waba_access_token'>
}) {
  const supabase = getAdminSupabase()

  try {
    // 1. Récupérer la config de l'agent
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', params.agentId)
      .eq('is_active', true)
      .single()

    if (!agent) {
      console.warn('[AI] Agent introuvable ou inactif:', params.agentId)
      return
    }

    console.log('[AI] Agent trouvé:', agent.name, '| model:', agent.model)

    // 1.1. Récupérer la session complète pour les tokens + intégration
    const { data: sessionForTokens } = await supabase
      .from('whatsapp_sessions')
      .select('user_id, integration_type, instance_name, waba_phone_number_id, waba_access_token')
      .eq('id', params.sessionId)
      .single()

    const userId = sessionForTokens?.user_id
    // Utiliser la session passée en paramètre ou celle récupérée de la DB
    const sessionCtx = params.session || (sessionForTokens ? {
      integration_type: 'waba' as const,
      instance_name: sessionForTokens.instance_name || params.instanceName,
      waba_phone_number_id: sessionForTokens.waba_phone_number_id,
      waba_access_token: sessionForTokens.waba_access_token,
    } : {
      integration_type: 'waba' as const,
      instance_name: params.instanceName,
      waba_phone_number_id: null,
      waba_access_token: null,
    })
    if (userId) {
      // Gate plan : le plan free n'a AUCUNE IA (gestion manuelle). Return
      // silencieux — pas de message au contact, c'est le mode attendu du plan,
      // pas une panne. Le trial actif reste autorisé (limité par ses tokens).
      const gate = await canUseAi(userId)
      if (!gate.allowed) {
        console.log(`[AI] IA désactivée pour user ${userId} (plan ${gate.plan}, raison: ${gate.reason})`)
        return
      }

      const tokenCheck = await checkTokenLimit(userId)
      if (!tokenCheck.allowed) {
        console.log('[AI] Limite de tokens atteinte pour user:', userId, `(${tokenCheck.used}/${tokenCheck.limit})`)
        // Envoyer un message de notification au contact
        await sendMessage(
          sessionCtx,
          params.contactPhoneNumber,
          "Désolé, notre assistant IA est temporairement indisponible. Veuillez réessayer plus tard ou contacter directement notre équipe."
        )
        return
      }

      // Quota de conversations du plan (starter 100, pro 500 ; scale = illimité
      // fair-use, jamais bloqué). L'IA s'arrête au quota et l'utilisateur est
      // invité à upgrader (alerte in-app).
      const quota = await checkConversationQuota(userId)
      if (!quota.allowed) {
        console.log(`[AI] Quota conversations atteint (${quota.used}/${quota.limit}, plan ${quota.plan}) — IA stoppée pour user:`, userId)
        await supabase.from('user_alerts').insert({
          user_id: userId,
          alert_type: 'quota_reached',
          title: 'Crédits IA épuisés',
          message: `Vous avez atteint ${quota.limit} conversations IA ce mois-ci (plan ${quota.plan}). Rechargez des crédits ou passez à un plan supérieur pour continuer à répondre automatiquement.`,
          metadata: { used: quota.used, limit: quota.limit, plan: quota.plan },
        }).then(() => {}, () => {})
        return
      }
      // Alerte à 80% (une seule fois par mois calendaire) : crédits IA bientôt épuisés.
      if (quota.limit !== Infinity && quota.used >= Math.floor(quota.limit * 0.8)) {
        const periodStart = new Date(); periodStart.setDate(1); periodStart.setHours(0, 0, 0, 0)
        const { data: warned } = await supabase
          .from('user_alerts').select('id')
          .eq('user_id', userId).eq('alert_type', 'ai_credits_low')
          .gte('created_at', periodStart.toISOString()).limit(1).maybeSingle()
        if (!warned) {
          await supabase.from('user_alerts').insert({
            user_id: userId,
            alert_type: 'ai_credits_low',
            title: 'Crédits IA bientôt épuisés',
            message: `Il vous reste ${quota.limit - quota.used} conversations IA ce mois-ci (${quota.used}/${quota.limit}). Pensez à recharger pour éviter une interruption.`,
            metadata: { used: quota.used, limit: quota.limit, plan: quota.plan },
          }).then(() => {}, () => {})
        }
      }
    }

    let totalTokensUsed = 0

    // 1.5. Vérifier l'escalation (garde-fou) sur le dernier message entrant
    if (agent.escalation_enabled) {
      // Récupérer le dernier message entrant
      const { data: lastInbound } = await supabase
        .from('messages')
        .select('content')
        .eq('conversation_id', params.conversationId)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (lastInbound?.content) {
        const messageText = decryptMessage(lastInbound.content).toLowerCase()
        const escalationMode = agent.escalation_mode || 'keywords'
        let escalationTriggered = false
        let escalationReason = ''

        // Mode 1: Keywords (exact match)
        if ((escalationMode === 'keywords' || escalationMode === 'both') && agent.escalation_keywords?.length > 0) {
          const triggeredKeyword = (agent.escalation_keywords as string[]).find((kw: string) =>
            messageText.includes(kw.toLowerCase())
          )
          if (triggeredKeyword) {
            escalationTriggered = true
            escalationReason = `Mot-clé: "${triggeredKeyword}"`
          }
        }

        // Mode 2: AI detection
        if (!escalationTriggered && (escalationMode === 'ai' || escalationMode === 'both')) {
          // Situations de transfert décrites par le marchand (langage naturel).
          // Injectées en priorité ; à défaut, le détecteur applique ses règles par défaut.
          const merchantSituations = (agent.escalation_situations || '').trim()
          const situationsBlock = merchantSituations
            ? `Le marchand a défini les SITUATIONS qui doivent déclencher un transfert vers un conseiller humain :
"""
${merchantSituations}
"""
Déclenche le transfert dès qu'une de ces situations est présente. En complément, déclenche aussi pour :`
            : `Analyse le message d'un contact et détermine s'il correspond à une situation nécessitant un conseiller humain :`
          const aiCheck = await generateAgentResponse({
            model: 'gpt-4o-mini',
            temperature: 0,
            systemPrompt: `Tu es un détecteur de situations nécessitant le transfert d'une conversation e-commerce vers un conseiller humain. ${situationsBlock}
- Des insultes ou injures (même en argot, verlan, abrégé)
- Un ton agressif ou menaçant
- Des menaces légales ou physiques
- Du harcèlement
- Une demande explicite de parler à un humain

Réponds UNIQUEMENT par "OUI:raison" si un transfert est justifié, ou "NON" sinon.
Exemples :
- "t'es un con" → OUI:insulte
- "je vais porter plainte" → OUI:menace légale
- "fdp" → OUI:insulte
- "passez-moi un responsable" → OUI:demande humain
- "bonjour je voudrais un renseignement" → NON
- "c nul votre truc" → OUI:insulte
- "merci beaucoup" → NON`,
            messages: [{ role: 'user', content: messageText }],
          })

          if (aiCheck.ok) {
            totalTokensUsed += aiCheck.tokensUsed
            void logAiUsage({
              feature: 'escalation', model: 'gpt-4o-mini',
              promptTokens: aiCheck.promptTokens, completionTokens: aiCheck.completionTokens,
              userId, conversationId: params.conversationId,
            })
            const response = aiCheck.content?.trim() || ''
            if (response.toUpperCase().startsWith('OUI')) {
              escalationTriggered = true
              escalationReason = `IA: ${response.slice(4).trim() || 'message problématique détecté'}`
            }
          }
        }

        if (escalationTriggered) {
          console.log('[AI] ESCALATION détectée!', escalationReason)

          // Envoyer le message d'escalation si configuré
          if (agent.escalation_message) {
            await sendMessage(
              sessionCtx,
              params.contactPhoneNumber,
              agent.escalation_message
            )

            // Sauvegarder le message d'escalation
            await supabase.from('messages').insert({
              conversation_id: params.conversationId,
              session_id: params.sessionId,
              direction: 'outbound',
              content: encryptMessage(agent.escalation_message),
              message_type: 'text',
              sent_by: 'ai_agent',
              ai_agent_id: params.agentId,
              status: 'sent',
            })
          }

          // Désactiver l'IA pour cette conversation et enregistrer l'escalation
          await supabase
            .from('conversations')
            .update({
              is_ai_active: false,
              escalation_reason: escalationReason,
              escalated_at: new Date().toISOString(),
              last_message_at: new Date().toISOString(),
              last_message_preview: agent.escalation_message?.slice(0, 100) || 'Escalation automatique',
            })
            .eq('id', params.conversationId)

          // Créer une alerte pour l'utilisateur
          const { data: session } = await supabase
            .from('whatsapp_sessions')
            .select('user_id, instance_name')
            .eq('id', params.sessionId)
            .single()

          if (session) {
            await supabase.from('user_alerts').insert({
              user_id: session.user_id,
              alert_type: 'info',
              title: 'Escalation automatique',
              message: `Une conversation a été automatiquement transférée. Raison : ${escalationReason}. L'IA a été désactivée.`,
              metadata: {
                conversation_id: params.conversationId,
                session_id: params.sessionId,
                reason: escalationReason,
                agent_id: params.agentId,
                mode: escalationMode,
              },
            })
          }

          console.log('[AI] Conversation escaladée, IA désactivée')
          // Enregistrer les tokens avant de return
          if (userId && totalTokensUsed > 0) {
            await recordTokenUsage(userId, totalTokensUsed)
          }
          return
        }
      }
    }

    // 1.7. PLAFOND de messages IA par conversation : au-delà, on NE COUPE PAS
    // l'IA (soft) mais on notifie le marchand UNE SEULE FOIS « conversation
    // longue, voulez-vous reprendre la main ? ». Borne le coût des conversations
    // qui s'éternisent + qualité (l'IA tourne parfois en rond au-delà).
    const aiCap = agent.max_messages_per_conversation
    if (aiCap && aiCap > 0) {
      const { count: aiMsgCount } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', params.conversationId)
        .eq('sent_by', 'ai_agent')

      if ((aiMsgCount ?? 0) >= aiCap) {
        // Alerte unique : on ne re-notifie pas à chaque message au-delà du seuil.
        const { data: session2 } = await supabase
          .from('whatsapp_sessions').select('user_id').eq('id', params.sessionId).single()
        if (session2?.user_id) {
          const { data: existing } = await supabase
            .from('user_alerts')
            .select('id')
            .eq('user_id', session2.user_id)
            .eq('alert_type', 'conversation_long')
            .contains('metadata', { conversation_id: params.conversationId })
            .maybeSingle()
          if (!existing) {
            await supabase.from('user_alerts').insert({
              user_id: session2.user_id,
              alert_type: 'conversation_long',
              title: 'Conversation longue',
              message: `Une conversation dure depuis ${aiMsgCount} réponses de l'IA. Voulez-vous reprendre la main ?`,
              metadata: { conversation_id: params.conversationId, session_id: params.sessionId, agent_id: params.agentId, ai_messages: aiMsgCount },
            })
          }
        }
        // On continue quand même (soft cap) : l'IA répond, le marchand décide.
      }
    }

    // 2. Récupérer les N messages les plus récents (desc) puis remettre en ordre chrono
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('id, content, transcription, sent_by, direction, message_type, ai_processed, created_at')
      .eq('conversation_id', params.conversationId)
      .order('created_at', { ascending: false })
      .limit(MAX_CONTEXT_MESSAGES)

    // 3. Remettre en ordre chronologique et construire les messages pour OpenAI
    // Déchiffrer les messages pour le contexte IA
    const sorted = (recentMessages || []).reverse()
    const chatMessages: ChatMessage[] = sorted
      .filter((m) => m.content || m.transcription)
      .map((m) => {
        let text = m.content ? decryptMessage(m.content) : ''
        // Ajouter la transcription au contexte pour les messages média
        if (m.transcription) {
          const transcriptionText = decryptMessage(m.transcription)
          text = text ? `${text}\n[Transcription: ${transcriptionText}]` : transcriptionText
        }
        return {
          role: m.sent_by === 'contact' ? ('user' as const) : ('assistant' as const),
          content: text,
        }
      })

    // 3.5. RAG : Récupérer le contexte pertinent de la base de connaissances
    let knowledgeContext = ''
    const lastUserMessage = chatMessages.filter(m => m.role === 'user').pop()
    if (lastUserMessage) {
      const ragResult = await retrieveContext({
        agentId: params.agentId,
        userId: agent.user_id, // propriétaire de l'agent → inclut ses docs boutique (globaux)
        query: lastUserMessage.content,
        topK: 5,
        threshold: 0.35,
      })
      if (ragResult.ok && ragResult.context) {
        knowledgeContext = ragResult.context
        totalTokensUsed += ragResult.tokensUsed
        console.log('[AI] RAG contexte récupéré:', ragResult.chunks.length, 'chunks')
      } else if (!ragResult.ok) {
        console.warn('[AI] RAG erreur:', ragResult.error)
      }
    }

    // 3.6. Contexte boutique (nom + liens des pages/politiques) → injecté à TOUS
    // les agents du propriétaire (la boutique profite à tous les agents).
    let storeContextPrompt = ''
    {
      const { data: store } = await supabase
        .from('shopify_stores')
        .select('store_context')
        .eq('user_id', agent.user_id)
        .eq('is_active', true)
        .not('store_context', 'is', null)
        .maybeSingle()
      if (store?.store_context) {
        const { buildStoreContextPrompt } = await import('@/lib/shopify/sync')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        storeContextPrompt = buildStoreContextPrompt(store.store_context as any)
      }
    }

    // 4. Construire le prompt système (inclure l'objectif + connaissances si disponibles)
    const now = new Date()
    const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Paris' })
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })

    let systemPrompt = agent.system_prompt

    // 4.1. Détection automatique de langue — injectée EN PREMIER pour priorité maximale
    if (agent.auto_detect_language) {
      systemPrompt = `--- RÈGLE ABSOLUE DE LANGUE ---\nDétecte TOUJOURS la langue du dernier message de l'utilisateur et réponds OBLIGATOIREMENT dans cette même langue. Si l'utilisateur écrit en anglais → réponds en anglais. En espagnol → espagnol. En arabe → arabe. Cette règle prime sur tout le reste du prompt.\n--- FIN RÈGLE DE LANGUE ---\n\n` + systemPrompt
    }

    systemPrompt += `\n\n--- Date et heure actuelles ---\nNous sommes le ${dateStr}, il est ${timeStr} (fuseau horaire : Europe/Paris).\nUtilise TOUJOURS cette date comme référence. "Demain" = le jour suivant cette date. Pour les dates et heures dans les outils, utilise le format ISO 8601 avec timezone, par exemple : 2026-03-06T15:00:00+01:00.`
    systemPrompt += `\n\n--- Contexte de la conversation ---\nNuméro WhatsApp du client : ${params.contactPhoneNumber}\nATTENTION : Ce numéro est "${params.contactPhoneNumber}". Quand tu dois inclure le numéro WhatsApp dans un message ou une notification, écris EXACTEMENT "${params.contactPhoneNumber}" — jamais de crochets, jamais de placeholder.`

    // Identité du contact : email connu + s'il est relié à un client Shopify.
    // Sert à l'agent pour savoir s'il doit demander l'email (SAV) ou non.
    if (userId && (await userHasShopifyStore(userId))) {
      const { data: convForContact } = await supabase
        .from('conversations')
        .select('contact:contacts(notify_email, email, name, shopify_customer_id)')
        .eq('id', params.conversationId)
        .maybeSingle()
      const c = (convForContact?.contact as unknown as { notify_email: string | null; email: string | null; name: string | null; shopify_customer_id: string | null } | null)
      const contactEmail = c?.notify_email || c?.email || null
      if (c?.shopify_customer_id) {
        systemPrompt += `\nCe client est IDENTIFIÉ (compte Shopify relié${contactEmail ? `, email : ${contactEmail}` : ''}). Tu peux consulter ses commandes directement.`
      } else {
        systemPrompt += `\nCe client n'est PAS encore relié à un compte Shopify.${contactEmail ? ` Email connu : ${contactEmail}.` : ''} Pour toute demande liée à une commande (SAV, suivi, remboursement), demande d'abord poliment l'email utilisé pour la commande puis appelle l'outil link_customer. Ne traite JAMAIS un remboursement sans avoir vérifié l'identité (email + numéro de commande qui correspondent).`
      }
    }
    if (agent.objective) {
      systemPrompt += `\n\nObjectif principal : ${agent.objective}`
    }
    if (storeContextPrompt) {
      systemPrompt += `\n\n${storeContextPrompt}`
    }
    if (knowledgeContext) {
      systemPrompt += `\n\n--- Base de connaissances (PRIORITAIRE) ---\nIMPORTANT : Avant d'appeler un outil, vérifie TOUJOURS si la réponse se trouve dans la base de connaissances ci-dessous. N'appelle un outil que si l'information n'est PAS disponible ici. Utilise ces informations en priorité pour répondre de manière précise.\n\n${knowledgeContext}\n--- Fin de la base de connaissances ---`
    }

    // Injecter les "skills fenêtre 24h" : médias disponibles + boutons + lien.
    // L'agent peut composer un message riche à la volée (sans template Meta) en
    // insérant des balises dans sa réponse ; le système les exécute après coup.
    if (userId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: allUserMedia } = await (supabase as any)
        .from('knowledge_images')
        .select('ref, filename, agent_id, media_kind')
        .eq('user_id', userId) as { data: { ref: string; filename: string; agent_id: string | null; media_kind: string | null }[] | null }
      const agentMedia = (allUserMedia || []).filter(m => m.agent_id === null || m.agent_id === params.agentId)

      const images = agentMedia.filter(m => (m.media_kind || 'image') === 'image')
      const videos = agentMedia.filter(m => m.media_kind === 'video')
      const docs = agentMedia.filter(m => m.media_kind === 'document')

      const skillLines: string[] = []
      skillLines.push(`\n\n--- Compétences disponibles (fenêtre SAV, réponse libre) ---`)
      skillLines.push(`Le client vient de t'écrire : tu peux enrichir ta réponse SANS modèle pré-approuvé, en insérant ces balises. Le système les exécute et les retire du texte.`)

      if (images.length > 0) {
        skillLines.push(`\n🖼️ ENVOYER UNE IMAGE — balise [IMAGE:ref]. Images disponibles :`)
        skillLines.push(images.map(i => `  - [IMAGE:${i.ref}] → ${i.filename}`).join('\n'))
      }
      if (videos.length > 0) {
        skillLines.push(`\n🎬 ENVOYER UNE VIDÉO — balise [VIDEO:ref]. Vidéos disponibles :`)
        skillLines.push(videos.map(v => `  - [VIDEO:${v.ref}] → ${v.filename}`).join('\n'))
      }
      if (docs.length > 0) {
        skillLines.push(`\n📄 ENVOYER UN DOCUMENT — balise [DOC:ref]. Documents disponibles :`)
        skillLines.push(docs.map(d => `  - [DOC:${d.ref}] → ${d.filename}`).join('\n'))
      }

      // Boutons et liens : toujours disponibles (pas besoin de bibliothèque)
      skillLines.push(`\n🔘 PROPOSER DES BOUTONS — balise [BTN:Choix 1|Choix 2|Choix 3] (1 à 3 boutons, chaque libellé ≤ 20 caractères).
TU DOIS impérativement ajouter cette balise CHAQUE FOIS que tu proposes au client plusieurs options, choix, ou actions possibles — au lieu de les lister en texte. C'est OBLIGATOIRE, pas optionnel.
Exemples de déclenchement (insère TOUJOURS [BTN:...] dans ces cas) :
  - Le client dit "suivre ma commande ou parler à un conseiller" → réponds avec [BTN:Suivre ma commande|Parler à un conseiller]
  - Tu proposes plusieurs rubriques (livraison, retours, paiement) → [BTN:Livraison|Retours|Paiement]
  - Tu demandes au client de choisir (oui/non, telle ou telle option) → mets les choix en boutons.
La balise se place À LA FIN de ton message. Le texte que tu écris au-dessus accompagne les boutons. Quand le client clique, tu reçois le libellé comme s'il l'avait tapé.
NE liste JAMAIS des options en texte (genre "1. ... 2. ...") si tu peux les mettre en boutons.`)
      skillLines.push(`\n🔗 PARTAGER UN LIEN — balise [LINK:Libellé|https://url]. Le lien apparaît dans le message.`)
      skillLines.push(`\n🛍️ PRÉSENTER DES PRODUITS (CARROUSEL) — balise [CAROUSEL:handle1,handle2,...] (2 à 5 produits). Le système envoie pour chaque produit sa photo + son nom, prix et lien. Utilise UNIQUEMENT des "handle" de produits qui figurent dans le catalogue/la base de connaissances ci-dessus (jamais inventé). Insère cette balise quand tu recommandes ou compares plusieurs produits, au lieu de les décrire en texte.`)

      skillLines.push(`\nRÈGLES : n'utilise QUE des refs/handles listés ci-dessus (n'invente jamais un ref/handle). Insère la balise dès que le contexte s'y prête, et ne dis jamais que tu ne peux pas envoyer un média/bouton/carrousel si la balise est disponible.`)
      skillLines.push(`--- Fin des compétences ---`)

      // N'injecter que s'il y a au moins les boutons/liens (toujours vrai) — donc systématique en fenêtre SAV
      systemPrompt += skillLines.join('\n')
    }

    // 4.2. Lien de rendez-vous tracké
    if (agent.booking_url) {
      // Construire l'URL de tracking avec les paramètres de contexte
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
      const trackingUrl = new URL(`${baseUrl}/api/booking/${agent.id}`)
      trackingUrl.searchParams.set('conv', params.conversationId)
      trackingUrl.searchParams.set('session', params.sessionId)

      // Récupérer le contact_id depuis la conversation
      const { data: conv } = await supabase
        .from('conversations')
        .select('contact_id')
        .eq('id', params.conversationId)
        .single()

      if (conv?.contact_id) {
        trackingUrl.searchParams.set('contact', conv.contact_id)
      }

      systemPrompt += `\n\n--- Lien de rendez-vous ---\nSi l'utilisateur souhaite prendre un rendez-vous, planifier un appel, ou réserver un créneau, partage ce lien :\n${trackingUrl.toString()}\nUtilise ce lien tel quel sans le modifier. Tu peux l'inclure naturellement dans ta réponse quand c'est pertinent.`
      console.log('[AI] Booking URL injectée')
    }

    console.log('[AI] Contexte:', chatMessages.length, 'messages', knowledgeContext ? '| RAG actif' : '| sans RAG', agent.auto_detect_language ? '| multi-langue' : '', agent.booking_url ? '| booking' : '', '| Appel OpenAI...')

    // 4.5. Envoyer l'indicateur "en train d'écrire" avant d'appeler OpenAI
    await sendPresence(sessionCtx, params.contactPhoneNumber, 'composing')

    // 4.7. Charger les outils de l'agent (function calling)
    const agentTools = await getAgentTools(params.agentId)
    const { openaiTools, functionMap } = buildOpenAITools(agentTools)

    // 4.7b. Outils d'action Shopify (annuler/rembourser/code promo) — proposés
    // uniquement si l'utilisateur a une boutique Shopify connectée. L'IA ne fait
    // que créer une action en attente ; un humain valide ensuite.
    if (userId && (await userHasShopifyStore(userId))) {
      openaiTools.push(...SHOPIFY_ACTION_TOOLS)
      openaiTools.push(NOTIFICATION_CHANNEL_TOOL)
      openaiTools.push(TRACK_ORDER_TOOL)
      openaiTools.push(LINK_CUSTOMER_TOOL)
    }

    if (openaiTools.length > 0) {
      console.log('[AI] Outils chargés:', openaiTools.length, 'fonctions')
      const toolNames = openaiTools.map(t => t.function.name).join(', ')
      systemPrompt += `\n\n--- Outils disponibles ---\nTu disposes des outils suivants que tu DOIS utiliser quand la demande correspond : ${toolNames}.\nQuand l'utilisateur demande des informations ou actions liées à ces outils, utilise TOUJOURS l'outil approprié via un function call. Ne dis JAMAIS que tu ne peux pas accéder à ces données — appelle l'outil.\n--- Fin des outils ---`
    }

    // 5. Appeler OpenAI (avec boucle tool calling si outils disponibles)
    const MAX_TOOL_ROUNDS = 10
    const toolMessages: OpenAIMessage[] = []
    let aiResponseText = ''

    // ROUTEUR DE MODÈLE : mini par défaut, gpt-4o si demande sensible détectée
    // (mots-clés) ou si un outil sensible est appelé en cours de route. Réduit
    // fortement le coût sans sacrifier la qualité sur les cas qui comptent.
    let chosenModel = pickInitialModel(agent.model, lastUserMessage?.content)

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const aiStartedAt = Date.now()
      const result = await generateAgentResponse({
        model: chosenModel,
        temperature: agent.temperature,
        systemPrompt,
        messages: [...chatMessages, ...toolMessages],
        tools: openaiTools.length > 0 ? openaiTools : undefined,
      })

      if (!result.ok) {
        console.error('[AI] Erreur OpenAI:', result.error)
        return
      }

      totalTokensUsed += result.tokensUsed
      void logAiUsage({
        feature: 'sav_reply', model: chosenModel,
        promptTokens: result.promptTokens, completionTokens: result.completionTokens,
        latencyMs: Date.now() - aiStartedAt,
        userId, conversationId: params.conversationId,
      })

      // If no tool calls, we have our final response
      if (!result.toolCalls) {
        aiResponseText = result.content
        break
      }

      // Process tool calls
      console.log('[AI] Tool calls reçus:', result.toolCalls.length)

      // Escalade de modèle : si un outil SENSIBLE est demandé (remboursement,
      // annulation, réduction), on passe en gpt-4o pour la qualité sur l'action.
      if (chosenModel !== MODEL_QUALITY && result.toolCalls.some((tc) => isSensitiveToolName(tc.functionName))) {
        chosenModel = MODEL_QUALITY
        console.log('[AI] Outil sensible détecté → passage en', MODEL_QUALITY)
      }

      // Add the assistant message with tool_calls (native OpenAI format)
      toolMessages.push(result.rawMessage as OpenAIMessage)

      for (const tc of result.toolCalls) {
        // Outils d'action Shopify : on crée TOUJOURS une action en attente de
        // validation humaine (aucune exécution automatique).
        if (isShopifyActionTool(tc.functionName)) {
          const actionMsg = await handleActionTool(
            { functionName: tc.functionName, arguments: tc.arguments },
            { userId: userId!, conversationId: params.conversationId }
          )
          toolMessages.push({ role: 'tool', tool_call_id: tc.toolCallId, content: actionMsg })
          continue
        }

        // Opt-in canal de notification (le client choisit WhatsApp/Email).
        if (isNotificationChannelTool(tc.functionName)) {
          const { data: conv } = await supabase
            .from('conversations')
            .select('contact_id')
            .eq('id', params.conversationId)
            .maybeSingle()
          const channelMsg = await handleNotificationChannelTool(tc.arguments, { contactId: conv?.contact_id })
          toolMessages.push({ role: 'tool', tool_call_id: tc.toolCallId, content: channelMsg })
          continue
        }

        // Suivi de commande (lecture seule) : « où est ma commande ? ».
        if (isTrackOrderTool(tc.functionName)) {
          const trackMsg = await handleTrackOrder(tc.arguments, { userId: userId!, conversationId: params.conversationId })
          toolMessages.push({ role: 'tool', tool_call_id: tc.toolCallId, content: trackMsg })
          continue
        }

        // Liaison compte client Shopify (SAV) via l'email fourni par le client.
        if (isLinkCustomerTool(tc.functionName)) {
          const linkMsg = await handleLinkCustomer(tc.arguments, { userId: userId!, conversationId: params.conversationId })
          toolMessages.push({ role: 'tool', tool_call_id: tc.toolCallId, content: linkMsg })
          continue
        }

        const mapping = functionMap.get(tc.functionName)
        if (!mapping) {
          toolMessages.push({
            role: 'tool',
            tool_call_id: tc.toolCallId,
            content: 'Error: Unknown function',
          })
          continue
        }

        const { tool, fn } = mapping
        console.log('[AI] Exécution outil:', tool.name, '→', fn.name, '| args:', JSON.stringify(tc.arguments))

        const execResult = await executeToolCall(tool, fn, tc.arguments, {
          userId: userId!,
          agentId: params.agentId,
          conversationId: params.conversationId,
        })

        console.log('[AI] Résultat outil:', execResult.success ? 'OK' : 'ERREUR', `(${execResult.durationMs}ms)`)

        // Add tool result with proper "tool" role and tool_call_id
        toolMessages.push({
          role: 'tool',
          tool_call_id: tc.toolCallId,
          content: execResult.result,
        })
      }

      // Refresh typing indicator between rounds
      await sendPresence(sessionCtx, params.contactPhoneNumber, 'composing')
    }

    if (!aiResponseText) {
      console.error('[AI] Pas de réponse après', MAX_TOOL_ROUNDS, 'rounds de tool calling')
      return
    }

    console.log('[AI] Réponse OpenAI reçue:', aiResponseText.slice(0, 80) + '...')

    // 6. Skills "fenêtre 24h" : l'agent compose un message riche à la volée
    //    (médias, boutons, lien) via des balises, SANS template Meta.
    //    Balises supportées :
    //      [IMAGE:ref] [VIDEO:ref] [DOC:ref]  → envoyer un média de la bibliothèque
    //      [LINK:label|url]                    → dégradé en lien texte inline
    //      [BTN:t1|t2|t3]                      → message interactif (1-3 boutons)
    const mediaTagRegex = /\[(IMAGE|VIDEO|DOC):([a-z0-9_-]+)\]/gi
    const mediaTags = [...aiResponseText.matchAll(mediaTagRegex)].map(m => ({
      kind: m[1].toUpperCase() as 'IMAGE' | 'VIDEO' | 'DOC',
      ref: m[2],
    }))

    // Boutons : on ne garde que le PREMIER bloc [BTN:...] (un seul message interactif)
    const btnMatch = aiResponseText.match(/\[BTN:([^\]]+)\]/i)
    const buttonTitles = btnMatch
      ? btnMatch[1].split('|').map(t => t.trim()).filter(Boolean).slice(0, 3)
      : []

    // Carrousel produits : [CAROUSEL:handle1,handle2,...] → on garde le PREMIER bloc (2 à 5 handles)
    const carouselMatch = aiResponseText.match(/\[CAROUSEL:([^\]]+)\]/i)
    const carouselHandles = carouselMatch
      ? carouselMatch[1].split(',').map(h => h.trim().toLowerCase()).filter(Boolean).slice(0, 5)
      : []

    // Texte nettoyé : retirer médias + boutons + carrousel, remplacer [LINK:label|url] par "label : url"
    const cleanText = aiResponseText
      .replace(mediaTagRegex, '')
      .replace(/\[BTN:[^\]]+\]/gi, '')
      .replace(/\[CAROUSEL:[^\]]+\]/gi, '')
      .replace(/\[LINK:([^|\]]+)\|([^\]]+)\]/gi, (_m, label, url) => `${label.trim()} : ${url.trim()}`)
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    // 6.1 Helper : envoyer un média stocké (image/vidéo/document) depuis la bibliothèque
    const mediaKindMap = { IMAGE: 'image', VIDEO: 'video', DOC: 'document' } as const
    const sendStoredMedia = async (tag: { kind: 'IMAGE' | 'VIDEO' | 'DOC'; ref: string }) => {
      const mediatype = mediaKindMap[tag.kind]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let mediaQuery = (supabase as any)
        .from('knowledge_images')
        .select('ref, storage_path, mime_type, filename')
        .eq('ref', tag.ref)
      if (userId) mediaQuery = mediaQuery.eq('user_id', userId)
      const { data: rows } = await mediaQuery as { data: { ref: string; storage_path: string; mime_type: string; filename: string }[] | null }
      const record = rows?.[0]
      if (!record) {
        console.warn('[AI] Média ref introuvable:', tag.kind, tag.ref)
        return
      }
      try {
        const { data: fileData, error: dlError } = await supabase.storage
          .from('knowledge-images')
          .download(record.storage_path)
        if (dlError || !fileData) {
          console.warn('[AI] Média download failed:', tag.ref, dlError?.message)
          return
        }
        const buffer = Buffer.from(await fileData.arrayBuffer())
        const sendRes = await sendMediaMessage(sessionCtx, params.contactPhoneNumber, {
          mediatype,
          buffer,
          mimetype: record.mime_type,
          fileName: record.filename,
        })
        if (!sendRes.ok) {
          console.warn('[AI] Média send failed:', tag.ref, sendRes.error)
          return
        }
        await supabase.from('messages').insert({
          conversation_id: params.conversationId,
          session_id: params.sessionId,
          direction: 'outbound',
          content: encryptMessage(record.filename),
          message_type: mediatype,
          media_url: `knowledge-images:${record.storage_path}`,
          media_mime_type: record.mime_type,
          sent_by: 'ai_agent',
          ai_agent_id: params.agentId,
          status: 'sent',
        })
      } catch (mediaErr) {
        console.warn('[AI] Média error for ref:', tag.ref, mediaErr)
      }
    }

    // 6.2 Envoyer les médias d'abord, dans l'ordre d'apparition
    for (const tag of mediaTags) {
      await sendStoredMedia(tag)
    }

    const finalText = cleanText

    // 6.3 Message final : interactif (boutons) si présents, sinon texte simple
    let sendResult: { ok: boolean; error?: string } = { ok: true }
    let savedMessage: { id: string } | null = null

    if (buttonTitles.length > 0) {
      // Le corps interactif est REQUIS et non vide → fallback si l'agent n'a mis que des boutons
      const bodyText = finalText || 'Que souhaitez-vous faire ?'
      const buttons = buttonTitles.map((title, i) => ({ id: `qr_${i}`, title }))
      sendResult = await sendInteractiveMessage(sessionCtx, params.contactPhoneNumber, { bodyText, buttons })
      if (!sendResult.ok) console.error('[AI] Erreur envoi interactif:', sendResult.error)

      const { data: saved } = await supabase.from('messages').insert({
        conversation_id: params.conversationId,
        session_id: params.sessionId,
        direction: 'outbound',
        content: encryptMessage(`${bodyText}\n[boutons: ${buttonTitles.join(' | ')}]`),
        message_type: 'interactive',
        sent_by: 'ai_agent',
        ai_agent_id: params.agentId,
        status: sendResult.ok ? 'sent' : 'failed',
      }).select('id').single()
      savedMessage = saved
    } else if (finalText) {
      // Envoyer le texte uniquement s'il est non vide (si réponse = média seul, pas de texte)
      sendResult = await sendMessage(
        sessionCtx,
        params.contactPhoneNumber,
        finalText
      )

      if (!sendResult.ok) {
        console.error('[AI] Erreur envoi message:', sendResult.error)
      }

      // 7. Sauvegarder le message IA en BDD (chiffré si clé configurée)
      const { data: saved } = await supabase.from('messages').insert({
        conversation_id: params.conversationId,
        session_id: params.sessionId,
        direction: 'outbound',
        content: encryptMessage(finalText),
        message_type: 'text',
        sent_by: 'ai_agent',
        ai_agent_id: params.agentId,
        status: sendResult.ok ? 'sent' : 'failed',
      }).select('id').single()
      savedMessage = saved
    }

    // 7.05 Carrousel produits : une image + légende (nom, prix, lien) par produit.
    if (carouselHandles.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let prodQuery = (supabase as any)
        .from('shopify_products')
        .select('handle, title, price, url, image_url')
        .in('handle', carouselHandles)
      if (userId) prodQuery = prodQuery.eq('user_id', userId)
      const { data: prodRows } = await prodQuery as { data: { handle: string; title: string; price: string | null; url: string | null; image_url: string | null }[] | null }
      // Respecter l'ordre demandé par l'agent + ne garder que ceux avec image.
      const byHandle = new Map((prodRows || []).map(p => [p.handle, p]))
      const ordered = carouselHandles.map(h => byHandle.get(h)).filter((p): p is NonNullable<typeof p> => !!p && !!p.image_url)
      for (const p of ordered) {
        const priceStr = p.price ? ` — ${p.price}` : ''
        const caption = `${p.title}${priceStr}${p.url ? `\n${p.url}` : ''}`
        const r = await sendImageLink(sessionCtx, params.contactPhoneNumber, p.image_url!, caption)
        if (!r.ok) { console.warn('[AI] Carrousel image échec:', p.handle, r.error); continue }
        await supabase.from('messages').insert({
          conversation_id: params.conversationId,
          session_id: params.sessionId,
          direction: 'outbound',
          content: encryptMessage(caption),
          message_type: 'image',
          sent_by: 'ai_agent',
          ai_agent_id: params.agentId,
          status: 'sent',
        })
      }
    }

    // 7.1 Tracker si l'agent a proposé un lien de RDV dans sa réponse
    if (agent.booking_url) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
      const bookingLinkPattern = `${baseUrl}/api/booking/${agent.id}`

      if (finalText.includes(bookingLinkPattern)) {
        // Récupérer le contact_id depuis la conversation
        const { data: conv } = await supabase
          .from('conversations')
          .select('contact_id')
          .eq('id', params.conversationId)
          .single()

        // Enregistrer la proposition de RDV
        await supabase.from('booking_proposals').insert({
          agent_id: params.agentId,
          conversation_id: params.conversationId,
          contact_id: conv?.contact_id || null,
          session_id: params.sessionId,
          message_id: savedMessage?.id || null,
        })
        console.log('[AI] Proposition de RDV trackée pour agent:', agent.name)
      }
    }

    // 7.2 Vérifier la condition d'arrêt personnalisée
    if (agent.stop_condition) {
      const stopCheckResult = await generateAgentResponse({
        model: 'gpt-4o-mini',
        temperature: 0,
        systemPrompt: `Tu es un assistant qui vérifie si une condition d'arrêt est remplie.

Condition d'arrêt définie : "${agent.stop_condition}"

Analyse la dernière réponse de l'agent et détermine si la condition d'arrêt est remplie.
Réponds UNIQUEMENT par "OUI" si la condition est clairement remplie, ou "NON" sinon.
Sois strict : la condition doit être explicitement satisfaite.`,
        messages: [
          { role: 'user', content: `Dernière réponse de l'agent :\n\n${finalText}` },
        ],
      })

      if (stopCheckResult.ok) {
        totalTokensUsed += stopCheckResult.tokensUsed
      }

      if (stopCheckResult.ok && stopCheckResult.content?.trim().toUpperCase().startsWith('OUI')) {
        console.log('[AI] Condition d\'arrêt remplie:', agent.stop_condition)

        // Récupérer les infos de la session pour la notification
        const { data: session } = await supabase
          .from('whatsapp_sessions')
          .select('user_id, instance_name')
          .eq('id', params.sessionId)
          .single()

        // Désactiver l'IA pour cette conversation
        await supabase
          .from('conversations')
          .update({
            is_ai_active: false,
            last_message_at: new Date().toISOString(),
            last_message_preview: aiResponseText.slice(0, 100),
          })
          .eq('id', params.conversationId)

        // Créer une notification pour l'utilisateur
        if (session) {
          await supabase.from('user_alerts').insert({
            user_id: session.user_id,
            alert_type: 'agent_stopped',
            title: 'Agent arrêté automatiquement',
            message: `L'agent "${agent.name}" s'est arrêté car la condition a été remplie : "${agent.stop_condition}"`,
            metadata: {
              conversation_id: params.conversationId,
              session_id: params.sessionId,
              agent_id: params.agentId,
              stop_condition: agent.stop_condition,
              reason: 'stop_condition_met',
            },
          })
        }

        console.log('[AI] Conversation arrêtée suite à la condition d\'arrêt')
        // Enregistrer les tokens avant de return
        if (userId && totalTokensUsed > 0) {
          await recordTokenUsage(userId, totalTokensUsed)
          console.log('[AI] Tokens enregistrés (stop):', totalTokensUsed)
        }
        return
      }
    }

    // 7.9. Enregistrer l'utilisation des tokens
    if (userId && totalTokensUsed > 0) {
      await recordTokenUsage(userId, totalTokensUsed)
      console.log('[AI] Tokens enregistrés:', totalTokensUsed)
    }

    // 8. Mettre à jour l'aperçu de la conversation
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: finalText.slice(0, 100),
      })
      .eq('id', params.conversationId)

    // 9. Marquer les messages inbound non traités comme traités
    await supabase
      .from('messages')
      .update({ ai_processed: true })
      .eq('conversation_id', params.conversationId)
      .eq('direction', 'inbound')
      .eq('ai_processed', false)

    console.log('[AI] Réponse envoyée pour conversation:', params.conversationId)
  } catch (err) {
    console.error('[AI] processAIResponse error:', err)
    // Ne jamais rethrow — c'est du fire-and-forget
  }
}
