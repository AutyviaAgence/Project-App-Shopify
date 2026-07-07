import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/onboarding/complete
 *
 * - { step } : mémorise l'étape courante (reprise si le marchand quitte).
 * - { done: true } : marque l'onboarding TERMINÉ (dernier écran, après le
 *   choix d'abonnement — plan Gratuit autorisé). Débloque le dashboard.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { step?: string; done?: boolean }

  const update: Record<string, unknown> = {}
  if (typeof body.step === 'string' && body.step.length <= 40) update.onboarding_step = body.step
  if (body.done === true) update.onboarding_completed_at = new Date().toISOString()
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Rien à mettre à jour' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('profiles').update(update).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
