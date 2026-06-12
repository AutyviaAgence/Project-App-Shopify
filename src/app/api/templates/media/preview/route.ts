import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSignedMediaUrl } from '@/lib/storage/media'

/**
 * GET /api/templates/media/preview?path=template-headers/{userId}/...
 * Renvoie une URL signée temporaire pour prévisualiser un média d'en-tête.
 * Vérifie que le chemin appartient bien à l'utilisateur (préfixe userId).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const path = req.nextUrl.searchParams.get('path') || ''
  // Sécurité : on n'autorise que les chemins de l'utilisateur courant.
  if (!path.startsWith(`template-headers/${user.id}/`)) {
    return NextResponse.json({ error: 'Chemin non autorisé' }, { status: 403 })
  }

  const signed = await getSignedMediaUrl(path, 3600)
  if (!signed) return NextResponse.json({ error: 'Média introuvable' }, { status: 404 })
  return NextResponse.json({ data: { signed_url: signed } })
}
