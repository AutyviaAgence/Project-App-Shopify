import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptMessage } from '@/lib/crypto/encryption'

const GRAPH = 'https://graph.facebook.com/v22.0'

/**
 * POST /api/whatsapp/resubscribe — (Ré)abonne l'app à la WABA de l'utilisateur.
 *
 * Sans `subscribed_apps`, Meta n'envoie AUCUN webhook pour un compte : pas de
 * messages entrants, pas de statuts, pas de mises à jour de qualité. Les
 * sessions créées par saisie manuelle avant ce correctif n'ont jamais été
 * abonnées — cette route les répare sans devoir tout reconnecter.
 *
 * Idempotent : Meta accepte plusieurs abonnements successifs.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('waba_business_account_id, waba_access_token')
    .eq('user_id', user.id)
    .eq('integration_type', 'waba')
    .maybeSingle()

  if (!session?.waba_business_account_id || !session.waba_access_token) {
    return NextResponse.json({ error: 'Aucun compte WhatsApp connecté.' }, { status: 400 })
  }

  const token = decryptMessage(session.waba_access_token)
  const waba = session.waba_business_account_id

  const res = await fetch(`${GRAPH}/${waba}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('[resubscribe] échec:', JSON.stringify(json))
    return NextResponse.json(
      { error: json?.error?.message || 'Abonnement aux notifications impossible.' },
      { status: 502 }
    )
  }

  // Relire la liste des apps abonnées, pour confirmer à l'utilisateur.
  const check = await fetch(`${GRAPH}/${waba}/subscribed_apps`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const list = await check.json().catch(() => ({}))

  return NextResponse.json({
    data: {
      subscribed: true,
      apps: (list?.data || []).map(
        (a: { whatsapp_business_api_data?: { name?: string; id?: string } }) => ({
          name: a.whatsapp_business_api_data?.name,
          id: a.whatsapp_business_api_data?.id,
        })
      ),
    },
  })
}
