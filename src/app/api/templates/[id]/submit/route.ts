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

  // Règle Meta : le corps ne peut pas commencer ni finir par une variable {{n}}
  const trimmedBody = (template.body_text || '').trim()
  if (/^\{\{\s*\d+\s*\}\}/.test(trimmedBody) || /\{\{\s*\d+\s*\}\}$/.test(trimmedBody)) {
    return NextResponse.json(
      { error: 'Le message ne peut pas commencer ou finir par une variable ({{1}}, {{2}}…). Ajoutez du texte avant/après la variable.' },
      { status: 422 }
    )
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

  // HEADER : texte ou média (image/vidéo/document)
  const headerType = template.header_type || (template.header_text ? 'text' : 'none')
  if (headerType === 'text' && template.header_text) {
    components.push({ type: 'HEADER', format: 'TEXT', text: template.header_text })
  } else if ((headerType === 'image' || headerType === 'video' || headerType === 'document') && template.header_media_url) {
    // Meta exige un exemple de média via une URL d'en-tête (header_handle accepte une URL)
    components.push({
      type: 'HEADER',
      format: headerType.toUpperCase(),
      example: { header_handle: [template.header_media_url] },
    })
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

  // BUTTONS : URL / téléphone / copier-code / réponse rapide
  if (Array.isArray(template.buttons) && template.buttons.length > 0) {
    const metaButtons = template.buttons.map((b: { type: string; text: string; url?: string; phone?: string; code?: string }) => {
      if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url }
      if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone }
      if (b.type === 'COPY_CODE') return { type: 'COPY_CODE', example: b.code }
      return { type: 'QUICK_REPLY', text: b.text }
    })
    components.push({ type: 'BUTTONS', buttons: metaButtons })
  }

  const result = await wabaClient.createTemplate(session.waba_business_account_id, token, {
    name: template.name,
    language: template.language,
    category: template.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
    components,
  })

  if (!result.ok) {
    // Extraire le message Meta lisible (error_user_msg) si présent
    let metaUserMsg = result.error
    let metaCode: number | undefined
    try {
      const jsonStart = result.error.indexOf('{')
      if (jsonStart >= 0) {
        const parsed = JSON.parse(result.error.slice(jsonStart))
        metaCode = parsed?.error?.code
        metaUserMsg = parsed?.error?.error_user_msg || parsed?.error?.message || result.error
      }
    } catch { /* garde result.error brut */ }

    // Token réellement expiré = code 190 uniquement
    if (metaCode === 190) {
      return NextResponse.json(
        {
          error: 'Votre connexion WhatsApp a expiré. Reconnectez votre numéro (Tableau de bord → Connexion WhatsApp) avec un nouveau token Meta, puis réessayez.',
          token_expired: true,
        },
        { status: 401 }
      )
    }
    // Autres refus Meta (format du modèle, etc.) : message lisible
    return NextResponse.json({ error: `Meta a refusé le modèle : ${metaUserMsg}` }, { status: 422 })
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
