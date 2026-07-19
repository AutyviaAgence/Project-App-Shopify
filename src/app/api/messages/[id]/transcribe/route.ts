import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkTokenLimit } from '@/lib/openai/token-tracker'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { downloadMediaFromStorage } from '@/lib/storage/media'
import { transcribeAudio, describeImage } from '@/lib/openai/client'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'
import { recordTokenUsage } from '@/lib/openai/token-tracker'

/** POST /api/messages/[id]/transcribe — Transcription on-demand d'un message média */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer le message
  const { data: message } = await supabase
    .from('messages')
    .select('id, media_url, media_mime_type, message_type, transcription, session_id')
    .eq('id', id)
    .single()

  if (!message) {
    return NextResponse.json({ error: 'Message introuvable' }, { status: 404 })
  }

  // Si transcription existe déjà, la retourner
  if (message.transcription) {
    return NextResponse.json({
      transcription: decryptMessage(message.transcription),
    })
  }

  if (!message.media_url) {
    return NextResponse.json({ error: 'Pas de média associé' }, { status: 400 })
  }

  // Vérifier l'accès (propriétaire uniquement)
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('id, user_id')
    .eq('id', message.session_id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  }

  if (session.user_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  // ⚠️ QUOTA DE TOKENS — placé APRÈS le contrôle d'appartenance (inutile de
  // consommer du quota pour une requête qu'on va refuser). La transcription
  // Whisper est facturée : sans ce garde-fou, un compte pouvait boucler dessus
  // et brûler le budget OpenAI, qui est mutualisé entre tous les marchands.
  const tokenCheck = await checkTokenLimit(user.id)
  if (!tokenCheck.allowed) {
    return NextResponse.json({ error: 'Limite de tokens IA atteinte. Achetez des tokens supplémentaires.' }, { status: 429 })
  }

  // Télécharger le média depuis Supabase Storage
  const downloadResult = await downloadMediaFromStorage(message.media_url)
  if (!downloadResult.ok) {
    return NextResponse.json({ error: 'Téléchargement média échoué' }, { status: 500 })
  }

  const { buffer, mimeType: storedMimeType } = downloadResult
  const effectiveMimeType = message.media_mime_type || storedMimeType

  let transcriptionText: string | null = null
  let tokensUsed = 0

  // Traiter selon le type de message
  if (message.message_type === 'audio') {
    const result = await transcribeAudio(buffer, effectiveMimeType)
    if (result.ok) {
      transcriptionText = result.text
      tokensUsed = result.tokensUsed
    }
  } else if (message.message_type === 'image') {
    const base64 = buffer.toString('base64')
    const result = await describeImage(base64, effectiveMimeType)
    if (result.ok) {
      transcriptionText = result.description
      tokensUsed = result.tokensUsed
    }
  } else if (message.message_type === 'document') {
    transcriptionText = '[Extraction de texte non disponible pour ce type de document]'
  }

  if (!transcriptionText) {
    return NextResponse.json({ error: 'Transcription échouée' }, { status: 500 })
  }

  // Sauvegarder la transcription chiffrée en DB (via admin client pour bypass RLS)
  const adminSupabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await adminSupabase
    .from('messages')
    .update({ transcription: encryptMessage(transcriptionText) })
    .eq('id', id)

  // Enregistrer les tokens
  if (tokensUsed > 0) {
    await recordTokenUsage(user.id, tokensUsed).catch(err =>
      console.error('[Transcribe] Token recording error:', err)
    )
  }

  return NextResponse.json({ transcription: transcriptionText })
}
