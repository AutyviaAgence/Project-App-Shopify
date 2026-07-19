import { NextRequest, NextResponse } from 'next/server'
import { rateLimiter } from './limiter'
import { RATE_LIMITS, type RateLimitType } from './config'

/**
 * Extrait l'identifiant pour le rate limiting
 * Utilise l'IP ou un header personnalisé
 */
function getClientIdentifier(req: NextRequest): string {
  // ⚠️ ON PREND LE **DERNIER** SEGMENT, PAS LE PREMIER.
  //
  // `x-forwarded-for` est une liste « client, proxy1, proxy2 » où seuls les
  // segments de DROITE sont écrits par nos propres proxys : tout ce qui est à
  // gauche vient du client et est donc FORGEABLE.
  //
  // En lisant le premier segment, il suffisait d'envoyer un
  // `X-Forwarded-For: <valeur aléatoire>` différent à chaque requête pour
  // repartir d'un compteur neuf — le rate limiting entier était contournable,
  // y compris sur l'opt-in public (inscription massive de numéros tiers, aux
  // frais du marchand et au détriment de sa qualité Meta).
  //
  // Le dernier segment est posé par le reverse-proxy (Traefik/Dokploy) et ne
  // peut pas être choisi par l'appelant.
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded.split(',').map((s) => s.trim()).filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]
  }

  // `x-real-ip` est posé par le proxy lui-même : non forgeable de bout en bout.
  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  // Fallback
  return 'unknown'
}

/**
 * Applique le rate limiting à une requête
 * Retourne null si la requête est autorisée, sinon une réponse 429
 */
export function checkRateLimit(
  req: NextRequest,
  limitType: RateLimitType = 'STANDARD',
  customKey?: string
): NextResponse | null {
  const config = RATE_LIMITS[limitType]
  const clientId = customKey || getClientIdentifier(req)
  const key = `${limitType}:${clientId}`

  const result = rateLimiter.check(key, config.limit, config.windowMs)

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: 'Trop de requêtes',
        message: `Limite de ${config.limit} requêtes par minute atteinte`,
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfter || 60),
          'X-RateLimit-Limit': String(config.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
        },
      }
    )
  }

  return null
}

/**
 * Ajoute les headers de rate limit à une réponse
 */
export function addRateLimitHeaders(
  response: NextResponse,
  req: NextRequest,
  limitType: RateLimitType = 'STANDARD',
  customKey?: string
): NextResponse {
  const config = RATE_LIMITS[limitType]
  const clientId = customKey || getClientIdentifier(req)
  const key = `${limitType}:${clientId}`

  const status = rateLimiter.peek(key, config.limit, config.windowMs)

  response.headers.set('X-RateLimit-Limit', String(config.limit))
  response.headers.set('X-RateLimit-Remaining', String(status.remaining))
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(status.resetAt / 1000)))

  return response
}

/**
 * Helper pour créer un handler avec rate limiting
 */
export function withRateLimit<T extends NextRequest>(
  handler: (req: T, ...args: unknown[]) => Promise<NextResponse>,
  limitType: RateLimitType = 'STANDARD'
) {
  return async (req: T, ...args: unknown[]): Promise<NextResponse> => {
    const rateLimitResponse = checkRateLimit(req, limitType)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const response = await handler(req, ...args)
    return addRateLimitHeaders(response, req, limitType)
  }
}
