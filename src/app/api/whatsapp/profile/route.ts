import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptWabaToken } from '@/lib/messaging/send'

/**
 * Profil business WhatsApp du marchand (About, description, coordonnées, photo).
 * GET   → lit le profil actuel chez Meta.
 * PATCH → met à jour les champs texte + (optionnel) la photo de profil.
 *
 * Le NOM d'affichage n'est PAS modifiable ici : il passe par une revue Meta
 * (WhatsApp Manager). Seuls les champs de profil sont éditables par API.
 */

async function loadSession(userId: string) {
  const supabase = await createClient()
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('waba_phone_number_id, waba_access_token')
    .eq('user_id', userId)
    .eq('status', 'connected')
    .maybeSingle()
  if (!session?.waba_phone_number_id) return null
  const token = decryptWabaToken(session)
  if (!token) return null
  return { phoneNumberId: session.waba_phone_number_id, token }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const s = await loadSession(user.id)
  if (!s) return NextResponse.json({ data: { connected: false } })

  const res = await wabaClient.getBusinessProfile(s.phoneNumberId, s.token)
  if (!res.ok) return NextResponse.json({ data: { connected: true } })
  const p = res.data.data?.[0] || {}
  return NextResponse.json({
    data: {
      connected: true,
      about: p.about || '',
      description: p.description || '',
      address: p.address || '',
      email: p.email || '',
      websites: p.websites || [],
      profile_picture_url: p.profile_picture_url || null,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const s = await loadSession(user.id)
  if (!s) return NextResponse.json({ error: 'Aucun WhatsApp connecté' }, { status: 400 })

  const body = (await req.json().catch(() => ({}))) as {
    about?: string; description?: string; address?: string; email?: string
    website?: string
    /** image en data URL (data:image/...;base64,....) pour changer la photo */
    photo_data_url?: string
  }

  const fields: Record<string, unknown> = {}
  // Meta : `about` ≤ 139 car. ; description ≤ 512 ; adresse ≤ 256.
  if (typeof body.about === 'string') fields.about = body.about.trim().slice(0, 139)
  if (typeof body.description === 'string') fields.description = body.description.trim().slice(0, 512)
  if (typeof body.address === 'string') fields.address = body.address.trim().slice(0, 256)
  if (typeof body.email === 'string') fields.email = body.email.trim().slice(0, 128)
  if (typeof body.website === 'string') {
    const w = body.website.trim()
    fields.websites = w ? [/^https?:\/\//i.test(w) ? w : `https://${w}`] : []
  }

  // Photo : upload resumable → profile_picture_handle.
  if (body.photo_data_url && body.photo_data_url.startsWith('data:')) {
    const appId = process.env.META_APP_ID
    if (!appId) return NextResponse.json({ error: 'META_APP_ID non configuré côté serveur.' }, { status: 500 })
    const m = body.photo_data_url.match(/^data:([^;]+);base64,(.+)$/)
    if (!m) return NextResponse.json({ error: 'Format d’image invalide' }, { status: 400 })
    const mimeType = m[1]
    const buffer = Buffer.from(m[2], 'base64')
    if (buffer.length > 5 * 1024 * 1024) return NextResponse.json({ error: 'Image trop lourde (max 5 Mo)' }, { status: 400 })
    const up = await wabaClient.uploadResumableMedia(appId, s.token, { buffer, mimeType, fileName: 'profile' })
    if (!up.ok) return NextResponse.json({ error: `Upload photo : ${up.error}` }, { status: 502 })
    fields.profile_picture_handle = up.handle
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  const res = await wabaClient.updateBusinessProfile(s.phoneNumberId, s.token, fields)
  if (!res.ok) {
    const msg = (res.error || '').match(/"error_user_msg"\s*:\s*"([^"]+)"/)?.[1]
      || (res.error || '').match(/"message"\s*:\s*"([^"]+)"/)?.[1]
      || 'Meta a refusé la mise à jour'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
  return NextResponse.json({ data: { updated: true } })
}
