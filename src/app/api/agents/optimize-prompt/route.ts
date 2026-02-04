import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const OPTIMIZATION_PROMPT = `Tu es un expert en conception de prompts pour agents conversationnels WhatsApp.

Ton rôle est d'améliorer le prompt système fourni pour le rendre plus efficace, structuré et professionnel.

Règles d'optimisation :
1. **Structure claire** : Organise le prompt avec des sections (## Identité, ## Ton, ## Missions, ## Limites, etc.)
2. **Instructions précises** : Transforme les instructions vagues en directives claires et actionnables
3. **Contexte WhatsApp** : Adapte le style pour des conversations WhatsApp (messages courts, réactifs, naturels)
4. **Gestion des cas limites** : Ajoute des instructions pour les situations non couvertes
5. **Ton cohérent** : Assure une cohérence dans le ton et le style de communication
6. **Garde-fous** : Ajoute des limites si elles manquent (sujets à éviter, escalation vers humain)
7. **Concision** : Reste concis tout en étant complet - pas de blabla inutile

Important :
- Conserve l'essence et l'intention du prompt original
- Ne change pas fondamentalement le rôle ou l'identité de l'agent
- Améliore la formulation sans inventer de nouvelles informations
- Utilise le format markdown pour la structure
- Réponds UNIQUEMENT avec le prompt optimisé, sans explications ni commentaires`

export async function POST(request: Request) {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json()
    const { prompt, context } = body

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
      return NextResponse.json(
        { error: 'Le prompt doit contenir au moins 10 caractères' },
        { status: 400 }
      )
    }

    // Construire le message utilisateur avec contexte optionnel
    let userMessage = `Voici le prompt système à optimiser :\n\n---\n${prompt}\n---`

    if (context) {
      if (context.businessName) {
        userMessage += `\n\nContexte supplémentaire :\n- Entreprise : ${context.businessName}`
      }
      if (context.agentType) {
        userMessage += `\n- Type d'agent : ${context.agentType === 'relance' ? 'Agent de relance (campagnes)' : 'Agent de conversation'}`
      }
      if (context.objective) {
        userMessage += `\n- Objectif : ${context.objective}`
      }
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: OPTIMIZATION_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    })

    const optimizedPrompt = completion.choices[0]?.message?.content?.trim()

    if (!optimizedPrompt) {
      return NextResponse.json(
        { error: 'Erreur lors de l\'optimisation' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: {
        original: prompt,
        optimized: optimizedPrompt,
      }
    })
  } catch (error) {
    console.error('Erreur optimisation prompt:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'optimisation du prompt' },
      { status: 500 }
    )
  }
}
