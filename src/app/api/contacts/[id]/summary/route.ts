import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAgentResponse } from '@/lib/openai/client'

/** POST /api/contacts/[id]/summary — Générer un résumé IA de la conversation */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer le contact
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, session_id')
    .eq('id', id)
    .single()

  if (!contact) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
  }

  // Vérifier la propriété de la session
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('id', contact.session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // Trouver la conversation pour ce contact
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('contact_id', id)
    .eq('session_id', contact.session_id)
    .single()

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }

  // Récupérer les 200 derniers messages
  const { data: messages } = await supabase
    .from('messages')
    .select('content, direction, sent_by, created_at')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })
    .limit(200)

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: 'Aucun message à résumer' }, { status: 400 })
  }

  // Formater le transcript
  const transcript = messages
    .filter((m) => m.content)
    .map((m) => {
      const sender =
        m.sent_by === 'contact'
          ? 'Contact'
          : m.sent_by === 'ai_agent'
            ? 'Agent IA'
            : 'Utilisateur'
      return `[${sender}]: ${m.content}`
    })
    .join('\n')

  // Appeler OpenAI pour le résumé
  const result = await generateAgentResponse({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    systemPrompt: `Tu es un assistant qui génère des résumés concis de conversations WhatsApp.
Génère un résumé structuré en français qui inclut :
- Les sujets principaux abordés
- Les demandes ou besoins du contact
- Les informations clés échangées
- Le ton général de la conversation
Sois concis (max 300 mots). Utilise des puces pour structurer.`,
    messages: [
      { role: 'user', content: `Voici la conversation à résumer :\n\n${transcript}` },
    ],
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Erreur lors de la génération du résumé' },
      { status: 500 }
    )
  }

  // Sauvegarder le résumé
  const { data: updated, error: updateError } = await supabase
    .from('contacts')
    .update({
      ai_summary: result.content,
      ai_summary_updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}
