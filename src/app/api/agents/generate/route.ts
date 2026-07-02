import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { checkTokenLimit, recordTokenUsage } from '@/lib/openai/token-tracker'
import { logAiUsage } from '@/lib/openai/usage-log'

// Génère la configuration complète d'un agent WhatsApp à partir des réponses
// du questionnaire d'onboarding (style Blow Up). Calqué sur optimize-prompt.

const SYSTEM_PROMPT = `Tu es un expert en conception de prompts système pour agents conversationnels IA sur WhatsApp. Tu produis des prompts de NIVEAU PRODUCTION, longs, détaillés et opérationnels — pas des descriptions génériques.

À partir des réponses d'un questionnaire, tu génères la configuration complète d'un agent. Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de cette forme exacte :
{
  "name": "string — nom court et clair de l'agent",
  "description": "string — une phrase décrivant le rôle de l'agent",
  "objective": "string — la mission principale en une phrase",
  "system_prompt": "string — le prompt système complet (voir structure obligatoire ci-dessous)"
}

Le system_prompt DOIT suivre EXACTEMENT cette structure, en texte brut avec des titres de section en MAJUSCULES (pas de markdown ##), chaque section non vide et adaptée au métier :

ROLE ET OBJECTIF
Qui est l'agent (assistant IA de [entreprise/métier] sur WhatsApp), ce qu'il fait concrètement (qualifier, répondre, prendre RDV, établir devis, transmettre…), et l'impression qu'il doit donner. 2 à 4 phrases.

LANGUE — REGLE ABSOLUE ET PRIORITAIRE
L'agent détecte la langue du client au 1er message et répond UNIQUEMENT dans cette langue, sans JAMAIS en changer en cours de conversation. Liste les langues fournies. Langue ambiguë → anglais par défaut. Il ne demande jamais au client quelle langue il préfère.

IDENTITE — REGLE NON NEGOCIABLE
L'agent est une IA. Si on lui demande s'il est un robot/humain, il le confirme toujours. Donne une réponse type.

TON ET STYLE
Règles précises selon le ton/emojis/longueur demandés : nombre max de phrases par message, une seule question à la fois, vouvoiement par défaut (tutoiement si le client tutoie), usage des emojis, formulations INTERDITES ("n'hésitez pas", "je reste à votre disposition", "un instant je vérifie"…), ne jamais répéter deux fois la même formulation.

ANALYSE DU PREMIER MESSAGE — REGLE FONDAMENTALE
L'agent analyse entièrement le 1er message avant de répondre. Détaille 3 cas concrets adaptés au métier :
CAS A — message vague (ex : "bonjour") → message d'accueil + présentation des services.
CAS B — besoin identifié mais infos manquantes → accueil bref + extraction + 1re question manquante.
CAS C — message complet → accueil bref + récapitulatif + question restante OU transmission directe.
REGLE : un seul message d'accueil par conversation, jamais de "bonjour" après le 1er échange.

EXTRACTION INTELLIGENTE
À chaque message, extraire TOUTES les infos déjà présentes avant de poser une question. Ne jamais redemander une info déjà donnée. Une seule question à la fois.

INFORMATIONS A COLLECTER
La liste précise des informations que l'agent doit récolter (issue des réponses du questionnaire), dans l'ordre, avec les éventuelles règles (obligatoire / conditionnel).

DEROULEMENT / FLOW
Les étapes de la conversation selon la fonction de l'agent (collecte, devis, RDV, SAV…). Étapes numérotées et claires.

TRANSMISSION A L'EQUIPE
Quand et comment l'agent transmet (escalade humaine selon le réglage fourni). Décris quand notifier l'équipe, quelles infos transmettre, et le message de confirmation au client.

BASE DE CONNAISSANCES
Pour toute question factuelle (produits, prix, horaires, livraison…), l'agent consulte sa base de connaissances et n'invente JAMAIS. S'il ne trouve pas : phrase type renvoyant vers un contact humain.

CE QUE TU NE FAIS JAMAIS
Liste de 8 à 12 interdits concrets et adaptés (mentir sur sa nature, changer de langue, inventer un prix, poser 2 questions à la fois, redemander une info, etc.).

RÈGLES DE GÉNÉRATION :
- Adapte CHAQUE section au métier, au secteur et au type d'agent fournis. Sois concret, pas générique.
- N'invente PAS de données factuelles précises (vrais tarifs, vraies adresses, vrais horaires) : elles viennent de la base de connaissances. Tu peux structurer où elles s'utilisent.
- Si un exemple de conversation est fourni, inspire-t'en pour le ton et le flow.
- Le prompt fait au minimum 600 mots. Écris en français (sauf les exemples de messages multilingues si plusieurs langues).`

interface OnboardingAnswers {
  role?: string
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
  languages?: string
  collect?: string
  example?: string
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
    if (answers.sector) lines.push(`- Secteur d'activité : ${answers.sector}`)
    if (answers.tone) lines.push(`- Ton : ${answers.tone}`)
    if (answers.emojis) lines.push(`- Usage des emojis : ${answers.emojis}`)
    if (answers.length) lines.push(`- Longueur des réponses : ${answers.length}`)
    if (answers.hours) lines.push(`- Disponibilité : ${answers.hours}`)
    if (answers.languages?.trim()) lines.push(`- Langues gérées : ${answers.languages.trim()}`)
    if (answers.services?.trim()) lines.push(`- Services / produits : ${answers.services.trim()}`)
    if (answers.collect?.trim()) lines.push(`- Informations à collecter auprès du client : ${answers.collect.trim()}`)
    if (answers.escalation) lines.push(`- Transfert vers un humain : ${answers.escalation}`)
    if (answers.bookingUrl) lines.push(`- Lien de rendez-vous disponible : oui`)
    if (answers.example?.trim()) lines.push(`- Exemple de conversation type fourni par le client :\n${answers.example.trim()}`)

    const userMessage = `Voici les réponses du questionnaire :\n${lines.join('\n')}\n\nGénère la configuration JSON de l'agent avec un system_prompt complet et opérationnel suivant la structure imposée.`

    const completion = await openai.chat.completions.create({
      store: false,
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.6,
      max_tokens: 4000,
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

    void logAiUsage({
      feature: 'agent_generate',
      model: completion.model || 'gpt-4o',
      promptTokens: completion.usage?.prompt_tokens || 0,
      completionTokens: completion.usage?.completion_tokens || 0,
      userId: user.id,
    })
    await recordTokenUsage(user.id, completion.usage?.total_tokens || 0)

    // Garde-fous : valeurs par défaut si l'IA omet un champ
    const config = {
      name: parsed.name?.trim() || answers.agentName.trim(),
      description: parsed.description?.trim() || '',
      objective: parsed.objective?.trim() || '',
      system_prompt: parsed.system_prompt?.trim() || '',
      agent_type: 'conversation',
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
