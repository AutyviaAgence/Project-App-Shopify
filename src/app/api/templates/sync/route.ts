import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'

/**
 * POST /api/templates/sync
 * Rafraîchit le statut Meta des modèles soumis (pending → approved/rejected).
 * Parcourt les sessions WABA de l'utilisateur et synchronise par nom.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id, waba_business_account_id, waba_access_token')
    .eq('user_id', user.id)
    .not('waba_business_account_id', 'is', null)

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ data: { synced: 0 } })
  }

  // Construire une map (name|language) → statut Meta
  const metaStatus = new Map<string, { status: string; meta_id: string }>()
  for (const s of sessions) {
    if (!s.waba_business_account_id || !s.waba_access_token) continue
    const token = decryptMessage(s.waba_access_token)
    const res = await wabaClient.listTemplates(s.waba_business_account_id, token)
    if (res.ok) {
      for (const t of res.data.data) {
        metaStatus.set(`${t.name}|${t.language}`, { status: t.status, meta_id: t.id })
      }
    }
  }

  // Mettre à jour les templates locaux
  const { data: locals } = await supabase
    .from('whatsapp_templates')
    .select('id, name, language, status')
    .eq('user_id', user.id)

  let synced = 0
  for (const tpl of locals || []) {
    const meta = metaStatus.get(`${tpl.name}|${tpl.language}`)
    if (meta) {
      const newStatus = meta.status.toLowerCase() as 'pending' | 'approved' | 'rejected'
      if (newStatus !== tpl.status) {
        await supabase
          .from('whatsapp_templates')
          .update({ status: newStatus, meta_id: meta.meta_id, updated_at: new Date().toISOString() })
          .eq('id', tpl.id)
        synced++
      }
    }
  }

  return NextResponse.json({ data: { synced } })
}
