import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessResource } from '@/lib/teams/access'
import OpenAI from 'openai'
import { checkTokenLimit, recordTokenUsage } from '@/lib/openai/token-tracker'

// Assistant d'ajustement du prompt système, façon copilote :
// l'utilisateur exprime ce qu'il aime/n'aime pas dans les réponses de l'agent,
// le LLM réécrit le system_prompt en conséquence et résume les changements.
// Le nouveau prompt n'est appliqué que si `apply: true` (validation explicite).

const REFINE_SYSTEM_PROMPT = `Tu es un expert en conception de prompts système pour agents conversationnels WhatsApp.

On te donne :
- le PROMPT SYSTÈME ACTUEL d'un agent,
- éventuellement un EXTRAIT DE CONVERSATION de test (ce que l'agent a répondu),
- un RETOUR de l'utilisateur décrivant ce qu'il veut changer/améliorer.

Ta mission : produire une VERSION RÉVISÉE du prompt système qui intègre le retour de l'utilisateur.

Règles :
1. Conserve l'essence, le rôle et l'identité de l'agent — n'invente pas d'informations factuelles (noms, prix, horaires) qui ne sont pas déjà présentes.
2. Applique précisément le retour : si l'utilisateur n'aime pas un comportement, ajoute/modifie les instructions pour le corriger.
3. Garde un prompt structuré, clair et concis (markdown avec sections si pertinent).
4. Ne supprime pas les garde-fous existants sauf demande explicite.
5. Reste cohérent avec le style WhatsApp (messages naturels, courts, réactifs).

Réponds STRICTEMENT en JSON valide avec cette forme :
{
  "revised_prompt": "le prompt système révisé complet",
  "summary": "résumé en 1 à 3 puces des changements appliqués (texte court, en français)"
}`

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer l'agent
  const { data: agent, error: agentError } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('id', id)
    .single()

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 })
  }

  // Vérifier l'accès
  const hasAccess = await canAccessResource(supabase, user.id, agent.user_id, agent.team_id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json()
  const { feedback, transcript, apply, revised_prompt } = body as {
    feedback?: string
    transcript?: { role: 'user' | 'assistant'; content: string }[]
    apply?: boolean
    revised_prompt?: string
  }

  // ── Mode application : on persiste directement le prompt révisé validé ──
  if (apply) {
    if (!revised_prompt || typeof revised_prompt !== 'string' || !revised_prompt.trim()) {
      return NextResponse.json({ error: 'Prompt révisé manquant' }, { status: 400 })
    }
    const { error: updateError } = await supabase
      .from('ai_agents')
      .update({ system_prompt: revised_prompt.trim() })
      .eq('id', id)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    return NextResponse.json({ data: { applied: true, system_prompt: revised_prompt.trim() } })
  }

  // ── Mode génération : on demande au LLM une version révisée ──
  if (!feedback || typeof feedback !== 'string' || feedback.trim().length < 2) {
    return NextResponse.json({ error: 'Retour requis' }, { status: 400 })
  }

  // Vérifier la limite de tokens
  const tokenCheck = await checkTokenLimit(user.id)
  if (!tokenCheck.allowed) {
    return NextResponse.json({ error: 'Limite de tokens IA atteinte. Achetez des tokens supplémentaires.' }, { status: 429 })
  }

  // Construire le message utilisateur
  let userMessage = `PROMPT SYSTÈME ACTUEL :\n---\n${agent.system_prompt}\n---`

  if (Array.isArray(transcript) && transcript.length > 0) {
    const lines = transcript
      .slice(-12) // on garde les derniers échanges pertinents
      .map((m) => `${m.role === 'user' ? 'Client' : 'Agent'} : ${m.content}`)
      .join('\n')
    userMessage += `\n\nEXTRAIT DE CONVERSATION DE TEST :\n---\n${lines}\n---`
  }

  userMessage += `\n\nRETOUR DE L'UTILISATEUR :\n---\n${feedback.trim()}\n---`

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: REFINE_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.5,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    })

    await recordTokenUsage(user.id, completion.usage?.total_tokens || 0)

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) {
      return NextResponse.json({ error: 'Réponse vide du modèle' }, { status: 500 })
    }

    let parsed: { revised_prompt?: string; summary?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Réponse du modèle invalide' }, { status: 500 })
    }

    if (!parsed.revised_prompt || !parsed.revised_prompt.trim()) {
      return NextResponse.json({ error: 'Aucun prompt révisé généré' }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        current_prompt: agent.system_prompt,
        revised_prompt: parsed.revised_prompt.trim(),
        summary: parsed.summary?.trim() || '',
      },
    })
  } catch (error) {
    console.error('Erreur refine-prompt:', error)
    return NextResponse.json({ error: 'Erreur lors de l\'ajustement du prompt' }, { status: 500 })
  }
}
