import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAgentResponse } from '@/lib/openai/client'
import { checkRateLimit } from '@/lib/rate-limit'

/** POST /api/contacts/[id]/extract-info — Extraire les informations du contact via IA */
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
    .select('id, session_id, name, first_name, last_name, email, notes')
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
    return NextResponse.json({ error: 'Aucun message à analyser' }, { status: 400 })
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

  // Appeler OpenAI pour extraire les informations
  const result = await generateAgentResponse({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    systemPrompt: `Tu es un assistant spécialisé dans l'extraction d'informations de contacts à partir de conversations WhatsApp.

Analyse la conversation et extrait les informations suivantes sur le CONTACT (pas l'utilisateur ou l'agent IA) :

Tu dois répondre UNIQUEMENT en JSON valide avec ce format exact :
{
  "first_name": "string ou null si non trouvé",
  "last_name": "string ou null si non trouvé",
  "email": "string ou null si non trouvé",
  "notes": "string avec les informations importantes sur le contact : profession, entreprise, localisation, besoins, préférences, contexte, etc. Maximum 500 caractères. Si rien de pertinent, mettre null."
}

Règles importantes :
- Ne met QUE les informations explicitement mentionnées ou clairement déduites de la conversation
- Si le contact se présente avec son nom complet, sépare prénom et nom
- Pour l'email, cherche des adresses email mentionnées par le contact
- Pour les notes, résume les informations clés utiles pour un commercial ou support client
- Si tu n'es pas sûr d'une information, met null
- Ne devine pas et ne fabrique pas d'informations

Réponds UNIQUEMENT avec le JSON, sans explication ni texte autour.`,
    messages: [
      { role: 'user', content: `Voici la conversation à analyser :\n\n${transcript}` },
    ],
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Erreur lors de l\'extraction des informations' },
      { status: 500 }
    )
  }

  // Parser la réponse JSON
  let extractedInfo: {
    first_name: string | null
    last_name: string | null
    email: string | null
    notes: string | null
  }

  try {
    // Nettoyer la réponse si nécessaire (enlever les ```json si présents)
    let jsonStr = result.content?.trim() || '{}'
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '')
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '')
    }
    extractedInfo = JSON.parse(jsonStr)
  } catch {
    return NextResponse.json(
      { error: 'Erreur lors du parsing des informations extraites' },
      { status: 500 }
    )
  }

  // Préparer les données à mettre à jour (ne remplacer que les champs vides ou avec de nouvelles infos)
  const updateData: Record<string, string> = {}

  if (extractedInfo.first_name && !contact.first_name) {
    updateData.first_name = extractedInfo.first_name
  }
  if (extractedInfo.last_name && !contact.last_name) {
    updateData.last_name = extractedInfo.last_name
  }
  if (extractedInfo.email && !contact.email) {
    updateData.email = extractedInfo.email
  }
  if (extractedInfo.notes) {
    // Pour les notes, on ajoute ou remplace
    updateData.notes = extractedInfo.notes
  }

  // Retourner les infos extraites même si rien à mettre à jour
  // Le frontend décidera quoi faire
  return NextResponse.json({
    data: {
      extracted: extractedInfo,
      current: {
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        notes: contact.notes,
      },
    },
  })
}
