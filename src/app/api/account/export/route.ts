import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'
import { decryptMessage } from '@/lib/crypto/encryption'

/** GET /api/account/export — Exporter toutes les données de l'utilisateur (RGPD) */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  try {
    const zip = new JSZip()
    const exportDate = new Date().toISOString().split('T')[0]

    // 1. Profil utilisateur
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
    }

    // 2. Sessions WhatsApp
    const { data: sessions } = await supabase
      .from('whatsapp_sessions')
      .select('id, instance_name, display_name, phone_number, status, created_at, updated_at')
      .eq('user_id', user.id)

    if (sessions && sessions.length > 0) {
      zip.file('sessions.json', JSON.stringify(sessions, null, 2))

      // 3. Contacts (pour chaque session)
      const sessionIds = sessions.map(s => s.id)
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

        // 4. Conversations
        const contactIds = contacts.map(c => c.id)
        const { data: conversations } = await supabase
          .from('conversations')
          .select('id, session_id, contact_id, ai_agent_id, last_message_at, is_ai_active, created_at')
          .in('contact_id', contactIds)

        if (conversations && conversations.length > 0) {
          zip.file('conversations.json', JSON.stringify(conversations, null, 2))

          // 5. Messages (par conversation, dans un dossier)
          const conversationIds = conversations.map(c => c.id)
          const { data: messages } = await supabase
            .from('messages')
            .select('id, conversation_id, direction, content, message_type, sent_by, status, created_at')
            .in('conversation_id', conversationIds)
            .order('created_at', { ascending: true })

          if (messages && messages.length > 0) {
            // Déchiffrer les messages pour l'export GDPR (portabilité des données)
            const decryptedMessages = messages.map(msg => ({
              ...msg,
              content: msg.content ? decryptMessage(msg.content) : msg.content,
            }))

            // Grouper par conversation
            const messagesByConv: Record<string, typeof decryptedMessages> = {}
            for (const msg of decryptedMessages) {
              if (!messagesByConv[msg.conversation_id]) {
                messagesByConv[msg.conversation_id] = []
              }
              messagesByConv[msg.conversation_id].push(msg)
            }

            const messagesFolder = zip.folder('conversations')
            for (const [convId, convMessages] of Object.entries(messagesByConv)) {
              messagesFolder?.file(`${convId}.json`, JSON.stringify(convMessages, null, 2))
            }
          }
        }
      }
    }

    // 6. Agents IA
    const { data: agents } = await supabase
      .from('ai_agents')
      .select('id, name, description, system_prompt, objective, model, temperature, is_active, agent_type, created_at')
      .eq('user_id', user.id)

    if (agents && agents.length > 0) {
      zip.file('agents.json', JSON.stringify(agents, null, 2))
    }

    // 7. Documents de connaissance
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
    }

    // 8. Liens WA
    const { data: links } = await supabase
      .from('wa_links')
      .select('id, name, slug, pre_filled_message, tracking_source, click_count, is_active, created_at')
      .eq('user_id', user.id)

    if (links && links.length > 0) {
      zip.file('links.json', JSON.stringify(links, null, 2))
    }

    // 9. Tags
    const { data: tags } = await supabase
      .from('conversation_tags')
      .select('id, name, color, created_at')
      .eq('user_id', user.id)

    if (tags && tags.length > 0) {
      zip.file('tags.json', JSON.stringify(tags, null, 2))
    }

    // 10. Campagnes
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name, status, message_template, total_recipients, sent_count, delivered_count, replied_count, created_at')
      .eq('user_id', user.id)

    if (campaigns && campaigns.length > 0) {
      zip.file('campaigns.json', JSON.stringify(campaigns, null, 2))
    }

    // 11. Équipes
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
    }

    // 12. Alertes
    const { data: alerts } = await supabase
      .from('user_alerts')
      .select('id, alert_type, title, message, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (alerts && alerts.length > 0) {
      zip.file('alerts.json', JSON.stringify(alerts, null, 2))
    }

    // Ajouter un README
    zip.file('README.txt', `Export de données - ${exportDate}
=====================================

Cet archive contient toutes vos données personnelles stockées sur notre plateforme.

Fichiers inclus:
- profile.json: Votre profil utilisateur
- sessions.json: Vos sessions WhatsApp
- contacts.csv/json: Vos contacts (format CSV et JSON)
- conversations/: Dossier contenant les messages de chaque conversation
- agents.json: Vos agents IA configurés
- knowledge/: Vos documents de connaissance
- links.json: Vos liens WhatsApp
- tags.json: Vos étiquettes de conversation
- campaigns.json: Vos campagnes de relance
- teams.json: Vos équipes
- alerts.json: Vos dernières alertes

Conformément au RGPD, vous avez le droit de demander la suppression
de ces données à tout moment depuis les paramètres de votre compte.

Date d'export: ${new Date().toISOString()}
`)

    // Générer le ZIP en base64, puis convertir en ArrayBuffer
    const zipBase64 = await zip.generateAsync({ type: 'base64' })
    const binaryString = atob(zipBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Retourner le fichier
    return new Response(bytes.buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="export_${exportDate}.zip"`,
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
