import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from '@/lib/openai/usage-log'
import { TRIGGER_EVENTS } from '@/lib/automations/types'
import { CONDITION_FIELDS } from '@/components/automations/builder/field-labels'
import { canUseAiOrOnboarding } from '@/lib/plans/gate'
import { checkTokenLimit } from '@/lib/openai/token-tracker'

/**
 * POST /api/automations/suggest — Aide IA contextuelle du wizard d'automatisation.
 *
 * Deux usages selon `kind` :
 *  - kind:'event'     { text } → { event } : déduit l'événement déclencheur.
 *  - kind:'condition' { text } → { rule }  : déduit une règle de condition.
 *
 * Petit appel gpt-4o-mini en JSON. Ne remplace pas le wizard : il assiste.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const gate = await canUseAiOrOnboarding(user.id)
  if (!gate.allowed) return NextResponse.json({ error: 'L’assistant IA nécessite un plan payant.', upgrade: true }, { status: 403 })

  // ⚠️ QUOTA DE TOKENS — protege VOTRE cle OpenAI, qui est mutualisee.
  //
  // Cette route etait authentifiee mais sans aucun garde-fou : un seul compte
  // (y compris un compte d'essai cree pour l'occasion) pouvait la boucler et
  // bruler le budget API. Les routes voisines (agents/generate, optimize-prompt,
  // refine-prompt) verifiaient deja le quota — c'etait un oubli, pas un choix.
  const tokenCheck = await checkTokenLimit(user.id)
  if (!tokenCheck.allowed) {
    return NextResponse.json({ error: 'Limite de tokens IA atteinte. Achetez des tokens supplementaires.' }, { status: 429 })
  }

  const { kind, text } = (await req.json().catch(() => ({}))) as { kind?: string; text?: string }
  const phrase = (text || '').trim()
  if (!phrase) return NextResponse.json({ error: 'text requis' }, { status: 400 })

  const eventList = TRIGGER_EVENTS.map((e) => `- ${e.value} : ${e.label} (${e.description})`).join('\n')
  const fieldList = CONDITION_FIELDS.map((f) => `- ${f.value} : ${f.label} (type ${f.valueType}, ops : ${f.ops.join(' ')})`).join('\n')

  const system = kind === 'condition'
    ? `Tu aides à créer une CONDITION d'automatisation e-commerce. À partir de la phrase du marchand, déduis une règle.
Champs disponibles :
${fieldList}
Réponds UNIQUEMENT en JSON : { "rule": { "field": "<champ>", "op": "<opérateur>", "value": <valeur> } }
Si tu ne peux pas déduire, renvoie { "rule": null }.`
    : `Tu aides à choisir l'ÉVÉNEMENT déclencheur d'une automatisation e-commerce. À partir de la phrase du marchand, choisis LE meilleur événement.
Événements disponibles :
${eventList}
Réponds UNIQUEMENT en JSON : { "event": "<valeur>" } (une des valeurs ci-dessus). Si aucun ne convient : { "event": null }.`

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 3, timeout: 60_000 })
  const started = Date.now()
  try {
    const res = await openai.chat.completions.create({
      store: false,
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: phrase }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    })
    void logAiUsage({
      feature: 'other', model: res.model || 'gpt-4o-mini',
      promptTokens: res.usage?.prompt_tokens || 0, completionTokens: res.usage?.completion_tokens || 0,
      latencyMs: Date.now() - started, userId: user.id,
    })
    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')

    if (kind === 'condition') {
      const rule = parsed.rule
      const valid = rule && CONDITION_FIELDS.some((f) => f.value === rule.field && f.ops.includes(rule.op))
      return NextResponse.json({ rule: valid ? rule : null })
    }
    const event = TRIGGER_EVENTS.some((e) => e.value === parsed.event) ? parsed.event : null
    return NextResponse.json({ event })
  } catch {
    return NextResponse.json({ error: 'Suggestion indisponible' }, { status: 502 })
  }
}
