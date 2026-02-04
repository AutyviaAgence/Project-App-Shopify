import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAgentResponse } from '@/lib/openai/client'
import { checkRateLimit } from '@/lib/rate-limit'
import { decryptMessage } from '@/lib/crypto/encryption'

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

  // Formater le transcript - utiliser direction comme fallback si sent_by n'est pas défini
  // Déchiffrer les messages avant de les envoyer à l'IA
  const transcript = messages
    .filter((m): m is typeof m & { content: string } => !!m.content)
    .map((m) => {
      let sender = 'Inconnu'
      if (m.sent_by === 'contact' || m.direction === 'inbound') {
        sender = 'Contact'
      } else if (m.sent_by === 'ai_agent') {
        sender = 'Agent IA'
      } else if (m.sent_by === 'user' || m.direction === 'outbound') {
        sender = 'Utilisateur'
      }
      // Déchiffrer le contenu du message
      const decryptedContent = decryptMessage(m.content)
      return `[${sender}]: ${decryptedContent}`
    })
    .join('\n')

  console.log('[extract-info] Messages count:', messages.length)
  console.log('[extract-info] Transcript preview:', transcript.substring(0, 1000))

  // Appeler OpenAI pour extraire les informations
  const result = await generateAgentResponse({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    systemPrompt: `Tu es un assistant spécialisé dans l'extraction d'informations de contacts à partir de conversations WhatsApp.

Analyse la conversation et extrait les informations sur le CONTACT (messages marqués [Contact]).

IMPORTANT: Dans cette conversation, les messages du contact (client) sont marqués avec "[Contact]:". Les messages marqués "[Agent IA]:" ou "[Utilisateur]:" viennent de l'entreprise.

Réponds UNIQUEMENT en JSON valide avec cette structure :
{
  "first_name": null,
  "last_name": null,
  "email": null,
  "notes": null
}

Pour chaque champ, remplace null par la valeur trouvée ou garde null si non trouvé.

Règles :
- first_name: prénom du contact s'il se présente
- last_name: nom de famille du contact s'il se présente
- email: adresse email mentionnée par le contact (format xxx@xxx.xxx)
- notes: résumé des infos utiles (profession, entreprise, localisation, besoins, produits/services demandés). Max 500 caractères.

Cherche particulièrement :
- Quand le contact dit "je suis...", "je m'appelle...", "mon nom est..."
- Les emails dans le format texte@domaine.extension
- Les informations sur le métier, l'entreprise, les besoins du contact

Ne devine RIEN. Extrais uniquement les informations explicites.`,
    messages: [
      { role: 'user', content: `Conversation à analyser :\n\n${transcript}` },
    ],
  })

  if (!result.ok) {
    console.error('[extract-info] OpenAI error:', result.error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'extraction des informations' },
      { status: 500 }
    )
  }

  console.log('[extract-info] OpenAI response:', result.content)

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

    // Normaliser les valeurs : convertir chaînes vides, "null", undefined en null
    const normalizeValue = (val: unknown): string | null => {
      if (val === null || val === undefined) return null
      if (typeof val !== 'string') return null
      const trimmed = val.trim()
      if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed === 'string ou null si non trouvé') {
        return null
      }
      return trimmed
    }

    extractedInfo.first_name = normalizeValue(extractedInfo.first_name)
    extractedInfo.last_name = normalizeValue(extractedInfo.last_name)
    extractedInfo.email = normalizeValue(extractedInfo.email)
    extractedInfo.notes = normalizeValue(extractedInfo.notes)

    console.log('[extract-info] Parsed info:', extractedInfo)
  } catch (parseError) {
    console.error('[extract-info] JSON parse error:', parseError, 'Raw:', result.content)
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
