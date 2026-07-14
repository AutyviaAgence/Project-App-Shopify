import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { HELP_TOPICS, searchTopic } from '@/lib/support/knowledge'

/**
 * POST /api/support  { question }
 *
 * L'assistant d'aide. Il répond ET montre : quand c'est pertinent, il indique la
 * page où aller et l'élément à surligner — le marchand voit le bouton, il ne le
 * cherche pas.
 *
 * ── LA RECHERCHE D'ABORD, L'IA ENSUITE ──────────────────────────────────────
 *
 * La plupart des questions de support sont les mêmes. Y répondre par une recherche
 * de mots-clés est instantané, gratuit, et la réponse est toujours exacte. L'IA
 * n'est appelée QUE si rien ne correspond.
 *
 * ⚠️ Ces appels IA sont facturés à NOUS, pas au marchand : sans ce filtre, chaque
 * « comment connecter WhatsApp ? » nous coûterait des tokens.
 *
 * ── QUAND L'AGENT NE SAIT PAS ───────────────────────────────────────────────
 *
 * Il le dit et propose de basculer sur WhatsApp. Un agent qui invente une réponse
 * est pire qu'un agent qui avoue son ignorance : le marchand suit une fausse piste,
 * perd du temps, et finit par écrire quand même.
 */

/** Le numéro vers lequel basculer. Modifiable sans redéployer le code. */
const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '33636006808'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { question } = (await req.json().catch(() => ({}))) as { question?: string }
  const q = (question || '').trim()
  if (!q) return NextResponse.json({ error: 'Question vide' }, { status: 400 })

  // ── 1. La FAQ, d'abord ────────────────────────────────────────────────────
  const topic = searchTopic(q)
  if (topic) {
    return NextResponse.json({
      data: {
        answer: topic.answer,
        page: topic.page ?? null,
        target: topic.target ?? null,
        source: 'faq' as const,
        escalate: false,
      },
    })
  }

  // ── 2. L'IA, en secours ───────────────────────────────────────────────────
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      data: {
        answer: 'Je n’ai pas la réponse à cette question. Voulez-vous en parler à notre équipe ?',
        page: null,
        target: null,
        source: 'fallback' as const,
        escalate: true,
        whatsapp: SUPPORT_WHATSAPP,
      },
    })
  }

  // ⚠️ On donne à l'IA la carte EXACTE des endroits qu'elle peut pointer.
  // Sans cette contrainte, elle inventerait des pages et des éléments qui
  // n'existent pas — et le surlignage échouerait en silence.
  const destinations = HELP_TOPICS.filter((t) => t.page)
    .map((t) => `- ${t.id} → page "${t.page}"${t.target ? `, élément "${t.target}"` : ''} : ${t.question}`)
    .join('\n')

  const SYSTEM = `Tu es l'assistant d'aide de Xeyo, un SaaS qui connecte WhatsApp à une boutique Shopify (agent IA de SAV, relances de panier, campagnes).

Tu réponds en FRANÇAIS, en 2 ou 3 phrases maximum. Pas de liste, pas de markdown : du texte simple.

Quand la réponse se trouve à un endroit précis de l'application, indique-le : le marchand sera amené sur la page et l'élément sera surligné. Voici les SEULES destinations valides :

${destinations}

⚠️ N'invente JAMAIS une page ou un élément qui n'est pas dans cette liste : le surlignage échouerait.

⚠️ Si tu ne sais pas, dis-le franchement et mets "escalate": true. Ne devine pas. Une fausse réponse envoie le marchand sur une fausse piste et lui fait perdre du temps — il finira par nous écrire de toute façon, en plus agacé.

Réponds UNIQUEMENT en JSON :
{"answer": "ta réponse", "page": "/dashboard" ou null, "target": "whatsapp-connect" ou null, "escalate": false}`

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2, timeout: 20_000 })

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // suffisant pour du support, et bien moins cher
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: q },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 300,
    })

    const raw = res.choices[0]?.message?.content
    if (!raw) throw new Error('Réponse vide')

    const parsed = JSON.parse(raw) as {
      answer?: string
      page?: string | null
      target?: string | null
      escalate?: boolean
    }

    // ⚠️ On vérifie que la destination existe RÉELLEMENT. Un modèle peut inventer
    // une page malgré la consigne ; on ne fait pas naviguer le marchand vers du vide.
    const validPages = new Set(HELP_TOPICS.map((t) => t.page).filter(Boolean))
    const validTargets = new Set(HELP_TOPICS.map((t) => t.target).filter(Boolean))

    const page = parsed.page && validPages.has(parsed.page) ? parsed.page : null
    const target = parsed.target && validTargets.has(parsed.target) ? parsed.target : null

    const escalate = parsed.escalate === true

    return NextResponse.json({
      data: {
        answer: parsed.answer || 'Je n’ai pas la réponse à cette question.',
        page,
        // Un élément sans sa page ne sert à rien : on ne peut pas le surligner.
        target: page ? target : null,
        source: 'ai' as const,
        escalate,
        ...(escalate ? { whatsapp: SUPPORT_WHATSAPP } : {}),
      },
    })
  } catch (e) {
    console.error('[support] échec IA:', e)
    // Une panne de l'IA ne doit pas laisser le marchand sans recours.
    return NextResponse.json({
      data: {
        answer: 'Je n’arrive pas à répondre pour le moment. Voulez-vous en parler à notre équipe ?',
        page: null,
        target: null,
        source: 'fallback' as const,
        escalate: true,
        whatsapp: SUPPORT_WHATSAPP,
      },
    })
  }
}
