import 'server-only'
/**
 * Construction du composant `carousel` au moment de l'ENVOI d'un template.
 *
 * RÈGLE META (confirmée par la doc + la définition réelle du template) :
 * pour un template carrousel, l'envoi DOIT inclure le composant `carousel` avec
 * CHAQUE carte (card_index), et chaque carte doit re-fournir son média d'en-tête
 * (image/vidéo) via un `media_id` uploadé à l'envoi — le média n'est PAS rejoué
 * automatiquement par Meta. Omettre le header → erreur 132012.
 *
 * Structure par carte :
 *   { card_index, components: [
 *       { type:'header', parameters:[{ type:'image', image:{ id:<media_id> } }] },
 *       { type:'body',   parameters:[{ type:'text', text:'...' }] }   // si variables
 *   ] }
 *
 * Le body de carte n'est inclus que si la carte a des variables {{n}}. Les
 * boutons (URL/quick_reply) figés ne sont pas renvoyés (ils sont dans le modèle
 * approuvé). Le média d'en-tête, lui, est TOUJOURS requis.
 */
import { resolveVariables, type VariableContext } from './variables'
import { downloadMediaFromStorage } from '@/lib/storage/media'
import { wabaClient } from '@/lib/whatsapp-cloud/client'

/** Carte de carrousel telle que stockée en base (carousel_cards). */
export type SendCard = {
  body_text?: string
  body_variable_keys?: string[]
  header_type?: string | null         // 'image' | 'video' | 'document'
  header_media_url?: string | null    // storage path (bucket media) ou URL
}

/** Nombre de variables {{n}} dans un texte. */
function countVars(text: string): number {
  const m = (text || '').match(/\{\{\s*(\d+)\s*\}\}/g)
  if (!m) return 0
  return Math.max(...m.map((x) => parseInt(x.replace(/\D/g, ''), 10)))
}

/** Type de média WhatsApp pour le paramètre header d'une carte. */
function headerMediaType(kind: string | null | undefined): 'image' | 'video' | 'document' {
  if (kind === 'video') return 'video'
  if (kind === 'document') return 'document'
  return 'image'
}

/**
 * Construit le composant `carousel` à envoyer. ASYNC : upload chaque image
 * d'en-tête de carte vers Meta pour obtenir un media_id.
 *
 * Renvoie null si aucune carte (carrousel vide). Si une image d'en-tête échoue
 * à s'uploader, on lève une erreur explicite (mieux qu'un 132012 opaque).
 */
export async function buildCarouselComponent(
  cards: SendCard[],
  ctx: VariableContext,
  meta: { phoneNumberId: string; token: string }
): Promise<{ type: 'carousel'; cards: unknown[] } | null> {
  if (!Array.isArray(cards) || cards.length === 0) return null

  // Les cartes sont traitées EN PARALLÈLE (chacune télécharge son image Shopify
  // puis l'uploade à Meta) : pour 3-4 cartes, ça divise d'autant le temps total
  // et évite le timeout/502 des envois séquentiels.
  const outCards = await Promise.all(cards.map(async (card, idx) => {
    const components: unknown[] = []

    // Règle Meta : CHAQUE carte de carrousel DOIT avoir un média d'en-tête.
    // Sans image, Meta rejette tout le carrousel avec une erreur obscure → on
    // lève un message clair (ce modèle a été créé sans image dans ses cartes).
    if (!card.header_media_url) {
      throw new Error(`carte ${idx + 1} sans image : un carrousel exige une image par carte (règle Meta). Ajoutez une image à chaque carte du modèle.`)
    }

    // 1) HEADER média — requis pour chaque carte qui en a un.
    if (card.header_media_url) {
      const mediatype = headerMediaType(card.header_type)
      const dl = await downloadMediaFromStorage(card.header_media_url)
      if (!dl.ok) {
        throw new Error(`carte ${idx}: header introuvable (${card.header_media_url}): ${dl.error}`)
      }
      const up = await wabaClient.uploadMedia(
        meta.phoneNumberId, meta.token, dl.buffer, dl.mimeType, `card-${idx}.${mediatype}`
      )
      if (!up.ok) {
        throw new Error(`carte ${idx}: upload header Meta échoué: ${up.error}`)
      }
      components.push({
        type: 'header',
        parameters: [{ type: mediatype, [mediatype]: { id: up.data.id } }],
      })
    }

    // 2) BODY — uniquement si la carte a des variables {{n}}.
    const varCount = countVars(card.body_text || '')
    if (varCount > 0) {
      const keys = Array.isArray(card.body_variable_keys) ? card.body_variable_keys : []
      const resolved = resolveVariables(keys, ctx).slice(0, varCount)
      while (resolved.length < varCount) resolved.push('')
      components.push({
        type: 'body',
        parameters: resolved.map((t) => ({ type: 'text', text: t })),
      })
    }

    return { card_index: idx, components }
  }))

  return { type: 'carousel', cards: outCards }
}
