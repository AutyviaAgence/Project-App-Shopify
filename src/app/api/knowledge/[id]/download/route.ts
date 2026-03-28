import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessResource } from '@/lib/teams/access'

/**
 * GET /api/knowledge/[id]/download
 * Pour les PDF : génère une URL signée temporaire (60 secondes)
 * Pour les textes : retourne le contenu brut en texte
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: doc, error } = await supabase
    .from('knowledge_documents')
    .select('doc_type, storage_path, text_content, name, user_id, team_id')
    .eq('id', id)
    .single()

  if (error || !doc) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  const hasAccess = await canAccessResource(supabase, user.id, doc.user_id, doc.team_id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  if (doc.doc_type === 'pdf') {
    if (!doc.storage_path) {
      return NextResponse.json({ error: 'Fichier PDF introuvable' }, { status: 404 })
    }

    const { data: signedUrl, error: signError } = await supabase.storage
      .from('knowledge')
      .createSignedUrl(doc.storage_path, 60)

    if (signError || !signedUrl?.signedUrl) {
      return NextResponse.json({ error: 'Impossible de générer le lien' }, { status: 500 })
    }

    return NextResponse.json({ url: signedUrl.signedUrl, type: 'pdf', name: doc.name })
  }

  // Document texte : retourner le contenu
  return NextResponse.json({ content: doc.text_content || '', type: 'text', name: doc.name })
}
