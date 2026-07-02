import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { logAiUsage } from '@/lib/openai/usage-log'

/** POST /api/email/improve — Améliorer un texte email avec IA */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { text, context, action } = body as {
    text?: string
    context?: string
    action?: 'grammar' | 'friendly' | 'professional' | 'expand'
  }

  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: 'text requis' }, { status: 400 })
  }

  // Limiter la taille des inputs pour éviter abus et injection de prompt
  if (text.length > 5000) {
    return NextResponse.json({ error: 'text trop long (max 5000 caractères)' }, { status: 400 })
  }
  const safeContext = context ? context.replace(/\n/g, ' ').slice(0, 500) : undefined

  const actionInstructions = {
    grammar: 'Corrige uniquement les fautes de grammaire, d\'orthographe et de ponctuation. Ne change pas le ton ni le contenu.',
    friendly: 'Rends le texte plus chaleureux, sympathique et accessible tout en gardant le sens.',
    professional: 'Rends le texte plus professionnel, formel et soigné.',
    expand: 'Développe et enrichis le message pour le rendre plus complet et détaillé, sans répéter.',
  }[action ?? 'professional']

  const systemPrompt = `Tu es un assistant spécialisé dans la rédaction d'emails.
${actionInstructions}
Retourne uniquement le texte amélioré, sans commentaire ni introduction.${safeContext ? `\nContexte: ${safeContext}` : ''}`

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 4, timeout: 60_000 })
    const completion = await openai.chat.completions.create({
      store: false,
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

    void logAiUsage({
      feature: 'email',
      model: completion.model || 'gpt-4o-mini',
      promptTokens: completion.usage?.prompt_tokens || 0,
      completionTokens: completion.usage?.completion_tokens || 0,
      userId: user.id,
    })

    if (tokensUsed > 0) {
      await supabase.rpc('increment_token_usage', { p_user_id: user.id, p_tokens: tokensUsed })
    }

    return NextResponse.json({ text: improved, tokens_used: tokensUsed })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Erreur IA: ${errMsg}` }, { status: 500 })
  }
}
