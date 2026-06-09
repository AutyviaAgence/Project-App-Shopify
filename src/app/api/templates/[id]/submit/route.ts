import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'

/**
 * POST /api/templates/[id]/submit
 * Soumet un modèle à Meta pour approbation (passe en statut "pending").
 * Nécessite une session WABA (business_account_id + access_token).
 */
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

  const body = await req.json().catch(() => ({}))
  const sessionIdOverride = (body as { session_id?: string }).session_id

  const { data: template } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!template) {
    return NextResponse.json({ error: 'Modèle introuvable' }, { status: 404 })
  }

  // Trouver une session WABA (celle du template, l'override, ou la première dispo)
  const sessionId = sessionIdOverride || template.session_id
  let sessionQuery = supabase
    .from('whatsapp_sessions')
    .select('id, waba_business_account_id, waba_access_token')
    .eq('user_id', user.id)
    .not('waba_business_account_id', 'is', null)
  sessionQuery = sessionId ? sessionQuery.eq('id', sessionId) : sessionQuery.limit(1)
  const { data: session } = await sessionQuery.maybeSingle()

  if (!session?.waba_business_account_id || !session.waba_access_token) {
    return NextResponse.json(
      { error: 'Aucune session WhatsApp Business configurée pour soumettre le modèle' },
      { status: 400 }
    )
  }

  const token = decryptMessage(session.waba_access_token)

  // Construire les composants au format Graph API
  const components: Record<string, unknown>[] = []
  if (template.header_text) {
    components.push({ type: 'HEADER', format: 'TEXT', text: template.header_text })
  }
  const bodyComponent: Record<string, unknown> = { type: 'BODY', text: template.body_text }
  // Exemples requis par Meta si le corps contient des variables
  if (template.variables_count > 0) {
    const samples = (template.sample_values && template.sample_values.length === template.variables_count)
      ? template.sample_values
      : Array.from({ length: template.variables_count }, (_, i) => `exemple${i + 1}`)
    bodyComponent.example = { body_text: [samples] }
  }
  components.push(bodyComponent)
  if (template.footer_text) {
    components.push({ type: 'FOOTER', text: template.footer_text })
  }

  const result = await wabaClient.createTemplate(session.waba_business_account_id, token, {
    name: template.name,
    language: template.language,
    category: template.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
    components,
  })

  if (!result.ok) {
    return NextResponse.json({ error: `Meta a refusé la soumission : ${result.error}` }, { status: 502 })
  }

  // Mettre à jour le statut local
  const { data: updated } = await supabase
    .from('whatsapp_templates')
    .update({
      meta_id: result.data.id,
      status: (result.data.status || 'PENDING').toLowerCase() as 'pending' | 'approved' | 'rejected',
      session_id: session.id,
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  return NextResponse.json({ data: updated })
}
