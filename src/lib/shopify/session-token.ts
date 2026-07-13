import 'server-only'
import crypto from 'crypto'
import type { NextRequest } from 'next/server'
import { getShopifyConfig, isValidShopDomain } from './client'

/**
 * Vérification du SESSION TOKEN Shopify (App Bridge).
 *
 * En app EMBEDDED, il n'y a pas de cookie (SameSite bloque les cookies tiers dans
 * l'iframe de l'admin). L'identité vient d'un JWT signé HS256 avec
 * SHOPIFY_API_SECRET, envoyé par App Bridge en `Authorization: Bearer <token>`.
 *
 * Claims utiles :
 *   - `dest` : https://xxx.myshopify.com  → LA BOUTIQUE (seule clé de jointure)
 *   - `aud`  : notre client_id (doit matcher, sinon token d'une autre app)
 *   - `sub`  : id du staff Shopify (PAS un compte Xeyo — inutilisable seul)
 *   - `exp` / `nbf` : fenêtre de validité (~1 min)
 *
 * On implémente la vérif à la main (crypto), cohérent avec le reste du module
 * (verifyHmac/verifyWebhookHmac) et sans nouvelle dépendance.
 */

export type ShopifySession = {
  /** Domaine de la boutique (xxx.myshopify.com) — dérivé du claim `dest`. */
  shop: string
  /** Id du membre du staff Shopify (claim `sub`). Ne sert PAS à identifier un compte Xeyo. */
  shopifyUserId: string | null
}

/** base64url → Buffer (le JWT n'utilise pas le base64 standard). */
function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

/**
 * Vérifie un session token Shopify et renvoie la boutique, ou null si invalide.
 * Ne jette jamais : un token absent/expiré/forgé renvoie simplement null.
 */
export function verifySessionToken(token: string | null | undefined): ShopifySession | null {
  if (!token) return null
  const { apiKey, apiSecret } = getShopifyConfig()
  if (!apiKey || !apiSecret) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, signatureB64] = parts

  // 1. Signature HS256 sur "header.payload" — comparaison timing-safe.
  const expected = crypto
    .createHmac('sha256', apiSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest()
  let given: Buffer
  try {
    given = b64urlDecode(signatureB64)
  } catch {
    return null
  }
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null

  // 2. Payload.
  let payload: {
    dest?: string; aud?: string; sub?: string; exp?: number; nbf?: number; iss?: string
  }
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'))
  } catch {
    return null
  }

  // 3. Destinataire : le token doit être émis POUR NOTRE app.
  if (payload.aud !== apiKey) return null

  // 4. Fenêtre de validité (tolérance 10 s d'horloge).
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp === 'number' && now > payload.exp + 10) return null
  if (typeof payload.nbf === 'number' && now < payload.nbf - 10) return null

  // 5. Boutique : `dest` = https://xxx.myshopify.com
  const dest = payload.dest || payload.iss || ''
  const shop = dest.replace(/^https?:\/\//, '').split('/')[0]
  if (!shop || !isValidShopDomain(shop)) return null

  return { shop, shopifyUserId: payload.sub ?? null }
}

/** Extrait et vérifie le session token d'une requête (header Authorization: Bearer). */
export function sessionFromRequest(req: NextRequest): ShopifySession | null {
  const auth = req.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return verifySessionToken(m?.[1])
}
