import { NextRequest, NextResponse } from 'next/server'
import { checkTokenLimit } from '@/lib/openai/token-tracker'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { knowledgeForPrompt, VALID_PAGES, VALID_TARGETS, HELP_TOPICS } from '@/lib/support/knowledge'

/**
 * POST /api/support  { question, history? }
 *
 * L'assistant d'aide. Il répond ET montre : quand c'est pertinent, il indique la
 * page où aller et l'élément à surligner — le marchand voit le bouton, il ne le
 * cherche pas.
 *
 * ── C'EST L'IA QUI QUALIFIE, PAS DES MOTS-CLÉS ──────────────────────────────
 *
 * La première version cherchait par mots-clés. « Je peux contacter un humain ? »
 * matchait sur « contact » et répondait… sur la collecte de numéros clients. Le
 * mot était identique, le sens à l'opposé. Aucun réglage de mots-clés ne répare
 * une confusion de SENS.
 *
 * L'IA lit donc toute la base de connaissances et choisit ce qui répond vraiment.
 * Le coût est négligeable — 0,03 centime par question : le filtre par mots-clés
 * n'économisait rien et cassait la qualité.
 *
 * ── ELLE NE PEUT PAS INVENTER ───────────────────────────────────────────────
 *
 * Sa réponse est vérifiée : la page et l'élément doivent EXISTER réellement. Un
 * modèle peut halluciner une destination malgré la consigne — on ne fait pas
 * naviguer un marchand vers du vide.
 */

/** Le numéro du support. En variable d'env pour être modifiable sans redéployer. */
const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '33636006808'

/**
 * Au-delà, on bascule vers l'humain.
 *
 * Cinq questions sans solution, c'est un problème que l'assistant ne sait pas
 * traiter. Insister ne ferait qu'ajouter de la frustration — et du coût IA.
 */
export const MAX_QUESTIONS = 5

type Turn = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // ⚠️ QUOTA DE TOKENS — la cle OpenAI est mutualisee entre tous les marchands.
  // Sans ce controle, un seul compte pouvait boucler sur cette route et bruler
  // le budget API. Les routes agents/generate & co le verifiaient deja.
  const tokenCheck = await checkTokenLimit(user.id)
  if (!tokenCheck.allowed) {
    return NextResponse.json({ error: 'Limite de tokens IA atteinte. Achetez des tokens supplementaires.' }, { status: 429 })
  }

  const body = (await req.json().catch(() => ({}))) as { question?: string; history?: Turn[] }
  const q = (body.question || '').trim()
  if (!q) return NextResponse.json({ error: 'Question vide' }, { status: 400 })

  // ⚠️ AU-DELÀ DE 5 QUESTIONS, ON PASSE LA MAIN.
  //
  // Si l'assistant n'a pas résolu le problème en cinq échanges, il ne le résoudra
  // pas : le marchand tourne en rond, et chaque tour supplémentaire ne fait
  // qu'ajouter de la frustration (et du coût IA, à notre charge).
  //
  // La limite est posée CÔTÉ SERVEUR : le compteur du client est contournable, il
  // suffirait de vider l'historique envoyé.
  const asked = (body.history || []).filter((t) => t.role === 'user').length
  if (asked >= MAX_QUESTIONS) {
    return escalated(
      'Je ne suis pas parvenu à vous aider. Le mieux est d’en parler directement à notre équipe — elle a tout le contexte de votre boutique.'
    )
  }

  // Sans clé IA, on ne bricole pas une réponse approximative : on passe la main.
  if (!process.env.OPENAI_API_KEY) {
    return escalated('Je ne peux pas répondre pour le moment. Voulez-vous en parler à notre équipe ?')
  }

  const SYSTEM = `Tu es l'assistant d'aide de Xeyo — un outil qui branche WhatsApp sur une boutique Shopify : un agent IA répond aux clients, relance les paniers abandonnés et envoie des campagnes.

Tu parles à un MARCHAND qui utilise Xeyo, jamais à ses clients.

# CE QUE TU SAIS FAIRE

Voici tout ce que tu connais de l'application. Chaque sujet indique où aller et quel élément surligner :

${knowledgeForPrompt()}

# COMMENT RÉPONDRE

1. Comprends d'abord ce que le marchand veut VRAIMENT. Ne te fie pas aux mots isolés.
   Exemple : « je peux contacter un humain ? » veut dire « je veux parler à quelqu'un
   de votre équipe » — surtout PAS « comment collecter les contacts de mes clients ».

2. Si un sujet ci-dessus répond à sa question, sers-t'en. Reprends la réponse, en
   l'adaptant à sa formulation. Renvoie la page et l'élément associés.

3. Si sa question est proche de plusieurs sujets, choisis le plus PRÉCIS.
   « Où sont les automatisations ? » et « comment en créer une ? » sont deux questions
   différentes : la seconde attend le bouton de création, pas la page.

4. Si AUCUN sujet ne répond, ou s'il demande à parler à un humain, ou s'il signale un
   bug : mets "escalate": true. N'invente JAMAIS de réponse. Une fausse piste lui fait
   perdre du temps, et il finira par nous écrire de toute façon — en plus agacé.

5. Réponds en 2 ou 3 phrases. Du texte simple : pas de liste, pas de markdown, pas de
   gras. Sois concret : nomme les boutons tels qu'ils s'affichent à l'écran.

⚠️ N'invente JAMAIS une page ou un élément qui n'est pas dans la liste ci-dessus.

# FORMAT

Réponds UNIQUEMENT en JSON :
{"answer": "…", "page": "/dashboard" ou null, "target": "whatsapp-connect" ou null, "escalate": false}`

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2, timeout: 25_000 })

    // On garde le fil : « et pour les créer ? » n'a de sens qu'avec ce qui précède.
    const history = (body.history || []).slice(-6).map((t) => ({
      role: t.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: t.content,
    }))

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM },
        ...history,
        { role: 'user', content: q },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 350,
    })

    const raw = res.choices[0]?.message?.content
    if (!raw) throw new Error('Réponse vide')

    const parsed = JSON.parse(raw) as {
      answer?: string
      page?: string | null
      target?: string | null
      escalate?: boolean
    }

    if (parsed.escalate === true) {
      return escalated(parsed.answer || 'Je n’ai pas la réponse à cette question. Voulez-vous en parler à notre équipe ?')
    }

    // ⚠️ On VÉRIFIE que la destination existe. Le modèle peut inventer une page
    // malgré la consigne — on ne fait pas naviguer le marchand vers du vide.
    const page = parsed.page && VALID_PAGES.has(parsed.page) ? parsed.page : null
    const target = parsed.target && VALID_TARGETS.has(parsed.target) ? parsed.target : null

    // Un élément sans sa page ne peut pas être surligné : on ne saurait pas où aller.
    const finalTarget = page ? target : null

    // La note du sujet (le piège à connaître) : elle vient de NOTRE base, pas du
    // modèle — c'est le genre de détail qu'une IA reformule mal.
    const topic = finalTarget
      ? HELP_TOPICS.find((t) => t.target === finalTarget && t.page === page)
      : page
        ? HELP_TOPICS.find((t) => t.page === page && !t.target)
        : null

    return NextResponse.json({
      data: {
        answer: parsed.answer || 'Je n’ai pas la réponse à cette question.',
        note: topic?.note ?? null,
        page,
        target: finalTarget,
        escalate: false,
      },
    })
  } catch (e) {
    console.error('[support] échec IA:', e)
    return escalated('Je n’arrive pas à répondre pour le moment. Voulez-vous en parler à notre équipe ?')
  }
}

/** L'agent ne sait pas — on le dit, et on propose l'humain. */
function escalated(answer: string) {
  return NextResponse.json({
    data: {
      answer,
      note: null,
      page: null,
      target: null,
      escalate: true,
      whatsapp: SUPPORT_WHATSAPP,
    },
  })
}
