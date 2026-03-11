import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'
import type { CredentialType } from '@/types/database'

const SECRET_METADATA_KEYS = ['api_key', 'token', 'password', 'consumer_key', 'consumer_secret', 'secret']

/** GET /api/credentials — List user's credentials (all types) */
export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: credentials, error } = await supabase
    .from('oauth_credentials')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Mask secrets for display
  const safe = (credentials || []).map(cred => ({
    ...cred,
    client_secret: cred.client_secret ? maskSecret(decryptMessage(cred.client_secret)) : null,
    access_token: cred.access_token ? '••••••••' : null,
    refresh_token: cred.refresh_token ? '••••••••' : null,
    metadata: maskMetadataSecrets(cred.metadata),
  }))

  return NextResponse.json({ data: safe })
}

/** POST /api/credentials — Create a new credential (OAuth or non-OAuth) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const {
    name,
    provider,
    credential_type = 'oauth2' as CredentialType,
    team_id,
    // OAuth fields
    client_id,
    client_secret,
    // Non-OAuth secrets (stored in metadata)
    secrets,
  } = body

  if (!name) {
    return NextResponse.json({ error: 'name est requis' }, { status: 400 })
  }

  // Validate based on credential type
  if (credential_type === 'oauth2') {
    if (!client_id || !client_secret) {
      return NextResponse.json({ error: 'client_id et client_secret sont requis pour OAuth' }, { status: 400 })
    }
  } else if (credential_type === 'api_key') {
    if (!secrets?.api_key) {
      return NextResponse.json({ error: 'secrets.api_key est requis' }, { status: 400 })
    }
  } else if (credential_type === 'basic') {
    if (!secrets?.username || !secrets?.password) {
      return NextResponse.json({ error: 'secrets.username et secrets.password sont requis' }, { status: 400 })
    }
  } else if (credential_type === 'bearer') {
    if (!secrets?.token) {
      return NextResponse.json({ error: 'secrets.token est requis' }, { status: 400 })
    }
  }

  // Encrypt secrets into metadata
  const encryptedMetadata = secrets ? encryptMetadataSecrets(secrets) : {}

  const { data: credential, error } = await supabase
    .from('oauth_credentials')
    .insert({
      user_id: user.id,
      name,
      provider: provider || (credential_type === 'oauth2' ? 'google' : 'custom'),
      credential_type: credential_type as CredentialType,
      team_id: team_id || null,
      metadata: encryptedMetadata,
      is_connected: credential_type !== 'oauth2',
      client_id: credential_type === 'oauth2' ? client_id : null,
      client_secret: credential_type === 'oauth2' ? encryptMessage(client_secret) : null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      ...credential,
      client_secret: client_secret ? maskSecret(client_secret) : null,
      metadata: maskMetadataSecrets(credential.metadata),
    },
  }, { status: 201 })
}

function maskSecret(value: string): string {
  if (!value || value.length <= 8) return '••••••••'
  return value.slice(0, 4) + '••••' + value.slice(-4)
}

function encryptMetadataSecrets(secrets: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(secrets)) {
    if (typeof value === 'string' && SECRET_METADATA_KEYS.includes(key)) {
      result[key] = encryptMessage(value)
    } else {
      result[key] = value
    }
  }
  return result
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
