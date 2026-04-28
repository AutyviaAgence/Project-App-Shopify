import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const SEED_AGENT_NAME = 'Agent Autyvia (exemple)'
const SEED_KB_NAME = 'Base de connaissances (exemple)'

/** POST /api/onboarding/seed — Crée un agent exemple + base de connaissances exemple */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Idempotent : vérifier si déjà créé
  const { data: existingAgent } = await adminSupabase
    .from('ai_agents')
    .select('id')
    .eq('user_id', user.id)
    .eq('name', SEED_AGENT_NAME)
    .maybeSingle()

  const { data: existingKb } = await adminSupabase
    .from('knowledge_documents')
    .select('id')
    .eq('user_id', user.id)
    .eq('name', SEED_KB_NAME)
    .maybeSingle()

  let agentId = existingAgent?.id ?? null
  let documentId = existingKb?.id ?? null

  // Créer l'agent exemple si pas encore fait
  if (!agentId) {
    const { data: newAgent, error: agentError } = await adminSupabase
      .from('ai_agents')
      .insert({
        user_id: user.id,
        name: SEED_AGENT_NAME,
        agent_type: 'qualifier',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        is_active: true,
        system_prompt: `Tu es un assistant commercial chaleureux et professionnel qui représente l'entreprise.

Ton rôle est d'accueillir les nouveaux contacts, comprendre leur besoin en quelques questions simples, et les orienter vers la bonne personne ou le bon service.

Sois naturel, concis et bienveillant. Pose une seule question à la fois. Ne propose jamais d'informations que tu n'as pas.`,
        objective: 'Accueillir les contacts et qualifier leur besoin pour les rediriger vers le bon interlocuteur.',
        response_delay_min: 2,
        response_delay_max: 5,
      })
      .select('id')
      .single()

    if (agentError || !newAgent) {
      return NextResponse.json({ error: 'Erreur création agent : ' + agentError?.message }, { status: 500 })
    }
    agentId = newAgent.id
  }

  // Créer la base de connaissances exemple si pas encore fait
  if (!documentId) {
    const exampleContent = `# Autyvia — Plateforme d'automatisation WhatsApp avec IA

## Qu'est-ce qu'Autyvia ?
Autyvia est une plateforme qui permet aux entreprises d'automatiser leurs conversations WhatsApp grâce à l'intelligence artificielle. Elle combine un inbox partagé, des agents IA configurables, et des outils d'analyse pour optimiser la relation client.

## Fonctionnalités principales
- **Sessions WhatsApp** : connectez un ou plusieurs numéros WhatsApp via QR code ou l'API Meta Cloud
- **Agents IA** : créez des agents qui répondent automatiquement à vos clients 24h/24
- **Inbox partagé** : gérez toutes vos conversations depuis une seule interface
- **Base de connaissances** : alimentez vos agents avec vos documents, FAQ, fiches produits
- **Outils** : connectez Google Calendar, Sheets, CRM et autres services à vos agents
- **Campagnes** : envoyez des messages en masse à vos contacts (plan Scale)
- **Liens WhatsApp** : créez des liens trackés qui déclenchent une conversation avec un agent
- **Équipes** : invitez des collaborateurs et gérez leurs accès

## Comment démarrer ?
1. Connectez votre session WhatsApp dans l'onglet Sessions
2. Créez votre premier agent IA dans l'onglet Agents
3. Ajoutez des documents à votre base de connaissances
4. Activez l'agent sur votre session et commencez à recevoir des messages automatisés

## Support
Pour toute question, contactez le support Autyvia depuis les paramètres de votre compte.`

    const { data: newDoc, error: docError } = await adminSupabase
      .from('knowledge_documents')
      .insert({
        user_id: user.id,
        name: SEED_KB_NAME,
        text_content: exampleContent,
        doc_type: 'text',
        status: 'pending',
        char_count: exampleContent.length,
      })
      .select('id')
      .single()

    if (docError || !newDoc) {
      return NextResponse.json({ error: 'Erreur création base de connaissances : ' + docError?.message }, { status: 500 })
    }
    documentId = newDoc.id

    // Associer la KB à l'agent
    await adminSupabase.from('agent_knowledge_documents').insert({
      agent_id: agentId,
      document_id: documentId,
    }).select()
  }

  return NextResponse.json({ agent_id: agentId, document_id: documentId })
}
