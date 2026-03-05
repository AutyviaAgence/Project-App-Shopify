import 'server-only'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Scopes for Calendar + Sheets
const SCOPES: Record<string, string[]> = {
  google_calendar: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  google_sheets: [
    'https://www.googleapis.com/auth/spreadsheets',
  ],
}

/**
 * Build the Google OAuth authorization URL
 */
export function buildGoogleAuthUrl(params: {
  clientId: string
  redirectUri: string
  toolType: string
  state: string
}): string {
  const scopes = SCOPES[params.toolType] || SCOPES.google_calendar
  const url = new URL(GOOGLE_AUTH_URL)
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', params.state)
  return url.toString()
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(params: {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Failed to exchange code')
  }

  return data
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshAccessToken(params: {
  refreshToken: string
  clientId: string
  clientSecret: string
}): Promise<{
  access_token: string
  expires_in: number
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Failed to refresh token')
  }

  return data
}
