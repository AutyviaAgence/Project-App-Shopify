import crypto from 'crypto'

/**
 * Chiffrement AES-256-GCM pour les messages en base de données
 *
 * La clé doit être définie dans MESSAGE_ENCRYPTION_KEY (32 bytes en hex = 64 caractères)
 * Générer une clé : openssl rand -hex 32
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.MESSAGE_ENCRYPTION_KEY
  if (!keyHex || keyHex.length !== 64) {
    return null
  }
  return Buffer.from(keyHex, 'hex')
}

/**
 * Chiffre un texte avec AES-256-GCM
 * Retourne le texte chiffré au format: iv:authTag:ciphertext (base64)
 * Si pas de clé configurée, retourne le texte original
 */
export function encryptMessage(plaintext: string): string {
  const key = getEncryptionKey()
  if (!key) {
    // FAIL-CLOSED en production : ne JAMAIS stocker un secret (token Shopify/WABA)
    // en clair par erreur de config. En dev, on tolère l'absence de clé.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MESSAGE_ENCRYPTION_KEY manquante ou invalide (64 hex requis), chiffrement impossible.')
    }
    return plaintext
  }

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  // Format: iv:authTag:ciphertext (tout en base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
}

/**
 * Déchiffre un texte chiffré avec AES-256-GCM
 * Retourne le texte original
 * Si pas de clé configurée ou format invalide, retourne le texte tel quel
 */
export function decryptMessage(ciphertext: string): string {
  const key = getEncryptionKey()
  if (!key) {
    return ciphertext
  }

  // Vérifier si c'est un message chiffré (format iv:authTag:ciphertext)
  const parts = ciphertext.split(':')
  if (parts.length !== 3) {
    // Pas chiffré (ancien message ou clé non configurée lors de l'écriture)
    return ciphertext
  }

  try {
    const [ivBase64, authTagBase64, encryptedBase64] = parts
    const iv = Buffer.from(ivBase64, 'base64')
    const authTag = Buffer.from(authTagBase64, 'base64')
    const encrypted = Buffer.from(encryptedBase64, 'base64')

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      return ciphertext
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted)
    decrypted = Buffer.concat([decrypted, decipher.final()])

    return decrypted.toString('utf8')
  } catch (err) {
    // Échec du déchiffrement (mauvaise clé, corruption, etc.)
    console.error('[Crypto] Decryption failed:', err instanceof Error ? err.message : err)
    return '[Message non déchiffrable]'
  }
}

/**
 * Vérifie si le chiffrement est activé (clé configurée)
 */
export function isEncryptionEnabled(): boolean {
  return getEncryptionKey() !== null
}
