import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'

/** GET /api/credentials — List user's OAuth credentials */
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
    client_secret: maskSecret(decryptMessage(cred.client_secret)),
    access_token: cred.access_token ? '••••••••' : null,
    refresh_token: cred.refresh_token ? '••••••••' : null,
  }))

  return NextResponse.json({ data: safe })
}

/** POST /api/credentials — Create a new OAuth credential */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { name, provider, client_id, client_secret, team_id } = body

  if (!name || !client_id || !client_secret) {
    return NextResponse.json({ error: 'name, client_id et client_secret sont requis' }, { status: 400 })
  }

  const { data: credential, error } = await supabase
    .from('oauth_credentials')
    .insert({
      user_id: user.id,
      name,
      provider: provider || 'google',
      client_id,
      client_secret: encryptMessage(client_secret),
      team_id: team_id || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      ...credential,
      client_secret: maskSecret(client_secret),
    },
  }, { status: 201 })
}

function maskSecret(value: string): string {
  if (!value || value.length <= 8) return '••••••••'
  return value.slice(0, 4) + '••••' + value.slice(-4)
}
