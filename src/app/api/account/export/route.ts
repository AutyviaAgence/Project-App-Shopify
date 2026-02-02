import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'

type ExportOptions = {
  sessions: boolean
  contacts: boolean
  conversations: boolean
  agents: boolean
  knowledge: boolean
  links: boolean
  tags: boolean
  campaigns: boolean
  // Filtre optionnel par session
  sessionId?: string
}

/** GET /api/account/export — Exporter toutes les données (RGPD - legacy) */
export async function GET() {
  // Appeler POST avec toutes les options par défaut
  const defaultOptions: ExportOptions = {
    sessions: true,
    contacts: true,
    conversations: true,
    agents: true,
    knowledge: true,
    links: true,
    tags: true,
    campaigns: true,
  }
  return handleExport(defaultOptions)
}

/** POST /api/account/export — Exporter des données avec options */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const options: ExportOptions = {
    sessions: body.sessions ?? true,
    contacts: body.contacts ?? true,
    conversations: body.conversations ?? true,
    agents: body.agents ?? true,
    knowledge: body.knowledge ?? true,
    links: body.links ?? true,
    tags: body.tags ?? true,
    campaigns: body.campaigns ?? true,
    sessionId: body.sessionId,
  }
  return handleExport(options)
}

async function handleExport(options: ExportOptions) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  try {
    const zip = new JSZip()
    const exportDate = new Date().toISOString().split('T')[0]
    const manifest: string[] = []

    // 1. Profil utilisateur (toujours inclus)
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profile) {
      zip.file('profile.json', JSON.stringify({
        ...profile,
        auth_email: user.email,
        auth_created_at: user.created_at,
      }, null, 2))
      manifest.push('- profile.json: Votre profil utilisateur')
    }

    // Déterminer les sessions à exporter
    let sessionIds: string[] = []
    let sessionsData: Array<{ id: string; instance_name: string; display_name: string | null; phone_number: string | null; status: string; created_at: string; updated_at: string }> = []

    if (options.sessions || options.contacts || options.conversations || options.links) {
      // Récupérer les sessions
      let sessionsQuery = supabase
        .from('whatsapp_sessions')
        .select('id, instance_name, display_name, phone_number, status, created_at, updated_at')
        .eq('user_id', user.id)

      // Filtrer par session si spécifié
      if (options.sessionId) {
        sessionsQuery = sessionsQuery.eq('id', options.sessionId)
      }

      const { data: sessions } = await sessionsQuery
      sessionsData = sessions || []
      sessionIds = sessionsData.map(s => s.id)

      if (options.sessions && sessionsData.length > 0) {
        zip.file('sessions.json', JSON.stringify(sessionsData, null, 2))
        manifest.push('- sessions.json: Vos sessions WhatsApp')
      }
    }

    // 2. Contacts
    if (options.contacts && sessionIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, session_id, phone_number, name, first_name, last_name, email, notes, created_at')
        .in('session_id', sessionIds)

      if (contacts && contacts.length > 0) {
        // Export CSV pour les contacts
        const csvHeader = 'id,session_id,phone_number,name,first_name,last_name,email,notes,created_at'
        const csvRows = contacts.map(c =>
          [c.id, c.session_id, c.phone_number, c.name || '', c.first_name || '', c.last_name || '', c.email || '', (c.notes || '').replace(/"/g, '""'), c.created_at]
            .map(v => `"${v}"`)
            .join(',')
        )
        zip.file('contacts.csv', [csvHeader, ...csvRows].join('\n'))
        zip.file('contacts.json', JSON.stringify(contacts, null, 2))
        manifest.push('- contacts.csv/json: Vos contacts (format CSV et JSON)')

        // 3. Conversations (si demandé)
        if (options.conversations) {
          const contactIds = contacts.map(c => c.id)
          const { data: conversations } = await supabase
            .from('conversations')
            .select('id, session_id, contact_id, ai_agent_id, last_message_at, is_ai_active, created_at')
            .in('contact_id', contactIds)

          if (conversations && conversations.length > 0) {
            // Ajouter les noms des contacts aux conversations pour le fichier
            const contactsMap = Object.fromEntries(contacts.map(c => [c.id, c]))
            const conversationsWithNames = conversations.map(conv => ({
              ...conv,
              contact_name: contactsMap[conv.contact_id]?.name || contactsMap[conv.contact_id]?.phone_number || 'Inconnu',
              contact_phone: contactsMap[conv.contact_id]?.phone_number || '',
            }))

            zip.file('conversations.json', JSON.stringify(conversationsWithNames, null, 2))
            manifest.push('- conversations.json: Vos conversations')

            // Messages (par conversation, dans un dossier)
            const conversationIds = conversations.map(c => c.id)
            const { data: messages } = await supabase
              .from('messages')
              .select('id, conversation_id, direction, content, message_type, sent_by, status, created_at')
              .in('conversation_id', conversationIds)
              .order('created_at', { ascending: true })

            if (messages && messages.length > 0) {
              // Grouper par conversation
              const messagesByConv: Record<string, typeof messages> = {}
              for (const msg of messages) {
                if (!messagesByConv[msg.conversation_id]) {
                  messagesByConv[msg.conversation_id] = []
                }
                messagesByConv[msg.conversation_id].push(msg)
              }

              const messagesFolder = zip.folder('conversations')
              for (const [convId, convMessages] of Object.entries(messagesByConv)) {
                // Trouver le nom du contact pour le fichier
                const conv = conversationsWithNames.find(c => c.id === convId)
                const fileName = conv
                  ? `${conv.contact_name.replace(/[^a-zA-Z0-9]/g, '_')}_${convId.slice(0, 8)}.json`
                  : `${convId}.json`
                messagesFolder?.file(fileName, JSON.stringify(convMessages, null, 2))
              }
              manifest.push('- conversations/: Dossier contenant les messages de chaque conversation')
            }
          }
        }
      }
    }

    // 4. Agents IA
    if (options.agents) {
      const { data: agents } = await supabase
        .from('ai_agents')
        .select('id, name, description, system_prompt, objective, model, temperature, is_active, agent_type, response_delay_min, response_delay_max, schedule_enabled, schedule_timezone, schedule_start_time, schedule_end_time, schedule_days, auto_detect_language, escalation_enabled, escalation_keywords, escalation_message, booking_url, created_at')
        .eq('user_id', user.id)

      if (agents && agents.length > 0) {
        zip.file('agents.json', JSON.stringify(agents, null, 2))
        manifest.push('- agents.json: Vos agents IA configurés')
      }
    }

    // 5. Documents de connaissance
    if (options.knowledge) {
      const { data: documents } = await supabase
        .from('knowledge_documents')
        .select('id, name, description, doc_type, text_content, status, chunk_count, char_count, created_at')
        .eq('user_id', user.id)

      if (documents && documents.length > 0) {
        const knowledgeFolder = zip.folder('knowledge')
        knowledgeFolder?.file('documents.json', JSON.stringify(documents, null, 2))

        // Exporter le contenu texte de chaque document
        for (const doc of documents) {
          if (doc.text_content) {
            knowledgeFolder?.file(`${doc.id}_${doc.name.replace(/[^a-zA-Z0-9]/g, '_')}.txt`, doc.text_content)
          }
        }
        manifest.push('- knowledge/: Vos documents de connaissance')
      }
    }

    // 6. Liens WA
    if (options.links) {
      let linksQuery = supabase
        .from('wa_links')
        .select('id, session_id, name, slug, pre_filled_message, tracking_source, click_count, is_active, created_at')
        .eq('user_id', user.id)

      // Filtrer par session si spécifié
      if (options.sessionId && sessionIds.length > 0) {
        linksQuery = linksQuery.in('session_id', sessionIds)
      }

      const { data: links } = await linksQuery

      if (links && links.length > 0) {
        zip.file('links.json', JSON.stringify(links, null, 2))
        manifest.push('- links.json: Vos liens WhatsApp')
      }
    }

    // 7. Tags
    if (options.tags) {
      const { data: tags } = await supabase
        .from('conversation_tags')
        .select('id, name, color, created_at')
        .eq('user_id', user.id)

      if (tags && tags.length > 0) {
        zip.file('tags.json', JSON.stringify(tags, null, 2))
        manifest.push('- tags.json: Vos étiquettes de conversation')
      }
    }

    // 8. Campagnes
    if (options.campaigns) {
      let campaignsQuery = supabase
        .from('campaigns')
        .select('id, name, status, message_template, filter_session_ids, total_recipients, sent_count, delivered_count, replied_count, created_at')
        .eq('user_id', user.id)

      const { data: campaigns } = await campaignsQuery

      // Filtrer par session si spécifié (campagnes qui utilisent cette session)
      let filteredCampaigns = campaigns || []
      if (options.sessionId && filteredCampaigns.length > 0) {
        filteredCampaigns = filteredCampaigns.filter(c =>
          !c.filter_session_ids || c.filter_session_ids.includes(options.sessionId!)
        )
      }

      if (filteredCampaigns.length > 0) {
        zip.file('campaigns.json', JSON.stringify(filteredCampaigns, null, 2))
        manifest.push('- campaigns.json: Vos campagnes de relance')
      }
    }

    // 9. Équipes (toujours incluses pour contexte)
    const { data: teamMemberships } = await supabase
      .from('team_members')
      .select(`
        role,
        status,
        created_at,
        teams:team_id (
          id,
          name,
          slug,
          created_at
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'accepted')

    if (teamMemberships && teamMemberships.length > 0) {
      zip.file('teams.json', JSON.stringify(teamMemberships, null, 2))
      manifest.push('- teams.json: Vos équipes')
    }

    // Construire le nom du fichier
    let fileName = `export_${exportDate}`
    if (options.sessionId && sessionsData.length > 0) {
      const session = sessionsData[0]
      const sessionName = session.display_name || session.phone_number || session.instance_name
      fileName = `export_${sessionName.replace(/[^a-zA-Z0-9]/g, '_')}_${exportDate}`
    }

    // Ajouter un README
    zip.file('README.txt', `Export de données - ${exportDate}
=====================================

${options.sessionId ? `Export filtré pour la session: ${sessionsData[0]?.display_name || sessionsData[0]?.phone_number || 'N/A'}\n` : 'Export complet de toutes vos données.\n'}
Fichiers inclus:
${manifest.join('\n')}

Conformément au RGPD, vous avez le droit de demander la suppression
de ces données à tout moment depuis les paramètres de votre compte.

Date d'export: ${new Date().toISOString()}
`)

    // Générer le ZIP
    const zipBase64 = await zip.generateAsync({ type: 'base64' })
    const binaryString = atob(zipBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    return new Response(bytes.buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}.zip"`,
      },
    })
  } catch (error) {
    console.error('[Export] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'export des données' },
      { status: 500 }
    )
  }
}
