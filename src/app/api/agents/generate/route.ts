import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { checkTokenLimit, recordTokenUsage } from '@/lib/openai/token-tracker'

// Génère la configuration complète d'un agent WhatsApp à partir des réponses
// du questionnaire d'onboarding (style Blow Up). Calqué sur optimize-prompt.

const SYSTEM_PROMPT = `Tu es un expert en conception d'agents conversationnels IA pour WhatsApp.

À partir des réponses d'un questionnaire d'onboarding, tu génères la configuration
complète d'un agent. Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte autour.

Le JSON doit avoir exactement cette forme :
{
  "name": "string — nom court et clair de l'agent",
  "description": "string — une phrase décrivant le rôle de l'agent",
  "objective": "string — la mission principale de l'agent en une phrase",
  "system_prompt": "string — prompt système complet en markdown structuré"
}

Règles pour le system_prompt :
1. Structure en sections markdown : ## Identité, ## Ton et style, ## Missions, ## Limites & garde-fous.
2. Contexte WhatsApp : messages courts, réactifs, naturels, humains.
3. Adapte l'identité et les missions au métier et au type d'agent fournis.
4. Respecte le ton, l'usage des emojis et la longueur de réponse demandés.
5. Ajoute des garde-fous (sujets à éviter, escalade vers un humain si pertinent).
6. N'invente pas d'informations métier précises (tarifs, horaires) : reste générique,
   ces infos seront fournies via une base de connaissance.
7. Écris en français, ton naturel.`

interface OnboardingAnswers {
  role?: string
  agentType?: 'conversation' | 'relance' | 'qualifier'
  sector?: string
  agentName?: string
  tone?: string
  emojis?: string
  length?: string
  hours?: string
  services?: string
  prices?: string
  address?: string
  escalation?: string
  bookingUrl?: string
}

export async function POST(request: Request) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const tokenCheck = await checkTokenLimit(user.id)
    if (!tokenCheck.allowed) {
      return NextResponse.json({ error: 'Limite de tokens IA atteinte. Achetez des tokens supplémentaires.' }, { status: 429 })
    }

    const body = await request.json()
    const answers: OnboardingAnswers = body.answers || {}

    if (!answers.agentName || !answers.agentName.trim()) {
      return NextResponse.json({ error: 'Le nom de l\'agent est requis' }, { status: 400 })
    }

    // Construire le message utilisateur lisible pour le modèle
    const lines: string[] = []
    if (answers.agentName) lines.push(`- Nom souhaité : ${answers.agentName}`)
    if (answers.role) lines.push(`- Rôle de l'agent : ${answers.role}`)
    if (answers.agentType) lines.push(`- Type technique : ${answers.agentType}`)
    if (answers.sector) lines.push(`- Secteur d'activité : ${answers.sector}`)
    if (answers.tone) lines.push(`- Ton : ${answers.tone}`)
    if (answers.emojis) lines.push(`- Usage des emojis : ${answers.emojis}`)
    if (answers.length) lines.push(`- Longueur des réponses : ${answers.length}`)
    if (answers.hours) lines.push(`- Disponibilité : ${answers.hours}`)
    if (answers.escalation) lines.push(`- Transfert vers un humain : ${answers.escalation}`)
    if (answers.bookingUrl) lines.push(`- Lien de rendez-vous disponible : oui`)

    const userMessage = `Voici les réponses du questionnaire :\n${lines.join('\n')}\n\nGénère la configuration JSON de l'agent.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1800,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) {
      return NextResponse.json({ error: 'Erreur lors de la génération' }, { status: 500 })
    }

    let parsed: { name?: string; description?: string; objective?: string; system_prompt?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Réponse IA invalide' }, { status: 500 })
    }

    await recordTokenUsage(user.id, completion.usage?.total_tokens || 0)

    // Garde-fous : valeurs par défaut si l'IA omet un champ
    const config = {
      name: parsed.name?.trim() || answers.agentName.trim(),
      description: parsed.description?.trim() || '',
      objective: parsed.objective?.trim() || '',
      system_prompt: parsed.system_prompt?.trim() || '',
      agent_type: answers.agentType || 'conversation',
      escalation_enabled: answers.escalation ? answers.escalation !== 'none' : false,
      escalation_mode: 'both' as const,
      escalation_keywords: ['humain', 'conseiller', 'parler à quelqu\'un'],
      escalation_message: 'Je vous mets en relation avec un conseiller, un instant…',
      booking_url: answers.bookingUrl?.trim() || null,
      schedule_enabled: false,
    }

    // Construire le contenu RAG à partir des infos métier fournies
    const ragParts: string[] = []
    if (answers.sector) ragParts.push(`# Secteur\n${answers.sector}`)
    if (answers.hours) ragParts.push(`# Disponibilité\n${answers.hours}`)
    if (answers.services?.trim()) ragParts.push(`# Services\n${answers.services.trim()}`)
    if (answers.prices?.trim()) ragParts.push(`# Tarifs\n${answers.prices.trim()}`)
    if (answers.address?.trim()) ragParts.push(`# Adresse\n${answers.address.trim()}`)
    const ragContent = ragParts.join('\n\n')

    return NextResponse.json({ data: { config, ragContent } })
  } catch (error) {
    console.error('Erreur génération agent:', error)
    return NextResponse.json({ error: 'Erreur lors de la génération de l\'agent' }, { status: 500 })
  }
}
