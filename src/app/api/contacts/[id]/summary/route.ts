import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAgentResponse } from '@/lib/openai/client'
import { checkTokenLimit, recordTokenUsage } from '@/lib/openai/token-tracker'
import { checkRateLimit } from '@/lib/rate-limit'
import { decryptMessage } from '@/lib/crypto/encryption'
import { getUserTeamIds, buildAccessFilter } from '@/lib/teams/access'

/** POST /api/contacts/[id]/summary — Générer un résumé IA de la conversation */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limiting (10/min car opération IA lourde)
  const rateLimitResponse = checkRateLimit(req, 'HEAVY')
  if (rateLimitResponse) return rateLimitResponse

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

  // Vérifier la propriété de la session (owner OU membre d'équipe)
  const teamIds = await getUserTeamIds(supabase, user.id)
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('id', contact.session_id)
    .or(buildAccessFilter(user.id, teamIds))
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

  // Vérifier la limite de tokens
  const tokenCheck = await checkTokenLimit(user.id)
  if (!tokenCheck.allowed) {
    return NextResponse.json({ error: 'Limite de tokens IA atteinte. Achetez des tokens supplémentaires.' }, { status: 429 })
  }

  // Formater le transcript - déchiffrer les messages avant de les envoyer à l'IA
  const transcript = messages
    .filter((m): m is typeof m & { content: string } => !!m.content)
    .map((m) => {
      const sender =
        m.sent_by === 'contact'
          ? 'Contact'
          : m.sent_by === 'ai_agent'
            ? 'Agent IA'
            : 'Utilisateur'
      // Déchiffrer le contenu du message
      const decryptedContent = decryptMessage(m.content)
      return `[${sender}]: ${decryptedContent}`
    })
    .join('\n')

  // Appeler OpenAI pour le résumé
  const result = await generateAgentResponse({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    systemPrompt: `Tu es un assistant qui génère des résumés structurés de conversations WhatsApp.

Génère un résumé en français avec EXACTEMENT ces sections (garde les titres tels quels) :

**Discussions générale :**
Un résumé des sujets principaux abordés dans la conversation.

**Informations client :**
Les informations personnelles ou professionnelles mentionnées par le contact (nom, entreprise, localisation, préférences, etc.). Si aucune information n'est disponible, écris "Aucune information extraite".

**Demandes et besoins :**
Les demandes spécifiques, questions ou besoins exprimés par le contact.

**Ton et sentiment :**
Le ton général de la conversation (amical, formel, frustré, satisfait, etc.).

**Points d'action :**
Les actions à suivre ou engagements pris, s'il y en a. Sinon, écris "Aucun".

Sois concis et factuel. Maximum 400 mots au total.`,
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

  // Enregistrer l'utilisation des tokens
  await recordTokenUsage(user.id, result.tokensUsed)

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
