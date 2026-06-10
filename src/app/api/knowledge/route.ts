import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkPlanQuota } from '@/lib/plan-quota'

/** GET /api/knowledge — Lister les documents de l'utilisateur */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: documents, error } = await supabase
    .from('knowledge_documents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: documents || [] })
}

/** POST /api/knowledge — Créer un document (texte JSON ou PDF multipart) */
export async function POST(req: NextRequest) {
  // Rate limiting (10/min car opération lourde)
  const rateLimitResponse = checkRateLimit(req, 'HEAVY')
  if (rateLimitResponse) return rateLimitResponse

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier le quota de documents selon le plan
  const docQuota = await checkPlanQuota(supabase, user.id, 'docs')
  if (!docQuota.allowed) {
    const error = docQuota.reason === 'observer_mode'
      ? 'Votre compte est en mode visualisation. Souscrivez à un plan pour ajouter des documents.'
      : docQuota.reason === 'no_subscription'
      ? 'Abonnement requis pour ajouter un document. Souscrivez à un plan depuis la page Abonnement.'
      : `Limite atteinte : votre plan ${docQuota.plan} inclut ${docQuota.limit} document(s) RAG. Passez à un plan supérieur pour en ajouter davantage.`
    return NextResponse.json({
      error,
      quota_exceeded: true,
      reason: docQuota.reason,
      limit: docQuota.limit,
      current: docQuota.current,
    }, { status: 403 })
  }

  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    // Upload PDF
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const name = formData.get('name') as string | null
    const description = formData.get('description') as string | null

    if (!file || !name?.trim()) {
      return NextResponse.json({ error: 'Fichier et nom requis' }, { status: 400 })
    }

    if (!file.name.endsWith('.pdf') || file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Seuls les fichiers PDF sont acceptés' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 10 Mo)' }, { status: 400 })
    }

    // Upload vers Supabase Storage
    // Sanitize filename: remove accents, replace special chars with underscores
    const sanitizedName = file.name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars (spaces, parens, etc.)
      .replace(/_+/g, '_') // Collapse multiple underscores
    const storagePath = `${user.id}/${Date.now()}_${sanitizedName}`
    const { error: uploadError } = await supabase.storage
      .from('knowledge')
      .upload(storagePath, file, { contentType: 'application/pdf' })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // Créer le document
    const { data: doc, error: insertError } = await supabase
      .from('knowledge_documents')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        doc_type: 'pdf',
        storage_path: storagePath,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Fire-and-forget : traitement en arrière-plan
    import('@/lib/knowledge/processor')
      .then(({ processDocument }) => processDocument(doc.id))
      .catch((err) => console.error('[Knowledge] Background process error:', err))

    return NextResponse.json({ data: doc })
  } else {
    // Document texte (JSON)
    const body = await req.json()
    const { name, description, text_content } = body as {
      name?: string
      description?: string
      text_content?: string
    }

    if (!name?.trim() || !text_content?.trim()) {
      return NextResponse.json({ error: 'Nom et contenu requis' }, { status: 400 })
    }

    const { data: doc, error: insertError } = await supabase
      .from('knowledge_documents')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        doc_type: 'text',
        text_content: text_content.trim(),
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Fire-and-forget
    import('@/lib/knowledge/processor')
      .then(({ processDocument }) => processDocument(doc.id))
      .catch((err) => console.error('[Knowledge] Background process error:', err))

    return NextResponse.json({ data: doc })
  }
}
