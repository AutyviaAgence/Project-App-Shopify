import 'server-only'
import crypto from 'crypto'

/**
 * Vérifie la signature App Proxy de Shopify (fail-CLOSED).
 *
 * Shopify signe les requêtes App Proxy avec HMAC-SHA256 (paramètre `signature`)
 * sur les query params triés. On rejette :
 *   - toute requête SANS signature (en production),
 *   - toute signature invalide (comparaison timing-safe).
 *
 * En dev (NODE_ENV !== 'production') sans secret configuré, on laisse passer
 * pour ne pas bloquer les tests locaux.
 */
export function verifyAppProxySignature(searchParams: URLSearchParams): boolean {
  const secret = process.env.SHOPIFY_API_SECRET
  const isProd = process.env.NODE_ENV === 'production'

  if (!secret) return !isProd // pas de secret : toléré en dev uniquement

  const signature = searchParams.get('signature') || ''
  if (!signature) return false // fail-closed : pas de signature = refus

  const params: Record<string, string> = {}
  searchParams.forEach((value, key) => { if (key !== 'signature') params[key] = value })
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('')
  const computed = crypto.createHmac('sha256', secret).update(sorted).digest('hex')

  // Comparaison timing-safe (les buffers doivent avoir la même longueur).
  const a = Buffer.from(computed, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
