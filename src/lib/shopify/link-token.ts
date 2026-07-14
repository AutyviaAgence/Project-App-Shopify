import 'server-only'
import crypto from 'crypto'

/**
 * JETON DE LIAISON — casse le cercle vicieux de l'association compte ↔ boutique.
 *
 * ⚠️ LE PROBLÈME DE CONCEPTION QU'IL RÉSOUT.
 *
 * En embedded, l'identité vient du session token Shopify : il désigne la BOUTIQUE,
 * jamais une personne. On en déduisait donc le compte Xeyo à partir de
 * `shop.email` (l'email du propriétaire de la boutique). C'était FAUX : rien ne dit
 * que le marchand veut utiliser CE compte. Il peut s'être inscrit avec son Gmail
 * perso, gérer plusieurs boutiques avec un seul compte Xeyo, ou vouloir changer.
 *
 * Résultat, un cercle vicieux : l'app embedded IMPOSAIT le compte de `shop.email`,
 * et « Utiliser un autre compte » ramenait toujours au même — impossible d'en sortir.
 *
 * ── L'INVERSION ───────────────────────────────────────────────────────────────
 *
 * Ce n'est plus Shopify qui désigne le compte Xeyo. C'est le MARCHAND, connecté au
 * compte de SON choix, qui réclame la boutique :
 *
 *   1. L'app embedded génère un jeton signé prouvant « je parle pour la boutique X ».
 *   2. Le marchand ouvre app.xeyo.io avec ce jeton, et s'y connecte ou s'y inscrit
 *      LIBREMENT (email, Google, peu importe).
 *   3. Le compte auquel il vient de s'authentifier réclame la boutique.
 *
 * L'app embedded ne décide plus jamais à sa place.
 *
 * ── SÉCURITÉ ──────────────────────────────────────────────────────────────────
 *
 * Le jeton est signé (HMAC-SHA256, `SHOPIFY_API_SECRET`) et porte le domaine de la
 * boutique + une expiration courte. Il ne peut donc pas être forgé : sans le secret,
 * impossible de fabriquer un jeton pour la boutique d'autrui.
 *
 * Il n'est délivré qu'au porteur d'un session token Shopify valide — donc à
 * quelqu'un qui a déjà accès à l'admin de cette boutique. Le jeton ne donne pas plus
 * de pouvoir que ce qu'il a déjà : relier LA boutique dont il est déjà administrateur.
 *
 * Durée de vie courte (15 min) : c'est un jeton de transfert, pas une session.
 */

const TTL_MS = 15 * 60 * 1000

function secret(): string | null {
  return process.env.SHOPIFY_API_SECRET || null
}

/** base64url (pas de `+`, `/`, `=` : le jeton voyage dans une URL). */
function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

/** Crée un jeton de liaison pour cette boutique. `null` si le secret manque. */
export function createLinkToken(shop: string): string | null {
  const key = secret()
  if (!key) return null

  const payload = b64url(Buffer.from(JSON.stringify({ shop, exp: Date.now() + TTL_MS })))
  const sig = b64url(crypto.createHmac('sha256', key).update(payload).digest())
  return `${payload}.${sig}`
}

/**
 * Vérifie un jeton et renvoie la boutique, ou `null` s'il est invalide/expiré.
 * Ne lève jamais : un jeton forgé renvoie simplement `null`.
 */
export function verifyLinkToken(token: string | null | undefined): string | null {
  const key = secret()
  if (!key || !token) return null

  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null

  // Comparaison timing-safe : ne pas laisser fuiter la signature attendue.
  const expected = crypto.createHmac('sha256', key).update(payload).digest()
  let given: Buffer
  try {
    given = b64urlDecode(sig)
  } catch {
    return null
  }
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null

  try {
    const data = JSON.parse(b64urlDecode(payload).toString('utf8')) as { shop?: string; exp?: number }
    if (!data.shop || typeof data.exp !== 'number') return null
    if (Date.now() > data.exp) return null // jeton de transfert : expiration stricte
    return data.shop
  } catch {
    return null
  }
}
