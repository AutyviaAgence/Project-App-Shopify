import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

/** POST /api/email/improve — Améliorer un texte email avec IA */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { text, context, tone } = body as {
    text?: string
    context?: string
    tone?: 'professional' | 'friendly' | 'concise'
  }

  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: 'text requis' }, { status: 400 })
  }

  const toneInstructions = {
    professional: 'Rends le texte professionnel et formel.',
    friendly: 'Rends le texte chaleureux et accessible.',
    concise: 'Rends le texte concis et direct, supprime les parties inutiles.',
  }[tone ?? 'professional'] ?? 'Rends le texte professionnel et formel.'

  const systemPrompt = `Tu es un assistant spécialisé dans la rédaction d'emails professionnels.
${toneInstructions}
Améliore le texte fourni sans changer son sens. Retourne uniquement le texte amélioré, sans commentaire ni introduction.${context ? `\nContexte de la conversation: ${context}` : ''}`

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    })

    const improved = completion.choices[0]?.message?.content ?? text
    const tokensUsed = completion.usage?.total_tokens ?? 0

    // Déduire les tokens utilisés
    if (tokensUsed > 0) {
      await supabase.rpc('increment_token_usage', { p_user_id: user.id, p_tokens: tokensUsed })
    }

    return NextResponse.json({ improved, tokens_used: tokensUsed })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Erreur IA: ${errMsg}` }, { status: 500 })
  }
}
