import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'

const SECRET_METADATA_KEYS = ['api_key', 'token', 'password', 'consumer_key', 'consumer_secret', 'secret']

/** GET /api/credentials/[id] — Get a single credential */
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

  const { data: cred, error } = await supabase
    .from('oauth_credentials')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !cred) {
    return NextResponse.json({ error: 'Credential introuvable' }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      ...cred,
      client_secret: cred.client_secret ? maskSecret(decryptMessage(cred.client_secret)) : null,
      access_token: cred.access_token ? '••••••••' : null,
      refresh_token: cred.refresh_token ? '••••••••' : null,
      metadata: maskMetadataSecrets(cred.metadata),
    },
  })
}

/** PATCH /api/credentials/[id] — Update a credential */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Verify ownership
  const { data: existing } = await supabase
    .from('oauth_credentials')
    .select('id, metadata')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Credential introuvable' }, { status: 404 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.name) updates.name = body.name
  if (body.client_id) updates.client_id = body.client_id
  if (body.client_secret) updates.client_secret = encryptMessage(body.client_secret)
  if (body.team_id !== undefined) updates.team_id = body.team_id || null

  // Handle non-OAuth secrets update (merge into existing metadata)
  if (body.secrets) {
    const existingMetadata = (existing.metadata || {}) as Record<string, unknown>
    const encryptedSecrets: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body.secrets)) {
      if (typeof value === 'string' && SECRET_METADATA_KEYS.includes(key)) {
        encryptedSecrets[key] = encryptMessage(value)
      } else {
        encryptedSecrets[key] = value
      }
    }
    updates.metadata = { ...existingMetadata, ...encryptedSecrets }
  }

  const { data: updated, error } = await supabase
    .from('oauth_credentials')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      ...updated,
      client_secret: updated.client_secret ? '••••••••' : null,
      access_token: updated.access_token ? '••••••••' : null,
      refresh_token: updated.refresh_token ? '••••••••' : null,
      metadata: maskMetadataSecrets(updated.metadata),
    },
  })
}

/** DELETE /api/credentials/[id] — Delete a credential */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Verify the credential exists and belongs to this user
  const { data: existing, error: findError } = await supabase
    .from('oauth_credentials')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (findError || !existing) {
    return NextResponse.json({ error: 'Credential introuvable' }, { status: 404 })
  }

  // Use a pure admin client (no cookies/SSR) to bypass RLS for delete
  const adminSupabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: deleted, error } = await adminSupabase
    .from('oauth_credentials')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  console.log(`[DELETE credential] id=${id} user=${user.id} deleted=`, deleted, 'error=', error)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Suppression échouée — aucune ligne affectée' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

function maskSecret(value: string): string {
  if (!value || value.length <= 8) return '••••••••'
  return value.slice(0, 4) + '••••' + value.slice(-4)
}

function maskMetadataSecrets(metadata: Record<string, unknown> | null): Record<string, unknown> {
  if (!metadata) return {}
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string' && SECRET_METADATA_KEYS.includes(key)) {
      try {
        const decrypted = decryptMessage(value)
        result[key] = maskSecret(decrypted)
      } catch {
        result[key] = '••••••••'
      }
    } else {
      result[key] = value
    }
  }
  return result
}
