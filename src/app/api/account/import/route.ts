import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'

type ImportOptions = {
  agents: boolean
  knowledge: boolean
  tags: boolean
  links: boolean
  campaigns: boolean
  targetSessionId?: string // Session cible pour associer les ressources
}

type ImportResult = {
  agents: { imported: number; errors: string[] }
  knowledge: { imported: number; errors: string[] }
  tags: { imported: number; errors: string[] }
  links: { imported: number; errors: string[] }
  campaigns: { imported: number; errors: string[] }
}

/** POST /api/account/import — Importer des données depuis un fichier ZIP d'export */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const optionsRaw = formData.get('options') as string | null

    if (!file) {
      return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })
    }

    const options: ImportOptions = optionsRaw
      ? JSON.parse(optionsRaw)
      : { agents: true, knowledge: true, tags: true, links: true, campaigns: true }

    // Lire le fichier ZIP
    const arrayBuffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(arrayBuffer)

    const result: ImportResult = {
      agents: { imported: 0, errors: [] },
      knowledge: { imported: 0, errors: [] },
      tags: { imported: 0, errors: [] },
      links: { imported: 0, errors: [] },
      campaigns: { imported: 0, errors: [] },
    }

    // Mapping des anciens IDs vers les nouveaux (pour les références)
    const idMappings = {
      agents: new Map<string, string>(),
      tags: new Map<string, string>(),
      links: new Map<string, string>(),
      knowledge: new Map<string, string>(),
    }

    // 1. Importer les Tags (pas de dépendances)
    if (options.tags) {
      const tagsFile = zip.file('tags.json')
      if (tagsFile) {
        try {
          const tagsContent = await tagsFile.async('text')
          const tags = JSON.parse(tagsContent) as Array<{
            id: string
            name: string
            color: string
          }>

          for (const tag of tags) {
            // Vérifier si un tag avec le même nom existe déjà
            const { data: existing } = await supabase
              .from('conversation_tags')
              .select('id')
              .eq('user_id', user.id)
              .eq('name', tag.name)
              .single()

            if (existing) {
              idMappings.tags.set(tag.id, existing.id)
              continue // Skip, tag existe déjà
            }

            const { data: newTag, error } = await supabase
              .from('conversation_tags')
              .insert({
                user_id: user.id,
                team_id: null, // Importer en personnel
                name: tag.name,
                color: tag.color || '#3B82F6',
              })
              .select('id')
              .single()

            if (error) {
              result.tags.errors.push(`Tag "${tag.name}": ${error.message}`)
            } else if (newTag) {
              idMappings.tags.set(tag.id, newTag.id)
              result.tags.imported++
            }
          }
        } catch (e) {
          result.tags.errors.push(`Erreur de parsing: ${e instanceof Error ? e.message : 'Inconnu'}`)
        }
      }
    }

    // 2. Importer les Agents IA
    if (options.agents) {
      const agentsFile = zip.file('agents.json')
      if (agentsFile) {
        try {
          const agentsContent = await agentsFile.async('text')
          const agents = JSON.parse(agentsContent) as Array<{
            id: string
            name: string
            description: string | null
            system_prompt: string
            objective: string | null
            model: string
            temperature: number
            is_active: boolean
            agent_type: 'conversation' | 'relance'
          }>

          for (const agent of agents) {
            // Vérifier si un agent avec le même nom existe déjà
            const { data: existing } = await supabase
              .from('ai_agents')
              .select('id')
              .eq('user_id', user.id)
              .eq('name', agent.name)
              .single()

            if (existing) {
              idMappings.agents.set(agent.id, existing.id)
              continue
            }

            const { data: newAgent, error } = await supabase
              .from('ai_agents')
              .insert({
                user_id: user.id,
                team_id: null,
                name: agent.name,
                description: agent.description,
                system_prompt: agent.system_prompt,
                objective: agent.objective,
                model: agent.model || 'gpt-4o-mini',
                temperature: agent.temperature ?? 0.7,
                is_active: agent.is_active ?? true,
                agent_type: agent.agent_type || 'conversation',
                // Valeurs par défaut pour les champs manquants
                response_delay_min: 1,
                response_delay_max: 3,
                schedule_enabled: false,
                schedule_timezone: 'Europe/Paris',
                schedule_start_time: '09:00',
                schedule_end_time: '18:00',
                schedule_days: [1, 2, 3, 4, 5],
                auto_detect_language: true,
                escalation_enabled: false,
                escalation_keywords: [],
              })
              .select('id')
              .single()

            if (error) {
              result.agents.errors.push(`Agent "${agent.name}": ${error.message}`)
            } else if (newAgent) {
              idMappings.agents.set(agent.id, newAgent.id)
              result.agents.imported++
            }
          }
        } catch (e) {
          result.agents.errors.push(`Erreur de parsing: ${e instanceof Error ? e.message : 'Inconnu'}`)
        }
      }
    }

    // 3. Importer les Documents de connaissance
    if (options.knowledge) {
      const knowledgeFolder = zip.folder('knowledge')
      const docsFile = knowledgeFolder?.file('documents.json')

      if (docsFile) {
        try {
          const docsContent = await docsFile.async('text')
          const docs = JSON.parse(docsContent) as Array<{
            id: string
            name: string
            description: string | null
            doc_type: 'pdf' | 'text'
            text_content: string | null
            status: string
            chunk_count: number
            char_count: number
          }>

          for (const doc of docs) {
            // Vérifier si un doc avec le même nom existe déjà
            const { data: existing } = await supabase
              .from('knowledge_documents')
              .select('id')
              .eq('user_id', user.id)
              .eq('name', doc.name)
              .single()

            if (existing) {
              idMappings.knowledge.set(doc.id, existing.id)
              continue
            }

            // On ne peut importer que les documents texte (pas les PDFs stockés)
            if (doc.doc_type === 'pdf' && !doc.text_content) {
              result.knowledge.errors.push(`Document "${doc.name}": Les PDFs sans contenu texte ne peuvent pas être importés`)
              continue
            }

            // Récupérer le contenu texte depuis le fichier .txt si disponible
            let textContent = doc.text_content
            const txtFile = knowledgeFolder?.file(`${doc.id}_${doc.name.replace(/[^a-zA-Z0-9]/g, '_')}.txt`)
            if (txtFile) {
              textContent = await txtFile.async('text')
            }

            const { data: newDoc, error } = await supabase
              .from('knowledge_documents')
              .insert({
                user_id: user.id,
                team_id: null,
                name: doc.name,
                description: doc.description,
                doc_type: 'text', // Forcer en texte pour l'import
                text_content: textContent,
                status: 'ready',
                chunk_count: doc.chunk_count || 0,
                char_count: textContent?.length || 0,
              })
              .select('id')
              .single()

            if (error) {
              result.knowledge.errors.push(`Document "${doc.name}": ${error.message}`)
            } else if (newDoc) {
              idMappings.knowledge.set(doc.id, newDoc.id)
              result.knowledge.imported++
            }
          }
        } catch (e) {
          result.knowledge.errors.push(`Erreur de parsing: ${e instanceof Error ? e.message : 'Inconnu'}`)
        }
      }
    }

    // 4. Importer les Liens WA
    if (options.links) {
      const linksFile = zip.file('links.json')
      if (linksFile) {
        try {
          const linksContent = await linksFile.async('text')
          const links = JSON.parse(linksContent) as Array<{
            id: string
            name: string
            slug: string
            pre_filled_message: string | null
            tracking_source: string | null
            is_active: boolean
          }>

          for (const link of links) {
            // Vérifier si un lien avec le même slug existe déjà
            const { data: existing } = await supabase
              .from('wa_links')
              .select('id')
              .eq('slug', link.slug)
              .single()

            if (existing) {
              idMappings.links.set(link.id, existing.id)
              result.links.errors.push(`Lien "${link.name}": Le slug "${link.slug}" existe déjà`)
              continue
            }

            // On doit associer le lien à une session
            if (!options.targetSessionId) {
              result.links.errors.push(`Lien "${link.name}": Session cible requise`)
              continue
            }

            const { data: newLink, error } = await supabase
              .from('wa_links')
              .insert({
                user_id: user.id,
                team_id: null,
                session_id: options.targetSessionId,
                name: link.name,
                slug: link.slug + '_' + Date.now().toString(36), // Ajouter un suffixe unique
                pre_filled_message: link.pre_filled_message,
                tracking_source: link.tracking_source,
                is_active: link.is_active ?? true,
                click_count: 0, // Reset le compteur
              })
              .select('id')
              .single()

            if (error) {
              result.links.errors.push(`Lien "${link.name}": ${error.message}`)
            } else if (newLink) {
              idMappings.links.set(link.id, newLink.id)
              result.links.imported++
            }
          }
        } catch (e) {
          result.links.errors.push(`Erreur de parsing: ${e instanceof Error ? e.message : 'Inconnu'}`)
        }
      }
    }

    // 5. Importer les Campagnes
    if (options.campaigns) {
      const campaignsFile = zip.file('campaigns.json')
      if (campaignsFile) {
        try {
          const campaignsContent = await campaignsFile.async('text')
          const campaigns = JSON.parse(campaignsContent) as Array<{
            id: string
            name: string
            message_template: string | null
          }>

          for (const campaign of campaigns) {
            // Vérifier si une campagne avec le même nom existe déjà
            const { data: existing } = await supabase
              .from('campaigns')
              .select('id')
              .eq('user_id', user.id)
              .eq('name', campaign.name)
              .single()

            if (existing) {
              continue
            }

            const { error } = await supabase
              .from('campaigns')
              .insert({
                user_id: user.id,
                team_id: null,
                name: campaign.name + ' (importé)',
                status: 'draft', // Toujours en brouillon à l'import
                message_template: campaign.message_template,
                // Valeurs par défaut
                max_recipients: 100,
                delay_between_min: 30,
                delay_between_max: 60,
                messages_per_hour: 30,
                send_hour_start: 9,
                send_hour_end: 18,
                min_response_rate: 0.1,
                min_days_since_last_campaign: 7,
                filter_exclude_replied: true,
                total_recipients: 0,
                sent_count: 0,
                delivered_count: 0,
                replied_count: 0,
                failed_count: 0,
              })

            if (error) {
              result.campaigns.errors.push(`Campagne "${campaign.name}": ${error.message}`)
            } else {
              result.campaigns.imported++
            }
          }
        } catch (e) {
          result.campaigns.errors.push(`Erreur de parsing: ${e instanceof Error ? e.message : 'Inconnu'}`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      result,
      summary: {
        totalImported:
          result.agents.imported +
          result.knowledge.imported +
          result.tags.imported +
          result.links.imported +
          result.campaigns.imported,
        totalErrors:
          result.agents.errors.length +
          result.knowledge.errors.length +
          result.tags.errors.length +
          result.links.errors.length +
          result.campaigns.errors.length,
      },
    })
  } catch (error) {
    console.error('[Import] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'import des données' },
      { status: 500 }
    )
  }
}
