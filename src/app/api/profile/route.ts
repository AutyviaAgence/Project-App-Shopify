import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/profile — Récupérer le profil de l'utilisateur connecté */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer le profil existant
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Extraire les données de auth.users
  const authFullName = user.user_metadata?.full_name || user.user_metadata?.name
  const authAvatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture

  // Si le profil n'existe pas ou manque des infos, synchroniser
  if (!existingProfile) {
    // Créer le profil s'il n'existe pas
    const { data: newProfile, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email || '',
        full_name: authFullName || user.email?.split('@')[0] || null,
        avatar_url: authAvatarUrl || null,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: 'Erreur création profil' }, { status: 500 })
    }
    return NextResponse.json({ data: newProfile })
  }

  // Synchroniser si des infos manquent dans le profil mais existent dans auth
  const needsSync =
    (!existingProfile.full_name && authFullName) ||
    (!existingProfile.avatar_url && authAvatarUrl) ||
    (existingProfile.email !== user.email)

  if (needsSync) {
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: existingProfile.full_name || authFullName || user.email?.split('@')[0],
        avatar_url: existingProfile.avatar_url || authAvatarUrl,
        email: user.email || existingProfile.email,
      })
      .eq('id', user.id)
      .select()
      .single()

    if (!updateError && updatedProfile) {
      return NextResponse.json({ data: updatedProfile })
    }
  }

  return NextResponse.json({ data: existingProfile })
}

/** PATCH /api/profile — Modifier le profil */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { full_name, avatar_url, timezone } = body as {
    full_name?: string
    avatar_url?: string
    timezone?: string
  }

  const updateData: Record<string, unknown> = {}
  if (full_name !== undefined) updateData.full_name = full_name.trim() || null
  if (avatar_url !== undefined) updateData.avatar_url = avatar_url.trim() || null
  if (timezone !== undefined) updateData.timezone = timezone

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: profile })
}
